/**
 * AUBA Beauty Studio - Rutas de Administración
 * Dashboard, CRUD servicios, CRUD manicuristas, gestión usuarios
 */

const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const { requireAuth } = require('./middleware');

// Proteger TODAS las rutas admin
router.use(requireAuth(['admin']));

// ============================================
// DASHBOARD STATS
// ============================================

router.get('/stats', async (req, res) => {
    try {
        const pool = req.app.locals.pool;
        const today = new Date().toISOString().split('T')[0];

        const [todayBookings] = await pool.execute(
            'SELECT COUNT(*) as count FROM bookings WHERE booking_date = ?',
            [today]
        );

        const [weekBookings] = await pool.execute(
            `SELECT COUNT(*) as count FROM bookings 
             WHERE booking_date >= CURRENT_DATE - EXTRACT(ISODOW FROM CURRENT_DATE)::INT + 1
             AND booking_date <= CURRENT_DATE - EXTRACT(ISODOW FROM CURRENT_DATE)::INT + 7`
        );

        const [totalUsers] = await pool.execute('SELECT COUNT(*) as count FROM users');

        const [monthRevenue] = await pool.execute(`
            SELECT COALESCE(SUM(s.price), 0) as total
            FROM bookings b
            JOIN services s ON b.service_id = s.id
            WHERE EXTRACT(MONTH FROM b.booking_date) = EXTRACT(MONTH FROM CURRENT_DATE)
            AND EXTRACT(YEAR FROM b.booking_date) = EXTRACT(YEAR FROM CURRENT_DATE)
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

// ============================================
// CITAS
// ============================================

router.get('/bookings/upcoming', async (req, res) => {
    try {
        const pool = req.app.locals.pool;
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
            WHERE b.booking_date >= CURRENT_DATE
            AND b.status != 'cancelled'
            ORDER BY b.booking_date ASC, b.booking_time ASC
            LIMIT 10
        `);
        res.json(rows);
    } catch (error) {
        res.status(500).json({ error: 'Error del servidor' });
    }
});

router.get('/bookings', async (req, res) => {
    try {
        const pool = req.app.locals.pool;
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

router.put('/bookings/:id/status', async (req, res) => {
    try {
        const pool = req.app.locals.pool;
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

// ============================================
// CRUD SERVICIOS
// ============================================

router.post('/services', async (req, res) => {
    try {
        const pool = req.app.locals.pool;
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

router.put('/services/:id', async (req, res) => {
    try {
        const pool = req.app.locals.pool;
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

router.delete('/services/:id', async (req, res) => {
    try {
        const pool = req.app.locals.pool;
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

// ============================================
// USUARIOS
// ============================================

router.get('/users', async (req, res) => {
    try {
        const pool = req.app.locals.pool;
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

// ============================================
// CRUD MANICURISTAS
// ============================================

router.get('/manicurists', async (req, res) => {
    try {
        const pool = req.app.locals.pool;
        const [rows] = await pool.execute('SELECT id, name, phone, specialty, available FROM manicurists ORDER BY name');
        res.json(rows);
    } catch (error) {
        res.status(500).json({ error: 'Error del servidor' });
    }
});

router.post('/manicurists', async (req, res) => {
    try {
        const pool = req.app.locals.pool;
        const { name, phone, specialty, password } = req.body;

        if (!name || name.trim().length < 3) {
            return res.status(400).json({ success: false, error: 'El nombre debe tener al menos 3 caracteres' });
        }
        if (!phone || !/^\d{10}$/.test(phone.replace(/\s/g, ''))) {
            return res.status(400).json({ success: false, error: 'El número de celular debe tener 10 dígitos' });
        }
        if (!password || password.length < 4) {
            return res.status(400).json({ success: false, error: 'La contraseña debe tener al menos 4 caracteres' });
        }

        const [existing] = await pool.execute('SELECT id FROM manicurists WHERE phone = ?', [phone]);
        if (existing.length > 0) {
            return res.status(400).json({ success: false, error: 'Este número de celular ya está registrado' });
        }

        const hashedPassword = await bcrypt.hash(password, 10);

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

router.put('/manicurists/:id', async (req, res) => {
    try {
        const pool = req.app.locals.pool;
        const { id } = req.params;
        const { name, phone, specialty } = req.body;

        if (!name || name.trim().length < 3) {
            return res.status(400).json({ success: false, error: 'El nombre debe tener al menos 3 caracteres' });
        }

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

router.put('/manicurists/:id/availability', async (req, res) => {
    try {
        const pool = req.app.locals.pool;
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

router.delete('/manicurists/:id', async (req, res) => {
    try {
        const pool = req.app.locals.pool;
        const { id } = req.params;

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
// RESET DE CONTRASEÑAS GENÉRICAS
// ============================================

router.put('/users/:id/reset-password', async (req, res) => {
    try {
        const pool = req.app.locals.pool;
        const { id } = req.params;
        const hashedPassword = await bcrypt.hash('auba2026', 10);
        
        await pool.execute(
            'UPDATE users SET password = ?, password_reset_token = NULL, token_expiry = NULL WHERE id = ?',
            [hashedPassword, id]
        );
        
        res.json({ success: true, message: 'Contraseña de clienta restablecida a: auba2026' });
    } catch (error) {
        console.error('Error reset user password:', error);
        res.status(500).json({ success: false, error: 'Error del servidor' });
    }
});

router.put('/manicurists/:id/reset-password', async (req, res) => {
    try {
        const pool = req.app.locals.pool;
        const { id } = req.params;
        const hashedPassword = await bcrypt.hash('auba2026', 10);
        
        await pool.execute(
            'UPDATE manicurists SET password = ? WHERE id = ?',
            [hashedPassword, id]
        );
        
        res.json({ success: true, message: 'Contraseña de manicurista restablecida a: auba2026' });
    } catch (error) {
        console.error('Error reset manicurist password:', error);
        res.status(500).json({ success: false, error: 'Error del servidor' });
    }
});

module.exports = router;
