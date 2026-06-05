const axios = require('axios');

async function test() {
    try {
        console.log('Testing Patient API...');
        const res = await axios.get('http://localhost:3000/api/patient/HN-690023');
        console.log('Response:', JSON.stringify(res.data, null, 2));
    } catch (err) {
        console.error('Error:', err.message);
    }
}

test();
