const mysql = require('mysql2/promise');

const dbConfig = {
    host: 'localhost',
    user: 'root',
    password: 'Notemascree12:)*',
    database: 'auba_studio'
};

async function checkUsers() {
    let connection;
    try {
        connection = await mysql.createConnection(dbConfig);
        const [rows] = await connection.execute("SELECT * FROM users WHERE name != 'Test User' ORDER BY id DESC");
        if (rows.length === 0) console.log("Only 'Test User' found.");
        else console.table(rows);
    } catch (error) {
        console.error(error);
    } finally {
        if (connection) await connection.end();
    }
}

checkUsers();
