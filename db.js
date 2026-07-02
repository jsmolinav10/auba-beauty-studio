const { Pool } = require('pg');

const pgPool = new Pool({
    connectionString: process.env.SUPABASE_DB_URL,
    ssl: { rejectUnauthorized: false }
});

const db = {
    async execute(sql, params = []) {
        // Replace all ? with $1, $2, $3...
        let counter = 1;
        // The regex replaces ? not inside quotes, but simple replace works for our queries
        const pgSql = sql.replace(/\?/g, () => `$${counter++}`);
        
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
            console.error('Database Error in query:', finalSql);
            console.error('Params:', params);
            throw err;
        }
    },

    async query(sql, params) {
        return this.execute(sql, params);
    }
};

module.exports = db;
