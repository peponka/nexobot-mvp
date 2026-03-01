-- Migración para crear SuperAdmins y Partners (Bancos/Financieras)

-- 1. Tabla de SuperAdmins (Equipo Interno de NexoFinanzas)
CREATE TABLE IF NOT EXISTS superadmins (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    email TEXT UNIQUE NOT NULL,
    password_hash TEXT NOT NULL, -- Contraseña encriptada
    name TEXT NOT NULL,
    role TEXT DEFAULT 'superadmin', -- superadmin, admin, viewer
    is_active BOOLEAN DEFAULT true,
    last_login_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- 2. Tabla de Partners B2B (Bancos, Financieras, Proveedores)
CREATE TABLE IF NOT EXISTS b2b_partners (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_name TEXT NOT NULL, -- Ej: Banco Itaú, Visión Banco
    contact_email TEXT UNIQUE NOT NULL, -- Email del ejecutivo de cuenta
    password_hash TEXT NOT NULL, -- Contraseña para el portal
    api_key TEXT UNIQUE NOT NULL, -- Llave para consumir la API de NexoScore/GreenLight
    plan_type TEXT DEFAULT 'professional', -- basic, professional, enterprise
    api_calls_limit INTEGER DEFAULT 500, -- Límite de consultas al mes
    api_calls_used INTEGER DEFAULT 0, -- Consultas usadas en el mes actual
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- 3. Tabla de Logs de Uso de API por Partners (Para Facturación y Auditoría)
CREATE TABLE IF NOT EXISTS b2b_api_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    partner_id UUID REFERENCES b2b_partners(id) ON DELETE CASCADE,
    endpoint TEXT NOT NULL, -- Ej: /api/score/+595981234567, /api/greenlight/check
    method TEXT NOT NULL, -- GET, POST
    status_code INTEGER NOT NULL, -- 200, 429, 500
    response_time_ms INTEGER, -- Tiempo que tardó en responder
    merchant_phone TEXT, -- Teléfono del comerciante consultado (opcional)
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Índices para mejorar la velocidad de las consultas
CREATE INDEX IF NOT EXISTS idx_b2b_api_logs_partner_id ON b2b_api_logs(partner_id);
CREATE INDEX IF NOT EXISTS idx_b2b_partners_api_key ON b2b_partners(api_key);

-- Insertar un SuperAdmin por defecto (la contraseña es temporal y debe cambiarse)
-- La contraseña será: nexo_admin_secure_123 (encriptado en la app, pero aquí lo guardamos simple para empezar, 
-- luego en el backend usaremos bcrypt)
INSERT INTO superadmins (email, password_hash, name, role)
VALUES (
    'admin@nexofinanzas.com', 
    'nexo_admin_secure_123', -- OJO: En producción usar hashes con bcrypt
    'Super Administrador', 
    'superadmin'
) ON CONFLICT (email) DO NOTHING;

-- Insertar un Partner de demostración (Banco de Ejemplo)
INSERT INTO b2b_partners (company_name, contact_email, password_hash, api_key, plan_type, api_calls_limit)
VALUES (
    'Cooperativa San Cristóbal (Demo)', 
    'demo@banco.com', 
    'banco_demo_123', -- OJO: En producción usar hashes
    'gl-demo-key-2026', -- Llave API de prueba
    'professional', 
    500
) ON CONFLICT (contact_email) DO NOTHING;

-- Habilitar RLS (Row Level Security) para mayor seguridad
ALTER TABLE superadmins ENABLE ROW LEVEL SECURITY;
ALTER TABLE b2b_partners ENABLE ROW LEVEL SECURITY;
ALTER TABLE b2b_api_logs ENABLE ROW LEVEL SECURITY;

-- Políticas de seguridad muy básicas (permitir a los servicios backend acceder a todo)
-- En un entorno más estricto, ajustar estas políticas según sea necesario.
DO $$ BEGIN
    CREATE POLICY "Permitir todo a superadmins" ON superadmins FOR ALL USING (true);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
    CREATE POLICY "Permitir todo a b2b_partners" ON b2b_partners FOR ALL USING (true);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
    CREATE POLICY "Permitir todo a b2b_api_logs" ON b2b_api_logs FOR ALL USING (true);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
