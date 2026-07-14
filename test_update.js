require('dotenv').config();
const db = require('./db');

async function test() {
    try {
        const result = await db.execute(
            'UPDATE services SET title = ?, description = ?, price = ?, duration = ? WHERE id = ?',
            ['Retoque', 'Prueba', 75000, 60, 1]
        );
        console.log('Result:', result);
    } catch (err) {
        console.error('Error:', err);
    }
}
test();
