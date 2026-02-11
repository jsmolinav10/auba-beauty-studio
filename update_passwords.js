const mysql = require('mysql2/promise');

const dbConfig = {
    host: 'localhost',
    user: 'root',
    password: 'Notemascree12:)*',
    database: 'auba_studio'
};

async function updatePasswords() {
    let connection;
    try {
        connection = await mysql.createConnection(dbConfig);
        const newHash = '$2b$10$cnUUToZiuRn89EuKq2VMEea9FmphWty7gO9e7E1cA3exSb6AAiyfK'; // hash for 'auba2026'

        await connection.execute('UPDATE manicurists SET password = ?', [newHash]);
        console.log('✅ Passwords updated successfully.');

    } catch (error) {
        console.error('❌ Update failed:', error);
    } finally {
        if (connection) await connection.end();
    }
}

updatePasswords();
