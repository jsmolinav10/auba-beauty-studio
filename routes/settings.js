/**
 * AUBA Beauty Studio - Rutas de Configuración
 * Pregunta de seguridad para portales de admin y manicuristas
 */

const express = require('express');
const router = express.Router();
const { requireAuth } = require('./middleware');

const DEFAULT_QUESTION = '¿Cuál es el nombre del estudio?';
const DEFAULT_ANSWER = 'auba';
const ADMIN_QUESTION = '¿Como ves?';
const ADMIN_ANSWER = 'solo con corazón';

/**
 * GET /api/settings/manicurist-question
 * Público. Devuelve la pregunta de seguridad para el portal de manicuristas.
 */
router.get('/settings/manicurist-question', async (req, res) => {
    try {
        const pool = req.app.locals.pool;
        const [rows] = await pool.execute(
            "SELECT setting_value FROM app_settings WHERE setting_key = 'manicurist_security_question'"
        );
        res.json({ question: rows[0]?.setting_value || DEFAULT_QUESTION });
    } catch (error) {
        console.error('Error obteniendo pregunta de seguridad:', error);
        res.status(500).json({ question: DEFAULT_QUESTION });
    }
});

/**
 * POST /api/settings/verify
 * Público. Verifica una respuesta de seguridad.
 * Body: { portal: 'admin' | 'manicurist', answer: string }
 */
router.post('/settings/verify', async (req, res) => {
    try {
        const { portal, answer } = req.body;

        if (!portal || !answer) {
            return res.status(400).json({ valid: false, error: 'Faltan datos' });
        }

        let expected;

        if (portal === 'admin') {
            expected = ADMIN_ANSWER;
        } else if (portal === 'manicurist') {
            const pool = req.app.locals.pool;
            const [rows] = await pool.execute(
                "SELECT setting_value FROM app_settings WHERE setting_key = 'manicurist_security_answer'"
            );
            expected = rows[0]?.setting_value || DEFAULT_ANSWER;
        } else {
            return res.status(400).json({ valid: false, error: 'Portal no válido' });
        }

        const isValid = answer.toLowerCase().trim() === expected.toLowerCase().trim();
        res.json({ valid: isValid });
    } catch (error) {
        console.error('Error verificando respuesta de seguridad:', error);
        res.status(500).json({ valid: false, error: 'Error del servidor' });
    }
});

/**
 * GET /api/admin/settings/security
 * Admin. Devuelve la configuración de seguridad actual.
 */
router.get('/admin/settings/security', requireAuth(['admin']), async (req, res) => {
    try {
        const pool = req.app.locals.pool;
        const [rows] = await pool.execute(
            "SELECT setting_key, setting_value FROM app_settings " +
            "WHERE setting_key IN ('manicurist_security_question', 'manicurist_security_answer')"
        );

        const settings = {};
        rows.forEach(r => { settings[r.setting_key] = r.setting_value; });

        res.json({
            manicurist_security_question: settings.manicurist_security_question || DEFAULT_QUESTION,
            manicurist_security_answer: settings.manicurist_security_answer || DEFAULT_ANSWER,
            admin_security_question: ADMIN_QUESTION,
            admin_security_answer: ADMIN_ANSWER
        });
    } catch (error) {
        console.error('Error obteniendo configuración de seguridad:', error);
        res.status(500).json({ error: 'Error del servidor' });
    }
});

/**
 * PUT /api/admin/settings/security
 * Admin. Actualiza la pregunta y respuesta de seguridad para manicuristas.
 * Body: { manicurist_security_question, manicurist_security_answer }
 */
router.put('/admin/settings/security', requireAuth(['admin']), async (req, res) => {
    try {
        const { manicurist_security_question, manicurist_security_answer } = req.body;
        const pool = req.app.locals.pool;

        if (manicurist_security_question !== undefined) {
            await pool.execute(
                "INSERT INTO app_settings (setting_key, setting_value) VALUES ('manicurist_security_question', ?) " +
                "ON CONFLICT (setting_key) DO UPDATE SET setting_value = EXCLUDED.setting_value",
                [manicurist_security_question]
            );
        }

        if (manicurist_security_answer !== undefined) {
            await pool.execute(
                "INSERT INTO app_settings (setting_key, setting_value) VALUES ('manicurist_security_answer', ?) " +
                "ON CONFLICT (setting_key) DO UPDATE SET setting_value = EXCLUDED.setting_value",
                [manicurist_security_answer]
            );
        }

        res.json({ success: true, message: 'Configuración actualizada correctamente' });
    } catch (error) {
        console.error('Error actualizando configuración de seguridad:', error);
        res.status(500).json({ success: false, error: 'Error del servidor' });
    }
});

module.exports = router;
