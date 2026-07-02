-- Script para crear la base de datos AUBA Studio
-- Ejecutar con: mysql -u root -p < database/schema.sql
-- Este schema es la fuente de verdad completa (incluye pagos y recovery)

CREATE DATABASE IF NOT EXISTS auba_studio;
USE auba_studio;

-- Tabla de usuarios
CREATE TABLE IF NOT EXISTS users (
    id INT AUTO_INCREMENT PRIMARY KEY,
    name VARCHAR(100) NOT NULL,
    phone VARCHAR(15) NOT NULL UNIQUE,
    email VARCHAR(100),
    password VARCHAR(255) NOT NULL,
    password_reset_token VARCHAR(255) DEFAULT NULL,
    token_expiry DATETIME DEFAULT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Tabla de manicuristas (con campos de autenticación)
CREATE TABLE IF NOT EXISTS manicurists (
    id INT AUTO_INCREMENT PRIMARY KEY,
    name VARCHAR(100) NOT NULL,
    phone VARCHAR(15) UNIQUE,
    password VARCHAR(255),
    specialty VARCHAR(100),
    available BOOLEAN DEFAULT TRUE
);

-- Tabla de servicios
CREATE TABLE IF NOT EXISTS services (
    id INT AUTO_INCREMENT PRIMARY KEY,
    title VARCHAR(100) NOT NULL,
    price DECIMAL(10,2) NOT NULL,
    duration INT NOT NULL COMMENT 'Duración en minutos',
    description TEXT
);

-- Tabla de reservas (con pagos Nequi/ePayco incluidos)
CREATE TABLE IF NOT EXISTS bookings (
    id INT AUTO_INCREMENT PRIMARY KEY,
    user_id INT NOT NULL,
    manicurist_id INT NOT NULL,
    service_id INT NOT NULL,
    booking_date DATE NOT NULL,
    booking_time TIME NOT NULL,
    status ENUM('pending','confirmed','in_progress','completed','cancelled','no_show') DEFAULT 'pending',
    -- Campos de pago anticipado (Nequi QR)
    payment_type ENUM('none','deposit','full') DEFAULT 'none',
    payment_amount DECIMAL(10,2) DEFAULT 0,
    payment_status ENUM('unpaid','pending_verification','verified','completed') DEFAULT 'unpaid',
    payment_proof VARCHAR(255) DEFAULT NULL,
    nequi_reference VARCHAR(100) DEFAULT NULL,
    -- Campos de pago final (al completar servicio)
    final_payment_amount DECIMAL(10,2) DEFAULT 0,
    final_payment_method VARCHAR(50) DEFAULT NULL,
    -- Referencia ePayco (pago online)
    payment_ref VARCHAR(100) DEFAULT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (manicurist_id) REFERENCES manicurists(id) ON DELETE CASCADE,
    FOREIGN KEY (service_id) REFERENCES services(id) ON DELETE CASCADE
);

-- Datos iniciales: Manicuristas con credenciales
-- Contraseña por defecto: auba2026 (hasheada con bcrypt)
INSERT INTO manicurists (name, phone, password, specialty, available) VALUES
('María González', '3001234567', '$2b$10$mm5ZV8WcmuwK4VT2zf.aCOxM5fU6CVOUAXuK7Z.izHL9JVSVFuvxK', 'Especialista en Nail Art', TRUE),
('Camila Rodríguez', '3007654321', '$2b$10$mm5ZV8WcmuwK4VT2zf.aCOxM5fU6CVOUAXuK7Z.izHL9JVSVFuvxK', 'Experta en Gel & Acrílico', TRUE),
('Sofía Martínez', '3009876543', '$2b$10$mm5ZV8WcmuwK4VT2zf.aCOxM5fU6CVOUAXuK7Z.izHL9JVSVFuvxK', 'Manicura Clásica & Spa', TRUE);

-- Datos iniciales: Servicios
INSERT INTO services (title, price, duration, description) VALUES
('Manicura Gel', 45000, 60, 'Limpieza profunda, esmaltado en gel de larga duración y diseño minimalista.'),
('Pedicura Spa', 60000, 75, 'Relajación total, exfoliación, masaje e hidratación profunda.'),
('Lifting de Pestañas', 80000, 90, 'Realza tu mirada con un efecto natural y duradero.'),
('Diseño de Cejas', 35000, 45, 'Visagismo y depilación con hilo para unas cejas perfectas.'),
('Maquillaje Social', 120000, 120, 'Look profesional para eventos especiales, resaltando tu belleza.'),
('Tratamiento Facial', 150000, 90, 'Limpieza e hidratación para una piel radiante y saludable.');

