require('dotenv').config();
const mysql = require('mysql2/promise');
const { Client } = require('pg');

async function migrate() {
    console.log('Iniciando migración de MySQL a Supabase PostgreSQL...');

    if (!process.env.SUPABASE_DB_URL) {
        console.error('Falta la variable SUPABASE_DB_URL en el archivo .env');
        process.exit(1);
    }

    const mysqlPool = mysql.createPool({
        host: process.env.DB_HOST || 'localhost',
        user: process.env.DB_USER || 'root',
        password: process.env.DB_PASSWORD,
        database: process.env.DB_NAME || 'auba_studio'
    });

    const pgClient = new Client({
        connectionString: process.env.SUPABASE_DB_URL,
        ssl: { rejectUnauthorized: false }
    });

    try {
        await pgClient.connect();
        console.log('✅ Conectado a Supabase PostgreSQL');

        // 1. Create Tables
        console.log('Creando tablas en PostgreSQL...');
        await pgClient.query(`
            CREATE TABLE IF NOT EXISTS users (
                id SERIAL PRIMARY KEY,
                name VARCHAR(100) NOT NULL,
                phone VARCHAR(15) UNIQUE NOT NULL,
                email VARCHAR(100),
                password VARCHAR(255) NOT NULL,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                password_reset_token VARCHAR(255),
                token_expiry TIMESTAMP,
                data_consent BOOLEAN DEFAULT FALSE,
                consent_date TIMESTAMP
            );
        `);

        await pgClient.query(`
            CREATE TABLE IF NOT EXISTS services (
                id SERIAL PRIMARY KEY,
                title VARCHAR(100) NOT NULL,
                price DECIMAL(10,2) NOT NULL,
                duration INT NOT NULL,
                description TEXT
            );
        `);

        await pgClient.query(`
            CREATE TABLE IF NOT EXISTS manicurists (
                id SERIAL PRIMARY KEY,
                name VARCHAR(100) NOT NULL,
                phone VARCHAR(15) UNIQUE,
                password VARCHAR(255),
                specialty VARCHAR(100),
                available BOOLEAN DEFAULT TRUE
            );
        `);

        await pgClient.query(`
            CREATE TABLE IF NOT EXISTS bookings (
                id SERIAL PRIMARY KEY,
                user_id INT NOT NULL REFERENCES users(id),
                manicurist_id INT NOT NULL REFERENCES manicurists(id),
                service_id INT NOT NULL REFERENCES services(id),
                booking_date DATE NOT NULL,
                booking_time TIME NOT NULL DEFAULT '09:00:00',
                status VARCHAR(50) DEFAULT 'pending',
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                payment_type VARCHAR(50) DEFAULT 'none',
                payment_amount DECIMAL(10,2) DEFAULT 0.00,
                payment_status VARCHAR(50) DEFAULT 'unpaid',
                payment_proof VARCHAR(255),
                final_payment_amount DECIMAL(10,2) DEFAULT 0.00,
                final_payment_method VARCHAR(50),
                nequi_reference VARCHAR(100)
            );
        `);
        console.log('✅ Tablas creadas');

        // 2. Migrate Data
        const tables = ['users', 'services', 'manicurists', 'bookings'];

        for (const table of tables) {
            console.log(`Migrando datos de la tabla: ${table}...`);
            const [rows] = await mysqlPool.query(`SELECT * FROM ${table}`);
            
            if (rows.length === 0) {
                console.log(`- La tabla ${table} está vacía. Saltando.`);
                continue;
            }

            for (const row of rows) {
                const keys = Object.keys(row);
                const values = Object.values(row);
                
                // Format boolean values for Postgres
                const formattedValues = values.map((val, idx) => {
                    const key = keys[idx];
                    if ((table === 'users' && key === 'data_consent') || 
                        (table === 'manicurists' && key === 'available')) {
                        return val === 1;
                    }
                    return val;
                });

                const placeholders = keys.map((_, i) => `$${i + 1}`).join(', ');
                const columns = keys.join(', ');

                const query = `INSERT INTO ${table} (${columns}) VALUES (${placeholders}) ON CONFLICT (id) DO NOTHING`;
                await pgClient.query(query, formattedValues);
            }
            
            // Update sequence for SERIAL columns to avoid ID conflicts later
            await pgClient.query(`SELECT setval('${table}_id_seq', COALESCE((SELECT MAX(id)+1 FROM ${table}), 1), false)`);
            console.log(`- Migrados ${rows.length} registros de ${table}`);
        }

        console.log('🎉 Migración completada exitosamente.');
    } catch (err) {
        console.error('❌ Error durante la migración:', err);
    } finally {
        await pgClient.end();
        await mysqlPool.end();
        process.exit(0);
    }
}

migrate();
