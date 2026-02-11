/**
 * AUBA Beauty Studio - Backend Server
 * API REST con Express + MySQL
 */

require('dotenv').config();

const express = require('express');
const mysql = require('mysql2/promise');
const cors = require('cors');
const bcrypt = require('bcryptjs');
const cron = require('node-cron');
const crypto = require('crypto');
const rateLimit = require('express-rate-limit');
const WhatsAppService = require('./services/whatsapp');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static('.')); // Servir archivos estáticos (HTML, CSS, JS)

// BUG-24 FIX: Rate limiting global
const globalLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutos
    max: 100, // máx. 100 peticiones por IP cada 15 min
    message: { success: false, error: 'Demasiadas solicitudes. Intenta de nuevo en 15 minutos.' }
});
app.use('/api', globalLimiter);

// Rate limiting estricto para login (BUG-24)
const loginLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutos
    max: 5, // máx. 5 intentos de login por IP cada 15 min
    message: { success: false, error: 'Demasiados intentos de inicio de sesión. Intenta en 15 minutos.' }
});

// ============================================
// BUG-03/04/05 FIX: Token Auth System
// ============================================
const tokenStore = new Map(); // token -> { userId, role, expiresAt }

function generateToken(userId, role) {
    const token = crypto.randomBytes(32).toString('hex');
    tokenStore.set(token, {
        userId,
        role,
        expiresAt: Date.now() + 24 * 60 * 60 * 1000 // 24 horas
    });
    return token;
}

// Limpiar tokens expirados cada hora
setInterval(() => {
    const now = Date.now();
    for (const [token, data] of tokenStore) {
        if (data.expiresAt < now) tokenStore.delete(token);
    }
}, 60 * 60 * 1000);

// Middleware de autenticación
function requireAuth(allowedRoles = []) {
    return (req, res, next) => {
        const authHeader = req.headers.authorization;
        if (!authHeader || !authHeader.startsWith('Bearer ')) {
            return res.status(401).json({ success: false, error: 'No autorizado. Inicia sesión.' });
        }
        const token = authHeader.split(' ')[1];
        const session = tokenStore.get(token);
        if (!session || session.expiresAt < Date.now()) {
            tokenStore.delete(token);
            return res.status(401).json({ success: false, error: 'Sesión expirada. Inicia sesión de nuevo.' });
        }
        if (allowedRoles.length > 0 && !allowedRoles.includes(session.role)) {
            return res.status(403).json({ success: false, error: 'No tienes permisos para esta acción.' });
        }
        req.auth = session;
        next();
    };
}

// BUG-02 FIX: Generar hash de admin password al iniciar
let adminPasswordHash = null;
async function initAdminPassword() {
    const adminPassword = process.env.ADMIN_PASSWORD || 'admin2026';
    adminPasswordHash = await bcrypt.hash(adminPassword, 10);
    console.log('🔐 Admin password hash ready');
}
initAdminPassword();

// Configuración de la base de datos desde variables de entorno
const dbConfig = {
    host: process.env.DB_HOST || 'localhost',
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME || 'auba_studio'
};

// Pool de conexiones
let pool;

async function initDB() {
    try {
        pool = mysql.createPool(dbConfig);
        console.log('✅ Conectado a MySQL');
    } catch (error) {
        console.error('❌ Error conectando a MySQL:', error.message);
        process.exit(1);
    }
}

// ============================================
// RUTAS DE AUTENTICACIÓN
// ============================================

// Registro de usuario
app.post('/api/auth/register', async (req, res) => {
    try {
        const { name, phone, email, password } = req.body;

        // Validaciones
        if (!name || name.trim().length < 3) {
            return res.status(400).json({ success: false, error: 'El nombre debe tener al menos 3 caracteres' });
        }
        if (!phone || !/^\d{10}$/.test(phone.replace(/\s/g, ''))) {
            return res.status(400).json({ success: false, error: 'El número de celular debe tener 10 dígitos' });
        }
        // BUG-28 FIX: Contraseña mínima de 6 caracteres
        if (!password || password.length < 6) {
            return res.status(400).json({ success: false, error: 'La contraseña debe tener al menos 6 caracteres' });
        }

        // BUG-18 FIX: Validar email como requerido (consistente con frontend)
        if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
            return res.status(400).json({ success: false, error: 'Debes proporcionar un email válido' });
        }

        // Verificar si el teléfono ya existe
        const [existing] = await pool.execute('SELECT id FROM users WHERE phone = ?', [phone]);
        if (existing.length > 0) {
            return res.status(400).json({ success: false, error: 'Este número de celular ya está registrado' });
        }

        // Hashear contraseña
        const hashedPassword = await bcrypt.hash(password, 10);

        // BUG-19 FIX: Normalizar email a minúsculas para consistencia
        const normalizedEmail = email ? email.trim().toLowerCase() : null;

        // Insertar usuario
        const [result] = await pool.execute(
            'INSERT INTO users (name, phone, email, password) VALUES (?, ?, ?, ?)',
            [name.trim(), phone.replace(/\s/g, ''), normalizedEmail, hashedPassword]
        );

        const user = {
            id: result.insertId,
            name: name.trim(),
            phone: phone.replace(/\s/g, ''),
            email: email || null
        };

        res.json({ success: true, user });

    } catch (error) {
        console.error('Error en registro:', error);
        res.status(500).json({ success: false, error: 'Error del servidor' });
    }
});

// Login de usuario
app.post('/api/auth/login', loginLimiter, async (req, res) => {
    try {
        const { phone, password } = req.body;

        const [users] = await pool.execute('SELECT * FROM users WHERE phone = ?', [phone]);

        if (users.length === 0) {
            return res.status(401).json({ success: false, error: 'Número o contraseña incorrectos' });
        }

        const user = users[0];
        const validPassword = await bcrypt.compare(password, user.password);

        if (!validPassword) {
            return res.status(401).json({ success: false, error: 'Número o contraseña incorrectos' });
        }

        // BUG-05 FIX: Generar token de sesión para usuario
        const token = generateToken(user.id, 'user');

        res.json({
            success: true,
            token,
            user: {
                id: user.id,
                name: user.name,
                phone: user.phone,
                email: user.email
            }
        });

    } catch (error) {
        console.error('Error en login:', error);
        res.status(500).json({ success: false, error: 'Error del servidor' });
    }
});

// Login de Manicurista
app.post('/api/auth/manicurist/login', loginLimiter, async (req, res) => {
    try {
        const { phone, password } = req.body;

        const [users] = await pool.execute('SELECT * FROM manicurists WHERE phone = ?', [phone]);

        if (users.length === 0) {
            return res.status(401).json({ success: false, error: 'Credenciales inválidas' });
        }

        const manicurist = users[0];
        const validPassword = await bcrypt.compare(password, manicurist.password);

        if (!validPassword) {
            return res.status(401).json({ success: false, error: 'Credenciales inválidas' });
        }

        // BUG-04 FIX: Generar token de sesión para manicurista
        const token = generateToken(manicurist.id, 'manicurist');

        res.json({
            success: true,
            token,
            user: {
                id: manicurist.id,
                name: manicurist.name,
                phone: manicurist.phone,
                role: 'manicurist'
            }
        });

    } catch (error) {
        console.error('Error en manucurist login:', error);
        res.status(500).json({ success: false, error: 'Error del servidor' });
    }
});

// ============================================
// PASSWORD RECOVERY
// ============================================

const nodemailer = require('nodemailer');
// crypto already required at the top

// Create email transporter
const createTransporter = () => {
    return nodemailer.createTransport({
        host: process.env.SMTP_HOST || 'smtp.gmail.com',
        port: parseInt(process.env.SMTP_PORT) || 587,
        secure: false,
        auth: {
            user: process.env.SMTP_USER,
            pass: process.env.SMTP_PASS
        }
    });
};

// Forgot Password - Request reset link
app.post('/api/auth/forgot-password', async (req, res) => {
    try {
        const { email } = req.body;

        if (!email) {
            return res.status(400).json({ success: false, error: 'El email es requerido' });
        }

        // Find user by email
        const [users] = await pool.execute('SELECT id, name, email FROM users WHERE email = ?', [email.toLowerCase()]);

        if (users.length === 0) {
            // Don't reveal if email exists for security
            return res.json({ success: true, message: 'Si el email existe, recibirás un enlace de recuperación' });
        }

        const user = users[0];

        // Generate secure token
        const token = crypto.randomBytes(32).toString('hex');
        const tokenExpiry = new Date(Date.now() + 3600000); // 1 hour from now

        // Store token in database
        await pool.execute(
            'UPDATE users SET password_reset_token = ?, token_expiry = ? WHERE id = ?',
            [token, tokenExpiry, user.id]
        );

        // Create reset URL
        const siteUrl = process.env.SITE_URL || 'http://localhost:3000';
        const resetUrl = `${siteUrl}/reset-password.html?token=${token}`;

        // BUG-23 FIX: Detectar credenciales SMTP placeholder además de vacías
        const smtpUser = process.env.SMTP_USER || '';
        const smtpPass = process.env.SMTP_PASS || '';
        const isSmtpPlaceholder = !smtpUser || !smtpPass
            || smtpUser.includes('tu_email')
            || smtpPass.includes('tu_contrase');

        if (isSmtpPlaceholder) {
            console.log('⚠️ SMTP not configured or placeholder detected. Reset URL:', resetUrl);
            return res.json({
                success: true,
                message: 'Email de recuperación enviado (modo desarrollo)',
                // In development, return the URL for testing
                devResetUrl: resetUrl
            });
        }

        // Send email
        const transporter = createTransporter();

        await transporter.sendMail({
            from: process.env.SMTP_FROM || 'AUBA Beauty Studio <noreply@auba.com>',
            to: user.email,
            subject: 'Recupera tu contraseña - AUBA Beauty Studio',
            html: `
                <div style="font-family: 'Inter', Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
                    <div style="text-align: center; margin-bottom: 30px;">
                        <h1 style="color: #1D1D1F; font-size: 24px;">AUBA Beauty Studio</h1>
                    </div>
                    <p style="color: #1D1D1F; font-size: 16px;">Hola ${user.name},</p>
                    <p style="color: #666; font-size: 15px; line-height: 1.6;">
                        Recibimos una solicitud para restablecer la contraseña de tu cuenta. 
                        Haz clic en el botón de abajo para crear una nueva contraseña.
                    </p>
                    <div style="text-align: center; margin: 30px 0;">
                        <a href="${resetUrl}" 
                           style="background: linear-gradient(135deg, #D4A574, #C49B6C); 
                                  color: white; 
                                  padding: 14px 32px; 
                                  text-decoration: none; 
                                  border-radius: 999px; 
                                  font-weight: 500;
                                  display: inline-block;">
                            Restablecer Contraseña
                        </a>
                    </div>
                    <p style="color: #999; font-size: 13px;">
                        Este enlace expirará en 1 hora. Si no solicitaste este cambio, ignora este correo.
                    </p>
                    <hr style="border: none; border-top: 1px solid #eee; margin: 30px 0;">
                    <p style="color: #999; font-size: 12px; text-align: center;">
                        AUBA Beauty Studio | Estética & Elegancia
                    </p>
                </div>
            `
        });

        res.json({ success: true, message: 'Email de recuperación enviado' });

    } catch (error) {
        console.error('Error in forgot-password:', error);
        res.status(500).json({ success: false, error: 'Error al procesar la solicitud' });
    }
});

// Reset Password - Update password with token
app.post('/api/auth/reset-password', async (req, res) => {
    try {
        const { token, newPassword } = req.body;

        if (!token || !newPassword) {
            return res.status(400).json({ success: false, error: 'Token y contraseña son requeridos' });
        }

        if (newPassword.length < 4) {
            return res.status(400).json({ success: false, error: 'La contraseña debe tener al menos 4 caracteres' });
        }

        // Find user by token and check expiry
        const [users] = await pool.execute(
            'SELECT id FROM users WHERE password_reset_token = ? AND token_expiry > NOW()',
            [token]
        );

        if (users.length === 0) {
            return res.status(400).json({ success: false, error: 'Token inválido o expirado' });
        }

        const user = users[0];

        // Hash new password
        const hashedPassword = await bcrypt.hash(newPassword, 10);

        // Update password and clear token
        await pool.execute(
            'UPDATE users SET password = ?, password_reset_token = NULL, token_expiry = NULL WHERE id = ?',
            [hashedPassword, user.id]
        );

        res.json({ success: true, message: 'Contraseña actualizada correctamente' });

    } catch (error) {
        console.error('Error in reset-password:', error);
        res.status(500).json({ success: false, error: 'Error al restablecer la contraseña' });
    }
});

// ============================================
// RUTAS DE DATOS
// ============================================

// Obtener manicuristas
app.get('/api/manicurists', async (req, res) => {
    try {
        const [rows] = await pool.execute('SELECT * FROM manicurists WHERE available = TRUE');
        res.json(rows);
    } catch (error) {
        res.status(500).json({ error: 'Error del servidor' });
    }
});

// Obtener servicios
app.get('/api/services', async (req, res) => {
    try {
        const [rows] = await pool.execute('SELECT * FROM services');
        res.json(rows);
    } catch (error) {
        res.status(500).json({ error: 'Error del servidor' });
    }
});

// Verificar disponibilidad (revisar conflictos de horario)
app.get('/api/availability/:manicuristId/:date', async (req, res) => {
    try {
        const { manicuristId, date } = req.params;

        // Obtener todas las reservas de esa manicurista en esa fecha
        const [bookings] = await pool.execute(
            'SELECT booking_time, service_id FROM bookings WHERE manicurist_id = ? AND booking_date = ? AND status != "cancelled"',
            [manicuristId, date]
        );

        // Devolvemos las horas ocupadas. El frontend calculará los huecos libres.
        // Asumimos 2 horas de duración por defecto como solicitado.
        const occupiedSlots = bookings.map(b => {
            return {
                start: b.booking_time, // formato '10:00:00'
                duration: 120 // minutos hardcoded por ahora
            };
        });

        res.json({ occupiedSlots });
    } catch (error) {
        console.error('Error checking availability:', error);
        res.status(500).json({ error: 'Error del servidor' });
    }
});

// ============================================
// RUTAS DE RESERVAS
// ============================================

// Crear reserva
app.post('/api/bookings', async (req, res) => {
    try {
        const { user_id, manicurist_id, service_id, booking_date, booking_time } = req.body;

        // BUG-10 FIX: Validar que la fecha no sea pasada
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        const bookDate = new Date(booking_date + 'T00:00:00');
        if (bookDate < today) {
            return res.status(400).json({ success: false, error: 'No puedes reservar en una fecha pasada.' });
        }

        // Validación simple de conflicto en servidor (opcional, pero recomendada)
        const [existing] = await pool.execute(
            `SELECT id FROM bookings 
             WHERE manicurist_id = ? 
             AND booking_date = ? 
             AND status != 'cancelled'
             AND (
                (booking_time <= ? AND ADDTIME(booking_time, '02:00:00') > ?) OR
                (booking_time < ADDTIME(?, '02:00:00') AND ADDTIME(booking_time, '02:00:00') >= ADDTIME(?, '02:00:00'))
             )`,
            [manicurist_id, booking_date, booking_time, booking_time, booking_time, booking_time]
        );

        if (existing.length > 0) {
            return res.status(400).json({ success: false, error: 'El horario seleccionado ya no está disponible.' });
        }

        const [result] = await pool.execute(
            'INSERT INTO bookings (user_id, manicurist_id, service_id, booking_date, booking_time) VALUES (?, ?, ?, ?, ?)',
            [user_id, manicurist_id, service_id, booking_date, booking_time]
        );

        res.json({
            success: true,
            booking_id: result.insertId,
            message: '¡Reserva creada exitosamente!'
        });

    } catch (error) {
        console.error('Error creando reserva:', error);
        res.status(500).json({ success: false, error: 'Error del servidor' });
    }
});

// Obtener reservas de un usuario
app.get('/api/bookings/:userId', async (req, res) => {
    try {
        const [rows] = await pool.execute(`
            SELECT 
                b.id,
                DATE_FORMAT(b.booking_date, '%Y-%m-%d') as booking_date,
                b.booking_time,
                b.status,
                b.created_at,
                b.manicurist_id,
                m.name as manicurist_name,
                s.title as service_title,
                s.price as service_price
            FROM bookings b
            JOIN manicurists m ON b.manicurist_id = m.id
            JOIN services s ON b.service_id = s.id
            WHERE b.user_id = ?
            ORDER BY b.booking_date DESC, b.booking_time DESC
        `, [req.params.userId]);

        res.json(rows);
    } catch (error) {
        res.status(500).json({ error: 'Error del servidor' });
    }
});

// Reagendar una cita (solo si faltan más de 24 horas)
app.put('/api/bookings/:id/reschedule', async (req, res) => {
    try {
        const { id } = req.params;
        const { user_id, new_date, new_time } = req.body;

        // Verificar que la cita exista y pertenezca al usuario
        const [bookings] = await pool.execute(
            'SELECT id, booking_date, booking_time, manicurist_id, status FROM bookings WHERE id = ? AND user_id = ?',
            [id, user_id]
        );

        if (bookings.length === 0) {
            return res.status(404).json({ success: false, error: 'Cita no encontrada o no autorizada' });
        }

        const booking = bookings[0];

        // Verificar que la cita no esté ya completada o cancelada
        if (['completed', 'cancelled', 'no_show', 'in_progress'].includes(booking.status)) {
            return res.status(400).json({ success: false, error: 'Esta cita no se puede reagendar' });
        }

        // Calcular horas hasta la cita original
        const bookingDateTime = new Date(`${booking.booking_date}T${booking.booking_time}`);
        const now = new Date();
        const hoursUntilBooking = (bookingDateTime - now) / (1000 * 60 * 60);

        // Validar regla de 24 horas
        if (hoursUntilBooking <= 24) {
            return res.status(400).json({
                success: false,
                error: 'Solo puedes reagendar con más de 24 horas de anticipación'
            });
        }

        // Verificar disponibilidad del nuevo horario
        const [conflicts] = await pool.execute(
            `SELECT id FROM bookings 
             WHERE manicurist_id = ? 
             AND booking_date = ? 
             AND status NOT IN ('cancelled', 'no_show')
             AND id != ?
             AND (
                (booking_time <= ? AND ADDTIME(booking_time, '02:00:00') > ?) OR
                (booking_time < ADDTIME(?, '02:00:00') AND ADDTIME(booking_time, '02:00:00') >= ADDTIME(?, '02:00:00'))
             )`,
            [booking.manicurist_id, new_date, id, new_time, new_time, new_time, new_time]
        );

        if (conflicts.length > 0) {
            return res.status(400).json({
                success: false,
                error: 'El horario seleccionado ya no está disponible'
            });
        }

        // Actualizar la reserva
        await pool.execute(
            'UPDATE bookings SET booking_date = ?, booking_time = ? WHERE id = ?',
            [new_date, new_time, id]
        );

        res.json({
            success: true,
            message: 'Cita reagendada exitosamente'
        });

    } catch (error) {
        console.error('Error rescheduling booking:', error);
        res.status(500).json({ success: false, error: 'Error del servidor' });
    }
});

// BUG-04 FIX: Proteger rutas de manicuristas
app.get('/api/manicurists/:id/bookings', requireAuth(['manicurist', 'admin']), async (req, res) => {
    try {
        const { id } = req.params;
        const { date, status } = req.query; // opcional: filtrar por fecha y/o status

        let query = `
            SELECT 
                b.id,
                b.booking_date,
                b.booking_time,
                b.status,
                u.name as client_name,
                u.phone as client_phone,
                s.title as service_title
            FROM bookings b
            JOIN users u ON b.user_id = u.id
            JOIN services s ON b.service_id = s.id
            WHERE b.manicurist_id = ? AND b.status != 'cancelled'
        `;

        const params = [id];

        if (date) {
            query += ' AND b.booking_date = ?';
            params.push(date);
        }

        if (status) {
            query += ' AND b.status = ?';
            params.push(status);
        }

        query += ' ORDER BY b.booking_date ASC, b.booking_time ASC';

        const [rows] = await pool.execute(query, params);
        res.json(rows);
    } catch (error) {
        console.error('Error fetching manicurist bookings:', error);
        res.status(500).json({ error: 'Error del servidor' });
    }
});

// Actualizar estado de una reserva (desde portal de manicurista)
app.put('/api/manicurists/:manicuristId/bookings/:bookingId/status', requireAuth(['manicurist', 'admin']), async (req, res) => {
    try {
        const { manicuristId, bookingId } = req.params;
        const { status } = req.body;

        // Validar estados permitidos
        const allowedStatuses = ['pending', 'confirmed', 'in_progress', 'completed', 'cancelled', 'no_show'];
        if (!allowedStatuses.includes(status)) {
            return res.status(400).json({ success: false, error: 'Estado no válido' });
        }

        // Verificar que la cita pertenezca a esta manicurista
        const [bookings] = await pool.execute(
            'SELECT id FROM bookings WHERE id = ? AND manicurist_id = ?',
            [bookingId, manicuristId]
        );

        if (bookings.length === 0) {
            return res.status(404).json({ success: false, error: 'Cita no encontrada' });
        }

        // Actualizar estado
        await pool.execute(
            'UPDATE bookings SET status = ? WHERE id = ?',
            [status, bookingId]
        );

        res.json({ success: true, message: 'Estado actualizado correctamente' });

    } catch (error) {
        console.error('Error updating booking status:', error);
        res.status(500).json({ success: false, error: 'Error del servidor' });
    }
});

// ============================================
// RUTAS DE PAGOS (ePayco)
// ============================================

// Obtener configuración de ePayco (llave pública para el frontend)
app.get('/api/payments/config', (req, res) => {
    res.json({
        publicKey: process.env.EPAYCO_PUBLIC_KEY || '',
        testMode: process.env.EPAYCO_TEST_MODE === 'true'
    });
});

// Webhook de confirmación de ePayco
app.post('/api/payments/confirm', async (req, res) => {
    try {
        const { x_ref_payco, x_id_invoice, x_amount, x_cod_response } = req.body;

        console.log('📥 Confirmación de pago ePayco:', {
            ref: x_ref_payco,
            invoice: x_id_invoice,
            amount: x_amount,
            status: x_cod_response
        });

        // Código 1 = Aprobado, 3 = Pendiente
        if (x_cod_response === '1' || x_cod_response === 1) {
            // Actualizar el estado del booking si incluimos el booking_id en el invoice
            const bookingId = x_id_invoice?.replace('AUBA-', '');
            if (bookingId && !isNaN(bookingId)) {
                await pool.execute(
                    'UPDATE bookings SET payment_status = ?, payment_ref = ? WHERE id = ?',
                    ['paid', x_ref_payco, bookingId]
                );
            }
        }

        res.json({ success: true });
    } catch (error) {
        console.error('Error en webhook de pagos:', error);
        res.status(500).json({ success: false, error: 'Error procesando confirmación' });
    }
});

// Verificar estado de una transacción
app.get('/api/payments/verify/:refPayco', async (req, res) => {
    try {
        // En producción, aquí haríamos una llamada a la API de ePayco
        // Por ahora retornamos el estado almacenado en nuestra DB
        const { refPayco } = req.params;

        const [bookings] = await pool.execute(
            'SELECT id, payment_status, payment_ref FROM bookings WHERE payment_ref = ?',
            [refPayco]
        );

        if (bookings.length === 0) {
            return res.status(404).json({ success: false, error: 'Transacción no encontrada' });
        }

        res.json({
            success: true,
            status: bookings[0].payment_status,
            bookingId: bookings[0].id
        });
    } catch (error) {
        console.error('Error verificando pago:', error);
        res.status(500).json({ success: false, error: 'Error verificando pago' });
    }
});

// ============================================
// RUTAS DE ADMINISTRACIÓN
// ============================================

// Login de administrador
app.post('/api/auth/admin/login', loginLimiter, async (req, res) => {
    try {
        const { phone, password } = req.body;

        const adminPhone = process.env.ADMIN_PHONE || '3001234567';

        // BUG-02 FIX: Comparar con bcrypt en lugar de texto plano
        const isValidPhone = phone === adminPhone;
        const isValidPassword = await bcrypt.compare(password, adminPasswordHash);

        if (isValidPhone && isValidPassword) {
            // BUG-03 FIX: Generar token de sesión
            const token = generateToken(0, 'admin');
            res.json({
                success: true,
                token,
                user: {
                    id: 0,
                    name: 'Administrador',
                    phone: adminPhone,
                    role: 'admin'
                }
            });
        } else {
            res.status(401).json({ success: false, error: 'Credenciales inválidas' });
        }
    } catch (error) {
        console.error('Error en admin login:', error);
        res.status(500).json({ success: false, error: 'Error del servidor' });
    }
});

// Estadísticas del dashboard
// BUG-03 FIX: Proteger TODAS las rutas admin con autenticación
app.use('/api/admin', requireAuth(['admin']));

app.get('/api/admin/stats', async (req, res) => {
    try {
        const today = new Date().toISOString().split('T')[0];

        // Citas de hoy
        const [todayBookings] = await pool.execute(
            'SELECT COUNT(*) as count FROM bookings WHERE booking_date = ?',
            [today]
        );

        // Citas de esta semana
        const [weekBookings] = await pool.execute(
            `SELECT COUNT(*) as count FROM bookings 
             WHERE booking_date >= DATE_SUB(CURDATE(), INTERVAL WEEKDAY(CURDATE()) DAY)
             AND booking_date <= DATE_ADD(DATE_SUB(CURDATE(), INTERVAL WEEKDAY(CURDATE()) DAY), INTERVAL 6 DAY)`
        );

        // Total de usuarios
        const [totalUsers] = await pool.execute('SELECT COUNT(*) as count FROM users');

        // Ingresos del mes (basado en reservas completadas)
        const [monthRevenue] = await pool.execute(`
            SELECT COALESCE(SUM(s.price), 0) as total
            FROM bookings b
            JOIN services s ON b.service_id = s.id
            WHERE MONTH(b.booking_date) = MONTH(CURDATE())
            AND YEAR(b.booking_date) = YEAR(CURDATE())
            AND b.status IN ('confirmed', 'completed')
        `);

        res.json({
            bookingsToday: todayBookings[0].count,
            bookingsWeek: weekBookings[0].count,
            totalUsers: totalUsers[0].count,
            revenueMonth: monthRevenue[0].total
        });
    } catch (error) {
        console.error('Error getting stats:', error);
        res.status(500).json({ error: 'Error del servidor' });
    }
});

// Próximas citas
app.get('/api/admin/bookings/upcoming', async (req, res) => {
    try {
        const [rows] = await pool.execute(`
            SELECT 
                b.id,
                b.booking_date,
                b.booking_time,
                b.status,
                u.name as client_name,
                s.title as service_title
            FROM bookings b
            JOIN users u ON b.user_id = u.id
            JOIN services s ON b.service_id = s.id
            WHERE b.booking_date >= CURDATE()
            AND b.status != 'cancelled'
            ORDER BY b.booking_date ASC, b.booking_time ASC
            LIMIT 10
        `);
        res.json(rows);
    } catch (error) {
        res.status(500).json({ error: 'Error del servidor' });
    }
});

// Listar todas las reservas con filtros
app.get('/api/admin/bookings', async (req, res) => {
    try {
        const { date, status } = req.query;

        let query = `
            SELECT 
                b.id,
                b.booking_date,
                b.booking_time,
                b.status,
                u.name as client_name,
                u.phone as client_phone,
                m.name as manicurist_name,
                s.title as service_title
            FROM bookings b
            JOIN users u ON b.user_id = u.id
            JOIN manicurists m ON b.manicurist_id = m.id
            JOIN services s ON b.service_id = s.id
            WHERE 1=1
        `;
        const params = [];

        if (date) {
            query += ' AND b.booking_date = ?';
            params.push(date);
        }
        if (status) {
            query += ' AND b.status = ?';
            params.push(status);
        }

        query += ' ORDER BY b.booking_date DESC, b.booking_time DESC LIMIT 100';

        const [rows] = await pool.execute(query, params);
        res.json(rows);
    } catch (error) {
        res.status(500).json({ error: 'Error del servidor' });
    }
});

// Actualizar estado de reserva
app.put('/api/admin/bookings/:id/status', async (req, res) => {
    try {
        const { id } = req.params;
        const { status } = req.body;

        await pool.execute(
            'UPDATE bookings SET status = ? WHERE id = ?',
            [status, id]
        );

        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ success: false, error: 'Error del servidor' });
    }
});

// CRUD Servicios
app.post('/api/admin/services', async (req, res) => {
    try {
        const { title, description, price, duration } = req.body;
        const [result] = await pool.execute(
            'INSERT INTO services (title, description, price, duration) VALUES (?, ?, ?, ?)',
            [title, description, price, duration || 60]
        );
        res.json({ success: true, id: result.insertId });
    } catch (error) {
        res.status(500).json({ success: false, error: 'Error del servidor' });
    }
});

app.put('/api/admin/services/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const { title, description, price, duration } = req.body;
        await pool.execute(
            'UPDATE services SET title = ?, description = ?, price = ?, duration = ? WHERE id = ?',
            [title, description, price, duration, id]
        );
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ success: false, error: 'Error del servidor' });
    }
});

app.delete('/api/admin/services/:id', async (req, res) => {
    try {
        // BUG-21 FIX: Verificar que no tenga reservas activas antes de eliminar
        const [activeBookings] = await pool.execute(
            "SELECT COUNT(*) as count FROM bookings WHERE service_id = ? AND status IN ('pending', 'confirmed', 'in_progress')",
            [req.params.id]
        );

        if (activeBookings[0].count > 0) {
            return res.status(400).json({
                success: false,
                error: `No se puede eliminar: tiene ${activeBookings[0].count} reserva(s) activa(s). Cancélalas primero.`
            });
        }

        await pool.execute('DELETE FROM services WHERE id = ?', [req.params.id]);
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ success: false, error: 'Error del servidor' });
    }
});

// Listar usuarios
app.get('/api/admin/users', async (req, res) => {
    try {
        const [rows] = await pool.execute(`
            SELECT 
                u.id,
                u.name,
                u.phone,
                u.email,
                u.created_at,
                (SELECT COUNT(*) FROM bookings WHERE user_id = u.id) as booking_count
            FROM users u
            ORDER BY u.created_at DESC
        `);
        res.json(rows);
    } catch (error) {
        res.status(500).json({ error: 'Error del servidor' });
    }
});

// Actualizar disponibilidad de manicurista
app.put('/api/admin/manicurists/:id/availability', async (req, res) => {
    try {
        const { id } = req.params;
        const { available } = req.body;
        await pool.execute(
            'UPDATE manicurists SET available = ? WHERE id = ?',
            [available, id]
        );
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ success: false, error: 'Error del servidor' });
    }
});

// Listar todas las manicuristas (incluyendo no disponibles) - para admin
app.get('/api/admin/manicurists', async (req, res) => {
    try {
        const [rows] = await pool.execute('SELECT id, name, phone, specialty, available FROM manicurists ORDER BY name');
        res.json(rows);
    } catch (error) {
        res.status(500).json({ error: 'Error del servidor' });
    }
});

// Crear nueva manicurista
app.post('/api/admin/manicurists', async (req, res) => {
    try {
        const { name, phone, specialty, password } = req.body;

        // Validaciones
        if (!name || name.trim().length < 3) {
            return res.status(400).json({ success: false, error: 'El nombre debe tener al menos 3 caracteres' });
        }
        if (!phone || !/^\d{10}$/.test(phone.replace(/\s/g, ''))) {
            return res.status(400).json({ success: false, error: 'El número de celular debe tener 10 dígitos' });
        }
        if (!password || password.length < 4) {
            return res.status(400).json({ success: false, error: 'La contraseña debe tener al menos 4 caracteres' });
        }

        // Verificar si el teléfono ya existe
        const [existing] = await pool.execute('SELECT id FROM manicurists WHERE phone = ?', [phone]);
        if (existing.length > 0) {
            return res.status(400).json({ success: false, error: 'Este número de celular ya está registrado' });
        }

        // Hashear contraseña
        const hashedPassword = await bcrypt.hash(password, 10);

        // Insertar manicurista
        const [result] = await pool.execute(
            'INSERT INTO manicurists (name, phone, specialty, password, available) VALUES (?, ?, ?, ?, TRUE)',
            [name.trim(), phone.replace(/\s/g, ''), specialty || 'Especialista', hashedPassword]
        );

        res.json({
            success: true,
            id: result.insertId,
            message: 'Manicurista creada exitosamente'
        });

    } catch (error) {
        console.error('Error creando manicurista:', error);
        res.status(500).json({ success: false, error: 'Error del servidor' });
    }
});

// Actualizar manicurista
app.put('/api/admin/manicurists/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const { name, phone, specialty } = req.body;

        // Validaciones
        if (!name || name.trim().length < 3) {
            return res.status(400).json({ success: false, error: 'El nombre debe tener al menos 3 caracteres' });
        }

        // Verificar que el teléfono no esté usado por otra manicurista
        if (phone) {
            const [existing] = await pool.execute('SELECT id FROM manicurists WHERE phone = ? AND id != ?', [phone, id]);
            if (existing.length > 0) {
                return res.status(400).json({ success: false, error: 'Este número ya está registrado por otra manicurista' });
            }
        }

        await pool.execute(
            'UPDATE manicurists SET name = ?, phone = ?, specialty = ? WHERE id = ?',
            [name.trim(), phone || null, specialty || 'Especialista', id]
        );

        res.json({ success: true, message: 'Manicurista actualizada correctamente' });
    } catch (error) {
        console.error('Error actualizando manicurista:', error);
        res.status(500).json({ success: false, error: 'Error del servidor' });
    }
});

// Eliminar manicurista
app.delete('/api/admin/manicurists/:id', async (req, res) => {
    try {
        const { id } = req.params;

        // Verificar que no tenga citas pendientes
        const [bookings] = await pool.execute(
            "SELECT COUNT(*) as count FROM bookings WHERE manicurist_id = ? AND status IN ('pending', 'confirmed')",
            [id]
        );

        if (bookings[0].count > 0) {
            return res.status(400).json({
                success: false,
                error: 'No se puede eliminar, tiene citas pendientes. Cancélalas primero.'
            });
        }

        await pool.execute('DELETE FROM manicurists WHERE id = ?', [id]);
        res.json({ success: true, message: 'Manicurista eliminada correctamente' });
    } catch (error) {
        console.error('Error eliminando manicurista:', error);
        res.status(500).json({ success: false, error: 'Error del servidor' });
    }
});

// ============================================
// RUTAS DE WHATSAPP / NOTIFICACIONES
// ============================================

// Enviar confirmación de reserva por WhatsApp
app.post('/api/notifications/booking-confirmation', async (req, res) => {
    try {
        const { bookingId } = req.body;

        // Obtener datos de la reserva
        const [bookings] = await pool.execute(`
            SELECT 
                b.id,
                b.booking_date,
                b.booking_time,
                u.name as client_name,
                u.phone as client_phone,
                m.name as manicurist_name,
                s.title as service_name
            FROM bookings b
            JOIN users u ON b.user_id = u.id
            JOIN manicurists m ON b.manicurist_id = m.id
            JOIN services s ON b.service_id = s.id
            WHERE b.id = ?
        `, [bookingId]);

        if (bookings.length === 0) {
            return res.status(404).json({ success: false, error: 'Reserva no encontrada' });
        }

        const booking = bookings[0];
        const result = await WhatsAppService.sendBookingConfirmation({
            clientPhone: WhatsAppService.normalizePhone(booking.client_phone),
            clientName: booking.client_name,
            serviceName: booking.service_name,
            date: booking.booking_date,
            time: booking.booking_time.substring(0, 5),
            manicuristName: booking.manicurist_name
        });

        res.json(result);
    } catch (error) {
        console.error('Error enviando confirmación WhatsApp:', error);
        res.status(500).json({ success: false, error: 'Error enviando notificación' });
    }
});

// Endpoint manual para enviar recordatorios
app.post('/api/notifications/send-reminders', async (req, res) => {
    try {
        const results = await sendDailyReminders();
        res.json({ success: true, sent: results.length, results });
    } catch (error) {
        console.error('Error enviando recordatorios:', error);
        res.status(500).json({ success: false, error: 'Error enviando recordatorios' });
    }
});

// Función para enviar recordatorios diarios
async function sendDailyReminders() {
    console.log('📱 Ejecutando envío de recordatorios...');

    // Obtener fecha de mañana
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    const tomorrowStr = tomorrow.toISOString().split('T')[0];

    try {
        // Buscar citas de mañana
        const [bookings] = await pool.execute(`
            SELECT 
                b.id,
                b.booking_date,
                b.booking_time,
                u.name as client_name,
                u.phone as client_phone,
                m.name as manicurist_name,
                s.title as service_name
            FROM bookings b
            JOIN users u ON b.user_id = u.id
            JOIN manicurists m ON b.manicurist_id = m.id
            JOIN services s ON b.service_id = s.id
            WHERE b.booking_date = ? AND b.status != 'cancelled'
        `, [tomorrowStr]);

        console.log(`📅 Encontradas ${bookings.length} citas para mañana (${tomorrowStr})`);

        const results = [];
        for (const booking of bookings) {
            const result = await WhatsAppService.sendReminder({
                clientPhone: WhatsAppService.normalizePhone(booking.client_phone),
                clientName: booking.client_name,
                serviceName: booking.service_name,
                date: booking.booking_date,
                time: booking.booking_time.substring(0, 5),
                manicuristName: booking.manicurist_name
            });
            results.push({ bookingId: booking.id, ...result });
        }

        return results;
    } catch (error) {
        console.error('Error en recordatorios:', error);
        return [];
    }
}

// ============================================
// INICIAR SERVIDOR
// ============================================

initDB().then(() => {
    app.listen(PORT, () => {
        console.log(`🚀 Servidor corriendo en http://localhost:${PORT}`);
        console.log(`📱 Abre http://localhost:${PORT}/index.html en tu navegador`);

        // Programar recordatorios diarios a las 9:00 AM
        cron.schedule('0 9 * * *', () => {
            console.log('⏰ Ejecutando tarea programada: recordatorios diarios');
            sendDailyReminders();
        });
        console.log('⏰ Recordatorios programados para las 9:00 AM diariamente');
    });
});
