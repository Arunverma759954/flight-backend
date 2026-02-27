require('dotenv').config();
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const amadeusService = require('./amadeusService');

const app = express();
const PORT = process.env.PORT || 5000;

// Middleware
app.use(helmet());
app.use(cors());
app.use(morgan('dev'));
app.use(express.json());

// Routes
app.get('/', (req, res) => {
    res.json({ message: 'RedeFlights Backend is running!' });
});

/**
 * Airport Suggestions API (static popular airports)
 * GET /api/flights/suggestions?q=del
 */
const POPULAR_AIRPORTS = [
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

app.get('/api/flights/suggestions', (req, res) => {
    const q = (req.query.q || '').toLowerCase();
    if (!q || q.length < 2) {
        return res.json([]);
    }

    const filtered = POPULAR_AIRPORTS.filter((a) =>
        a.city.toLowerCase().includes(q) ||
        a.code.toLowerCase().includes(q) ||
        a.name.toLowerCase().includes(q)
    );

    res.json(filtered);
});

/**
 * Flight Search API
 * POST /api/flights/search
 * (Also supports GET with query params for no-code builders)
 */

// Unified handler used by both POST body and GET query
async function handleFlightSearch(req, res) {
    console.log('--- NEW SEARCH REQUEST ---');
    const payload = req.method === 'GET' ? req.query : req.body;
    console.log('Params:', JSON.stringify(payload, null, 2));

    try {
        const results = await amadeusService.searchFlights(payload);
        console.log('Search successful, returning', results.length, 'flights');
        res.json(results);
    } catch (error) {
        console.error('SEARCH ERROR:', error.message);
        res.status(500).json({ error: error.message });
    }
}

app.post('/api/flights/search', handleFlightSearch);
app.get('/api/flights/search', handleFlightSearch);
});

// Health check for Amadeus authentication
app.get('/api/health', async (req, res) => {
    try {
        const token = await amadeusService.getToken();
        res.json({ status: 'Connected to Amadeus', hasToken: !!token });
    } catch (error) {
        res.status(500).json({ status: 'Amadeus Connection Failed', error: error.message });
    }
});

// Error handling middleware
app.use((err, req, res, next) => {
    console.error(err.stack);
    res.status(500).json({
        error: 'Something went wrong!',
        message: err.message
    });
});

const server = app.listen(PORT, () => {
    console.log(`\n✅ SUCCESS: RedeFlights Backend is now listening on http://localhost:${PORT}`);
    console.log(`🔗 Health Check: http://localhost:${PORT}/api/health\n`);
});

// Catch server errors (like port already in use)
server.on('error', (err) => {
    if (err.code === 'EADDRINUSE') {
        console.error(`\n❌ ERROR: Port ${PORT} is already in use!`);
        console.error(`This means your previous server is still running in the background.`);
        console.error(`Please run this command to fix it: taskkill /F /PID <PID_FROM_TERMINAL>\n`);
    } else {
        console.error('SERVER ERROR:', err);
    }
});

// Keep process from exiting on unhandled rejections
process.on('unhandledRejection', (reason, promise) => {
    console.error('Unhandled Rejection at:', promise, 'reason:', reason);
});

process.on('uncaughtException', (err) => {
    console.error('Uncaught Exception:', err);
});
