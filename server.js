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
    console.error('   Copy .env.production.example to .env and fill in ALL values.');
    process.exit(1);
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
const db = require('./db');

// ============================================
// CLOUDINARY CONFIG
// ============================================

cloudinary.config({
    cloud_name: process.env.CLOUDINARY_CLOUD_NAME || 'di3azqbni',
    api_key: process.env.CLOUDINARY_API_KEY || '968518722423617',
    api_secret: process.env.CLOUDINARY_API_SECRET || 'R3TOv5iRK5TS-U0gG1pAziju1Y4'
});

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
    limits: { fileSize: 5 * 1024 * 1024 } // 5MB max
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
            frameSrc: ["https://checkout.epayco.co"],
            manifestSrc: ["'self'"],
            upgradeInsecureRequests: isProduction ? [] : null
        }
    },
    crossOriginEmbedderPolicy: false,
    crossOriginResourcePolicy: false,
    hsts: isProduction ? { maxAge: 31536000, includeSubDomains: true } : false
}));

// CORS
const allowedOrigins = process.env.ALLOWED_ORIGINS
    ? process.env.ALLOWED_ORIGINS.split(',')
    : [];
allowedOrigins.push('http://localhost:3000', 'http://192.168.40.12:3000', 'https://auba-studio.vercel.app', 'https://beauty-studio-jsmolinav10-5854s-projects.vercel.app', 'https://beauty-studio-kappa.vercel.app', 'https://auba-nails-studio.vercel.app');

app.use(cors({
    origin: function (origin, callback) {
        if (!origin) return callback(null, true);
        if (allowedOrigins.includes(origin) || (origin && origin.endsWith('.vercel.app'))) {
            return callback(null, true);
        }
        return callback(new Error('Not allowed by CORS'));
    },
    credentials: true
}));

app.use(express.json());
app.use(express.static('public'));

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
        console.log('✅ Conectado a Supabase PostgreSQL');
    } catch (error) {
        console.error('❌ Error conectando a PostgreSQL:', error.message);
        process.exit(1);
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
        res.status(503).json({
            status: 'error',
            timestamp: new Date().toISOString(),
            database: 'disconnected',
            error: error.message
        });
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
