-- Migración: Agregar columnas de pago a tabla bookings
-- Ejecutar con: mysql -u root -p auba_studio < database/add_payment_columns.sql

USE auba_studio;

-- Tipo de pago: none (sin pago), deposit (abono), full (pago completo)
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS payment_type ENUM('none','deposit','full') DEFAULT 'none';

-- Monto del pago anticipado (abono o total)
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS payment_amount DECIMAL(10,2) DEFAULT 0;

-- Estado del pago
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS payment_status ENUM('unpaid','pending_verification','verified','completed') DEFAULT 'unpaid';

-- Ruta del comprobante de pago (screenshot)
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS payment_proof VARCHAR(255) DEFAULT NULL;

-- Monto cobrado al finalizar el servicio (restante)
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS final_payment_amount DECIMAL(10,2) DEFAULT 0;

-- Método del pago final (efectivo, nequi, transferencia)
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS final_payment_method VARCHAR(50) DEFAULT NULL;
