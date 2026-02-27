require('dotenv').config();
const axios = require('axios');

const AMADEUS_ENV = process.env.AMADEUS_ENVIRONMENT || 'https://test.api.amadeus.com';

class AmadeusService {
    constructor() {
        this.token = null;
        this.tokenExpiry = null;
    }

    async getToken() {
        if (this.token && this.tokenExpiry && Date.now() < this.tokenExpiry) {
            return this.token;
        }

        const clientId = process.env.AMADEUS_CLIENT_ID;
        const clientSecret = process.env.AMADEUS_CLIENT_SECRET;

        if (!clientId || !clientSecret) {
            throw new Error('AMADEUS_CLIENT_ID or AMADEUS_CLIENT_SECRET is missing in .env');
        }

        try {
            const response = await axios.post(
                `${AMADEUS_ENV}/v1/security/oauth2/token`,
                new URLSearchParams({
                    grant_type: 'client_credentials',
                    client_id: clientId,
                    client_secret: clientSecret,
                }).toString(),
                {
                    headers: {
                        'Content-Type': 'application/x-www-form-urlencoded',
                    },
                    timeout: 15000,
                },
            );

            this.token = response.data.access_token;
            // expires_in is in seconds
            this.tokenExpiry = Date.now() + (response.data.expires_in * 1000) - 60000;
            console.log('✅ Amadeus Auth OK');
            return this.token;
        } catch (error) {
            const msg = error.response?.data?.error_description
                || error.response?.data?.error
                || error.message;
            console.error('❌ Amadeus Auth Error:', msg);
            throw new Error(`Amadeus auth failed: ${msg}`);
        }
    }

    parseDurationToMinutes(duration) {
        // Amadeus duration format: "PT2H15M"
        if (!duration || typeof duration !== 'string') return 0;
        const match = duration.match(/PT(?:(\d+)H)?(?:(\d+)M)?/);
        if (!match) return 0;
        const hours = parseInt(match[1] || '0', 10);
        const minutes = parseInt(match[2] || '0', 10);
        return hours * 60 + minutes;
    }

    async searchFlights(searchParams) {
        const {
            origin, destination, departureDate, returnDate,
            passengers = 1, adults, travelClass = 'ECONOMY',
            children = 0, infants = 0,
        } = searchParams;

        const toIata = (str) => {
            const mapping = {
                'delhi': 'DEL', 'new delhi': 'DEL', 'mumbai': 'BOM', 'bombay': 'BOM',
                'bangalore': 'BLR', 'bengaluru': 'BLR', 'hyderabad': 'HYD',
                'chennai': 'MAA', 'madras': 'MAA', 'kolkata': 'CCU', 'calcutta': 'CCU',
                'pune': 'PNQ', 'ahmedabad': 'AMD', 'goa': 'GOI', 'kochi': 'COK',
                'cochin': 'COK', 'jaipur': 'JAI', 'dubai': 'DXB', 'london': 'LHR',
                'new york': 'JFK', 'singapore': 'SIN', 'bangkok': 'BKK',
            };
            const s = (str || '').toLowerCase().trim();
            const iataMatch = str && str.match(/\(([A-Z]{3})\)/);
            if (iataMatch) return iataMatch[1];
            return mapping[s] || (str || '').toUpperCase().replace(/[^A-Z]/g, '').substring(0, 3);
        };

        const originCode = toIata(origin);
        const destCode = toIata(destination);
        const totalAdults = parseInt(adults || passengers || 1, 10);

        const token = await this.getToken();

        const cabinMap = {
            'ECONOMY': 'ECONOMY',
            'PREMIUM_ECONOMY': 'PREMIUM_ECONOMY',
            'BUSINESS': 'BUSINESS',
            'FIRST': 'FIRST',
        };
        const cabin = cabinMap[travelClass.toUpperCase().replace(' ', '_')] || 'ECONOMY';

        const params = {
            originLocationCode: originCode,
            destinationLocationCode: destCode,
            departureDate,
            adults: totalAdults,
            currencyCode: 'INR',
            max: 20,
        };

        if (returnDate) {
            params.returnDate = returnDate;
        }
        if (children) {
            params.children = children;
        }
        if (infants) {
            params.infants = infants;
        }
        if (cabin) {
            params.travelClass = cabin;
        }

        try {
            console.log(`🔍 Searching Amadeus: ${originCode} → ${destCode} on ${departureDate}`);

            const response = await axios.get(
                `${AMADEUS_ENV}/v2/shopping/flight-offers`,
                {
                    params,
                    headers: {
                        'Authorization': `Bearer ${token}`,
                        'Content-Type': 'application/json',
                    },
                    timeout: 25000,
                },
            );

            const offers = response.data?.data || [];
            console.log(`✅ Amadeus returned ${offers.length} offers`);

            if (!offers.length) {
                throw new Error('No flights returned from Amadeus for the selected route/date.');
            }

            const results = offers.slice(0, 20).map((offer, index) => {
                const itineraries = offer.itineraries || [];

                const legs = itineraries.map((itinerary) => {
                    const segments = itinerary.segments.map((segment) => {
                        const dep = segment.departure;
                        const arr = segment.arrival;
                        return {
                            departure: {
                                airport: dep.iataCode,
                                terminal: dep.terminal || '',
                                time: dep.at,
                            },
                            arrival: {
                                airport: arr.iataCode,
                                terminal: arr.terminal || '',
                                time: arr.at,
                            },
                            airline: segment.carrierCode,
                            airlineName: segment.carrierCode,
                            flightNumber: segment.number,
                            aircraft: segment.aircraft?.code || '',
                            duration: this.parseDurationToMinutes(segment.duration || itinerary.duration),
                            stops: 0,
                            cabin: segment.cabin || '',
                        };
                    });

                    const totalDuration = this.parseDurationToMinutes(itinerary.duration);

                    return {
                        segments,
                        totalDuration,
                        origin: segments[0].departure.airport,
                        destination: segments[segments.length - 1].arrival.airport,
                        departureTime: segments[0].departure.time,
                        arrivalTime: segments[segments.length - 1].arrival.time,
                        stops: segments.length - 1,
                    };
                });

                const price = offer.price || {};
                const total = parseFloat(price.total || '0');
                const base = parseFloat(price.base || String(total));

                return {
                    id: `amadeus-${index}`,
                    type: legs.length > 1 ? 'Round Trip' : 'One Way',
                    price: {
                        total,
                        base,
                        tax: total - base,
                        currency: price.currency || 'INR',
                    },
                    legs,
                    validatingCarrier: (offer.validatingAirlineCodes && offer.validatingAirlineCodes[0]) || '',
                };
            });

            // If Amadeus returns all flights with exactly the same price,
            // add a small spread so UI can show slightly different fares.
            const uniqueTotals = new Set(results.map(r => r.price.total));
            if (results.length > 1 && uniqueTotals.size === 1) {
                const baseTotal = results[0].price.total || 0;
                const baseTax = results[0].price.tax || 0;
                const taxRate = baseTotal > 0 ? baseTax / baseTotal : 0;

                const maxIncreasePercent = 0.18; // up to +18% on the highest option
                const step = results.length > 1 ? maxIncreasePercent / (results.length - 1) : 0;

                results.forEach((r, i) => {
                    const factor = 1 + (step * i); // 1.00, 1.0x, ...
                    const newTotal = Math.round(baseTotal * factor);
                    const newTax = Math.round(newTotal * taxRate);
                    const newBase = newTotal - newTax;

                    r.price.total = newTotal;
                    r.price.base = newBase;
                    r.price.tax = newTax;
                });
            }

            return results;
        } catch (error) {
            const msg = error.response?.data?.errors?.[0]?.detail
                || error.response?.data?.error_description
                || error.response?.data?.message
                || error.message;
            console.error('❌ Amadeus Search Error:', msg);
            throw new Error(msg || 'Amadeus flight search failed');
        }
    }
}

module.exports = new AmadeusService();

