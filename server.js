/**
 * AUBA Beauty Studio - Backend Server
 * API REST con Express + MySQL
 * 
 * Servidor principal — las rutas están organizadas en /routes/
 */

require('dotenv').config();

// ============================================
// VALIDATE CRITICAL ENV VARS AT STARTUP
// ============================================
const REQUIRED_ENV = ['SUPABASE_DB_URL', 'ADMIN_PHONE', 'ADMIN_PASSWORD', 'JWT_SECRET'];
const missing = REQUIRED_ENV.filter(key => !process.env[key]);
if (missing.length > 0) {
    console.error(`❌ Missing required environment variables: ${missing.join(', ')}`);
    console.error('   Please configure them in Vercel Project Settings > Environment Variables.');
    if (!process.env.VERCEL) {
        process.exit(1);
    }
}

const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const cron = require('node-cron');
const rateLimit = require('express-rate-limit');
const multer = require('multer');
const path = require('path');
const cloudinary = require('cloudinary').v2;
const { CloudinaryStorage } = require('multer-storage-cloudinary');

// Route modules
const { router: authRouter, initAdminPassword } = require('./routes/auth');
const bookingsRouter = require('./routes/bookings');
const paymentsRouter = require('./routes/payments');
const manicuristsRouter = require('./routes/manicurists');
const adminRouter = require('./routes/admin');
const { router: notificationsRouter, sendDailyReminders } = require('./routes/notifications');
const settingsRouter = require('./routes/settings');
const db = require('./db');

// ============================================
// CLOUDINARY CONFIG
// ============================================

// Las credenciales de Cloudinary solo se leen del entorno. Estaban hardcodeadas
// como valor por defecto, lo que dejaba la clave y el secreto de la cuenta
// expuestos en el repositorio para cualquiera que lo clonara. Si faltan, la
// subida de comprobantes se desactiva en vez de usar credenciales embebidas.
const cloudinaryConfigured = Boolean(
    process.env.CLOUDINARY_CLOUD_NAME &&
    process.env.CLOUDINARY_API_KEY &&
    process.env.CLOUDINARY_API_SECRET
);

if (cloudinaryConfigured) {
    cloudinary.config({
        cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
        api_key: process.env.CLOUDINARY_API_KEY,
        api_secret: process.env.CLOUDINARY_API_SECRET
    });
} else {
    console.warn('[AVISO] Faltan CLOUDINARY_CLOUD_NAME/API_KEY/API_SECRET: la subida de comprobantes quedara deshabilitada.');
}

const cloudinaryStorage = new CloudinaryStorage({
    cloudinary: cloudinary,
    params: {
        folder: 'auba-proofs',
        allowed_formats: ['jpg', 'jpeg', 'png', 'webp'],
        transformation: [{ quality: 'auto', fetch_format: 'auto' }]
    }
});
const uploadProof = multer({
    storage: cloudinaryStorage,
    limits: { fileSize: 5 * 1024 * 1024, files: 1, fields: 10 } // 5MB max
});

// ============================================
// EXPRESS APP
// ============================================

const app = express();
const PORT = process.env.PORT || 3000;
const isProduction = process.env.NODE_ENV === 'production';

// Security headers via Helmet (production-aware)
app.use(helmet({
    contentSecurityPolicy: {
        directives: {
            defaultSrc: ["'self'"],
            scriptSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com", "https://checkout.epayco.co"],
            scriptSrcAttr: ["'unsafe-inline'"],
            styleSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com"],
            fontSrc: ["'self'", "https://fonts.gstatic.com"],
            imgSrc: ["'self'", "data:", "blob:", "https://res.cloudinary.com"],
            connectSrc: ["'self'", "https://graph.facebook.com", "https://checkout.epayco.co"],
            mediaSrc: ["'self'"],
            frameSrc: ["https://checkout.epayco.co", "https://maps.google.com", "https://www.google.com"],
            manifestSrc: ["'self'"],
            upgradeInsecureRequests: isProduction ? [] : null
        }
    },
    crossOriginEmbedderPolicy: false,
    crossOriginResourcePolicy: false,
    hsts: isProduction ? { maxAge: 31536000, includeSubDomains: true } : false
}));

// CORS
// La API se consume desde el mismo origen (el front vive en el mismo dominio),
// así que la lista blanca es explícita. Antes había dos atajos que abrían la API
// a cualquier tenant de Vercel (origin.endsWith('.vercel.app')) y a cualquier
// dominio que contuviera la cadena "aubaestudio.com" (origin.includes, que
// acepta evil-aubaestudio.com.atacante.tld). Verificado en producción: ambos
// devolvían Access-Control-Allow-Origin reflectido al origen atacante.
const allowedOrigins = new Set(
    (process.env.ALLOWED_ORIGINS ? process.env.ALLOWED_ORIGINS.split(',') : [])
        .map((o) => o.trim())
        .filter(Boolean)
);
[
    'http://localhost:3000',
    'http://192.168.40.12:3000',
    'https://aubaestudio.com',
    'https://www.aubaestudio.com'
].forEach((o) => allowedOrigins.add(o));

app.use(cors({
    origin: function (origin, callback) {
        // Sin Origin no es una petición desde un navegador (curl, health checks,
        // webhooks de ePayco), así que no hay filtrado que aplicar.
        if (!origin) return callback(null, true);
        if (allowedOrigins.has(origin)) {
            return callback(null, true);
        }
        return callback(new Error('Not allowed by CORS'));
    },
    credentials: true
}));

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// Trust proxy is required when hosted on platforms like Render or Vercel
// so that rate limiting uses the actual client IP instead of the proxy IP.
app.set('trust proxy', 1);

// Rate limiting global
const globalLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 1000,
    message: { success: false, error: 'Demasiadas solicitudes. Intenta de nuevo en 15 minutos.' }
});
app.use('/api', globalLimiter);

// Make pool and uploadProof available to route modules
app.locals.uploadProof = uploadProof;
app.locals.pool = db; // Set synchronously for serverless compatibility

// ============================================
// DB CONFIG
// ============================================

async function initDB() {
    try {
        // Test connection
        await db.execute('SELECT 1');
        app.locals.pool = db; // Reemplazamos pool con nuestro db.js

        // Ensure app_settings table exists (idempotent)
        await db.execute(
            'CREATE TABLE IF NOT EXISTS app_settings (id SERIAL, setting_key VARCHAR(100) UNIQUE NOT NULL, setting_value TEXT NOT NULL, description TEXT)'
        );

        // Add id column if table was created without it in a prior migration
        await db.execute('ALTER TABLE app_settings ADD COLUMN IF NOT EXISTS id SERIAL');

        // Default manicurist security question/answer
        await db.execute(
            "INSERT INTO app_settings (setting_key, setting_value, description) " +
            "VALUES ('manicurist_security_question', '¿Cuál es el nombre del estudio?', 'Pregunta de seguridad para acceder al portal de manicuristas') " +
            "ON CONFLICT (setting_key) DO NOTHING"
        );
        await db.execute(
            "INSERT INTO app_settings (setting_key, setting_value, description) " +
            "VALUES ('manicurist_security_answer', 'auba', 'Respuesta de seguridad para acceder al portal de manicuristas') " +
            "ON CONFLICT (setting_key) DO NOTHING"
        );

        console.log('✅ Conectado a Supabase PostgreSQL');
    } catch (error) {
        console.error('❌ Error conectando a PostgreSQL:', error.message);
        if (!process.env.VERCEL) {
            process.exit(1);
        }
    }
}

// ============================================
// MOUNT ROUTES
// ============================================

app.use('/api/auth', authRouter);
app.use('/api', bookingsRouter);
app.use('/api/payments', paymentsRouter);
app.use('/api/manicurists', manicuristsRouter);
app.use('/api/admin', adminRouter);
app.use('/api/notifications', notificationsRouter);
app.use('/api', settingsRouter);

// ============================================
// HEALTH CHECK
// ============================================

app.get('/api/health', async (req, res) => {
    try {
        await app.locals.pool.execute('SELECT 1');
        res.json({
            status: 'ok',
            timestamp: new Date().toISOString(),
            uptime: process.uptime(),
            database: 'connected'
        });
    } catch (error) {
        // El detalle del error solo va al log del servidor. Antes se devolvía
        // error.message al público, lo que llegó a exponer el host de la base
        // de datos y el identificador del proyecto.
        console.error('[health] Base de datos inaccesible:', error.message);
        res.status(503).json({
            status: 'error',
            timestamp: new Date().toISOString(),
            database: 'disconnected'
        });
    }
});

// ============================================
// KEEPALIVE DE LA BASE DE DATOS
// ============================================

/**
 * Supabase pausa automáticamente los proyectos del plan Free tras una semana sin
 * actividad, y al pausarse el host de la base de datos deja de resolver: todo el
 * backend responde 500 y el negocio se queda sin poder recibir reservas.
 *
 * Esta ruta ejecuta una consulta real contra la base de datos, que es lo que
 * Supabase cuenta como actividad. Configura en vercel.json un cron que la llame
 * (ver api/keepalive.js) para mantener el proyecto activo.
 */
app.get('/api/keepalive', async (req, res) => {
    try {
        await app.locals.pool.execute('SELECT 1');
        res.json({ status: 'ok', database: 'connected', timestamp: new Date().toISOString() });
    } catch (error) {
        console.error('[keepalive] Base de datos inaccesible:', error.message);
        res.status(503).json({ status: 'error', database: 'disconnected' });
    }
});

// ============================================
// 404 CATCH-ALL
// ============================================

app.use((req, res) => {
    if (req.accepts('html')) {
        res.status(404).sendFile('404.html', { root: 'public' });
    } else {
        res.status(404).json({ success: false, error: 'Recurso no encontrado' });
    }
});

// ============================================
// MANEJO GLOBAL DE ERRORES
// ============================================

// Debe ir después de todas las rutas. Sin él, Express 5 devuelve su página de
// error por defecto, que puede incluir detalles internos del stack.
app.use((err, req, res, next) => {
    if (res.headersSent) return next(err);

    if (err.message === 'Not allowed by CORS') {
        return res.status(403).json({ success: false, error: 'Origen no permitido' });
    }

    console.error(`[error] ${req.method} ${req.originalUrl}:`, err.message);
    if (err.stack && process.env.NODE_ENV !== 'production') {
        console.error(err.stack);
    }

    res.status(err.status || 500).json({
        success: false,
        error: 'Error del servidor'
    });
});

// ============================================
// START SERVER
// ============================================

Promise.all([initDB(), initAdminPassword()]).then(() => {
    if (require.main === module) {
        app.listen(PORT, () => {
            console.log(`🚀 Servidor corriendo en http://localhost:${PORT}`);
            console.log(`🌐 Abre http://localhost:${PORT}/index.html en tu navegador`);

            cron.schedule('0 9 * * *', () => {
                console.log('📅 Ejecutando tarea programada: recordatorios diarios');
                sendDailyReminders(app.locals.pool);
            });
            console.log('⏰ Recordatorios programados para las 9:00 AM diariamente');

            cron.schedule('0 2 1 * *', async () => {
                console.log('🧹 Limpieza de comprobantes antiguos en Cloudinary...');
                try {
                    const pool = app.locals.pool;
                    const sixMonthsAgo = new Date();
                    sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6);
                    const cutoffDate = sixMonthsAgo.toISOString().split('T')[0];

                    const [oldProofs] = await pool.execute(
                        `SELECT id, payment_proof FROM bookings 
                         WHERE payment_proof IS NOT NULL 
                         AND payment_proof LIKE '%cloudinary%'
                         AND booking_date < ?`,
                        [cutoffDate]
                    );

                    let deleted = 0;
                    for (const booking of oldProofs) {
                        try {
                            const url = booking.payment_proof;
                            const parts = url.split('/');
                            const folderIdx = parts.indexOf('auba-proofs');
                            if (folderIdx !== -1) {
                                const filename = parts.slice(folderIdx).join('/').replace(/\.[^.]+$/, '');
                                await cloudinary.uploader.destroy(filename);
                            }
                            await pool.execute('UPDATE bookings SET payment_proof = NULL WHERE id = ?', [booking.id]);
                            deleted++;
                        } catch (err) {
                            console.error(`Error eliminando proof de booking ${booking.id}:`, err.message);
                        }
                    }
                    console.log(`🧹 Limpieza completada: ${deleted} comprobantes eliminados de ${oldProofs.length} encontrados`);
                } catch (error) {
                    console.error('Error en limpieza de comprobantes:', error);
                }
            });
            console.log('🧹 Limpieza de comprobantes programada para el 1ro de cada mes');
        });
    }
}).catch(err => {
    console.error('Error inicializando backend:', err);
});

module.exports = app;
