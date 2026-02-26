require('dotenv').config();
const axios = require('axios');

const SABRE_ENV = process.env.SABRE_ENVIRONMENT || 'https://api.test.sabre.com';
const USE_MOCK = process.env.SABRE_MOCK_MODE === 'true';

// ─── Airline name lookup ─────────────────────────────────────────────────────
const AIRLINE_NAMES = {
    'AI': 'Air India', '6E': 'IndiGo', 'SG': 'SpiceJet', 'UK': 'Vistara',
    'G8': 'Go First', 'I5': 'AirAsia India', 'IX': 'Air India Express',
    'EK': 'Emirates', 'QR': 'Qatar Airways', 'EY': 'Etihad Airways',
    'BA': 'British Airways', 'LH': 'Lufthansa', 'AF': 'Air France',
    'SQ': 'Singapore Airlines', 'TG': 'Thai Airways', 'MH': 'Malaysia Airlines',
    'CX': 'Cathay Pacific', 'TK': 'Turkish Airlines', 'KL': 'KLM',
    'AA': 'American Airlines', 'UA': 'United Airlines', 'DL': 'Delta Air Lines',
};

// ─── Demo flight builder ─────────────────────────────────────────────────────
function buildDemoFlights(origin, destination, departDate, returnDate, adults, tripType) {
    const flights = [];
    const orig = (origin || 'DEL').toUpperCase().substring(0, 3);
    const dest = (destination || 'BOM').toUpperCase().substring(0, 3);
    const parsedDate = departDate ? new Date(departDate) : new Date();

    const airlines = [
        { code: '6E', name: 'IndiGo', num: '6E-2341', price: 4850, dur: 115 },
        { code: 'AI', name: 'Air India', num: 'AI-657', price: 6200, dur: 120 },
        { code: 'SG', name: 'SpiceJet', num: 'SG-9214', price: 4250, dur: 110 },
        { code: 'UK', name: 'Vistara', num: 'UK-985', price: 7800, dur: 125 },
        { code: 'G8', name: 'Go First', num: 'G8-116', price: 3990, dur: 118 },
        { code: 'I5', name: 'AirAsia India', num: 'I5-760', price: 4100, dur: 113 },
    ];

    const departureTimes = ['05:15', '08:30', '11:45', '14:00', '17:20', '21:10'];

    airlines.forEach((airline, i) => {
        const [hh, mm] = departureTimes[i].split(':').map(Number);
        const depDate = new Date(parsedDate);
        depDate.setHours(hh, mm, 0, 0);

        const arrDate = new Date(depDate.getTime() + airline.dur * 60 * 1000);
        const hasStop = i === 1 || i === 3; // Some flights have 1 stop

        const segments = hasStop
            ? [
                {
                    departure: { airport: orig, terminal: 'T3', time: depDate.toISOString() },
                    arrival: { airport: 'BLR', terminal: 'T2', time: new Date(depDate.getTime() + 60 * 60 * 1000).toISOString() },
                    airline: airline.code, airlineName: airline.name,
                    flightNumber: airline.num.split('-')[1] + '1',
                    aircraft: '320', duration: 60, stops: 0, cabin: 'Y'
                },
                {
                    departure: { airport: 'BLR', terminal: 'T2', time: new Date(depDate.getTime() + 90 * 60 * 1000).toISOString() },
                    arrival: { airport: dest, terminal: 'T1', time: arrDate.toISOString() },
                    airline: airline.code, airlineName: airline.name,
                    flightNumber: airline.num.split('-')[1] + '2',
                    aircraft: '320', duration: airline.dur - 90, stops: 0, cabin: 'Y'
                }
            ]
            : [
                {
                    departure: { airport: orig, terminal: i % 2 === 0 ? 'T1' : 'T2', time: depDate.toISOString() },
                    arrival: { airport: dest, terminal: 'T1', time: arrDate.toISOString() },
                    airline: airline.code, airlineName: airline.name,
                    flightNumber: airline.num.split('-')[1],
                    aircraft: i % 3 === 0 ? '737' : '320', duration: airline.dur, stops: 0, cabin: 'Y'
                }
            ];

        const outboundLeg = {
            segments,
            totalDuration: airline.dur,
            origin: orig,
            destination: dest,
            departureTime: segments[0].departure.time,
            arrivalTime: segments[segments.length - 1].arrival.time,
            stops: segments.length - 1,
        };

        const legs = [outboundLeg];

        // Add return leg if round trip
        if ((tripType === 'round_trip' || tripType === 'Round trip') && returnDate) {
            const retDate = new Date(returnDate);
            retDate.setHours(hh + 2, mm, 0, 0);
            const retArr = new Date(retDate.getTime() + airline.dur * 60 * 1000);
            legs.push({
                segments: [{
                    departure: { airport: dest, terminal: 'T1', time: retDate.toISOString() },
                    arrival: { airport: orig, terminal: i % 2 === 0 ? 'T1' : 'T2', time: retArr.toISOString() },
                    airline: airline.code, airlineName: airline.name,
                    flightNumber: 'R' + airline.num.split('-')[1],
                    aircraft: '320', duration: airline.dur, stops: 0, cabin: 'Y'
                }],
                totalDuration: airline.dur,
                origin: dest,
                destination: orig,
                departureTime: retDate.toISOString(),
                arrivalTime: retArr.toISOString(),
                stops: 0,
            });
        }

        const basePrice = airline.price * (adults || 1);
        const tax = Math.round(basePrice * 0.18);

        flights.push({
            id: `flight-demo-${i}`,
            type: legs.length > 1 ? 'Round Trip' : 'One Way',
            price: {
                total: basePrice + tax,
                base: basePrice,
                tax: tax,
                currency: 'INR',
            },
            legs,
            validatingCarrier: airline.code,
            isDemo: true,
        });
    });

    return flights;
}

// ─── Main service ────────────────────────────────────────────────────────────
class SabreService {
    constructor() {
        this.token = null;
        this.tokenExpiry = null;
    }

    async getAirportSuggestions(query) {
        if (!query || query.length < 2) return [];

        // Popular airports fallback for when API is unavailable
        const popularAirports = [
            { name: 'Indira Gandhi International Airport', code: 'DEL', city: 'New Delhi' },
            { name: 'Chhatrapati Shivaji Maharaj International Airport', code: 'BOM', city: 'Mumbai' },
            { name: 'Kempegowda International Airport', code: 'BLR', city: 'Bangalore' },
            { name: 'Rajiv Gandhi International Airport', code: 'HYD', city: 'Hyderabad' },
            { name: 'Chennai International Airport', code: 'MAA', city: 'Chennai' },
            { name: 'Netaji Subhas Chandra Bose International Airport', code: 'CCU', city: 'Kolkata' },
            { name: 'Pune Airport', code: 'PNQ', city: 'Pune' },
            { name: 'Sardar Vallabhbhai Patel International Airport', code: 'AMD', city: 'Ahmedabad' },
            { name: 'Goa International Airport', code: 'GOI', city: 'Goa' },
            { name: 'Cochin International Airport', code: 'COK', city: 'Kochi' },
            { name: 'Jaipur International Airport', code: 'JAI', city: 'Jaipur' },
            { name: 'Biju Patnaik International Airport', code: 'BBI', city: 'Bhubaneswar' },
            { name: 'Dubai International Airport', code: 'DXB', city: 'Dubai' },
            { name: 'London Heathrow Airport', code: 'LHR', city: 'London' },
            { name: 'John F. Kennedy International Airport', code: 'JFK', city: 'New York' },
            { name: 'Singapore Changi Airport', code: 'SIN', city: 'Singapore' },
            { name: 'Bangkok Suvarnabhumi Airport', code: 'BKK', city: 'Bangkok' },
            { name: 'Kuala Lumpur International Airport', code: 'KUL', city: 'Kuala Lumpur' },
            { name: 'Frankfurt Airport', code: 'FRA', city: 'Frankfurt' },
            { name: 'Paris Charles de Gaulle Airport', code: 'CDG', city: 'Paris' },
        ];

        const q = query.toLowerCase();
        const filtered = popularAirports.filter(a =>
            a.city.toLowerCase().includes(q) ||
            a.code.toLowerCase().includes(q) ||
            a.name.toLowerCase().includes(q)
        );

        if (filtered.length > 0 || USE_MOCK) return filtered;

        try {
            const token = await this.getToken();
            const response = await axios.get(
                `${SABRE_ENV}/v1/lists/utilities/geoservices/autocomplete?query=${query}&category=AIR`,
                { headers: { 'Authorization': `Bearer ${token}` }, timeout: 5000 }
            );
            return response.data.Response.map(item => ({
                name: item.name, code: item.code, city: item.city
            }));
        } catch (error) {
            console.error('Autocomplete Error, using local data:', error.message);
            return filtered;
        }
    }

    async getToken() {
        if (this.token && this.tokenExpiry && Date.now() < this.tokenExpiry) {
            return this.token;
        }

        const clientId = process.env.SABRE_CLIENT_ID;
        const clientSecret = process.env.SABRE_CLIENT_SECRET;

        if (!clientId || !clientSecret) {
            throw new Error('SABRE_CLIENT_ID or SABRE_CLIENT_SECRET is missing in .env');
        }

        // Double Base64 encoding (required by Sabre)
        const encodedId = Buffer.from(clientId).toString('base64');
        const encodedSecret = Buffer.from(clientSecret).toString('base64');
        const credentialsDouble = Buffer.from(`${encodedId}:${encodedSecret}`).toString('base64');
        const credentialsSingle = Buffer.from(`${clientId}:${clientSecret}`).toString('base64');

        const tryAuth = async (credentials, label) => {
            console.log(`Attempting Sabre Auth (${label})...`);
            const response = await axios.post(
                `${SABRE_ENV}/v2/auth/token`,
                'grant_type=client_credentials',
                {
                    headers: {
                        'Authorization': `Basic ${credentials}`,
                        'Content-Type': 'application/x-www-form-urlencoded'
                    },
                    timeout: 15000
                }
            );
            this.token = response.data.access_token;
            this.tokenExpiry = Date.now() + (response.data.expires_in * 1000) - 60000;
            console.log(`✅ Sabre Auth OK (${label})`);
            return this.token;
        };

        try {
            return await tryAuth(credentialsDouble, 'Double Base64');
        } catch (e1) {
            console.log('Double Base64 failed, trying Single...');
            try {
                return await tryAuth(credentialsSingle, 'Single Base64');
            } catch (e2) {
                throw e2;
            }
        }
    }

    async searchFlights(searchParams) {
        const {
            origin, destination, departureDate, returnDate,
            passengers = 1, adults, travelClass = 'Economy',
            tripType, children = 0, infants = 0
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
            // Check if it's already a 3-letter IATA code (parenthetical)
            const iataMatch = str && str.match(/\(([A-Z]{3})\)/);
            if (iataMatch) return iataMatch[1];
            return mapping[s] || (str || '').toUpperCase().replace(/[^A-Z]/g, '').substring(0, 3);
        };

        const originCode = toIata(origin);
        const destCode = toIata(destination);
        const totalAdults = parseInt(adults || passengers || 1);

        // If mock mode is enabled, ALWAYS return demo data and never call Sabre
        if (USE_MOCK) {
            console.log('📦 Using demo flight data (MOCK MODE ENABLED)');
            return buildDemoFlights(originCode, destCode, departureDate, returnDate, totalAdults, tripType);
        }

        // Try real Sabre API (STRICT: no silent demo fallback)
        try {
            const token = await this.getToken();

            const classMap = {
                'ECONOMY': 'Y', 'ECONOMY_SAVER': 'Y',
                'PREMIUM_ECONOMY': 'S', 'PREMIUM ECONOMY': 'S',
                'BUSINESS': 'C', 'FIRST': 'F', 'FIRST_CLASS': 'F',
            };
            const sabreClass = classMap[(travelClass || 'ECONOMY').toUpperCase().replace(' ', '_')] || 'Y';

            const originDestInfo = [
                {
                    RPH: '1',
                    DepartureDateTime: `${departureDate}T00:00:00`,
                    OriginLocation: { LocationCode: originCode },
                    DestinationLocation: { LocationCode: destCode },
                    TPA_Extensions: { CabinPref: { Cabin: sabreClass, PreferLevel: 'Preferred' } }
                }
            ];

            if ((returnDate || tripType === 'round_trip') && returnDate) {
                originDestInfo.push({
                    RPH: '2',
                    DepartureDateTime: `${returnDate}T00:00:00`,
                    OriginLocation: { LocationCode: destCode },
                    DestinationLocation: { LocationCode: originCode },
                });
            }

            const passengerTypes = [{ Code: 'ADT', Quantity: totalAdults }];
            if (parseInt(children) > 0) passengerTypes.push({ Code: 'CNN', Quantity: parseInt(children) });
            if (parseInt(infants) > 0) passengerTypes.push({ Code: 'INF', Quantity: parseInt(infants) });

            const requestBody = {
                OTA_AirLowFareSearchRQ: {
                    Version: '5.3.0',
                    POS: {
                        Source: [{
                            PseudoCityCode: process.env.SABRE_PCC || 'IPCC',
                            RequestorID: {
                                Type: '1',
                                ID: 'FLT',
                                CompanyName: { Code: 'TN' }
                            }
                        }]
                    },
                    OriginDestinationInformation: originDestInfo,
                    TravelerInfoSummary: {
                        SeatsRequested: [totalAdults],
                        AirTravelerAvail: [{ PassengerTypeQuantity: passengerTypes }]
                    },
                    TPA_Extensions: {
                        IntelliSellTransaction: { ServiceTag: 'BFM' }
                    }
                }
            };

            console.log(`🔍 Searching Sabre: ${originCode} → ${destCode} on ${departureDate}`);

            // Try v4.3.0 (most common) then v5 endpoint
            let response;
            try {
                response = await axios.post(
                    `${SABRE_ENV}/v4.3.0/shop/flights`,
                    requestBody,
                    {
                        headers: {
                            'Authorization': `Bearer ${token}`,
                            'Content-Type': 'application/json'
                        },
                        timeout: 25000
                    }
                );
            } catch (endpointErr) {
                console.log('v4.3.0 failed, trying v5...');
                response = await axios.post(
                    `${SABRE_ENV}/v5/offers/shop/flights?forceitinerary=true`,
                    requestBody,
                    {
                        headers: {
                            'Authorization': `Bearer ${token}`,
                            'Content-Type': 'application/json'
                        },
                        timeout: 25000
                    }
                );
            }

            const formatted = this.formatFlightResults(response.data, originCode, destCode);
            console.log(`✅ Sabre returned ${formatted.length} flights`);

            if (formatted.length === 0) {
                // No itineraries from Sabre – do NOT return demo data in strict mode
                throw new Error('No flights returned from Sabre for the selected route/date.');
            }

            return formatted;

        } catch (error) {
            // In strict (real) mode we surface the Sabre error to the client instead of returning demo data
            const message = error.response?.data?.error_description
                || error.response?.data?.message
                || error.message
                || 'Sabre API error';
            console.error('⚠️  Sabre API error (STRICT MODE):', message);
            throw new Error(message);
        }
    }

    formatFlightResults(data, originCode, destCode) {
        // Handle both OTA and Grouped response structures
        const rs = data.OTA_AirLowFareSearchRS || data.groupedItineraryResponse;
        if (!rs) return [];

        // Standard OTA format
        if (rs.PricedItineraries) {
            const pricedItineraries = rs.PricedItineraries.PricedItinerary || [];
            return pricedItineraries.slice(0, 20).map((itinerary, index) => {
                try {
                    const airItinerary = itinerary.AirItinerary;
                    const originDestinationOptions = airItinerary.OriginDestinationOptions.OriginDestinationOption;
                    const pricingInfo = Array.isArray(itinerary.AirItineraryPricingInfo)
                        ? itinerary.AirItineraryPricingInfo[0]
                        : itinerary.AirItineraryPricingInfo;
                    const itinTotalFare = pricingInfo.ItinTotalFare;

                    const legs = originDestinationOptions.map(option => {
                        const segments = option.FlightSegment.map(segment => ({
                            departure: {
                                airport: segment.DepartureAirport.LocationCode,
                                terminal: segment.DepartureAirport.TerminalID || '',
                                time: segment.DepartureDateTime
                            },
                            arrival: {
                                airport: segment.ArrivalAirport.LocationCode,
                                terminal: segment.ArrivalAirport.TerminalID || '',
                                time: segment.ArrivalDateTime
                            },
                            airline: segment.MarketingAirline.Code,
                            airlineName: AIRLINE_NAMES[segment.MarketingAirline.Code] || segment.MarketingAirline.Code,
                            flightNumber: segment.FlightNumber,
                            aircraft: segment.Equipment ? segment.Equipment.AirEquipType : '',
                            duration: segment.ElapsedTime,
                            stops: segment.StopQuantity || 0,
                            cabin: segment.ResBookDesigCode
                        }));

                        const totalDuration = segments.reduce((acc, s) => acc + (parseInt(s.duration) || 0), 0);

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

                    const taxes = itinTotalFare.Taxes;
                    const taxAmount = taxes && taxes.Tax && taxes.Tax[0]
                        ? parseFloat(taxes.Tax[0].Amount)
                        : 0;

                    return {
                        id: `flight-${index}`,
                        type: legs.length > 1 ? 'Round Trip' : 'One Way',
                        price: {
                            total: parseFloat(itinTotalFare.TotalFare.Amount),
                            base: parseFloat(itinTotalFare.BaseFare.Amount),
                            tax: taxAmount,
                            currency: itinTotalFare.TotalFare.CurrencyCode,
                        },
                        legs,
                        validatingCarrier: pricingInfo.TPA_Extensions?.ValidatingCarrier?.Code || '',
                    };
                } catch (err) {
                    console.error(`Error parsing itinerary ${index}:`, err.message);
                    return null;
                }
            }).filter(Boolean);
        }

        return [];
    }
}

module.exports = new SabreService();
