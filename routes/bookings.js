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
        const [rows] = await pool.execute('SELECT id, name, phone, specialty, available FROM manicurists WHERE available = TRUE');
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

        // Verificar si el día está bloqueado por la manicurista
        const [blocked] = await pool.execute(
            'SELECT id FROM manicurist_unavailable_days WHERE manicurist_id = ? AND unavailable_date = ?',
            [manicuristId, date]
        );
        if (blocked.length > 0) {
            return res.json({ occupiedSlots: [], blocked: true });
        }

        const [bookings] = await pool.execute(
            `SELECT b.booking_time, s.duration 
             FROM bookings b 
             JOIN services s ON b.service_id = s.id 
             WHERE b.manicurist_id = ? AND b.booking_date = ? AND b.status != 'cancelled'`,
            [manicuristId, date]
        );

        const occupiedSlots = bookings.map(b => ({
            start: b.booking_time,
            duration: b.duration
        }));

        res.json({ occupiedSlots, blocked: false });
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
        const { manicurist_id, service_id, booking_date, booking_time } = req.body;

        // La reserva siempre es del usuario del token. Aceptar user_id del body
        // permitía a cualquier cliente crear citas en nombre de otra persona.
        const user_id = req.auth.userId;

        if (!manicurist_id || !service_id || !booking_date || !booking_time) {
            return res.status(400).json({ success: false, error: 'Faltan datos para completar la reserva' });
        }
        if (!/^\d{4}-\d{2}-\d{2}$/.test(booking_date)) {
            return res.status(400).json({ success: false, error: 'Formato de fecha inválido' });
        }
        if (!/^\d{2}:\d{2}(:\d{2})?$/.test(booking_time)) {
            return res.status(400).json({ success: false, error: 'Formato de hora inválido' });
        }

        const [manicurists] = await pool.execute(
            'SELECT id FROM manicurists WHERE id = ? AND available = TRUE',
            [manicurist_id]
        );
        if (manicurists.length === 0) {
            return res.status(400).json({ success: false, error: 'La especialista seleccionada no está disponible' });
        }

        const [services] = await pool.execute('SELECT id, duration FROM services WHERE id = ?', [service_id]);
        if (services.length === 0) {
            return res.status(400).json({ success: false, error: 'El servicio seleccionado no existe' });
        }
        const serviceDuration = services[0].duration;

        // Validar fecha no pasada
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        const bookDate = new Date(booking_date + 'T00:00:00');
        if (bookDate < today) {
            return res.status(400).json({ success: false, error: 'No puedes reservar en una fecha pasada.' });
        }

        // Verificar si el día está bloqueado por la manicurista
        const [blocked] = await pool.execute(
            'SELECT id FROM manicurist_unavailable_days WHERE manicurist_id = ? AND unavailable_date = ?',
            [manicurist_id, booking_date]
        );
        if (blocked.length > 0) {
            return res.status(400).json({ success: false, error: 'La manicurista no tiene disponibilidad este día.' });
        }

        // Validar conflicto de horario por intervalo real
        const [existing] = await pool.execute(
            `SELECT b.id FROM bookings b
             JOIN services s ON b.service_id = s.id
             WHERE b.manicurist_id = ?
               AND b.booking_date = ?
               AND b.status != 'cancelled'
               AND ?::time < (b.booking_time + (s.duration || ' minutes')::interval)
               AND (?::time + (?::int || ' minutes')::interval) > b.booking_time`,
            [manicurist_id, booking_date, booking_time, serviceDuration, booking_time, serviceDuration]
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
        console.error('Error creando reserva:', error.message);
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
            `SELECT b.id, b.booking_date, b.booking_time, b.manicurist_id, b.status, b.service_id, s.duration
             FROM bookings b
             JOIN services s ON b.service_id = s.id
             WHERE b.id = ? AND b.user_id = ?`,
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

        // Verificar si el día está bloqueado por la manicurista
        const [blocked] = await pool.execute(
            'SELECT id FROM manicurist_unavailable_days WHERE manicurist_id = ? AND unavailable_date = ?',
            [booking.manicurist_id, new_date]
        );
        if (blocked.length > 0) {
            return res.status(400).json({ success: false, error: 'La manicurista no tiene disponibilidad este día.' });
        }

        // Validación por intervalo real
        const serviceDuration = booking.duration || 60;
        const [conflicts] = await pool.execute(
            `SELECT b.id FROM bookings b
             JOIN services s ON b.service_id = s.id
             WHERE b.manicurist_id = ? 
               AND b.booking_date = ? 
               AND b.status NOT IN ('cancelled', 'no_show')
               AND b.id != ?
               AND ?::time < (b.booking_time + (s.duration || ' minutes')::interval)
               AND (?::time + (?::int || ' minutes')::interval) > b.booking_time`,
            [booking.manicurist_id, new_date, id, new_time, serviceDuration, new_time, serviceDuration]
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
