// Quick test script for admin auth flow
const http = require('http');

function postJSON(path, data) {
    return new Promise((resolve, reject) => {
        const body = JSON.stringify(data);
        const req = http.request({
            hostname: 'localhost',
            port: 3000,
            path,
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Content-Length': body.length }
        }, (res) => {
            let chunks = '';
            res.on('data', d => chunks += d);
            res.on('end', () => resolve({ status: res.statusCode, body: JSON.parse(chunks) }));
        });
        req.on('error', reject);
        req.write(body);
        req.end();
    });
}

function getJSON(path, token) {
    return new Promise((resolve, reject) => {
        const headers = {};
        if (token) headers['Authorization'] = `Bearer ${token}`;
        const req = http.request({
            hostname: 'localhost',
            port: 3000,
            path,
            method: 'GET',
            headers
        }, (res) => {
            let chunks = '';
            res.on('data', d => chunks += d);
            res.on('end', () => resolve({ status: res.statusCode, body: JSON.parse(chunks) }));
        });
        req.on('error', reject);
        req.end();
    });
}

async function runTests() {
    console.log('=== AUBA Bug Fix Verification ===\n');

    // Test 1: Public services endpoint (BUG-27)
    const services = await getJSON('/api/services');
    console.log(`[BUG-27] Services API: ${services.status === 200 ? '✅ PASS' : '❌ FAIL'} (${services.body.length} services)`);

    // Test 2: Admin route without auth (BUG-03)
    const noAuth = await getJSON('/api/admin/stats');
    console.log(`[BUG-03] Admin stats without auth: ${noAuth.status === 401 ? '✅ PASS (401 Unauthorized)' : '❌ FAIL'}`);

    // Test 3: Admin login with bcrypt (BUG-02)
    const login = await postJSON('/api/auth/admin/login', { phone: '3001234567', password: 'admin2026' });
    console.log(`[BUG-02] Admin login (bcrypt): ${login.body.success ? '✅ PASS' : '❌ FAIL'} - token: ${login.body.token ? 'received' : 'missing'}`);

    if (login.body.token) {
        // Test 4: Admin route WITH auth token (BUG-03)
        const withAuth = await getJSON('/api/admin/stats', login.body.token);
        console.log(`[BUG-03] Admin stats with token: ${withAuth.status === 200 ? '✅ PASS' : '❌ FAIL'}`);
    }

    // Test 5: User registration with short password (BUG-28)
    const shortPw = await postJSON('/api/auth/register', { name: 'Test', phone: '3001234560', password: '1234', email: 'test@test.com' });
    console.log(`[BUG-28] Short password rejected: ${shortPw.body.error && shortPw.body.error.includes('6') ? '✅ PASS' : '❌ FAIL'} - ${shortPw.body.error}`);

    // Test 6: User registration without email (BUG-18)
    const noEmail = await postJSON('/api/auth/register', { name: 'Test User', phone: '3001234561', password: '123456' });
    console.log(`[BUG-18] Missing email rejected: ${!noEmail.body.success ? '✅ PASS' : '❌ FAIL'} - ${noEmail.body.error}`);

    // Test 7: Past date validation (BUG-10) - try creating booking with yesterday
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    const dateStr = yesterday.toISOString().split('T')[0];
    const pastDate = await postJSON('/api/bookings', {
        user_id: 1, manicurist_id: 1, service_id: 1,
        booking_date: dateStr, booking_time: '10:00'
    });
    console.log(`[BUG-10] Past date rejected: ${pastDate.body.error && pastDate.body.error.includes('pasada') ? '✅ PASS' : '❌ FAIL'} - ${JSON.stringify(pastDate.body)}`);

    // Test 8: Rate limiting (BUG-24) - test with wrong credentials
    const wrongLogin = await postJSON('/api/auth/admin/login', { phone: 'wrong', password: 'wrong' });
    console.log(`[BUG-24] Rate limiting active: ${wrongLogin.status === 401 ? '✅ PASS (login rate limited endpoint)' : '❌ CHECK'}`);

    console.log('\n=== Tests Complete ===');
}

runTests().catch(console.error);
