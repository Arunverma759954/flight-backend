require('dotenv').config();
const axios = require('axios');

async function debugAuth() {
    const clientId = process.env.SABRE_CLIENT_ID;
    const clientSecret = process.env.SABRE_CLIENT_SECRET;
    const SABRE_ENV = process.env.SABRE_ENVIRONMENT || 'https://api.test.sabre.com';

    console.log('Using Client ID:', clientId);
    console.log('Using Client Secret:', clientSecret);
    console.log('Using Environment:', SABRE_ENV);

    // Common Encoding Formats
    const encodedId = Buffer.from(clientId).toString('base64');
    const encodedSecret = Buffer.from(clientSecret).toString('base64');

    // Double Base64 (Proper for Sabre REST)
    const b64_double = Buffer.from(`${encodedId}:${encodedSecret}`).toString('base64');
    // Single Base64 (Standard Basic Auth)
    const b64_single = Buffer.from(`${clientId}:${clientSecret}`).toString('base64');

    async function tryAuth(label, endpoint, credentials) {
        console.log(`\n--- Testing ${label} on ${endpoint} ---`);
        try {
            const response = await axios.post(`${SABRE_ENV}${endpoint}`, 'grant_type=client_credentials', {
                headers: {
                    'Authorization': `Basic ${credentials}`,
                    'Content-Type': 'application/x-www-form-urlencoded'
                },
                timeout: 15000 // 15 seconds timeout
            });
            console.log(`SUCCESS! Status: ${response.status}`);
            console.log('Token obtained successfully.');
            return true;
        } catch (error) {
            console.log(`FAILED.`);
            if (error.code === 'ECONNABORTED') {
                console.log('Error: Connection Timed Out (Server not responding)');
            } else if (error.response) {
                console.log('Status:', error.response.status);
                console.log('Error Message:', error.response.data.error_description || error.response.data.message || JSON.stringify(error.response.data));
            } else {
                console.log('Error Message:', error.message);
            }
            return false;
        }
    }

    // Try all common combinations
    await tryAuth('Double Base64', '/v2/auth/token', b64_double);
    await tryAuth('Single Base64', '/v2/auth/token', b64_single);
    await tryAuth('Double Base64', '/v3/auth/token', b64_double);
    await tryAuth('Single Base64', '/v3/auth/token', b64_single);
}

debugAuth();
