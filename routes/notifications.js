/**
 * AUBA Beauty Studio - Rutas de Notificaciones
 * WhatsApp Business API: confirmaciones y recordatorios
 */

const express = require('express');
const router = express.Router();
const WhatsAppService = require('../services/whatsapp');
const { requireAuth } = require('./middleware');

/**
 * Estas rutas disparan envíos reales de WhatsApp a la lista de clientes.
 * Sin autenticación cualquiera podría usarlas como relay de spam o agotar
 * la cuota de la cuenta de WhatsApp Business, así que quedan restringidas
 * a administration. La función exportada sigue siendo invocable por el cron
 * interno de server.js, que no pasa por HTTP.
 */
const requireAdmin = requireAuth(['admin']);

// Verifica que la reserva pertenece al usuario autenticado
async function assertBookingOwnership(req, bookingId) {
    const pool = req.app.locals.pool;
    const [rows] = await pool.execute('SELECT user_id FROM bookings WHERE id = ?', [bookingId]);
    if (rows.length === 0) {
        return { error: { status: 404, message: 'Reserva no encontrada' } };
    }
    const isOwner = rows[0].user_id === req.auth.userId;
    const isAdmin = req.auth.role === 'admin';
    if (!isOwner && !isAdmin) {
        return { error: { status: 403, message: 'No tienes permiso para acceder a esta reserva.' } };
    }
    return { booking: rows[0] };
}

// Enviar confirmación de reserva por WhatsApp
router.post('/booking-confirmation', requireAuth(['user', 'admin']), async (req, res) => {
    try {
        const pool = req.app.locals.pool;
        const { bookingId } = req.body;

        if (!bookingId) {
            return res.status(400).json({ success: false, error: 'Falta bookingId' });
        }

        const ownership = await assertBookingOwnership(req, bookingId);
        if (ownership.error) {
            return res.status(ownership.error.status).json({ success: false, error: ownership.error.message });
        }

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
        console.error('Error enviando confirmación WhatsApp:', error.message);
        res.status(500).json({ success: false, error: 'Error enviando notificación' });
    }
});

// Disparo manual de recordatorios (solo administración).
// Los recordatorios diarios los ejecuta el cron interno de server.js.
router.post('/send-reminders', requireAdmin, async (req, res) => {
    try {
        const pool = req.app.locals.pool;
        const results = await sendDailyReminders(pool);
        res.json({ success: true, sent: results.length, results });
    } catch (error) {
        console.error('Error enviando recordatorios:', error.message);
        res.status(500).json({ success: false, error: 'Error enviando recordatorios' });
    }
});

// Función para enviar recordatorios diarios (exportada para cron)
async function sendDailyReminders(pool) {
    console.log('📱 Ejecutando envío de recordatorios...');

    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    const tomorrowStr = tomorrow.toISOString().split('T')[0];

    try {
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

module.exports = { router, sendDailyReminders };
