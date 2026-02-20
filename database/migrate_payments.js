// Migration script - Add payment columns to bookings table
require('dotenv').config();
const mysql = require('mysql2/promise');

async function migrate() {
    const connection = await mysql.createConnection({
        host: process.env.DB_HOST,
        user: process.env.DB_USER,
        password: process.env.DB_PASSWORD,
        database: process.env.DB_NAME
    });

    const columns = [
        ["payment_type", "ENUM('none','deposit','full') DEFAULT 'none'"],
        ["payment_amount", "DECIMAL(10,2) DEFAULT 0"],
        ["payment_status", "ENUM('unpaid','pending_verification','verified','completed') DEFAULT 'unpaid'"],
        ["payment_proof", "VARCHAR(255) DEFAULT NULL"],
        ["final_payment_amount", "DECIMAL(10,2) DEFAULT 0"],
        ["final_payment_method", "VARCHAR(50) DEFAULT NULL"]
    ];

    for (const [name, definition] of columns) {
        try {
            await connection.execute(`ALTER TABLE bookings ADD COLUMN ${name} ${definition}`);
            console.log('✅ Added:', name);
        } catch (e) {
            if (e.code === 'ER_DUP_FIELDNAME') {
                console.log('⏭️  Exists:', name);
            } else {
                throw e;
            }
        }
    }

    console.log('\n🎉 Migration completed!');
    await connection.end();
    process.exit(0);
}

migrate().catch(e => {
    console.error('❌ Migration failed:', e.message);
    process.exit(1);
});
