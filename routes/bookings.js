/**
 * AUBA Beauty Studio - Rutas de Reservas
 * Crear, reagendar, consultar citas
 */

const express = require('express');
const router = express.Router();
const { requireAuth } = require('./middleware');

// ============================================
// DATOS PÚBLICOS
// ============================================

// Obtener manicuristas disponibles
router.get('/manicurists', async (req, res) => {
    try {
        const pool = req.app.locals.pool;
        const [rows] = await pool.execute('SELECT * FROM manicurists WHERE available = TRUE');
        res.json(rows);
    } catch (error) {
        res.status(500).json({ error: 'Error del servidor' });
    }
});

// Obtener servicios
router.get('/services', async (req, res) => {
    try {
        const pool = req.app.locals.pool;
        const [rows] = await pool.execute('SELECT * FROM services');
        res.json(rows);
    } catch (error) {
        res.status(500).json({ error: 'Error del servidor' });
    }
});

// Verificar disponibilidad
router.get('/availability/:manicuristId/:date', async (req, res) => {
    try {
        const pool = req.app.locals.pool;
        const { manicuristId, date } = req.params;

        const [bookings] = await pool.execute(
            'SELECT booking_time, service_id FROM bookings WHERE manicurist_id = ? AND booking_date = ? AND status != \'cancelled\'',
            [manicuristId, date]
        );

        const occupiedSlots = bookings.map(b => ({
            start: b.booking_time,
            duration: 120
        }));

        res.json({ occupiedSlots });
    } catch (error) {
        console.error('Error checking availability:', error);
        res.status(500).json({ error: 'Error del servidor' });
    }
});

// ============================================
// CREAR RESERVA
// ============================================

router.post('/bookings', requireAuth(['user']), async (req, res) => {
    try {
        const pool = req.app.locals.pool;
        const { user_id, manicurist_id, service_id, booking_date, booking_time } = req.body;

        // Validar fecha no pasada
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        const bookDate = new Date(booking_date + 'T00:00:00');
        if (bookDate < today) {
            return res.status(400).json({ success: false, error: 'No puedes reservar en una fecha pasada.' });
        }

        // Validar conflicto de horario
        const [existing] = await pool.execute(
            `SELECT id FROM bookings 
             WHERE manicurist_id = ? 
             AND booking_date = ? 
             AND status != 'cancelled'
             AND (
                (booking_time <= ? AND booking_time + INTERVAL '2 hours' > ?::TIME) OR
                (booking_time < ?::TIME + INTERVAL '2 hours' AND booking_time + INTERVAL '2 hours' >= ?::TIME + INTERVAL '2 hours')
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

// ============================================
// CONSULTAR RESERVAS DE USUARIO
// ============================================

router.get('/bookings/:userId', requireAuth(['user']), async (req, res) => {
    try {
        const pool = req.app.locals.pool;
        const { userId } = req.params;

        if (parseInt(userId) !== req.auth.userId) {
            return res.status(403).json({ success: false, error: 'No puedes ver las reservas de otro usuario.' });
        }

        const [rows] = await pool.execute(`
            SELECT 
                b.id,
                TO_CHAR(b.booking_date, 'YYYY-MM-DD') as booking_date,
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
        `, [userId]);

        res.json(rows);
    } catch (error) {
        res.status(500).json({ error: 'Error del servidor' });
    }
});

// ============================================
// REAGENDAR CITA
// ============================================

router.put('/bookings/:id/reschedule', requireAuth(['user']), async (req, res) => {
    try {
        const pool = req.app.locals.pool;
        const { id } = req.params;
        const { new_date, new_time } = req.body;
        const user_id = req.auth.userId;

        const [bookings] = await pool.execute(
            'SELECT id, booking_date, booking_time, manicurist_id, status FROM bookings WHERE id = ? AND user_id = ?',
            [id, user_id]
        );

        if (bookings.length === 0) {
            return res.status(404).json({ success: false, error: 'Cita no encontrada o no autorizada' });
        }

        const booking = bookings[0];

        if (['completed', 'cancelled', 'no_show', 'in_progress'].includes(booking.status)) {
            return res.status(400).json({ success: false, error: 'Esta cita no se puede reagendar' });
        }

        const bookingDateTime = new Date(`${booking.booking_date}T${booking.booking_time}`);
        const now = new Date();
        const hoursUntilBooking = (bookingDateTime - now) / (1000 * 60 * 60);

        if (hoursUntilBooking <= 24) {
            return res.status(400).json({
                success: false,
                error: 'Solo puedes reagendar con más de 24 horas de anticipación'
            });
        }

        const [conflicts] = await pool.execute(
            `SELECT id FROM bookings 
             WHERE manicurist_id = ? 
             AND booking_date = ? 
             AND status NOT IN ('cancelled', 'no_show')
             AND id != ?
             AND (
                (booking_time <= ? AND booking_time + INTERVAL '2 hours' > ?::TIME) OR
                (booking_time < ?::TIME + INTERVAL '2 hours' AND booking_time + INTERVAL '2 hours' >= ?::TIME + INTERVAL '2 hours')
             )`,
            [booking.manicurist_id, new_date, id, new_time, new_time, new_time, new_time]
        );

        if (conflicts.length > 0) {
            return res.status(400).json({
                success: false,
                error: 'El horario seleccionado ya no está disponible'
            });
        }

        await pool.execute(
            'UPDATE bookings SET booking_date = ?, booking_time = ? WHERE id = ?',
            [new_date, new_time, id]
        );

        res.json({ success: true, message: 'Cita reagendada exitosamente' });

    } catch (error) {
        console.error('Error rescheduling booking:', error);
        res.status(500).json({ success: false, error: 'Error del servidor' });
    }
});

module.exports = router;
