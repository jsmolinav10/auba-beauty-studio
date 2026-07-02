/**
 * AUBA Beauty Studio - Rutas de Notificaciones
 * WhatsApp Business API: confirmaciones y recordatorios
 */

const express = require('express');
const router = express.Router();
const WhatsAppService = require('../services/whatsapp');

// Enviar confirmación de reserva por WhatsApp
router.post('/booking-confirmation', async (req, res) => {
    try {
        const pool = req.app.locals.pool;
        const { bookingId } = req.body;

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
router.post('/send-reminders', async (req, res) => {
    try {
        const pool = req.app.locals.pool;
        const results = await sendDailyReminders(pool);
        res.json({ success: true, sent: results.length, results });
    } catch (error) {
        console.error('Error enviando recordatorios:', error);
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
