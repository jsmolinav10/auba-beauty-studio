require('dotenv').config();
const mysql = require('mysql2/promise');
const fs = require('fs');

async function extractSchema() {
    try {
        const pool = mysql.createPool({
            host: process.env.DB_HOST || 'localhost',
            user: process.env.DB_USER || 'root',
            password: process.env.DB_PASSWORD,
            database: process.env.DB_NAME || 'auba_studio'
        });

        const [tables] = await pool.query('SHOW TABLES');
        const dbName = process.env.DB_NAME || 'auba_studio';
        const tableKey = `Tables_in_${dbName}`;
        
        let schema = {};

        for (const row of tables) {
            const tableName = row[tableKey] || Object.values(row)[0];
            const [columns] = await pool.query(`SHOW COLUMNS FROM ${tableName}`);
            schema[tableName] = columns;
        }

        fs.writeFileSync('schema.json', JSON.stringify(schema, null, 2));
        console.log('Schema extraído en schema.json');
        process.exit(0);
    } catch (err) {
        console.error(err);
        process.exit(1);
    }
}

extractSchema();
