/**
 * AUBA Beauty Studio — QA Test Suite
 * Tests all major endpoints and flows
 */

const http = require('http');

const BASE = 'http://localhost:3000';
let passed = 0;
let failed = 0;
const results = [];

function request(method, path, body = null, headers = {}) {
    return new Promise((resolve, reject) => {
        const url = new URL(path, BASE);
        const opts = {
            hostname: url.hostname,
            port: url.port,
            path: url.pathname,
            method,
            headers: { 'Content-Type': 'application/json', ...headers },
            timeout: 5000
        };

        const req = http.request(opts, (res) => {
            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', () => {
                try {
                    resolve({ status: res.statusCode, headers: res.headers, body: data, json: JSON.parse(data) });
                } catch {
                    resolve({ status: res.statusCode, headers: res.headers, body: data, json: null });
                }
            });
        });
        req.on('error', reject);
        req.on('timeout', () => { req.destroy(); reject(new Error('Timeout')); });
        if (body) req.write(JSON.stringify(body));
        req.end();
    });
}

function test(name, fn) {
    return fn().then(result => {
        if (result.pass) {
            passed++;
            results.push(`✅ PASS: ${name}`);
        } else {
            failed++;
            results.push(`❌ FAIL: ${name} — ${result.reason}`);
        }
    }).catch(err => {
        failed++;
        results.push(`❌ FAIL: ${name} — Exception: ${err.message}`);
    });
}

async function runTests() {
    console.log('🧪 AUBA Beauty Studio — QA Test Suite\n');
    console.log('='.repeat(50));

    // ========== 1. STATIC PAGES ==========
    console.log('\n📄 1. PÁGINAS ESTÁTICAS\n');

    await test('Landing page loads (200)', async () => {
        const r = await request('GET', '/index.html');
        return { pass: r.status === 200 && r.body.includes('AUBA'), reason: `Status: ${r.status}` };
    });

    await test('Booking page loads (200)', async () => {
        const r = await request('GET', '/booking.html');
        return { pass: r.status === 200 && r.body.includes('Reserva'), reason: `Status: ${r.status}` };
    });

    await test('Admin page loads (200)', async () => {
        const r = await request('GET', '/admin.html');
        return { pass: r.status === 200, reason: `Status: ${r.status}` };
    });

    await test('Privacy page loads (200)', async () => {
        const r = await request('GET', '/privacy.html');
        return { pass: r.status === 200, reason: `Status: ${r.status}` };
    });

    await test('Terms page loads (200)', async () => {
        const r = await request('GET', '/terms.html');
        return { pass: r.status === 200, reason: `Status: ${r.status}` };
    });

    await test('404 page for unknown route', async () => {
        const r = await request('GET', '/nonexistent-page.html');
        return { pass: r.status === 404, reason: `Status: ${r.status}` };
    });

    await test('Manifest.json loads', async () => {
        const r = await request('GET', '/manifest.json');
        return { pass: r.status === 200 && r.json && r.json.name, reason: `Status: ${r.status}` };
    });

    await test('Service Worker loads', async () => {
        const r = await request('GET', '/sw.js');
        return { pass: r.status === 200, reason: `Status: ${r.status}` };
    });

    // ========== 2. SECURITY ==========
    console.log('\n🔐 2. SEGURIDAD\n');

    await test('.env file NOT accessible', async () => {
        const r = await request('GET', '/.env');
        return { pass: r.status === 404, reason: `Status: ${r.status} — FILE EXPOSED!` };
    });

    await test('server.js NOT accessible', async () => {
        const r = await request('GET', '/server.js');
        return { pass: r.status === 404, reason: `Status: ${r.status} — FILE EXPOSED!` };
    });

    await test('package.json NOT accessible', async () => {
        const r = await request('GET', '/package.json');
        return { pass: r.status === 404, reason: `Status: ${r.status} — FILE EXPOSED!` };
    });

    await test('Security headers present (helmet)', async () => {
        const r = await request('GET', '/index.html');
        const hasXFrame = !!r.headers['x-frame-options'];
        const hasCSP = !!r.headers['content-security-policy'];
        return { pass: hasXFrame || hasCSP, reason: `X-Frame: ${hasXFrame}, CSP: ${hasCSP}` };
    });

    // ========== 3. API ENDPOINTS ==========
    console.log('\n🔌 3. API ENDPOINTS\n');

    await test('Health check endpoint', async () => {
        const r = await request('GET', '/api/health');
        return { pass: r.status === 200 && r.json && r.json.status === 'ok', reason: `Status: ${r.status}, Body: ${r.body.substring(0, 100)}` };
    });

    await test('GET /api/services returns array', async () => {
        const r = await request('GET', '/api/services');
        return { pass: r.status === 200 && Array.isArray(r.json), reason: `Status: ${r.status}, Count: ${r.json ? r.json.length : 'N/A'}` };
    });

    await test('GET /api/manicurists returns array', async () => {
        const r = await request('GET', '/api/manicurists');
        return { pass: r.status === 200 && Array.isArray(r.json), reason: `Status: ${r.status}, Count: ${r.json ? r.json.length : 'N/A'}` };
    });

    // ========== 4. AUTH — REGISTER ==========
    console.log('\n👤 4. REGISTRO DE USUARIO\n');

    const testUser = {
        name: 'QA Test User',
        phone: '3001112233',
        email: 'qatest@test.com',
        password: 'test123'
    };

    await test('Register with valid data', async () => {
        const r = await request('POST', '/api/auth/register', testUser);
        // Could be success or "already exists"
        return {
            pass: r.status === 200 || r.status === 201 || (r.json && r.json.error && r.json.error.includes('registrado')),
            reason: `Status: ${r.status}, Body: ${r.body.substring(0, 150)}`
        };
    });

    await test('Register with missing name (should fail)', async () => {
        const r = await request('POST', '/api/auth/register', { phone: '3009999999', password: 'test123' });
        return { pass: r.status >= 400 || (r.json && !r.json.success), reason: `Status: ${r.status}, Body: ${r.body.substring(0, 100)}` };
    });

    await test('Register with short password (should fail)', async () => {
        const r = await request('POST', '/api/auth/register', { name: 'Test', phone: '3008888888', password: '123' });
        return { pass: r.status >= 400 || (r.json && !r.json.success), reason: `Status: ${r.status}` };
    });

    // ========== 5. AUTH — LOGIN ==========
    console.log('\n🔑 5. LOGIN\n');

    let userToken = null;
    let userId = null;

    await test('Login with valid credentials', async () => {
        const r = await request('POST', '/api/auth/login', { phone: testUser.phone, password: testUser.password });
        if (r.json && r.json.token) {
            userToken = r.json.token;
            userId = r.json.user ? r.json.user.id : null;
        }
        return { pass: r.json && r.json.token, reason: `Status: ${r.status}, HasToken: ${!!userToken}` };
    });

    await test('Login with wrong password (should fail)', async () => {
        const r = await request('POST', '/api/auth/login', { phone: testUser.phone, password: 'wrongpass' });
        return { pass: !r.json || !r.json.token, reason: `Status: ${r.status}` };
    });

    await test('Login with non-existent user (should fail)', async () => {
        const r = await request('POST', '/api/auth/login', { phone: '0000000000', password: 'test123' });
        return { pass: !r.json || !r.json.token, reason: `Status: ${r.status}` };
    });

    // ========== 6. BOOKING FLOW ==========
    console.log('\n📅 6. FLUJO DE RESERVA\n');

    // Get first manicurist and service for booking
    let manicuristId = null;
    let serviceId = null;

    await test('Get manicurists for booking', async () => {
        const r = await request('GET', '/api/manicurists');
        if (r.json && r.json.length > 0) manicuristId = r.json[0].id;
        return { pass: !!manicuristId, reason: `Manicurist ID: ${manicuristId}` };
    });

    await test('Get services for booking', async () => {
        const r = await request('GET', '/api/services');
        if (r.json && r.json.length > 0) serviceId = r.json[0].id;
        return { pass: !!serviceId, reason: `Service ID: ${serviceId}` };
    });

    // Future date for booking
    const futureDate = new Date();
    futureDate.setDate(futureDate.getDate() + 3);
    if (futureDate.getDay() === 0) futureDate.setDate(futureDate.getDate() + 1); // Skip Sunday
    const bookingDate = futureDate.toISOString().split('T')[0];

    await test('Check availability for date', async () => {
        if (!manicuristId) return { pass: false, reason: 'No manicurist ID' };
        const r = await request('GET', `/api/availability/${manicuristId}/${bookingDate}`);
        return { pass: r.status === 200 && r.json, reason: `Status: ${r.status}` };
    });

    let bookingId = null;

    await test('Create booking with auth token', async () => {
        if (!userToken || !manicuristId || !serviceId) return { pass: false, reason: 'Missing deps' };
        const r = await request('POST', '/api/bookings', {
            user_id: userId,
            manicurist_id: manicuristId,
            service_id: serviceId,
            booking_date: bookingDate,
            booking_time: '14:00:00'
        }, { 'Authorization': `Bearer ${userToken}` });
        if (r.json && r.json.booking_id) bookingId = r.json.booking_id;
        return { pass: r.json && r.json.success, reason: `Status: ${r.status}, BookingID: ${bookingId}, Body: ${r.body.substring(0, 150)}` };
    });

    await test('Create booking without auth (should fail)', async () => {
        const r = await request('POST', '/api/bookings', {
            user_id: userId,
            manicurist_id: manicuristId,
            service_id: serviceId,
            booking_date: bookingDate,
            booking_time: '15:00:00'
        });
        return { pass: r.status === 401 || r.status === 403 || (r.json && !r.json.success), reason: `Status: ${r.status}` };
    });

    await test('Get user bookings', async () => {
        if (!userId) return { pass: false, reason: 'No user ID' };
        const r = await request('GET', `/api/bookings/${userId}`);
        return { pass: r.status === 200 && Array.isArray(r.json), reason: `Status: ${r.status}, Count: ${r.json ? r.json.length : 'N/A'}` };
    });

    // ========== 7. ADMIN AUTH ==========
    console.log('\n👨‍💼 7. ADMIN\n');

    let adminToken = null;

    await test('Admin login with default credentials', async () => {
        const r = await request('POST', '/api/auth/admin/login', { phone: '3000000000', password: 'admin2026' });
        if (r.json && r.json.token) adminToken = r.json.token;
        return { pass: !!adminToken, reason: `Status: ${r.status}, HasToken: ${!!adminToken}` };
    });

    await test('Admin stats endpoint (with auth)', async () => {
        if (!adminToken) return { pass: false, reason: 'No admin token' };
        const r = await request('GET', '/api/admin/stats', null, { 'Authorization': `Bearer ${adminToken}` });
        return { pass: r.status === 200 && r.json, reason: `Status: ${r.status}, Body: ${r.body.substring(0, 150)}` };
    });

    await test('Admin stats without auth (should fail)', async () => {
        const r = await request('GET', '/api/admin/stats');
        return { pass: r.status === 401 || r.status === 403, reason: `Status: ${r.status}` };
    });

    await test('Admin bookings list', async () => {
        if (!adminToken) return { pass: false, reason: 'No admin token' };
        const r = await request('GET', '/api/admin/bookings', null, { 'Authorization': `Bearer ${adminToken}` });
        return { pass: r.status === 200, reason: `Status: ${r.status}` };
    });

    await test('Admin services CRUD — list all', async () => {
        if (!adminToken) return { pass: false, reason: 'No admin token' };
        const r = await request('GET', '/api/services');
        return { pass: r.status === 200 && r.json.length >= 6, reason: `Count: ${r.json ? r.json.length : 0}` };
    });

    // ========== 8. MANICURIST AUTH ==========
    console.log('\n💅 8. MANICURISTA\n');

    let manicuristToken = null;

    await test('Manicurist login', async () => {
        const r = await request('POST', '/api/auth/manicurist/login', { phone: '3001234567', password: 'auba2026' });
        if (r.json && r.json.token) manicuristToken = r.json.token;
        return { pass: !!manicuristToken, reason: `Status: ${r.status}, HasToken: ${!!manicuristToken}` };
    });

    await test('Manicurist bookings (with auth)', async () => {
        if (!manicuristToken || !manicuristId) return { pass: false, reason: 'Missing deps' };
        const r = await request('GET', `/api/manicurists/${manicuristId}/bookings`, null, { 'Authorization': `Bearer ${manicuristToken}` });
        return { pass: r.status === 200, reason: `Status: ${r.status}` };
    });

    // ========== 9. EDGE CASES ==========
    console.log('\n⚠️ 9. EDGE CASES\n');

    await test('Booking with past date (should fail)', async () => {
        if (!userToken) return { pass: false, reason: 'No token' };
        const r = await request('POST', '/api/bookings', {
            user_id: userId,
            manicurist_id: manicuristId,
            service_id: serviceId,
            booking_date: '2024-01-01',
            booking_time: '10:00:00'
        }, { 'Authorization': `Bearer ${userToken}` });
        return { pass: r.status >= 400 || (r.json && !r.json.success), reason: `Status: ${r.status}, Body: ${r.body.substring(0, 100)}` };
    });

    await test('API returns JSON for unknown API route', async () => {
        const r = await request('GET', '/api/nonexistent');
        return { pass: r.status === 404, reason: `Status: ${r.status}` };
    });

    // ========== RESULTS ==========
    console.log('\n' + '='.repeat(50));
    console.log(`\n📊 RESULTADOS: ${passed} ✅ passed, ${failed} ❌ failed (${passed + failed} total)\n`);
    results.forEach(r => console.log(r));
    console.log('\n' + '='.repeat(50));

    process.exit(failed > 0 ? 1 : 0);
}

runTests().catch(err => {
    console.error('Fatal error:', err);
    process.exit(1);
});
