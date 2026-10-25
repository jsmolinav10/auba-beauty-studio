/**
 * AUBA Beauty Studio - Rutas de Manicuristas
 * Portal de manicuristas: agenda, gestión de citas, búsqueda de clientas
 */

const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const { requireAuth, requireSelfOrAdmin } = require('./middleware');

// Proteger todas las rutas de manicuristas
router.use(requireAuth(['manicurist', 'admin']));

// Cada ruta opera sobre la manicurista indicada en la URL. Sin requireSelfOrAdmin
// una manicurista autenticada podía cambiar el :id y operar sobre la agenda, los
// datos personales y las credenciales de cualquier otra.

// ============================================
// AGENDA DE CITAS
// ============================================

router.get('/:id/bookings', requireSelfOrAdmin, async (req, res) => {
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
                s.price as service_price,
                s.duration as service_duration
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

router.put('/:manicuristId/bookings/:bookingId/status', requireSelfOrAdmin, async (req, res) => {
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

router.put('/:manicuristId/bookings/:bookingId/verify-payment', requireSelfOrAdmin, async (req, res) => {
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

router.put('/:manicuristId/bookings/:bookingId/complete-service', requireSelfOrAdmin, async (req, res) => {
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

router.get('/:id/search-clients', requireSelfOrAdmin, async (req, res) => {
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
// REGISTRAR CLIENTA EXPRESS (por manicurista)
// ============================================

router.post('/:id/clients', requireSelfOrAdmin, async (req, res) => {
    try {
        const pool = req.app.locals.pool;
        const { name, phone } = req.body;

        if (!name || name.trim().length < 3) {
            return res.status(400).json({ success: false, error: 'El nombre debe tener al menos 3 caracteres' });
        }

        const cleanPhone = phone ? phone.replace(/\s/g, '') : '';
        if (!cleanPhone || !/^\d{10}$/.test(cleanPhone)) {
            return res.status(400).json({ success: false, error: 'El número de celular debe tener 10 dígitos' });
        }

        const [existing] = await pool.execute(
            'SELECT id, name, phone FROM users WHERE phone = ?',
            [cleanPhone]
        );

        if (existing.length > 0) {
            return res.json({
                success: true,
                client: existing[0],
                existing: true,
                message: 'La clienta ya estaba registrada y fue seleccionada'
            });
        }

        const defaultPassword = 'auba2026';
        const hashedPassword = await bcrypt.hash(defaultPassword, 10);

        const [result] = await pool.execute(
            'INSERT INTO users (name, phone, password, data_consent, consent_date) VALUES (?, ?, ?, TRUE, NOW())',
            [name.trim(), cleanPhone, hashedPassword]
        );

        res.json({
            success: true,
            client: {
                id: result.insertId,
                name: name.trim(),
                phone: cleanPhone
            },
            isNew: true,
            message: 'Clienta registrada exitosamente'
        });

    } catch (error) {
        console.error('Error registrando clienta express:', error);
        res.status(500).json({ success: false, error: 'Error del servidor' });
    }
});

// ============================================
// HORARIOS DISPONIBLES
// ============================================

router.get('/:id/available-times', requireSelfOrAdmin, async (req, res) => {
    try {
        const pool = req.app.locals.pool;
        const { id } = req.params;
        const { date } = req.query;

        if (!date) {
            return res.status(400).json({ success: false, error: 'Fecha requerida' });
        }

        // Verificar si el día está bloqueado
        const [blocked] = await pool.execute(
            'SELECT id FROM manicurist_unavailable_days WHERE manicurist_id = ? AND unavailable_date = ?',
            [id, date]
        );
        if (blocked.length > 0) {
            return res.json({ success: true, times: [], blocked: true });
        }

        const [existing] = await pool.execute(
            `SELECT b.booking_time, s.duration 
             FROM bookings b 
             JOIN services s ON b.service_id = s.id
             WHERE b.manicurist_id = ? AND b.booking_date = ? AND b.status != 'cancelled'`,
            [id, date]
        );

        const allSlots = [];
        for (let h = 9; h <= 18; h++) {
            allSlots.push(`${h.toString().padStart(2, '0')}:00`);
            if (h < 18) {
                allSlots.push(`${h.toString().padStart(2, '0')}:30`);
            }
        }

        const toMinutes = (timeStr) => {
            const [h, m] = timeStr.split(':').map(Number);
            return h * 60 + m;
        };

        const available = allSlots.filter(slot => {
            const slotStart = toMinutes(slot);
            // No permitir slots que terminen después de 18:00 con duración desconocida; usar duración mínima 30? pero mejor filtrar solo por solapes
            // Verificar solapes con citas existentes
            const isOverlapping = existing.some(b => {
                const bookedStart = toMinutes(b.booking_time.substring(0, 5));
                const bookedEnd = bookedStart + (b.duration || 60);
                const slotEnd = slotStart + 60; // asumimos slot base 60 para filtrado, pero validación real será con duración del servicio
                return slotStart < bookedEnd && slotEnd > bookedStart;
            });
            if (isOverlapping) return false;
            // No permitir si empieza después de las 18:00? rango hasta 18:00
            if (slotStart >= 18 * 60) return false;
            return true;
        });

        res.json({ success: true, times: available, blocked: false });
    } catch (error) {
        console.error('Error obteniendo horarios:', error);
        res.status(500).json({ success: false, error: 'Error del servidor' });
    }
});

// ============================================
// CREAR RESERVA PARA CLIENTA
// ============================================

router.post('/:id/bookings', requireSelfOrAdmin, async (req, res) => {
    try {
        const pool = req.app.locals.pool;
        const { id } = req.params;
        let { client_id, client_name, client_phone, service_id, booking_date, booking_time } = req.body;

        if ((!client_id && (!client_name || !client_phone)) || !service_id || !booking_date || !booking_time) {
            return res.status(400).json({ success: false, error: 'Todos los campos son requeridos' });
        }

        // Si no se proporcionó client_id pero sí datos de clienta, buscar o crear express
        if (!client_id && client_phone) {
            const cleanPhone = client_phone.replace(/\s/g, '');
            if (!/^\d{10}$/.test(cleanPhone)) {
                return res.status(400).json({ success: false, error: 'El número de celular debe tener 10 dígitos' });
            }
            if (!client_name || client_name.trim().length < 3) {
                return res.status(400).json({ success: false, error: 'El nombre debe tener al menos 3 caracteres' });
            }

            const [existing] = await pool.execute('SELECT id, name FROM users WHERE phone = ?', [cleanPhone]);
            if (existing.length > 0) {
                client_id = existing[0].id;
            } else {
                const defaultPassword = 'auba2026';
                const hashedPassword = await bcrypt.hash(defaultPassword, 10);
                const [newUser] = await pool.execute(
                    'INSERT INTO users (name, phone, password, data_consent, consent_date) VALUES (?, ?, ?, TRUE, NOW())',
                    [client_name.trim(), cleanPhone, hashedPassword]
                );
                client_id = newUser.insertId;
            }
        }

        const [clients] = await pool.execute('SELECT id, name FROM users WHERE id = ?', [client_id]);
        if (clients.length === 0) {
            return res.status(404).json({ success: false, error: 'Clienta no registrada' });
        }

        const [services] = await pool.execute('SELECT id, duration FROM services WHERE id = ?', [service_id]);
        if (services.length === 0) {
            return res.status(400).json({ success: false, error: 'El servicio seleccionado no existe' });
        }
        const serviceDuration = services[0].duration;

        const today = new Date();
        today.setHours(0, 0, 0, 0);
        const bookDate = new Date(booking_date + 'T00:00:00');
        if (bookDate < today) {
            return res.status(400).json({ success: false, error: 'No se puede agendar en fecha pasada' });
        }

        // Verificar si el día está bloqueado
        const [blocked] = await pool.execute(
            'SELECT id FROM manicurist_unavailable_days WHERE manicurist_id = ? AND unavailable_date = ?',
            [id, booking_date]
        );
        if (blocked.length > 0) {
            return res.status(400).json({ success: false, error: 'La manicurista no tiene disponibilidad este día.' });
        }

        const [existing] = await pool.execute(
            `SELECT b.id FROM bookings b
             JOIN services s ON b.service_id = s.id
             WHERE b.manicurist_id = ? AND b.booking_date = ? AND b.status != 'cancelled'
               AND ?::time < (b.booking_time + (s.duration || ' minutes')::interval)
               AND (?::time + (?::int || ' minutes')::interval) > b.booking_time`,
            [id, booking_date, booking_time, serviceDuration, booking_time, serviceDuration]
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

// ============================================
// DÍAS BLOQUEADOS (DESCANSO)
// ============================================

router.get('/:id/unavailable-days', requireSelfOrAdmin, async (req, res) => {
    try {
        const pool = req.app.locals.pool;
        const { id } = req.params;
        const { from, to } = req.query;

        let query = 'SELECT id, manicurist_id, unavailable_date, reason, created_at, created_by FROM manicurist_unavailable_days WHERE manicurist_id = ?';
        const params = [id];

        if (from) {
            query += ' AND unavailable_date >= ?';
            params.push(from);
        }
        if (to) {
            query += ' AND unavailable_date <= ?';
            params.push(to);
        }

        query += ' ORDER BY unavailable_date ASC';

        const [rows] = await pool.execute(query, params);
        res.json({ success: true, days: rows });
    } catch (error) {
        console.error('Error obteniendo días bloqueados:', error);
        res.status(500).json({ success: false, error: 'Error del servidor' });
    }
});

router.post('/:id/unavailable-days', requireSelfOrAdmin, async (req, res) => {
    try {
        const pool = req.app.locals.pool;
        const { id } = req.params;
        const { date, reason } = req.body;

        if (!date) {
            return res.status(400).json({ success: false, error: 'Fecha requerida' });
        }

        // Verificar que no haya citas activas ese día
        const [bookings] = await pool.execute(
            `SELECT id FROM bookings WHERE manicurist_id = ? AND booking_date = ? AND status != 'cancelled' LIMIT 1`,
            [id, date]
        );
        if (bookings.length > 0) {
            return res.status(400).json({ success: false, error: 'No se puede bloquear un día con citas activas. Cancélalas o reagéndalas primero.' });
        }

        try {
            await pool.execute(
                'INSERT INTO manicurist_unavailable_days (manicurist_id, unavailable_date, reason, created_by) VALUES (?, ?, ?, ?)',
                [id, date, reason || null, req.auth.role === 'admin' ? 'admin' : 'manicurist']
            );
        } catch (e) {
            if (e.code === 'ER_DUP_ENTRY' || e.errno === 1062) {
                return res.status(400).json({ success: false, error: 'Este día ya está bloqueado' });
            }
            throw e;
        }

        res.json({ success: true, message: 'Día bloqueado correctamente' });
    } catch (error) {
        console.error('Error bloqueando día:', error);
        res.status(500).json({ success: false, error: 'Error del servidor' });
    }
});

router.delete('/:id/unavailable-days/:date', requireSelfOrAdmin, async (req, res) => {
    try {
        const pool = req.app.locals.pool;
        const { id, date } = req.params;

        await pool.execute(
            'DELETE FROM manicurist_unavailable_days WHERE manicurist_id = ? AND unavailable_date = ?',
            [id, date]
        );

        res.json({ success: true, message: 'Día desbloqueado correctamente' });
    } catch (error) {
        console.error('Error desbloqueando día:', error);
        res.status(500).json({ success: false, error: 'Error del servidor' });
    }
});

module.exports = router;
