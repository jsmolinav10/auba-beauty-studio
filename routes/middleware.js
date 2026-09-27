/**
 * AUBA Beauty Studio - Middleware de Autenticación JWT
 */

const jwt = require('jsonwebtoken');

const JWT_SECRET = process.env.JWT_SECRET;
const JWT_EXPIRES_IN = '24h';

function generateToken(userId, role) {
    return jwt.sign({ userId, role }, JWT_SECRET, { expiresIn: JWT_EXPIRES_IN });
}

function requireAuth(allowedRoles = []) {
    return (req, res, next) => {
        const authHeader = req.headers.authorization;
        if (!authHeader || !authHeader.startsWith('Bearer ')) {
            return res.status(401).json({ success: false, error: 'No autorizado. Inicia sesión.' });
        }
        const token = authHeader.split(' ')[1];
        try {
            const decoded = jwt.verify(token, JWT_SECRET);
            if (allowedRoles.length > 0 && !allowedRoles.includes(decoded.role)) {
                return res.status(403).json({ success: false, error: 'No tienes permisos para esta acción.' });
            }
            req.auth = { userId: decoded.userId, role: decoded.role };
            next();
        } catch (err) {
            return res.status(401).json({ success: false, error: 'Sesión expirada. Inicia sesión de nuevo.' });
        }
    };
}

/**
 * Exige que el recurso solicitado pertenezca al usuario autenticado.
 *
 * requireAuth solo comprueba el ROL, así que sin esta comprobación una manicurista
 * autenticada podía leer y modificar la agenda, los teléfonos y los comprobantes
 * de pago de cualquier otra manicurista simplemente cambiando el :id de la URL.
 * Sólo para rutas cuyo parámetro de recurso es la manicurista (:id o :manicuristId).
 */
function requireSelfOrAdmin(req, res, next) {
    if (req.auth.role === 'admin') return next();

    const resourceId = req.params.id ?? req.params.manicuristId;
    if (resourceId === undefined) {
        return res.status(400).json({ success: false, error: 'Recurso no especificado' });
    }

    if (Number(resourceId) !== Number(req.auth.userId)) {
        return res.status(403).json({
            success: false,
            error: 'No tienes permiso para acceder a los recursos de otra manicurista.'
        });
    }
    return next();
}

module.exports = { generateToken, requireAuth, requireSelfOrAdmin };
