const fs = require('fs');
const path = require('path');
const mysql = require('mysql2/promise');

const dbConfig = {
    host: 'localhost',
    user: 'root',
    password: 'Notemascree12:)*',
    database: 'auba_studio',
    multipleStatements: true // Enable multiple statements query
};

async function runMigration() {
    let connection;
    try {
        console.log('🔌 Connecting to database...');
        connection = await mysql.createConnection(dbConfig);
        console.log('✅ Connected.');

        const sqlPath = path.join(__dirname, 'migration_001.sql');
        const sql = fs.readFileSync(sqlPath, 'utf8');

        console.log('📜 Executing migration script...');
        await connection.query(sql);

        console.log('✅ Migration completed successfully!');

    } catch (error) {
        console.error('❌ Migration failed:', error);
        process.exit(1);
    } finally {
        if (connection) await connection.end();
    }
}

runMigration();
