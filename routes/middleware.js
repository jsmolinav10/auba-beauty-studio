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

module.exports = { generateToken, requireAuth };
