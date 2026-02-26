require('dotenv').config();
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const sabreService = require('./sabreService');

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
 * Airport Suggestions API
 * GET /api/flights/suggestions?q=del
 */
app.get('/api/flights/suggestions', async (req, res) => {
    const { q } = req.query;
    try {
        const suggestions = await sabreService.getAirportSuggestions(q);
        res.json(suggestions);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

/**
 * Flight Search API
 * POST /api/flights/search
 */
app.post('/api/flights/search', async (req, res) => {
    console.log('--- NEW SEARCH REQUEST ---');
    console.log('Params:', JSON.stringify(req.body, null, 2));

    try {
        const results = await sabreService.searchFlights(req.body);
        console.log('Search successful, returning', results.length, 'flights');
        res.json(results);
    } catch (error) {
        console.error('SEARCH ERROR:', error.message);
        res.status(500).json({ error: error.message });
    }
});

// Health check for Sabre authentication
app.get('/api/sabre/health', async (req, res) => {
    try {
        const token = await sabreService.getToken();
        res.json({ status: 'Connected to Sabre', hasToken: !!token });
    } catch (error) {
        res.status(500).json({ status: 'Sabre Connection Failed', error: error.message });
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
    console.log(`🔗 Health Check: http://localhost:${PORT}/api/sabre/health\n`);
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
