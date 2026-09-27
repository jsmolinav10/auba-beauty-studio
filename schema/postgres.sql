-- ============================================
-- AUBA Beauty Studio — Esquema canónico (PostgreSQL)
-- ============================================
-- Fuente de verdad del modelo de datos. Reemplaza a los archivos .sql del
-- proyecto, que estaban escritos en dialecto MySQL (AUTO_INCREMENT, ENUM,
-- USE auba_studio) y nunca se ejecutaron contra Supabase.
--
-- Aplicar sobre una base vacía:
--   psql "$SUPABASE_DB_URL" -f schema/postgres.sql
--
-- Si la base ya existe, este script es idempotente: las tablas se crean solo si
-- no están, y los índices se crean de forma condicional.

-- ============================================
-- USUARIOS (clientas)
-- ============================================
CREATE TABLE IF NOT EXISTS users (
    id                    SERIAL PRIMARY KEY,
    name                  VARCHAR(100) NOT NULL,
    phone                 VARCHAR(15) UNIQUE NOT NULL,
    email                 VARCHAR(100),
    password              VARCHAR(255) NOT NULL,
    created_at            TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    password_reset_token  VARCHAR(255),
    token_expiry          TIMESTAMP,
    -- Consentimiento de tratamiento de datos (Ley 1581 de 2012). El registro
    -- exige dataConsent = true y guarda la fecha en consent_date.
    data_consent          BOOLEAN DEFAULT FALSE,
    consent_date          TIMESTAMP
);

-- ============================================
-- SERVICIOS
-- ============================================
CREATE TABLE IF NOT EXISTS services (
    id          SERIAL PRIMARY KEY,
    title       VARCHAR(100) NOT NULL,
    price       DECIMAL(10,2) NOT NULL CHECK (price >= 0),
    duration    INT NOT NULL CHECK (duration > 0),
    description TEXT
);

-- ============================================
-- MANICURISTAS
-- ============================================
CREATE TABLE IF NOT EXISTS manicurists (
    id         SERIAL PRIMARY KEY,
    name       VARCHAR(100) NOT NULL,
    phone      VARCHAR(15) UNIQUE,
    password   VARCHAR(255),
    specialty  VARCHAR(100),
    available  BOOLEAN DEFAULT TRUE
);

-- ============================================
-- RESERVAS
-- ============================================
CREATE TABLE IF NOT EXISTS bookings (
    id                    SERIAL PRIMARY KEY,
    user_id               INT NOT NULL REFERENCES users(id),
    manicurist_id         INT NOT NULL REFERENCES manicurists(id),
    service_id            INT NOT NULL REFERENCES services(id),
    booking_date          DATE NOT NULL,
    booking_time          TIME NOT NULL DEFAULT '09:00:00',
    -- Estados en uso: pending, confirmed, in_progress, completed, cancelled, no_show
    status                VARCHAR(50) NOT NULL DEFAULT 'pending',
    created_at            TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    -- Flujo de cobro: abono por Nequi verificado a mano, saldo en efectivo
    --                  al terminar el servicio.
    payment_type          VARCHAR(50) NOT NULL DEFAULT 'none',
    payment_amount        DECIMAL(10,2) NOT NULL DEFAULT 0.00,
    -- unpaid, pending_verification, verified, completed
    payment_status        VARCHAR(50) NOT NULL DEFAULT 'unpaid',
    payment_proof         VARCHAR(255),
    final_payment_amount  DECIMAL(10,2) NOT NULL DEFAULT 0.00,
    final_payment_method  VARCHAR(50),
    nequi_reference       VARCHAR(100)
);

-- ============================================
-- ÍNDICES
-- ============================================
-- Las consultas más frecuentes son la agenda por fecha, el historial de una
-- clienta y la detección de horarios ocupados.
CREATE INDEX IF NOT EXISTS idx_bookings_manicurist_date
    ON bookings (manicurist_id, booking_date);

CREATE INDEX IF NOT EXISTS idx_bookings_user
    ON bookings (user_id);

CREATE INDEX IF NOT EXISTS idx_bookings_date_status
    ON bookings (booking_date, status);

-- Búsqueda de clientas desde el portal de manicuristas (ILIKE '%texto%').
-- Un índice funcional acelera esa consulta sin penalizar las demás.
CREATE INDEX IF NOT EXISTS idx_users_name_lower
    ON users (LOWER(name));

CREATE INDEX IF NOT EXISTS idx_users_phone
    ON users (phone);

-- ============================================
-- NOTAS
-- ============================================
-- 1. No hay ON DELETE CASCADE en las claves foráneas a propósito: se conserva el
--    historial financiero. El panel de administración impide borrar un servicio
--    o una manicurista que tenga reservas asociadas.
-- 2. Los estados se guardan como VARCHAR y no como ENUM para poder añadir valores
--    sin una migración de tipo. La lista válida se aplica en la capa de rutas.
-- 3. No existe la tabla de migraciones. Este archivo es el punto de partida; las
--    cambios posteriores deben añadirse como archivos numerados en migrations/
--    escritos en dialecto PostgreSQL.
