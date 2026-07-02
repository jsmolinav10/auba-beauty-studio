/**
 * AUBA Beauty Studio - Rutas de Manicuristas
 * Portal de manicuristas: agenda, gestión de citas, búsqueda de clientas
 */

const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const { requireAuth } = require('./middleware');

// Proteger todas las rutas de manicuristas
router.use(requireAuth(['manicurist', 'admin']));

// ============================================
// AGENDA DE CITAS
// ============================================

router.get('/:id/bookings', async (req, res) => {
    try {
        const pool = req.app.locals.pool;
        const { id } = req.params;
        const { date, status } = req.query;

        let query = `
            SELECT 
                b.id,
                b.booking_date,
                b.booking_time,
                b.status,
                b.payment_type,
                b.payment_amount,
                b.payment_status,
                b.payment_proof,
                b.final_payment_amount,
                b.final_payment_method,
                b.nequi_reference,
                u.name as client_name,
                u.phone as client_phone,
                s.title as service_title,
                s.price as service_price
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

// ============================================
// ACTUALIZAR ESTADO DE CITA
// ============================================

router.put('/:manicuristId/bookings/:bookingId/status', async (req, res) => {
    try {
        const pool = req.app.locals.pool;
        const { manicuristId, bookingId } = req.params;
        const { status } = req.body;

        const allowedStatuses = ['pending', 'confirmed', 'in_progress', 'completed', 'cancelled', 'no_show'];
        if (!allowedStatuses.includes(status)) {
            return res.status(400).json({ success: false, error: 'Estado no válido' });
        }

        const [bookings] = await pool.execute(
            'SELECT id FROM bookings WHERE id = ? AND manicurist_id = ?',
            [bookingId, manicuristId]
        );

        if (bookings.length === 0) {
            return res.status(404).json({ success: false, error: 'Cita no encontrada' });
        }

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
// VERIFICAR PAGO
// ============================================

router.put('/:manicuristId/bookings/:bookingId/verify-payment', async (req, res) => {
    try {
        const pool = req.app.locals.pool;
        const { manicuristId, bookingId } = req.params;

        const [bookings] = await pool.execute(
            'SELECT id, payment_status FROM bookings WHERE id = ? AND manicurist_id = ?',
            [bookingId, manicuristId]
        );

        if (bookings.length === 0) {
            return res.status(404).json({ success: false, error: 'Cita no encontrada' });
        }

        if (bookings[0].payment_status !== 'pending_verification') {
            return res.status(400).json({ success: false, error: 'El pago no está pendiente de verificación' });
        }

        await pool.execute(
            'UPDATE bookings SET payment_status = ? WHERE id = ?',
            ['verified', bookingId]
        );

        res.json({ success: true, message: 'Pago verificado correctamente' });

    } catch (error) {
        console.error('Error verificando pago:', error);
        res.status(500).json({ success: false, error: 'Error del servidor' });
    }
});

// ============================================
// COMPLETAR SERVICIO
// ============================================

router.put('/:manicuristId/bookings/:bookingId/complete-service', async (req, res) => {
    try {
        const pool = req.app.locals.pool;
        const { manicuristId, bookingId } = req.params;
        const { final_payment_amount, final_payment_method } = req.body;

        const [bookings] = await pool.execute(
            `SELECT b.id, b.payment_type, b.payment_amount, s.price 
             FROM bookings b 
             JOIN services s ON b.service_id = s.id
             WHERE b.id = ? AND b.manicurist_id = ?`,
            [bookingId, manicuristId]
        );

        if (bookings.length === 0) {
            return res.status(404).json({ success: false, error: 'Cita no encontrada' });
        }

        await pool.execute(
            `UPDATE bookings SET 
                status = 'completed',
                payment_status = 'completed',
                final_payment_amount = ?,
                final_payment_method = ?
             WHERE id = ?`,
            [final_payment_amount || 0, final_payment_method || 'efectivo', bookingId]
        );

        res.json({ success: true, message: 'Servicio completado y pago registrado' });

    } catch (error) {
        console.error('Error completando servicio:', error);
        res.status(500).json({ success: false, error: 'Error del servidor' });
    }
});

// ============================================
// BUSCAR CLIENTAS
// ============================================

router.get('/:id/search-clients', async (req, res) => {
    try {
        const pool = req.app.locals.pool;
        const { q } = req.query;
        if (!q || q.length < 2) {
            return res.json({ success: true, clients: [] });
        }

        const searchTerm = `%${q}%`;
        const [rows] = await pool.execute(
            `SELECT id, name, phone FROM users 
             WHERE (name ILIKE ? OR phone ILIKE ?) 
             ORDER BY name ASC LIMIT 10`,
            [searchTerm, searchTerm]
        );

        res.json({ success: true, clients: rows });
    } catch (error) {
        console.error('Error buscando clientas:', error);
        res.status(500).json({ success: false, error: 'Error del servidor' });
    }
});

// ============================================
// HORARIOS DISPONIBLES
// ============================================

router.get('/:id/available-times', async (req, res) => {
    try {
        const pool = req.app.locals.pool;
        const { id } = req.params;
        const { date } = req.query;

        if (!date) {
            return res.status(400).json({ success: false, error: 'Fecha requerida' });
        }

        const [existing] = await pool.execute(
            `SELECT booking_time FROM bookings 
             WHERE manicurist_id = ? AND booking_date = ? AND status != 'cancelled'`,
            [id, date]
        );

        const bookedTimes = existing.map(b => b.booking_time.substring(0, 5));

        const allSlots = [];
        for (let h = 9; h <= 18; h++) {
            const time = `${h.toString().padStart(2, '0')}:00`;
            allSlots.push(time);
        }

        const available = allSlots.filter(slot => {
            const slotHour = parseInt(slot.split(':')[0]);
            return !bookedTimes.some(bt => {
                const bookedHour = parseInt(bt.split(':')[0]);
                return Math.abs(slotHour - bookedHour) < 2;
            });
        });

        res.json({ success: true, times: available });
    } catch (error) {
        console.error('Error obteniendo horarios:', error);
        res.status(500).json({ success: false, error: 'Error del servidor' });
    }
});

// ============================================
// CREAR RESERVA PARA CLIENTA
// ============================================

router.post('/:id/bookings', async (req, res) => {
    try {
        const pool = req.app.locals.pool;
        const { id } = req.params;
        const { client_id, service_id, booking_date, booking_time } = req.body;

        if (!client_id || !service_id || !booking_date || !booking_time) {
            return res.status(400).json({ success: false, error: 'Todos los campos son requeridos' });
        }

        const [clients] = await pool.execute('SELECT id, name FROM users WHERE id = ?', [client_id]);
        if (clients.length === 0) {
            return res.status(404).json({ success: false, error: 'Clienta no registrada' });
        }

        const today = new Date();
        today.setHours(0, 0, 0, 0);
        const bookDate = new Date(booking_date + 'T00:00:00');
        if (bookDate < today) {
            return res.status(400).json({ success: false, error: 'No se puede agendar en fecha pasada' });
        }

        const [existing] = await pool.execute(
            `SELECT id FROM bookings 
             WHERE manicurist_id = ? AND booking_date = ? AND status != 'cancelled'
             AND ABS(EXTRACT(EPOCH FROM (booking_time - ?::TIME)) / 3600) < 2`,
            [id, booking_date, booking_time]
        );

        if (existing.length > 0) {
            return res.status(400).json({ success: false, error: 'Ese horario ya está ocupado' });
        }

        const [result] = await pool.execute(
            `INSERT INTO bookings (user_id, manicurist_id, service_id, booking_date, booking_time, status, payment_type, payment_status) 
             VALUES (?, ?, ?, ?, ?, 'confirmed', 'none', 'unpaid')`,
            [client_id, id, service_id, booking_date, booking_time]
        );

        res.json({
            success: true,
            booking_id: result.insertId,
            message: `Cita agendada para ${clients[0].name}`
        });

    } catch (error) {
        console.error('Error creando reserva desde manicurista:', error);
        res.status(500).json({ success: false, error: 'Error del servidor' });
    }
});

// ============================================
// CAMBIAR CONTRASEÑA
// ============================================

router.put('/:id/change-password', async (req, res) => {
    try {
        const pool = req.app.locals.pool;
        const { id } = req.params;
        const { newPassword } = req.body;

        if (!newPassword || newPassword.length < 4) {
            return res.status(400).json({ success: false, error: 'La contraseña debe tener al menos 4 caracteres' });
        }

        const hashedPassword = await bcrypt.hash(newPassword, 10);
        
        await pool.execute(
            'UPDATE manicurists SET password = ? WHERE id = ?',
            [hashedPassword, id]
        );
        
        res.json({ success: true, message: 'Contraseña actualizada correctamente' });
    } catch (error) {
        console.error('Error cambiando contraseña de manicurista:', error);
        res.status(500).json({ success: false, error: 'Error del servidor' });
    }
});

module.exports = router;
