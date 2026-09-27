const { Pool } = require('pg');

// db.js se puede cargar de forma independiente (por ejemplo desde la función
// programada api/keepalive.js), donde server.js no ha pasado por dotenv. Cargar
// aquí evita que el Pool se construya con una URL de conexión vacía.
require('dotenv').config();

const pgPool = new Pool({
    connectionString: process.env.SUPABASE_DB_URL,
    ssl: { rejectUnauthorized: false }
});

const db = {
    async execute(sql, params = []) {
        // Replace all ? placeholders with $1, $2, $3...
        // This regex skips ? inside single-quoted strings
        let counter = 1;
        let inString = false;
        let pgSql = '';
        for (let i = 0; i < sql.length; i++) {
            const char = sql[i];
            if (char === "'" && (i === 0 || sql[i-1] !== '\\')) {
                inString = !inString;
                pgSql += char;
            } else if (char === '?' && !inString) {
                pgSql += `$${counter++}`;
            } else {
                pgSql += char;
            }
        }
        
        let finalSql = pgSql;
        
        // Postgres needs RETURNING id for INSERT queries to get the inserted id
        if (pgSql.trim().toUpperCase().startsWith('INSERT') && !pgSql.toUpperCase().includes('RETURNING ID')) {
            finalSql = pgSql + ' RETURNING id';
        }

        try {
            const result = await pgPool.query(finalSql, params);
            
            // Format to match mysql2 response: [rows, fields]
            // Or for INSERT/UPDATE/DELETE: [{ insertId, affectedRows }, fields]
            
            if (['INSERT', 'UPDATE', 'DELETE'].includes(result.command)) {
                const insertId = (result.rows && result.rows.length > 0 && result.rows[0].id) ? result.rows[0].id : null;
                return [{
                    insertId: insertId,
                    affectedRows: result.rowCount
                }, null];
            }
            
            // Format booleans back to 1/0 for MySQL compatibility in frontend if needed
            // But frontend handles true/false fine if we are careful, let's just return rows
            const rows = result.rows.map(row => {
                const newRow = { ...row };
                // Convert booleans back to 1 or 0 just in case frontend relies on it
                for (const key in newRow) {
                    if (typeof newRow[key] === 'boolean') {
                        newRow[key] = newRow[key] ? 1 : 0;
                    }
                }
                return newRow;
            });
            
            return [rows, result.fields];
        } catch (err) {
            // No se registran los parámetros: las consultas de este proyecto
            // llevan teléfonos y correos de clientas, y los logs de Vercel son
            // de acceso amplio. El SQL sí es útil para diagnosticar.
            console.error('Database Error in query:', finalSql);
            console.error('Database Error:', err.message);
            throw err;
        }
    },

    async query(sql, params) {
        return this.execute(sql, params);
    }
};

module.exports = db;
