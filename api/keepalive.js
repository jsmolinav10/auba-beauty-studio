/**
 * Función programada de Vercel para mantener activa la base de datos.
 *
 * Supabase pausa los proyectos del plan Free tras una semana sin actividad y,
 * al pausarse, el host de la base de datos deja de resolver: el backend entero
 * responde 500 y el negocio se queda sin poder recibir reservas.
 *
 * Esta función ejecuta una consulta real contra la base de datos, que es
 * justamente lo que Supabase registra como actividad. Se programa en
 * vercel.json -> crons -> /api/keepalive.
 */

const db = require('../db');

module.exports = async (req, res) => {
    try {
        await db.execute('SELECT 1');
        console.log('[keepalive] Base de datos activa.');
        return res.status(200).json({ status: 'ok', database: 'connected' });
    } catch (error) {
        // Si esto falla, el proyecto está pausado o la URL es incorrecta.
        console.error('[keepalive] Base de datos inaccesible:', error.message);
        return res.status(503).json({ status: 'error', database: 'disconnected' });
    }
};
