/**
 * AUBA Beauty Studio - Rutas de Pagos
 * Nequi QR, ePayco, verificación de pagos
 */

const express = require('express');
const router = express.Router();
const { requireAuth } = require('./middleware');

const DEPOSIT_AMOUNT = 20000; // Abono fijo de $20.000

// ============================================
// NEQUI CONFIG
// ============================================

router.get('/nequi-config', (req, res) => {
    res.json({
        depositAmount: DEPOSIT_AMOUNT,
        qrImage: '/assets/nequi-qr.png',
        businessName: 'AUBA Beauty Studio',
        nequiNumber: process.env.NEQUI_NUMBER || ''
    });
});

// ============================================
// REGISTRAR PAGO
// ============================================

router.put('/bookings/:id/payment', requireAuth(['user']), (req, res, next) => {
    // uploadProof middleware is attached in server.js
    req.app.locals.uploadProof.single('proof')(req, res, next);
}, async (req, res) => {
    try {
        const pool = req.app.locals.pool;
        const { id } = req.params;
        const { payment_type, nequi_reference } = req.body;

        if (!['deposit', 'full'].includes(payment_type)) {
            return res.status(400).json({ success: false, error: 'Tipo de pago no válido' });
        }

        const [bookings] = await pool.execute(
            `SELECT b.id, b.user_id, s.price, s.title 
             FROM bookings b 
             JOIN services s ON b.service_id = s.id 
             WHERE b.id = ?`,
            [id]
        );

        if (bookings.length === 0) {
            return res.status(404).json({ success: false, error: 'Reserva no encontrada' });
        }

        const booking = bookings[0];

        if (booking.user_id !== req.auth.userId) {
            return res.status(403).json({ success: false, error: 'No tienes permiso para modificar esta reserva.' });
        }

        const paymentAmount = payment_type === 'deposit' ? DEPOSIT_AMOUNT : parseFloat(booking.price);
        const proofPath = req.file ? req.file.path : null;

        await pool.execute(
            `UPDATE bookings SET 
                payment_type = ?, 
                payment_amount = ?, 
                payment_status = ?,
                payment_proof = ?,
                nequi_reference = ?
             WHERE id = ?`,
            [payment_type, paymentAmount, proofPath ? 'pending_verification' : 'unpaid', proofPath, nequi_reference || null, id]
        );

        res.json({
            success: true,
            message: 'Pago registrado exitosamente',
            payment: {
                type: payment_type,
                amount: paymentAmount,
                status: 'pending_verification',
                proof: proofPath
            }
        });

    } catch (error) {
        console.error('Error registrando pago:', error);
        res.status(500).json({ success: false, error: 'Error del servidor' });
    }
});

// ============================================
// INFO DE PAGO
// ============================================

router.get('/bookings/:id/payment-info', requireAuth(['user', 'admin']), async (req, res) => {
    try {
        const pool = req.app.locals.pool;
        const { id } = req.params;

        const [bookingRows] = await pool.execute(
            'SELECT b.user_id FROM bookings b WHERE b.id = ?',
            [id]
        );

        if (bookingRows.length === 0) {
            return res.status(404).json({ success: false, error: 'Reserva no encontrada' });
        }

        const isOwner = bookingRows[0].user_id === req.auth.userId;
        if (!isOwner && req.auth.role !== 'admin') {
            return res.status(403).json({ success: false, error: 'No tienes permiso para ver esta reserva.' });
        }

        const [rows] = await pool.execute(
            `SELECT b.payment_type, b.payment_amount, b.payment_status,
                    b.payment_proof, b.final_payment_amount, b.final_payment_method,
                    s.price as service_price, s.title as service_title
             FROM bookings b
             JOIN services s ON b.service_id = s.id
             WHERE b.id = ?`,
            [id]
        );

        if (rows.length === 0) {
            return res.status(404).json({ success: false, error: 'Reserva no encontrada' });
        }

        const info = rows[0];
        const remaining = parseFloat(info.service_price) - parseFloat(info.payment_amount) - parseFloat(info.final_payment_amount);

        res.json({
            success: true,
            payment: {
                ...info,
                remaining_balance: Math.max(0, remaining),
                deposit_amount: DEPOSIT_AMOUNT
            }
        });

    } catch (error) {
        console.error('Error obteniendo info de pago:', error.message);
        res.status(500).json({ success: false, error: 'Error del servidor' });
    }
});

// ============================================
// EPAYCO
// ============================================

router.get('/config', (req, res) => {
    res.json({
        publicKey: process.env.EPAYCO_PUBLIC_KEY || '',
        testMode: process.env.EPAYCO_TEST_MODE === 'true'
    });
});

/**
 * Webhook de ePayco.
 *
 * ePayco no está integrado en el flujo real (la reserva se cobra por Nequi con
 * verificación manual), pero el endpoint quedaba expuesto: sin validar la firma
 * del servidor, cualquiera podía enviar x_cod_response=1 y marcar una reserva
 * como pagada. Pasa a quedar cerrado por defecto y solo se habilita si se define
 * EPAYCO_WEBHOOK_SECRET, que es el valor compartido que ePayco debe enviar.
 */
router.post('/confirm', async (req, res) => {
    const secret = process.env.EPAYCO_WEBHOOK_SECRET;
    if (!secret) {
        return res.status(503).json({
            success: false,
            error: 'Confirmación de pago deshabilitada. El cobro se realiza por Nequi.'
        });
    }
    if (req.get('x-epayco-secret') !== secret) {
        return res.status(401).json({ success: false, error: 'Firma de notificación inválida' });
    }

    try {
        const pool = req.app.locals.pool;
        const { x_ref_payco, x_id_invoice, x_amount, x_cod_response } = req.body;

        console.log('📥 Confirmación de pago ePayco:', {
            ref: x_ref_payco,
            invoice: x_id_invoice,
            amount: x_amount,
            status: x_cod_response
        });

        if (x_cod_response === '1' || x_cod_response === 1) {
            const bookingId = x_id_invoice?.replace('AUBA-', '');
            if (bookingId && !isNaN(bookingId)) {
                await pool.execute(
                    'UPDATE bookings SET payment_status = ? WHERE id = ?',
                    ['paid', bookingId]
                );
            }
        }

        res.json({ success: true });
    } catch (error) {
        console.error('Error en webhook de pagos:', error.message);
        res.status(500).json({ success: false, error: 'Error procesando confirmación' });
    }
});

// Verificación de transacción. Requiere sesión para no exponer el estado de pago
// de reservas ajenas por URL adivinable.
router.get('/verify/:refPayco', requireAuth(['user', 'admin']), async (req, res) => {
    try {
        const pool = req.app.locals.pool;
        const { refPayco } = req.params;

        const [bookings] = await pool.execute(
            'SELECT id, user_id, payment_status FROM bookings WHERE nequi_reference = ?',
            [refPayco]
        );

        if (bookings.length === 0) {
            return res.status(404).json({ success: false, error: 'Transacción no encontrada' });
        }

        const isOwner = bookings[0].user_id === req.auth.userId;
        if (!isOwner && req.auth.role !== 'admin') {
            return res.status(403).json({ success: false, error: 'No tienes permiso para ver esta transacción.' });
        }

        res.json({
            success: true,
            status: bookings[0].payment_status,
            bookingId: bookings[0].id
        });
    } catch (error) {
        console.error('Error verificando pago:', error.message);
        res.status(500).json({ success: false, error: 'Error verificando pago' });
    }
});

module.exports = router;
