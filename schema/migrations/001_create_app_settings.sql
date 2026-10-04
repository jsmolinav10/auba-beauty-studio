-- ============================================
-- Migración 001: Tabla de configuración de la aplicación
-- ============================================
-- Almacena valores de configuración global, incluida la pregunta de seguridad
-- para el portal de manicuristas. La pregunta es variable (cambiable desde el
-- panel de admin) y compartida por todas las manicuristas.

CREATE TABLE IF NOT EXISTS app_settings (
    id            SERIAL PRIMARY KEY,
    setting_key   VARCHAR(100) UNIQUE NOT NULL,
    setting_value TEXT NOT NULL,
    description   TEXT
);

-- Pregunta de seguridad para manicuristas (valor por defecto)
INSERT INTO app_settings (setting_key, setting_value, description)
VALUES (
    'manicurist_security_question',
    '¿Cuál es el nombre del estudio?',
    'Pregunta de seguridad para acceder al portal de manicuristas'
)
ON CONFLICT (setting_key) DO NOTHING;

-- Respuesta de seguridad para manicuristas (valor por defecto)
INSERT INTO app_settings (setting_key, setting_value, description)
VALUES (
    'manicurist_security_answer',
    'auba',
    'Respuesta de seguridad para acceder al portal de manicuristas'
)
ON CONFLICT (setting_key) DO NOTHING;
