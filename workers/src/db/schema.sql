-- ============================================
-- DISPATCH APP - D1 SCHEMA
-- Version: 1.0.0
-- ============================================

-- ============================================
-- TENANT (Multi-tenancy ready, single tenant MVP)
-- ============================================
CREATE TABLE IF NOT EXISTS tenants (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  subdomain TEXT UNIQUE,
  settings TEXT, -- JSON blob for tenant config
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);

-- Insert default tenant for MVP
INSERT OR IGNORE INTO tenants (id, name, subdomain) 
VALUES ('default', 'Default Company', 'app');

-- ============================================
-- DEPOTS
-- ============================================
CREATE TABLE IF NOT EXISTS depots (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL DEFAULT 'default' REFERENCES tenants(id),
  name TEXT NOT NULL,
  code TEXT NOT NULL,
  address TEXT,
  lat REAL,
  lng REAL,
  is_primary INTEGER DEFAULT 0,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now')),
  deleted_at TEXT,
  UNIQUE(tenant_id, code)
);

-- Default depot
INSERT OR IGNORE INTO depots (id, tenant_id, name, code, lat, lng, is_primary)
VALUES ('depot-main', 'default', 'Main Depot', 'MAIN', -34.9285, 138.6007, 1);

-- ============================================
-- LOCATIONS (pickup/dropoff points)
-- ============================================
CREATE TABLE IF NOT EXISTS locations (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL DEFAULT 'default' REFERENCES tenants(id),
  name TEXT NOT NULL,
  type TEXT, -- 'urban', 'transport', 'venue', 'school', etc.
  address TEXT,
  lat REAL NOT NULL,
  lng REAL NOT NULL,
  is_active INTEGER DEFAULT 1,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now')),
  deleted_at TEXT
);

-- ============================================
-- DUTY TYPES (configurable per tenant)
-- ============================================
CREATE TABLE IF NOT EXISTS duty_types (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL DEFAULT 'default' REFERENCES tenants(id),
  code TEXT NOT NULL,
  name TEXT NOT NULL,
  color TEXT NOT NULL DEFAULT '#6b7280',
  requires_vehicle INTEGER DEFAULT 0,
  requires_driver INTEGER DEFAULT 1,
  is_paid INTEGER DEFAULT 1,
  is_active INTEGER DEFAULT 1,
  sort_order INTEGER DEFAULT 0,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now')),
  UNIQUE(tenant_id, code)
);

-- Default duty types
INSERT OR IGNORE INTO duty_types (id, tenant_id, code, name, color, requires_vehicle, sort_order) VALUES
  ('dt-driving', 'default', 'driving', 'Driving', '#3b82f6', 1, 1),
  ('dt-oov', 'default', 'oov', 'Out of Vehicle', '#f59e0b', 0, 2),
  ('dt-break', 'default', 'break', 'Meal Break', '#22c55e', 0, 3),
  ('dt-waiting', 'default', 'waiting', 'Waiting', '#64748b', 0, 4),
  ('dt-charter', 'default', 'charter', 'Charter', '#a855f7', 1, 5),
  ('dt-dead', 'default', 'dead', 'Dead Running', '#ef4444', 1, 6);

-- ============================================
-- PAY TYPES (configurable per tenant)
-- ============================================
CREATE TABLE IF NOT EXISTS pay_types (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL DEFAULT 'default' REFERENCES tenants(id),
  code TEXT NOT NULL,
  name TEXT NOT NULL,
  multiplier REAL DEFAULT 1.0,
  is_active INTEGER DEFAULT 1,
  sort_order INTEGER DEFAULT 0,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now')),
  UNIQUE(tenant_id, code)
);

-- Default pay types
INSERT OR IGNORE INTO pay_types (id, tenant_id, code, name, multiplier, sort_order) VALUES
  ('pt-std', 'default', 'STD', 'Standard', 1.0, 1),
  ('pt-ot', 'default', 'OT', 'Overtime', 1.5, 2),
  ('pt-dt', 'default', 'DT', 'Double Time', 2.0, 3),
  ('pt-pen', 'default', 'PEN', 'Penalty Rate', 1.25, 4),
  ('pt-alw', 'default', 'ALW', 'Allowance', 1.0, 5),
  ('pt-unp', 'default', 'UNP', 'Unpaid', 0.0, 6);

-- ============================================
-- EMPLOYEES (HRM)
-- ============================================
CREATE TABLE IF NOT EXISTS employees (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL DEFAULT 'default' REFERENCES tenants(id),
  depot_id TEXT REFERENCES depots(id),
  employee_number TEXT NOT NULL,
  first_name TEXT NOT NULL,
  last_name TEXT NOT NULL,
  email TEXT,
  phone TEXT,
  licence_number TEXT,
  licence_expiry TEXT,
  role TEXT DEFAULT 'driver', -- 'driver', 'dispatcher', 'admin'
  status TEXT DEFAULT 'active', -- 'active', 'inactive', 'terminated'
  hire_date TEXT,
  notes TEXT,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now')),
  deleted_at TEXT,
  UNIQUE(tenant_id, employee_number)
);

CREATE INDEX IF NOT EXISTS idx_employees_tenant ON employees(tenant_id, deleted_at);
CREATE INDEX IF NOT EXISTS idx_employees_status ON employees(tenant_id, status);

-- ============================================
-- EMPLOYEE DAILY STATUS (leave, availability)
-- ============================================
CREATE TABLE IF NOT EXISTS employee_daily_status (
  id TEXT PRIMARY KEY,
  employee_id TEXT NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  date TEXT NOT NULL, -- YYYY-MM-DD
  status TEXT NOT NULL DEFAULT 'available', -- 'available', 'leave', 'sick', 'training'
  leave_type TEXT, -- 'annual', 'sick', 'unpaid', 'lwop'
  notes TEXT,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now')),
  UNIQUE(employee_id, date)
);

CREATE INDEX IF NOT EXISTS idx_emp_daily_date ON employee_daily_status(date);

-- ============================================
-- VEHICLES
-- ============================================
CREATE TABLE IF NOT EXISTS vehicles (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL DEFAULT 'default' REFERENCES tenants(id),
  depot_id TEXT REFERENCES depots(id),
  fleet_number TEXT NOT NULL, -- Internal ID like 'BUS-101'
  rego TEXT NOT NULL,
  capacity INTEGER NOT NULL,
  make TEXT,
  model TEXT,
  year INTEGER,
  vin TEXT,
  status TEXT DEFAULT 'active', -- 'active', 'inactive', 'sold'
  notes TEXT,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now')),
  deleted_at TEXT,
  UNIQUE(tenant_id, fleet_number),
  UNIQUE(tenant_id, rego)
);

CREATE INDEX IF NOT EXISTS idx_vehicles_tenant ON vehicles(tenant_id, deleted_at);

-- ============================================
-- VEHICLE DAILY STATUS (maintenance, etc.)
-- ============================================
CREATE TABLE IF NOT EXISTS vehicle_daily_status (
  id TEXT PRIMARY KEY,
  vehicle_id TEXT NOT NULL REFERENCES vehicles(id) ON DELETE CASCADE,
  date TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'available', -- 'available', 'maintenance', 'reserved', 'breakdown'
  reason TEXT,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now')),
  UNIQUE(vehicle_id, date)
);

CREATE INDEX IF NOT EXISTS idx_veh_daily_date ON vehicle_daily_status(date);

-- ============================================
-- CUSTOMERS (for charters)
-- ============================================
CREATE TABLE IF NOT EXISTS customers (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL DEFAULT 'default' REFERENCES tenants(id),
  name TEXT NOT NULL,
  type TEXT, -- 'corporate', 'school', 'club', 'individual', 'government'
  abn TEXT,
  billing_email TEXT,
  billing_address TEXT,
  contact_name TEXT,
  contact_phone TEXT,
  contact_email TEXT,
  payment_terms INTEGER DEFAULT 30,
  notes TEXT,
  is_active INTEGER DEFAULT 1,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now')),
  deleted_at TEXT
);

-- ============================================
-- ROUTES (for regular services)
-- ============================================
CREATE TABLE IF NOT EXISTS routes (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL DEFAULT 'default' REFERENCES tenants(id),
  code TEXT NOT NULL,
  name TEXT NOT NULL,
  description TEXT,
  is_active INTEGER DEFAULT 1,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now')),
  deleted_at TEXT,
  UNIQUE(tenant_id, code)
);

-- ============================================
-- SHIFT TEMPLATES (reusable shift definitions)
-- ============================================
CREATE TABLE IF NOT EXISTS shift_templates (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL DEFAULT 'default' REFERENCES tenants(id),
  code TEXT NOT NULL,
  name TEXT NOT NULL,
  shift_type TEXT NOT NULL DEFAULT 'regular', -- 'regular', 'charter', 'school'
  route_id TEXT REFERENCES routes(id),
  default_start REAL NOT NULL, -- Decimal hours (6.5 = 06:30)
  default_end REAL NOT NULL,
  default_vehicle_id TEXT REFERENCES vehicles(id),
  notes TEXT,
  is_active INTEGER DEFAULT 1,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now')),
  deleted_at TEXT,
  UNIQUE(tenant_id, code)
);

CREATE INDEX IF NOT EXISTS idx_shift_templates_tenant ON shift_templates(tenant_id, is_active);

-- ============================================
-- SHIFT TEMPLATE DUTIES (duties within a template)
-- Offset-based: times relative to shift start
-- ============================================
CREATE TABLE IF NOT EXISTS shift_template_duties (
  id TEXT PRIMARY KEY,
  shift_template_id TEXT NOT NULL REFERENCES shift_templates(id) ON DELETE CASCADE,
  duty_type_id TEXT NOT NULL REFERENCES duty_types(id),
  sequence INTEGER NOT NULL,
  start_offset REAL NOT NULL DEFAULT 0, -- Hours from shift start
  duration REAL NOT NULL, -- Hours
  description_template TEXT, -- Can include {route}, {location} placeholders
  default_vehicle INTEGER DEFAULT 0, -- 1 = use shift's default vehicle
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_template_duties ON shift_template_duties(shift_template_id, sequence);

-- ============================================
-- ROSTER ENTRIES (scheduled shifts on specific dates)
-- This is the core of the roster system
-- ============================================
CREATE TABLE IF NOT EXISTS roster_entries (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL DEFAULT 'default' REFERENCES tenants(id),
  shift_template_id TEXT REFERENCES shift_templates(id), -- NULL for ad-hoc
  date TEXT NOT NULL, -- YYYY-MM-DD
  name TEXT NOT NULL, -- Copied from template or custom
  shift_type TEXT NOT NULL DEFAULT 'regular',
  route_id TEXT REFERENCES routes(id),
  customer_id TEXT REFERENCES customers(id), -- For charters
  start_time REAL NOT NULL,
  end_time REAL NOT NULL,
  driver_id TEXT REFERENCES employees(id),
  vehicle_id TEXT REFERENCES vehicles(id),
  status TEXT DEFAULT 'scheduled', -- 'scheduled', 'in_progress', 'completed', 'cancelled'
  notes TEXT,
  source TEXT DEFAULT 'manual', -- 'manual', 'template', 'copied'
  source_roster_id TEXT, -- If copied, reference to original
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now')),
  deleted_at TEXT
);

CREATE INDEX IF NOT EXISTS idx_roster_date ON roster_entries(tenant_id, date, deleted_at);
CREATE INDEX IF NOT EXISTS idx_roster_driver ON roster_entries(driver_id, date);
CREATE INDEX IF NOT EXISTS idx_roster_vehicle ON roster_entries(vehicle_id, date);

-- ============================================
-- ROSTER DUTIES (instantiated duties for a roster entry)
-- These are the actual duties shown in dispatch
-- ============================================
CREATE TABLE IF NOT EXISTS roster_duties (
  id TEXT PRIMARY KEY,
  roster_entry_id TEXT NOT NULL REFERENCES roster_entries(id) ON DELETE CASCADE,
  duty_type_id TEXT NOT NULL REFERENCES duty_types(id),
  sequence INTEGER NOT NULL,
  start_time REAL NOT NULL, -- Actual time (not offset)
  end_time REAL NOT NULL,
  description TEXT,
  from_location_id TEXT REFERENCES locations(id),
  to_location_id TEXT REFERENCES locations(id),
  vehicle_id TEXT REFERENCES vehicles(id), -- Override roster entry vehicle
  driver_id TEXT REFERENCES employees(id), -- Override roster entry driver
  pay_type_id TEXT REFERENCES pay_types(id),
  status TEXT DEFAULT 'scheduled', -- 'scheduled', 'in_progress', 'completed'
  notes TEXT,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_roster_duties ON roster_duties(roster_entry_id, sequence);

-- ============================================
-- AUDIT LOG
-- ============================================
CREATE TABLE IF NOT EXISTS audit_log (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL DEFAULT 'default',
  user_id TEXT,
  action TEXT NOT NULL, -- 'create', 'update', 'delete', 'assign', 'transfer', 'copy'
  entity_type TEXT NOT NULL, -- 'employee', 'vehicle', 'shift_template', 'roster_entry', etc.
  entity_id TEXT NOT NULL,
  old_values TEXT, -- JSON
  new_values TEXT, -- JSON
  metadata TEXT, -- JSON for extra context
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_audit_entity ON audit_log(entity_type, entity_id);
CREATE INDEX IF NOT EXISTS idx_audit_date ON audit_log(tenant_id, created_at);

-- ============================================
-- VIEWS FOR CONVENIENCE
-- ============================================

-- Full roster view with joins
CREATE VIEW IF NOT EXISTS v_roster_full AS
SELECT 
  r.id,
  r.tenant_id,
  r.date,
  r.name,
  r.shift_type,
  r.start_time,
  r.end_time,
  r.status,
  r.driver_id,
  e.employee_number AS driver_number,
  e.first_name || ' ' || e.last_name AS driver_name,
  r.vehicle_id,
  v.fleet_number AS vehicle_number,
  v.rego AS vehicle_rego,
  v.capacity AS vehicle_capacity,
  r.route_id,
  rt.code AS route_code,
  r.customer_id,
  c.name AS customer_name,
  r.notes,
  r.created_at,
  r.updated_at
FROM roster_entries r
LEFT JOIN employees e ON r.driver_id = e.id
LEFT JOIN vehicles v ON r.vehicle_id = v.id
LEFT JOIN routes rt ON r.route_id = rt.id
LEFT JOIN customers c ON r.customer_id = c.id
WHERE r.deleted_at IS NULL;

-- Employee availability view
CREATE VIEW IF NOT EXISTS v_employee_availability AS
SELECT 
  e.id,
  e.tenant_id,
  e.employee_number,
  e.first_name,
  e.last_name,
  e.status AS employee_status,
  eds.date,
  COALESCE(eds.status, 'available') AS daily_status,
  eds.leave_type,
  eds.notes
FROM employees e
LEFT JOIN employee_daily_status eds ON e.id = eds.employee_id
WHERE e.deleted_at IS NULL AND e.status = 'active';
