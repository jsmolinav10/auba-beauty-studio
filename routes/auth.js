/**
 * AUBA Beauty Studio - Rutas de Autenticación
 * Login, registro, y recuperación de contraseña
 */

const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const rateLimit = require('express-rate-limit');
const { generateToken, requireAuth } = require('./middleware');

// Rate limiting estricto para login
const loginLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 100,
    message: { success: false, error: 'Demasiados intentos de inicio de sesión. Intenta en 15 minutos.' }
});

// Admin password hash (initialized at startup)
let adminPasswordHash = null;

async function initAdminPassword() {
    const adminPassword = process.env.ADMIN_PASSWORD;
    adminPasswordHash = await bcrypt.hash(adminPassword, 10);
    console.log('🔐 Admin password hash ready');
}

// ============================================
// REGISTRO
// ============================================

router.post('/register', async (req, res) => {
    try {
        const { name, phone, email, password } = req.body;

        if (!name || name.trim().length < 3) {
            return res.status(400).json({ success: false, error: 'El nombre debe tener al menos 3 caracteres' });
        }
        if (!phone || !/^\d{10}$/.test(phone.replace(/\s/g, ''))) {
            return res.status(400).json({ success: false, error: 'El número de celular debe tener 10 dígitos' });
        }
        if (!password || password.length < 6) {
            return res.status(400).json({ success: false, error: 'La contraseña debe tener al menos 6 caracteres' });
        }
        if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
            return res.status(400).json({ success: false, error: 'Debes proporcionar un email válido' });
        }

        const pool = req.app.locals.pool;
        const [existing] = await pool.execute('SELECT id FROM users WHERE phone = ?', [phone]);
        if (existing.length > 0) {
            return res.status(400).json({ success: false, error: 'Este número de celular ya está registrado' });
        }

        const hashedPassword = await bcrypt.hash(password, 10);
        const normalizedEmail = email ? email.trim().toLowerCase() : null;

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

// ============================================
// LOGIN USUARIO
// ============================================

router.post('/login', loginLimiter, async (req, res) => {
    try {
        const { phone, password } = req.body;
        const pool = req.app.locals.pool;

        const [users] = await pool.execute('SELECT * FROM users WHERE phone = ?', [phone]);
        if (users.length === 0) {
            return res.status(401).json({ success: false, error: 'Número o contraseña incorrectos' });
        }

        const user = users[0];
        const validPassword = await bcrypt.compare(password, user.password);
        if (!validPassword) {
            return res.status(401).json({ success: false, error: 'Número o contraseña incorrectos' });
        }

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

// ============================================
// LOGIN MANICURISTA
// ============================================

router.post('/manicurist/login', loginLimiter, async (req, res) => {
    try {
        const { phone, password } = req.body;
        const pool = req.app.locals.pool;

        const [users] = await pool.execute('SELECT * FROM manicurists WHERE phone = ?', [phone]);
        if (users.length === 0) {
            return res.status(401).json({ success: false, error: 'Credenciales inválidas' });
        }

        const manicurist = users[0];
        const validPassword = await bcrypt.compare(password, manicurist.password);
        if (!validPassword) {
            return res.status(401).json({ success: false, error: 'Credenciales inválidas' });
        }

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
        console.error('Error en manicurist login:', error);
        res.status(500).json({ success: false, error: 'Error del servidor' });
    }
});

// ============================================
// LOGIN ADMIN
// ============================================

router.post('/admin/login', loginLimiter, async (req, res) => {
    try {
        const { phone, password } = req.body;
        const adminPhone = process.env.ADMIN_PHONE;

        const isValidPhone = phone === adminPhone;
        const isValidPassword = await bcrypt.compare(password, adminPasswordHash);

        if (isValidPhone && isValidPassword) {
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

// ============================================
// RECUPERACIÓN DE CONTRASEÑA
// ============================================

router.post('/forgot-password', async (req, res) => {
    // Proceso simplificado: se le dice a la clienta que contacte por WhatsApp
    res.json({ 
        success: true, 
        message: 'Para recuperar tu contraseña, por favor contacta a soporte por WhatsApp para que te asignemos una nueva contraseña temporal.' 
    });
});

// ============================================
// CAMBIO DE CONTRASEÑA
// ============================================

router.put('/change-password', requireAuth(['user']), async (req, res) => {
    try {
        const { newPassword } = req.body;
        const userId = req.user.id; // From requireAuth middleware

        if (!newPassword || newPassword.length < 6) {
            return res.status(400).json({ success: false, error: 'La contraseña debe tener al menos 6 caracteres' });
        }

        const pool = req.app.locals.pool;
        const hashedPassword = await bcrypt.hash(newPassword, 10);

        await pool.execute(
            'UPDATE users SET password = ? WHERE id = ?',
            [hashedPassword, userId]
        );

        res.json({ success: true, message: 'Contraseña actualizada correctamente' });
    } catch (error) {
        console.error('Error in change-password:', error);
        res.status(500).json({ success: false, error: 'Error al actualizar la contraseña' });
    }
});

module.exports = { router, initAdminPassword };
