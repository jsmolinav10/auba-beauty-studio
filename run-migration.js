/**
 * Run database migration for password recovery feature
 * Execute with: node run-migration.js
 */

require('dotenv').config();
const mysql = require('mysql2/promise');

async function addColumnIfNotExists(pool, table, column, type) {
    try {
        await pool.execute(`ALTER TABLE ${table} ADD COLUMN ${column} ${type}`);
        console.log(`✅ Added ${column} column`);
    } catch (error) {
        if (error.code === 'ER_DUP_FIELDNAME') {
            console.log(`⚠️ Column ${column} already exists, skipping...`);
        } else {
            throw error;
        }
    }
}

async function runMigration() {
    const pool = mysql.createPool({
        host: process.env.DB_HOST || 'localhost',
        user: process.env.DB_USER || 'root',
        password: process.env.DB_PASSWORD,
        database: process.env.DB_NAME || 'auba_studio'
    });

    console.log('🔄 Running migrations...');

    try {
        // Add password reset columns
        await addColumnIfNotExists(pool, 'users', 'password_reset_token', 'VARCHAR(255) NULL');
        await addColumnIfNotExists(pool, 'users', 'token_expiry', 'DATETIME NULL');

        // Add data consent columns
        await addColumnIfNotExists(pool, 'users', 'data_consent', 'BOOLEAN DEFAULT FALSE');
        await addColumnIfNotExists(pool, 'users', 'consent_date', 'DATETIME NULL');

        console.log('🎉 All migrations completed successfully!');
    } catch (error) {
        console.error('❌ Migration error:', error.message);
    } finally {
        await pool.end();
    }
}

runMigration();
