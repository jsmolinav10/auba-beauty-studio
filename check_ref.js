require('dotenv').config();
const mysql = require('mysql2/promise');

(async () => {
    const pool = mysql.createPool({
        host: process.env.DB_HOST,
        user: process.env.DB_USER,
        password: process.env.DB_PASSWORD,
        database: process.env.DB_NAME
    });

    const [rows] = await pool.execute(
        'SELECT id, nequi_reference, payment_type, payment_status FROM bookings WHERE payment_type IS NOT NULL'
    );
    console.log('Bookings con pago:');
    console.log(JSON.stringify(rows, null, 2));

    pool.end();
})();
