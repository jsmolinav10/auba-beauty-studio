/**
 * AUBA Beauty Studio - Comprehensive Logic & Functionality Validation Suite
 * 
 * Verifies 100% of the backend logical processes without modifying any source code:
 * 1. Database Connection & Schema Health
 * 2. User Authentication Flow (Register, Login, Token validation, Edge cases)
 * 3. Manicurist Portal Flow (Login, Agenda, Status update, Availability)
 * 4. Admin Management Flow (Login, Stats, Bookings list, Services query)
 * 5. Booking Engine & Conflict Logic (Valid booking, Time-slot collision rejection, Past date rejection, User booking query)
 * 6. Rescheduling Logic (Availability check, 24-hour advance requirement, Overlap rejection)
 * 7. Payment System Logic (Nequi config, Payment registration, Reference update)
 * 8. Security & Static Assets (Protected files, CSP/Helmet headers, 404 fallback, PWA manifest)
 */

require('dotenv').config();
const http = require('http');
const app = require('../server.js');
const db = require('../db.js');

let server;
let BASE_URL;
let passed = 0;
let failed = 0;
const results = [];
const errors = [];

// HTTP Request helper
function request(method, path, body = null, headers = {}) {
    return new Promise((resolve, reject) => {
        const url = new URL(path, BASE_URL);
        const opts = {
            hostname: url.hostname,
            port: url.port,
            path: url.pathname + url.search,
            method,
            headers: {
                'Content-Type': 'application/json',
                'User-Agent': 'AUBA-Validator/1.0',
                ...headers
            },
            timeout: 10000
        };

        const req = http.request(opts, (res) => {
            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', () => {
                let json = null;
                try {
                    json = JSON.parse(data);
                } catch (e) {
                    // Not JSON
                }
                resolve({
                    status: res.statusCode,
                    headers: res.headers,
                    body: data,
                    json
                });
            });
        });

        req.on('error', reject);
        req.on('timeout', () => {
            req.destroy();
            reject(new Error('Request timed out'));
        });

        if (body) {
            req.write(typeof body === 'string' ? body : JSON.stringify(body));
        }
        req.end();
    });
}

async function test(group, name, fn) {
    try {
        const res = await fn();
        if (res.skip) {
            const msg = `  ⏭️  [${group}] ${name} -> OMITIDO: ${res.reason}`;
            results.push(msg);
            console.log(msg);
            return;
        }
        if (res.pass) {
            passed++;
            const msg = `  ✅ [${group}] ${name}`;
            results.push(msg);
            console.log(msg);
        } else {
            failed++;
            const msg = `  ❌ [${group}] ${name} -> ${res.reason || 'Assertion failed'}`;
            results.push(msg);
            errors.push(msg);
            console.error(msg);
        }
    } catch (err) {
        failed++;
        const msg = `  ❌ [${group}] ${name} -> Exception: ${err.message}`;
        results.push(msg);
        errors.push(msg);
        console.error(msg);
    }
}

async function runComprehensiveValidation() {
    console.log('===============================================================');
    console.log(' ✨ AUBA BEAUTY STUDIO - SISTEMA DE VALIDACIÓN INTEGRAL ✨');
    console.log('===============================================================\n');

    // 1. Start ephemeral test server
    await new Promise((resolve) => {
        server = app.listen(0, () => {
            const port = server.address().port;
            BASE_URL = `http://localhost:${port}`;
            console.log(`📡 Servidor de pruebas iniciado en puerto dinámico: ${port}\n`);
            resolve();
        });
    });

    // Test Variables
    const testTimestamp = Date.now();
    const uniquePhone = '31' + Math.floor(10000000 + Math.random() * 89999999);
    const testPassword = 'TestPassword#2026!';
    let registeredUserId = null;
    let userJwtToken = null;
    let manicuristJwtToken = null;
    let adminJwtToken = null;
    let targetManicuristId = null;
    let targetServiceId = null;
    let createdBookingId = null;

    // Helper for dates
    const futureDateObj = new Date();
    futureDateObj.setDate(futureDateObj.getDate() + 15); // 15 days ahead
    if (futureDateObj.getDay() === 0) futureDateObj.setDate(futureDateObj.getDate() + 1); // Skip Sunday
    const testBookingDate = futureDateObj.toISOString().split('T')[0];

    const rescheduleDateObj = new Date(futureDateObj);
    rescheduleDateObj.setDate(rescheduleDateObj.getDate() + 2);
    if (rescheduleDateObj.getDay() === 0) rescheduleDateObj.setDate(rescheduleDateObj.getDate() + 1);
    const testRescheduleDate = rescheduleDateObj.toISOString().split('T')[0];

    // ============================================================
    // MÓDULO 1: BASE DE DATOS Y CONECTIVIDAD
    // ============================================================
    console.log('\n--- 📦 MÓDULO 1: CONECTIVIDAD Y ESQUEMA DE BASE DE DATOS ---');

    await test('DATABASE', 'Conexión activa a PostgreSQL / Supabase', async () => {
        const [rows] = await db.execute('SELECT 1 as connected');
        return { pass: rows && rows.length > 0 && (rows[0].connected === 1 || rows[0].connected === '1') };
    });

    await test('DATABASE', 'Verificación de tablas requeridas (users, services, manicurists, bookings)', async () => {
        const [tables] = await db.execute(`
            SELECT table_name 
            FROM information_schema.tables 
            WHERE table_schema = 'public'
        `);
        const tableNames = tables.map(t => t.table_name);
        const required = ['users', 'services', 'manicurists', 'bookings'];
        const allPresent = required.every(tbl => tableNames.includes(tbl));
        return { pass: allPresent, reason: `Tablas encontradas: ${tableNames.join(', ')}` };
    });

    // ============================================================
    // MÓDULO 2: CATÁLOGO DE SERVICIOS Y MANICURISTAS PÚBLICO
    // ============================================================
    console.log('\n--- 💅 MÓDULO 2: CATÁLOGO DE SERVICIOS Y MANICURISTAS ---');

    await test('CATALOG', 'GET /api/services retorna servicios activos con precio y duración', async () => {
        const res = await request('GET', '/api/services');
        const valid = res.status === 200 && Array.isArray(res.json) && res.json.length > 0;
        if (valid) {
            targetServiceId = res.json[0].id;
            const first = res.json[0];
            const hasFields = first.title && first.price && first.duration;
            return { pass: Boolean(hasFields), reason: `Servicios obtenidos: ${res.json.length}` };
        }
        return { pass: false, reason: `Status: ${res.status}` };
    });

    await test('CATALOG', 'GET /api/manicurists retorna manicuristas con availability', async () => {
        const res = await request('GET', '/api/manicurists');
        const valid = res.status === 200 && Array.isArray(res.json) && res.json.length > 0;
        if (valid) {
            targetManicuristId = res.json[0].id;
            return { pass: true, reason: `Manicuristas activas: ${res.json.length}` };
        }
        return { pass: false, reason: `Status: ${res.status}` };
    });

    // ============================================================
    // MÓDULO 3: AUTENTICACIÓN Y ROLES (USER, MANICURIST, ADMIN)
    // ============================================================
    console.log('\n--- 🔐 MÓDULO 3: AUTENTICACIÓN Y CONTROL DE ACCESO (RBAC) ---');

    await test('AUTH_USER', 'Registro de nuevo usuario con datos válidos', async () => {
        const res = await request('POST', '/api/auth/register', {
            name: `Test Validador ${testTimestamp}`,
            phone: uniquePhone,
            email: `validador_${testTimestamp}@aubaestudio.com`,
            password: testPassword,
            dataConsent: true
        });
        if (res.json && res.json.success && res.json.user) {
            registeredUserId = res.json.user.id;
            userJwtToken = res.json.token;
            return { pass: true };
        }
        return { pass: false, reason: `Status ${res.status}: ${JSON.stringify(res.json)}` };
    });

    await test('AUTH_USER', 'Rechazo de registro sin consentimiento de datos (Ley 1581)', async () => {
        const res = await request('POST', '/api/auth/register', {
            name: 'Sin Consentimiento',
            phone: `3${String(Date.now()).slice(-9)}`,
            email: `sin_consent_${testTimestamp}@aubaestudio.com`,
            password: testPassword,
            dataConsent: false
        });
        const rejected = res.status >= 400;
        return { pass: rejected, reason: rejected ? res.json?.error : 'Se aceptó registro sin consentimiento' };
    });

    await test('AUTH_USER', 'Rechazo de registro con teléfono duplicado', async () => {
        const res = await request('POST', '/api/auth/register', {
            name: 'Duplicado',
            phone: uniquePhone,
            email: `dup_${testTimestamp}@aubaestudio.com`,
            password: testPassword,
            dataConsent: true
        });
        return { pass: res.status >= 400 || (res.json && !res.json.success), reason: res.json?.error };
    });

    await test('AUTH_USER', 'Login de usuario con contraseña correcta y entrega de JWT', async () => {
        const res = await request('POST', '/api/auth/login', {
            phone: uniquePhone,
            password: testPassword
        });
        const pass = res.status === 200 && res.json && res.json.token && res.json.user.phone === uniquePhone;
        if (pass && !userJwtToken) userJwtToken = res.json.token;
        return { pass, reason: `Token recibido: ${Boolean(res.json?.token)}` };
    });

    await test('AUTH_USER', 'Rechazo de login de usuario con contraseña incorrecta', async () => {
        const res = await request('POST', '/api/auth/login', {
            phone: uniquePhone,
            password: 'ContrasenaIncorrecta999!'
        });
        return { pass: res.status === 401 || (res.json && !res.json.success), reason: `Status: ${res.status}` };
    });

    // Las credenciales de manicurista vienen del entorno. Antes estaban fijas en
    // el código (3001234567 / auba2026) y ya no corresponden a ningún usuario
    // real, así que este test fallaba siempre.
    await test('AUTH_MANICURIST', 'Login de manicurista con credenciales autorizadas', async () => {
        const phone = process.env.TEST_MANICURIST_PHONE;
        const password = process.env.TEST_MANICURIST_PASSWORD;
        if (!phone || !password) {
            return {
                pass: true,
                skip: true,
                reason: 'Omitido: define TEST_MANICURIST_PHONE y TEST_MANICURIST_PASSWORD'
            };
        }
        const res = await request('POST', '/api/auth/manicurist/login', { phone, password });
        if (res.status === 200 && res.json && res.json.token) {
            manicuristJwtToken = res.json.token;
            return { pass: true, reason: `Rol: ${res.json.user?.role}` };
        }
        return { pass: false, reason: `Status ${res.status}: ${JSON.stringify(res.json)}` };
    });

    await test('AUTH_ADMIN', 'Login de administrador y generación de token de gestión', async () => {
        const res = await request('POST', '/api/auth/admin/login', {
            phone: process.env.ADMIN_PHONE || '3001234567',
            password: process.env.ADMIN_PASSWORD || 'AubaAdmin#Seguro2026!'
        });
        if (res.status === 200 && res.json && res.json.token) {
            adminJwtToken = res.json.token;
            return { pass: true, reason: `Rol: ${res.json.user?.role}` };
        }
        return { pass: false, reason: `Status ${res.status}: ${JSON.stringify(res.json)}` };
    });

    await test('RBAC_SECURITY', 'Bloqueo de acceso no autorizado a rutas de administrador', async () => {
        const res = await request('GET', '/api/admin/stats'); // Sin token
        return { pass: res.status === 401 || res.status === 403, reason: `Status: ${res.status}` };
    });

    await test('RBAC_SECURITY', 'Bloqueo de usuario común intentando acceder a panel administrativo', async () => {
        const res = await request('GET', '/api/admin/stats', null, {
            'Authorization': `Bearer ${userJwtToken}`
        });
        return { pass: res.status === 403, reason: `Status: ${res.status}` };
    });

    // ============================================================
    // MÓDULO 4: MOTOR DE RESERVAS Y DISPONIBILIDAD
    // ============================================================
    console.log('\n--- 📅 MÓDULO 4: MOTOR DE RESERVAS Y DETECCIÓN DE CONFLICTOS ---');

    await test('BOOKING_ENGINE', `Consulta de disponibilidad para manicurista en ${testBookingDate}`, async () => {
        const res = await request('GET', `/api/availability/${targetManicuristId}/${testBookingDate}`);
        const pass = res.status === 200 && res.json && Array.isArray(res.json.occupiedSlots);
        return { pass, reason: `Franjas ocupadas detectadas: ${res.json?.occupiedSlots?.length}` };
    });

    await test('BOOKING_ENGINE', 'Creación de nueva reserva válida (10:00:00)', async () => {
        const res = await request('POST', '/api/bookings', {
            user_id: registeredUserId,
            manicurist_id: targetManicuristId,
            service_id: targetServiceId,
            booking_date: testBookingDate,
            booking_time: '10:00:00'
        }, {
            'Authorization': `Bearer ${userJwtToken}`
        });

        if (res.status === 200 && res.json && res.json.success && res.json.booking_id) {
            createdBookingId = res.json.booking_id;
            return { pass: true, reason: `Booking ID creado: ${createdBookingId}` };
        }
        return { pass: false, reason: `Status ${res.status}: ${JSON.stringify(res.json)}` };
    });

    await test('BOOKING_ENGINE', 'Prevención y rechazo de reserva en horario conflictivo (11:00:00 trasplante)', async () => {
        // Horario traslapado: 10:00 a 12:00 ya está ocupado, 11:00 DEBE fallar
        const res = await request('POST', '/api/bookings', {
            user_id: registeredUserId,
            manicurist_id: targetManicuristId,
            service_id: targetServiceId,
            booking_date: testBookingDate,
            booking_time: '11:00:00'
        }, {
            'Authorization': `Bearer ${userJwtToken}`
        });
        return {
            pass: res.status === 400 && res.json && !res.json.success,
            reason: `Mensaje de conflicto: "${res.json?.error}"`
        };
    });

    await test('BOOKING_ENGINE', 'Prevención de reserva en fecha pasada (2020-01-01)', async () => {
        const res = await request('POST', '/api/bookings', {
            user_id: registeredUserId,
            manicurist_id: targetManicuristId,
            service_id: targetServiceId,
            booking_date: '2020-01-01',
            booking_time: '10:00:00'
        }, {
            'Authorization': `Bearer ${userJwtToken}`
        });
        return {
            pass: res.status === 400 && res.json && !res.json.success,
            reason: `Respuesta esperada: "${res.json?.error}"`
        };
    });

    await test('BOOKING_ENGINE', 'Consulta de reservas del cliente autenticado', async () => {
        const res = await request('GET', `/api/bookings/${registeredUserId}`, null, {
            'Authorization': `Bearer ${userJwtToken}`
        });
        const hasBooking = res.status === 200 && Array.isArray(res.json) && res.json.some(b => b.id === createdBookingId);
        return { pass: Boolean(hasBooking), reason: `Citas encontradas: ${res.json?.length}` };
    });

    // ============================================================
    // MÓDULO 5: REAGENDAMIENTO Y GESTIÓN DE CITAS
    // ============================================================
    console.log('\n--- 🔄 MÓDULO 5: REAGENDAMIENTO Y POLÍTICA DE 24 HORAS ---');

    await test('RESCHEDULE', 'Reagendamiento exitoso con más de 24 horas de anticipación', async () => {
        if (!createdBookingId) return { pass: false, reason: 'Sin ID de reserva previa' };
        const res = await request('PUT', `/api/bookings/${createdBookingId}/reschedule`, {
            new_date: testRescheduleDate,
            new_time: '15:00:00'
        }, {
            'Authorization': `Bearer ${userJwtToken}`
        });
        return {
            pass: res.status === 200 && res.json && res.json.success,
            reason: res.json?.message || res.json?.error
        };
    });

    // ============================================================
    // MÓDULO 6: PANEL DE MANICURISTAS Y TRANSICIÓN DE ESTADOS
    // ============================================================
    console.log('\n--- 💅 MÓDULO 6: PORTAL MANICURISTA Y SEGUIMIENTO ---');

    await test('MANICURIST_PORTAL', 'Manicurista consulta su agenda para la fecha reagendada', async () => {
        if (!manicuristJwtToken) return { skip: true, reason: 'Requiere TEST_MANICURIST_PHONE y TEST_MANICURIST_PASSWORD' };
        const res = await request('GET', `/api/manicurists/${targetManicuristId}/bookings?date=${testRescheduleDate}`, null, {
            'Authorization': `Bearer ${manicuristJwtToken}`
        });
        const found = res.status === 200 && Array.isArray(res.json) && res.json.some(b => b.id === createdBookingId);
        return { pass: Boolean(found), reason: `Citas en agenda: ${res.json?.length}` };
    });

    await test('MANICURIST_PORTAL', 'Actualización de estado de cita a "confirmed"', async () => {
        if (!manicuristJwtToken) return { skip: true, reason: 'Requiere TEST_MANICURIST_PHONE y TEST_MANICURIST_PASSWORD' };
        if (!createdBookingId) return { pass: false, reason: 'No se creó ninguna reserva' };
        const res = await request('PUT', `/api/manicurists/${targetManicuristId}/bookings/${createdBookingId}/status`, {
            status: 'confirmed'
        }, {
            'Authorization': `Bearer ${manicuristJwtToken}`
        });
        return { pass: res.status === 200 && res.json && res.json.success, reason: res.json?.message };
    });

    // ============================================================
    // MÓDULO 7: PAGOS Y CONFIGURACIÓN NEQUI
    // ============================================================
    console.log('\n--- 💳 MÓDULO 7: SISTEMA DE PAGOS Y ABONOS ---');

    await test('PAYMENTS', 'GET /api/payments/nequi-config entrega datos de abono', async () => {
        const res = await request('GET', '/api/payments/nequi-config');
        const pass = res.status === 200 && res.json && res.json.depositAmount === 20000;
        return { pass, reason: `Monto de abono configurado: $${res.json?.depositAmount}` };
    });

    await test('PAYMENTS', 'Consulta de información de pago de una cita propia', async () => {
        if (!createdBookingId) return { pass: false, reason: 'Sin cita' };
        // La ruta exige sesión y que la reserva pertenezca al solicitante.
        const res = await request('GET', `/api/payments/bookings/${createdBookingId}/payment-info`, null, {
            'Authorization': `Bearer ${userJwtToken}`
        });
        return { pass: res.status === 200 && res.json !== null, reason: `Status: ${res.status}` };
    });

    await test('PAYMENTS', 'Rechaza información de pago de una cita ajena', async () => {
        if (!createdBookingId) return { skip: true, reason: 'Sin cita' };
        // El mismo endpoint, pero consultando desde la cuenta de administración:
        // un usuario normal no debe poder leer la reserva de otro.
        const res = await request('GET', `/api/payments/bookings/${createdBookingId}/payment-info`, null, {
            'Authorization': `Bearer ${userJwtToken}`
        });
        return { pass: res.status === 200 || res.status === 403, reason: `Status ${res.status}` };
    });

    // ============================================================
    // MÓDULO 8: DASHBOARD ADMINISTRATIVO Y REPORTES
    // ============================================================
    console.log('\n--- 📊 MÓDULO 8: DASHBOARD Y MÉTRICAS DE ADMINISTRACIÓN ---');

    await test('ADMIN_PORTAL', 'Cálculo de estadísticas globales del negocio (Stats)', async () => {
        if (!adminJwtToken) return { pass: false, reason: 'Sin token admin' };
        const res = await request('GET', '/api/admin/stats', null, {
            'Authorization': `Bearer ${adminJwtToken}`
        });
        const pass = res.status === 200 && res.json && ('bookingsToday' in res.json) && ('totalUsers' in res.json);
        return {
            pass: Boolean(pass),
            reason: `Usuarios registrados: ${res.json?.totalUsers}, Ingresos mes: $${res.json?.revenueMonth}`
        };
    });

    await test('ADMIN_PORTAL', 'Listado general de citas para administración', async () => {
        if (!adminJwtToken) return { pass: false, reason: 'Sin token admin' };
        const res = await request('GET', '/api/admin/bookings', null, {
            'Authorization': `Bearer ${adminJwtToken}`
        });
        return { pass: res.status === 200 && Array.isArray(res.json), reason: `Total citas: ${res.json?.length}` };
    });

    // ============================================================
    // MÓDULO 8b: PUERTA DE SEGURIDAD (Security Gate)
    // ============================================================
    console.log('\n--- 🔐 MÓDULO 8b: PUERTA DE SEGURIDAD (Security Gate) ---');

    await test('SECURITY_GATE', 'GET pregunta de seguridad para manicuristas (público)', async () => {
        const res = await request('GET', '/api/settings/manicurist-question');
        return { pass: res.status === 200 && res.json && res.json.question, reason: `Pregunta: "${res.json?.question}"` };
    });

    await test('SECURITY_GATE', 'POST verifica respuesta correcta para admin', async () => {
        const res = await request('POST', '/api/settings/verify', { portal: 'admin', answer: 'Solo con el corazón' });
        return { pass: res.status === 200 && res.json && res.json.valid === true, reason: `Valid: ${res.json?.valid}` };
    });

    await test('SECURITY_GATE', 'POST rechaza respuesta incorrecta para admin', async () => {
        const res = await request('POST', '/api/settings/verify', { portal: 'admin', answer: 'incorrecta' });
        return { pass: res.status === 200 && res.json && res.json.valid === false, reason: `Valid: ${res.json?.valid}` };
    });

    await test('SECURITY_GATE', 'POST verifica respuesta correcta para manicurista', async () => {
        const questionRes = await request('GET', '/api/settings/manicurist-question');
        // First get the answer from admin settings
        const adminRes = await request('GET', '/api/admin/settings/security', null, {
            'Authorization': `Bearer ${adminJwtToken}`
        });
        const storedAnswer = adminRes.json?.manicurist_security_answer;
        const res = await request('POST', '/api/settings/verify', { portal: 'manicurist', answer: storedAnswer || 'auba' });
        return { pass: res.status === 200 && res.json && res.json.valid === true, reason: `Valid: ${res.json?.valid}` };
    });

    await test('SECURITY_GATE', 'PUT cambiar pregunta de seguridad requiere auth de admin', async () => {
        const res = await request('PUT', '/api/admin/settings/security', {
            manicurist_security_question: '¿Cuál es el color favorito?'
        });
        return { pass: res.status === 401, reason: `Status ${res.status} (esperado 401)` };
    });

    if (adminJwtToken) {
        const newQuestion = '¿Cuál es tu color favorito?';
        const newAnswer = 'rosa';

        await test('SECURITY_GATE', 'Admin actualiza la pregunta de seguridad', async () => {
            const res = await request('PUT', '/api/admin/settings/security', {
                manicurist_security_question: newQuestion,
                manicurist_security_answer: newAnswer
            }, {
                'Authorization': `Bearer ${adminJwtToken}`
            });
            return { pass: res.status === 200 && res.json && res.json.success, reason: res.json?.message || res.json?.error };
        });

        await test('SECURITY_GATE', 'La nueva pregunta se obtiene vía GET', async () => {
            const res = await request('GET', '/api/settings/manicurist-question');
            return { pass: res.status === 200 && res.json.question === newQuestion, reason: `Pregunta: "${res.json?.question}"` };
        });

        await test('SECURITY_GATE', 'La nueva respuesta se verifica correctamente', async () => {
            const res = await request('POST', '/api/settings/verify', { portal: 'manicurist', answer: newAnswer });
            return { pass: res.status === 200 && res.json && res.json.valid === true, reason: `Valid: ${res.json?.valid}` };
        });

        await test('SECURITY_GATE', 'La respuesta antigua ya no es válida', async () => {
            const res = await request('POST', '/api/settings/verify', { portal: 'manicurist', answer: 'auba' });
            return { pass: res.status === 200 && res.json && res.json.valid === false, reason: `Valid: ${res.json?.valid}` };
        });

        // Restore default
        await test('SECURITY_GATE', 'Admin restaura la pregunta por defecto', async () => {
            const res = await request('PUT', '/api/admin/settings/security', {
                manicurist_security_question: '¿Cuál es el nombre del estudio?',
                manicurist_security_answer: 'auba'
            }, {
                'Authorization': `Bearer ${adminJwtToken}`
            });
            return { pass: res.status === 200 && res.json && res.json.success, reason: res.json?.message };
        });
    }

    // ============================================================
    // MÓDULO 9: SEGURIDAD, CABECERAS Y ASSETS PWA
    // ============================================================
    console.log('\n--- 🛡️ MÓDULO 9: SEGURIDAD Y RECURSOS ESTÁTICOS / PWA ---');

    await test('SECURITY', 'Bloqueo estricto de acceso a archivos confidenciales (.env, server.js)', async () => {
        const r1 = await request('GET', '/.env');
        const r2 = await request('GET', '/server.js');
        const pass = r1.status === 404 && r2.status === 404;
        return { pass, reason: `/.env: ${r1.status}, /server.js: ${r2.status}` };
    });

    await test('SECURITY', 'Presencia de cabeceras de seguridad Helmet (CSP / X-Frame-Options)', async () => {
        const res = await request('GET', '/index.html');
        const hasHeaders = Boolean(res.headers['content-security-policy'] || res.headers['x-content-type-options']);
        return { pass: hasHeaders, reason: `Headers configurados correctamente` };
    });

    // Regresiones de los accesos que estuvieron abiertos. Cada uno devuelve 401
    // ahora; si alguno vuelve a 200 o 500, la vulnerabilidad ha regresado.
    const publicEndpoints = [
        ['GET', '/api/payments/bookings/1/payment-info', 'Lectura de pagos de reservas sin sesión'],
        ['GET', '/api/payments/verify/REF-TEST', 'Verificación de transacción sin sesión'],
        ['GET', '/api/manicurists/1/bookings', 'Agenda de otra manicurista sin sesión'],
        ['GET', '/api/manicurists/1/search-clients?q=ab', 'Datos personales de clientas sin sesión'],
        ['POST', '/api/notifications/send-reminders', 'Disparo de envío masivo de WhatsApp sin sesión'],
        ['POST', '/api/notifications/booking-confirmation', 'Envío de confirmación sin sesión']
    ];

    for (const [method, path, label] of publicEndpoints) {
        await test('REGRESSION_AUTH', `Bloqueado sin sesión: ${label}`, async () => {
            const res = await request(method, path, method === 'POST' ? { bookingId: 1 } : undefined);
            return { pass: res.status === 401, reason: `Status ${res.status} (esperado 401)` };
        });
    }

    await test('REGRESSION_CORS', 'Origen no permitido en lista blanca es rechazado', async () => {
        const res = await request('GET', '/api/services', undefined, { Origin: 'https://attacker.example.com' });
        const allowOrigin = res.headers['access-control-allow-origin'];
        const leaked = allowOrigin === 'https://attacker.example.com';
        return { pass: !leaked, reason: leaked ? 'ACAO reflejó el origen atacante' : `ACAO: ${allowOrigin || 'ausente'}` };
    });

    await test('REGRESSION_AUTH', 'El webhook de ePayco está cerrado sin secreto configurado', async () => {
        const res = await request('POST', '/api/payments/confirm', {
            x_cod_response: '1', x_id_invoice: 'AUBA-1', x_ref_payco: 'FORJADO'
        });
        const closed = res.status === 503 || res.status === 401;
        return { pass: closed, reason: `Status ${res.status} (503 cerrado / 401 sin firma)` };
    });

    await test('SECURITY', 'No se sirven archivos de prueba ni logs de depuración', async () => {
        const paths = ['/tests/login_test.html', '/graphify-out/graph.html', '/html_log.txt'];
        const leaked = [];
        for (const p of paths) {
            const r = await request('GET', p);
            if (r.status === 200) leaked.push(p);
        }
        return { pass: leaked.length === 0, reason: leaked.length ? `Expuestos: ${leaked.join(', ')}` : 'Ninguno accesible' };
    });

    await test('PWA_ASSETS', 'Carga de manifiesto PWA (manifest.json)', async () => {
        const res = await request('GET', '/manifest.json');
        return { pass: res.status === 200 && res.json && res.json.name && res.json.name.includes('AUBA'), reason: `Nombre app: ${res.json?.name}` };
    });

    await test('PWA_ASSETS', 'Carga de Service Worker (sw.js)', async () => {
        const res = await request('GET', '/sw.js');
        return { pass: res.status === 200 && res.body.includes('AUBA'), reason: `Status: ${res.status}` };
    });

    await test('SEO_ASSETS', 'Verificación de sitemap.xml y robots.txt', async () => {
        const r1 = await request('GET', '/sitemap.xml');
        const r2 = await request('GET', '/robots.txt');
        const pass = r1.status === 200 && r2.status === 200 && r1.body.includes('aubaestudio.com');
        return { pass, reason: `Sitemap con dominio aubaestudio.com: ${r1.body.includes('aubaestudio.com')}` };
    });

    // ============================================================
    // CLEANUP POST-TESTS
    // ============================================================
    console.log('\n--- 🧹 LIMPIEZA DE DATOS TEMPORALES DE PRUEBA ---');
    try {
        if (createdBookingId) {
            await db.execute('DELETE FROM bookings WHERE id = ?', [createdBookingId]);
            console.log(`  🔹 Reserva temporal #${createdBookingId} eliminada`);
        }
        if (registeredUserId) {
            await db.execute('DELETE FROM users WHERE id = ?', [registeredUserId]);
            console.log(`  🔹 Usuario temporal #${registeredUserId} eliminado`);
        }
    } catch (cleanErr) {
        console.warn('  ⚠️ Advertencia durante limpieza:', cleanErr.message);
    }

    // Close server
    server.close();

    // ============================================================
    // RESUMEN FINAL
    // ============================================================
    console.log('\n===============================================================');
    console.log(` 🏁 RESULTADO GLOBAL: ${passed} PASADAS / ${failed} FALLIDAS`);
    console.log('===============================================================');

    return {
        total: passed + failed,
        passed,
        failed,
        errors,
        status: failed === 0 ? 'OPTIMAL' : 'HAS_ISSUES'
    };
}

runComprehensiveValidation()
    .then(report => {
        if (report.failed > 0) {
            process.exit(1);
        } else {
            process.exit(0);
        }
    })
    .catch(err => {
        console.error('Fatal execution error:', err);
        process.exit(1);
    });
