const https = require('https');

const API_BASE = 'https://auba-beauty-studio.onrender.com/api';
const FRONTEND_URL = 'https://auba-studio.vercel.app';

const colors = {
    green: '\x1b[32m',
    red: '\x1b[31m',
    yellow: '\x1b[33m',
    reset: '\x1b[0m',
    blue: '\x1b[34m'
};

async function fetchWithTimeout(url, options = {}) {
    return new Promise((resolve, reject) => {
        const req = https.request(url, options, (res) => {
            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', () => resolve({ statusCode: res.statusCode, data }));
        });

        req.on('error', reject);
        req.setTimeout(10000, () => {
            req.destroy();
            reject(new Error('Timeout'));
        });

        if (options.body) {
            req.write(options.body);
        }
        req.end();
    });
}

async function runTests() {
    console.log(`${colors.blue}=== INICIANDO PRUEBAS DE ESTADO DE SERVIDORES ===${colors.reset}\n`);

    // 1. Test Frontend Vercel
    console.log(`Verificando Frontend Vercel (${FRONTEND_URL})...`);
    try {
        const res = await fetchWithTimeout(FRONTEND_URL);
        if (res.statusCode >= 200 && res.statusCode < 400) {
            console.log(`${colors.green}✅ Frontend Activo y Respondiendo (Status: ${res.statusCode})${colors.reset}`);
        } else {
            console.log(`${colors.red}❌ Frontend retornó Status: ${res.statusCode}${colors.reset}`);
        }
    } catch (e) {
        console.log(`${colors.red}❌ Frontend Caído o Inaccesible: ${e.message}${colors.reset}`);
    }

    // 2. Test Backend API
    console.log(`\nVerificando Backend Render API (${API_BASE}/health)...`);
    try {
        const res = await fetchWithTimeout(`${API_BASE}/health`);
        if (res.statusCode === 200) {
            console.log(`${colors.green}✅ Backend Activo y Conectado a Supabase (Status: 200)${colors.reset}`);
        } else {
            console.log(`${colors.red}❌ Backend retornó Status: ${res.statusCode}${colors.reset}`);
        }
    } catch (e) {
        console.log(`${colors.red}❌ Backend Caído: ${e.message}${colors.reset}`);
    }

    // 3. Test Admin Login (Simulación de conexión a BD)
    console.log(`\nVerificando Flujo de Login Administrador...`);
    try {
        const body = JSON.stringify({ phone: '3001234567', password: 'AubaAdmin2026!' });
        const res = await fetchWithTimeout(`${API_BASE}/auth/admin/login`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Content-Length': Buffer.byteLength(body)
            },
            body: body
        });
        
        const data = JSON.parse(res.data);
        if (data.success) {
            console.log(`${colors.green}✅ Login Admin Exitoso (Token Generado)${colors.reset}`);
        } else {
            console.log(`${colors.red}❌ Falló Login Admin: ${data.error}${colors.reset}`);
        }
    } catch (e) {
        console.log(`${colors.red}❌ Error en Login Admin: ${e.message}${colors.reset}`);
    }

    // 4. Test Manicurista Login
    console.log(`\nVerificando Flujo de Login Manicurista...`);
    try {
        const body = JSON.stringify({ phone: '3001234567', password: 'auba2026' });
        const res = await fetchWithTimeout(`${API_BASE}/auth/manicurist/login`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Content-Length': Buffer.byteLength(body)
            },
            body: body
        });
        
        const data = JSON.parse(res.data);
        if (data.success) {
            console.log(`${colors.green}✅ Login Manicurista Exitoso (Token Generado)${colors.reset}`);
        } else {
            console.log(`${colors.red}❌ Falló Login Manicurista: ${data.error}${colors.reset}`);
        }
    } catch (e) {
        console.log(`${colors.red}❌ Error en Login Manicurista: ${e.message}${colors.reset}`);
    }

    console.log(`\n${colors.blue}=== PRUEBAS FINALIZADAS ===${colors.reset}`);
}

runTests();
