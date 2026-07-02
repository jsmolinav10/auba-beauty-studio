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

router.get('/bookings/:id/payment-info', async (req, res) => {
    try {
        const pool = req.app.locals.pool;
        const { id } = req.params;
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
        console.error('Error obteniendo info de pago:', error);
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

router.post('/confirm', async (req, res) => {
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

router.get('/verify/:refPayco', async (req, res) => {
    try {
        const pool = req.app.locals.pool;
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

module.exports = router;
