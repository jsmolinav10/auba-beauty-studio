const mysql = require('mysql2/promise');

const dbConfig = {
    host: 'localhost',
    user: 'root',
    password: 'Notemascree12:)*',
    database: 'auba_studio'
};

async function checkBookings() {
    let connection;
    try {
        connection = await mysql.createConnection(dbConfig);
        console.log('✅ Connected to DB.');

        const [rows] = await connection.execute(`
            SELECT 
                b.id, 
                u.name as User, 
                m.name as Manicurist, 
                b.booking_date, 
                b.booking_time 
            FROM bookings b
            JOIN users u ON b.user_id = u.id
            JOIN manicurists m ON b.manicurist_id = m.id
            WHERE u.name != 'Test User'
            ORDER BY b.id DESC 
        `);

        if (rows.length === 0) {
            console.log('⚠️ No REAL USER bookings found.');
        } else {
            console.log('📋 Real User Bookings:');
            console.table(rows);
        }

    } catch (error) {
        console.error('❌ Error reading DB:', error);
    } finally {
        if (connection) await connection.end();
    }
}

checkBookings();
