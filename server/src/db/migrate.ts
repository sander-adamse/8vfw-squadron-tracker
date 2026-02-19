import pool from './pool'

const dropSchema = `
-- Drop tables in reverse dependency order
DROP TABLE IF EXISTS qualifications CASCADE;
DROP TABLE IF EXISTS category_colors CASCADE;
DROP TABLE IF EXISTS skills CASCADE;
DROP TABLE IF EXISTS pilots CASCADE;
DROP TABLE IF EXISTS users CASCADE;
DROP TABLE IF EXISTS wings CASCADE;
`;

const schema = `
-- Wings table
CREATE TABLE IF NOT EXISTS wings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(100) UNIQUE NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Users table (for authentication)
CREATE TABLE IF NOT EXISTS users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email VARCHAR(255) UNIQUE NOT NULL,
  password_hash VARCHAR(255) NOT NULL,
  role VARCHAR(20) NOT NULL DEFAULT 'pilot' CHECK (role IN ('pilot', 'instructor', 'admin')),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Pilots table
CREATE TABLE IF NOT EXISTS pilots (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  callsign VARCHAR(100) NOT NULL,
  first_name VARCHAR(100) NOT NULL,
  last_name VARCHAR(100) NOT NULL,
  wing_id UUID NOT NULL REFERENCES wings(id),
  board_number VARCHAR(20),
  role VARCHAR(20) NOT NULL DEFAULT 'pilot' CHECK (role IN ('pilot', 'instructor', 'admin')),
  email VARCHAR(255) NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Skills table (linked to a wing)
CREATE TABLE IF NOT EXISTS skills (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  wing_id UUID NOT NULL REFERENCES wings(id) ON DELETE CASCADE,
  name VARCHAR(200) NOT NULL,
  category VARCHAR(100) NOT NULL,
  description TEXT,
  sort_order INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Qualifications table
CREATE TABLE IF NOT EXISTS qualifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  pilot_id UUID NOT NULL REFERENCES pilots(id) ON DELETE CASCADE,
  skill_id UUID NOT NULL REFERENCES skills(id) ON DELETE CASCADE,
  status VARCHAR(10) NOT NULL CHECK (status IN ('NMQ', 'MQT', 'FMQ', 'IP')),
  last_updated TIMESTAMPTZ DEFAULT NOW(),
  updated_by VARCHAR(255),
  UNIQUE(pilot_id, skill_id)
);

-- Category colors table (per-wing category colors)
CREATE TABLE IF NOT EXISTS category_colors (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  wing_id UUID NOT NULL REFERENCES wings(id) ON DELETE CASCADE,
  category VARCHAR(100) NOT NULL,
  color VARCHAR(7) NOT NULL DEFAULT '#3B82F6',
  sort_order INTEGER DEFAULT 0,
  UNIQUE(wing_id, category)
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_qualifications_pilot_id ON qualifications(pilot_id);
CREATE INDEX IF NOT EXISTS idx_qualifications_skill_id ON qualifications(skill_id);
CREATE INDEX IF NOT EXISTS idx_pilots_wing_id ON pilots(wing_id);
CREATE INDEX IF NOT EXISTS idx_pilots_user_id ON pilots(user_id);
CREATE INDEX IF NOT EXISTS idx_skills_wing_id ON skills(wing_id);

-- Settings table for UX customization
CREATE TABLE IF NOT EXISTS settings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  key VARCHAR(100) UNIQUE NOT NULL,
  value TEXT NOT NULL,
  description TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Default settings
INSERT INTO settings (key, value, description) VALUES
  ('nav_title', 'DCS Squadron', 'Title shown in the navigation bar'),
  ('nav_color', '#2563EB', 'Navigation bar color (hex code)'),
  ('nav_icon', 'Plane', 'Navigation bar icon (lucide icon name)'),
  ('app_subtitle', 'Squadron Management System', 'Subtitle/tagline')
ON CONFLICT (key) DO NOTHING;

-- Migrations
-- Add sort_order column to category_colors if it doesn't exist
ALTER TABLE IF EXISTS category_colors ADD COLUMN IF NOT EXISTS sort_order INTEGER DEFAULT 0;

-- Add board_number to pilots if it doesn't exist
ALTER TABLE IF EXISTS pilots ADD COLUMN IF NOT EXISTS board_number VARCHAR(20);

-- Backfill missing qualifications with NMQ status
-- This ensures every pilot-skill combination has a status
INSERT INTO qualifications (pilot_id, skill_id, status, last_updated, updated_by)
SELECT p.id, s.id, 'NMQ', NOW(), 'system_migration'
FROM pilots p
CROSS JOIN skills s
WHERE s.wing_id = p.wing_id
  AND NOT EXISTS (
    SELECT 1 FROM qualifications q 
    WHERE q.pilot_id = p.id AND q.skill_id = s.id
  )
ON CONFLICT (pilot_id, skill_id) DO NOTHING;
`;

async function migrate() {
  const shouldReset = process.argv.includes('--reset')
  const isDebug = process.env.DEBUG_MIGRATIONS === 'true'
  
  if (isDebug) console.log('Running database migrations...')
  try {
    if (shouldReset) {
      if (process.env.NODE_ENV === 'production') {
        console.error('ERROR: --reset is not allowed in production. Aborting.')
        process.exit(1)
      }
      if (isDebug) console.log('Resetting database (dropping all tables)...')
      await pool.query(dropSchema)
    }
    await pool.query(schema)
    if (isDebug) console.log('Migrations completed successfully.')
  } catch (error) {
    console.error('Migration failed:', error)
    process.exit(1)
  } finally {
    await pool.end()
  }
}

migrate()
