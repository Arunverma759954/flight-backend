const axios = require('axios');

async function testSearch() {
    console.log('Testing Flight Search API...');

    try {
        const response = await axios.post('http://localhost:5000/api/flights/search', {
            origin: 'JFK',
            destination: 'LAX',
            departureDate: '2026-06-01',
            adults: 1,
            travelClass: 'Economy'
        });

        console.log('Search Results:', JSON.stringify(response.data, null, 2));
        console.log('\nSUCCESS: API is working and returning data!');
    } catch (error) {
        console.error('FAILED: API returned an error.');
        if (error.response) {
            console.error('Status:', error.response.status);
            console.error('Data:', JSON.stringify(error.response.data, null, 2));
        } else {
            console.error('Message:', error.message);
        }
    }
}

testSearch();
