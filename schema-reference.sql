-- ============================================
-- DISPATCH APP - DATABASE SCHEMA REFERENCE
-- ============================================
-- Generated from live database: January 18, 2026
-- 
-- To regenerate:
-- npx wrangler d1 execute dispatch-db --remote --command="SELECT sql FROM sqlite_master WHERE type='table' AND name NOT LIKE '_cf%' ORDER BY name;" > schema-output.txt
-- ============================================

-- ============================================
-- SYSTEM TABLES
-- ============================================

CREATE TABLE tenants (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  subdomain TEXT UNIQUE,
  settings TEXT, -- JSON blob for tenant config
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE audit_log (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  entity_type TEXT NOT NULL,
  entity_id TEXT NOT NULL,
  action TEXT NOT NULL,
  field_name TEXT,
  old_value TEXT,
  new_value TEXT,
  changed_by TEXT,
  changed_at TEXT NOT NULL,
  notes TEXT
);

-- ============================================
-- CORE TABLES
-- ============================================

CREATE TABLE depots (
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

CREATE TABLE employees (
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
  default_pay_type_id TEXT REFERENCES pay_types(id),
  UNIQUE(tenant_id, employee_number)
);

CREATE TABLE vehicles (
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

CREATE TABLE customers (
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
-- CONFIGURATION TABLES
-- ============================================

CREATE TABLE duty_types (
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

CREATE TABLE locations (
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

CREATE TABLE routes (
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
-- SHIFT TEMPLATES
-- ============================================

CREATE TABLE shift_templates (
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

CREATE TABLE shift_template_duty_blocks (
  id TEXT PRIMARY KEY,
  shift_template_id TEXT NOT NULL REFERENCES shift_templates(id) ON DELETE CASCADE,
  sequence INTEGER NOT NULL,
  name TEXT NOT NULL,
  driver_id TEXT REFERENCES employees(id),
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);
-- NOTE: No tenant_id column!

CREATE TABLE shift_template_duty_lines (
  id TEXT PRIMARY KEY,
  duty_block_id TEXT NOT NULL REFERENCES shift_template_duty_blocks(id) ON DELETE CASCADE,
  sequence INTEGER NOT NULL,
  start_time REAL NOT NULL,           -- Decimal hours (6.5 = 06:30)
  end_time REAL NOT NULL,
  duty_type TEXT NOT NULL DEFAULT 'driving',
  description TEXT,
  vehicle_id TEXT REFERENCES vehicles(id),
  pay_type TEXT NOT NULL DEFAULT 'STD',
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now')),
  location_name TEXT,
  location_lat REAL,
  location_lng REAL
);
-- NOTE: No tenant_id column!

-- ============================================
-- ROSTERS
-- ============================================

CREATE TABLE rosters (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL DEFAULT 'default' REFERENCES tenants(id),
  code TEXT NOT NULL,
  name TEXT NOT NULL,
  start_date TEXT NOT NULL,           -- YYYY-MM-DD
  end_date TEXT NOT NULL,             -- YYYY-MM-DD
  status TEXT DEFAULT 'draft',        -- 'draft', 'published', 'archived'
  notes TEXT,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now')),
  deleted_at TEXT,
  calendar_start_date TEXT,
  calendar_end_date TEXT,
  UNIQUE(tenant_id, code)
);

CREATE TABLE roster_entries (
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
  deleted_at TEXT,
  roster_id TEXT REFERENCES rosters(id),
  duty_block_id TEXT REFERENCES shift_template_duty_blocks(id),
  include_in_dispatch INTEGER DEFAULT 0
);

-- IMPORTANT: source_duty_line_id distinguishes template-sourced vs user-added
-- NULL = user added inline duty in dispatch
-- NOT NULL = copied from shift template
CREATE TABLE roster_duty_lines (
    id TEXT PRIMARY KEY,
    tenant_id TEXT NOT NULL,
    roster_entry_id TEXT NOT NULL REFERENCES roster_entries(id),
    source_duty_line_id TEXT,  -- Original template line (NULL if created in dispatch)
    sequence INTEGER NOT NULL DEFAULT 1,
    start_time REAL NOT NULL,
    end_time REAL NOT NULL,
    duty_type TEXT,
    description TEXT,
    vehicle_id TEXT REFERENCES vehicles(id),
    vehicle_number TEXT,  -- Denormalized for display
    pay_type TEXT DEFAULT 'STD',
    created_at TEXT DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
    deleted_at TEXT,
    location_name TEXT,
    location_lat REAL,
    location_lng REAL,
    FOREIGN KEY (tenant_id) REFERENCES tenants(id)
);

-- Legacy table (may still be referenced)
CREATE TABLE roster_duties (
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

-- ============================================
-- ADHOC SHIFTS (Standalone, no roster/template)
-- ============================================

CREATE TABLE dispatch_adhoc_shifts (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL DEFAULT 'default',
  date TEXT NOT NULL,
  employee_id TEXT NOT NULL,  -- NOTE: employee_id, not driver_id
  name TEXT NOT NULL DEFAULT 'ADHOC',
  start_time REAL NOT NULL,
  end_time REAL NOT NULL,
  vehicle_id TEXT,
  status TEXT DEFAULT 'active',
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now')),
  deleted_at TEXT
);

CREATE TABLE dispatch_adhoc_duty_lines (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL DEFAULT 'default',
  adhoc_shift_id TEXT NOT NULL,
  sequence INTEGER NOT NULL DEFAULT 1,
  start_time REAL NOT NULL,
  end_time REAL NOT NULL,
  duty_type TEXT NOT NULL DEFAULT 'driving',
  description TEXT,
  vehicle_id TEXT,
  pay_type TEXT NOT NULL DEFAULT 'STD',
  location_name TEXT,
  location_lat REAL,
  location_lng REAL,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now')),
  deleted_at TEXT
);
-- NOTE: No cancelled/cancel_reason columns - uses deleted_at

-- ============================================
-- DISPATCH
-- ============================================

CREATE TABLE dispatch_duty_cancellations (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL DEFAULT 'default',
  roster_duty_line_id TEXT NOT NULL,  -- NOTE: roster_duty_line_id, not duty_line_id
  reason TEXT,
  cancelled_at TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
-- NOTE: No reinstated columns

-- ============================================
-- PAY MANAGEMENT
-- ============================================

CREATE TABLE pay_types (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  code TEXT NOT NULL,
  name TEXT NOT NULL,
  hourly_rate REAL NOT NULL,  -- NOTE: hourly_rate, not multiplier
  display_order INTEGER DEFAULT 0,  -- NOTE: display_order, not sort_order
  is_active INTEGER DEFAULT 1,
  deleted_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
-- NOTE: No sort_order column

CREATE TABLE dispatch_commits (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  commit_date TEXT NOT NULL,  -- NOTE: commit_date, not date
  scope TEXT NOT NULL,
  employee_id TEXT,
  committed_by TEXT NOT NULL,
  committed_at TEXT NOT NULL,
  notes TEXT
);
-- NOTE: Different structure than I assumed

CREATE TABLE employee_pay_records (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  employee_id TEXT NOT NULL,
  work_date TEXT NOT NULL,  -- NOTE: work_date, not date
  shift_template_id TEXT,
  shift_name TEXT,
  duty_block_id TEXT,
  duty_name TEXT,
  pay_type_id TEXT,
  pay_type_code TEXT,
  hours REAL NOT NULL,
  rate REAL NOT NULL,
  total_amount REAL NOT NULL,
  source_duty_line_id TEXT,
  source_type TEXT DEFAULT 'roster',
  is_manual INTEGER DEFAULT 0,
  notes TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

-- ============================================
-- CUSTOM FIELDS
-- ============================================

CREATE TABLE employee_custom_field_definitions (
    id TEXT PRIMARY KEY,
    tenant_id TEXT NOT NULL,
    field_name TEXT NOT NULL,           -- Display name: "Training Date"
    field_key TEXT NOT NULL,            -- Unique key: "training_date"
    field_type TEXT NOT NULL,           -- text, number, date, select, boolean
    field_options TEXT,                 -- JSON for select options: ["Option1", "Option2"]
    is_required INTEGER DEFAULT 0,
    display_order INTEGER DEFAULT 0,
    tab_name TEXT DEFAULT 'Custom',     -- Which tab to display on
    deleted_at TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    field_width TEXT DEFAULT 'full',
    display_row INTEGER DEFAULT 0,
    UNIQUE(tenant_id, field_key)
);

CREATE TABLE employee_custom_field_values (
    id TEXT PRIMARY KEY,
    tenant_id TEXT NOT NULL,
    employee_id TEXT NOT NULL REFERENCES employees(id),
    field_definition_id TEXT NOT NULL REFERENCES employee_custom_field_definitions(id),
    value TEXT,                         -- Stored as text, parsed by field type
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    UNIQUE(employee_id, field_definition_id)
);

-- ============================================
-- DAILY STATUS
-- ============================================

CREATE TABLE employee_daily_status (
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
-- NOTE: No tenant_id column!

CREATE TABLE vehicle_daily_status (
  id TEXT PRIMARY KEY,
  vehicle_id TEXT NOT NULL REFERENCES vehicles(id) ON DELETE CASCADE,
  date TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'available', -- 'available', 'maintenance', 'reserved', 'breakdown'
  reason TEXT,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now')),
  UNIQUE(vehicle_id, date)
);
-- NOTE: No tenant_id column!

-- ============================================
-- INDEXES (Added January 17, 2026)
-- ============================================
-- Performance optimization for frequently queried columns

-- Roster indexes
CREATE INDEX idx_roster_entries_date ON roster_entries(date);
CREATE INDEX idx_roster_entries_roster_id ON roster_entries(roster_id);
CREATE INDEX idx_roster_entries_driver_id ON roster_entries(driver_id);
CREATE INDEX idx_roster_duty_lines_entry_id ON roster_duty_lines(roster_entry_id);

-- Dispatch indexes
CREATE INDEX idx_dispatch_commits_date ON dispatch_commits(commit_date);
CREATE INDEX idx_adhoc_shifts_date ON dispatch_adhoc_shifts(date);

-- Pay records indexes
CREATE INDEX idx_pay_records_work_date ON employee_pay_records(work_date);
CREATE INDEX idx_pay_records_source_duty ON employee_pay_records(source_duty_line_id);

-- Cancellation index
CREATE INDEX idx_cancellations_duty_line ON dispatch_duty_cancellations(roster_duty_line_id);

-- ============================================
-- CHARTER MODULE (Added January 18, 2026)
-- ============================================

-- Vehicle features for requirement matching
CREATE TABLE vehicle_features (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL DEFAULT 'default',
  code TEXT NOT NULL,
  name TEXT NOT NULL,
  description TEXT,
  is_active INTEGER DEFAULT 1,
  display_order INTEGER DEFAULT 0,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now')),
  UNIQUE(tenant_id, code)
);

CREATE TABLE vehicle_feature_assignments (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL DEFAULT 'default',
  vehicle_id TEXT NOT NULL REFERENCES vehicles(id) ON DELETE CASCADE,
  feature_id TEXT NOT NULL REFERENCES vehicle_features(id) ON DELETE CASCADE,
  created_at TEXT DEFAULT (datetime('now')),
  UNIQUE(vehicle_id, feature_id)
);

-- Charter customers
CREATE TABLE charter_customers (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL DEFAULT 'default',
  company_name TEXT NOT NULL,
  trading_name TEXT,
  abn TEXT,
  billing_address TEXT,
  billing_suburb TEXT,
  billing_state TEXT,
  billing_postcode TEXT,
  physical_address TEXT,
  physical_suburb TEXT,
  physical_state TEXT,
  physical_postcode TEXT,
  payment_terms INTEGER DEFAULT 14,
  credit_limit REAL DEFAULT 0,
  account_status TEXT DEFAULT 'active',  -- active, on_hold, closed
  primary_email TEXT,
  primary_phone TEXT,
  website TEXT,
  notes TEXT,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now')),
  deleted_at TEXT
);

CREATE TABLE charter_customer_contacts (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL DEFAULT 'default',
  customer_id TEXT NOT NULL REFERENCES charter_customers(id) ON DELETE CASCADE,
  first_name TEXT NOT NULL,
  last_name TEXT NOT NULL,
  role TEXT,
  email TEXT,
  phone TEXT,
  mobile TEXT,
  is_primary INTEGER DEFAULT 0,
  receives_invoices INTEGER DEFAULT 0,
  receives_quotes INTEGER DEFAULT 0,
  notes TEXT,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now')),
  deleted_at TEXT
);

-- Charters (booking containers)
CREATE TABLE charters (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL DEFAULT 'default',
  customer_id TEXT NOT NULL REFERENCES charter_customers(id),
  charter_number TEXT NOT NULL,  -- CHT-2026-0001
  name TEXT,
  description TEXT,
  status TEXT DEFAULT 'enquiry',  -- enquiry, quoted, confirmed, completed, invoiced, paid, cancelled
  cancelled_at TEXT,
  cancellation_reason TEXT,
  booking_date TEXT NOT NULL,
  event_date TEXT,
  quoted_total REAL DEFAULT 0,
  invoiced_total REAL DEFAULT 0,
  paid_total REAL DEFAULT 0,
  contact_id TEXT REFERENCES charter_customer_contacts(id),
  notes TEXT,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now')),
  deleted_at TEXT,
  UNIQUE(tenant_id, charter_number)
);

CREATE TABLE charter_notes (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL DEFAULT 'default',
  charter_id TEXT NOT NULL REFERENCES charters(id) ON DELETE CASCADE,
  note_text TEXT NOT NULL,
  created_by TEXT,
  created_at TEXT DEFAULT (datetime('now'))
);

-- Charter trips (individual legs)
CREATE TABLE charter_trips (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL DEFAULT 'default',
  charter_id TEXT NOT NULL REFERENCES charters(id) ON DELETE CASCADE,
  trip_number INTEGER NOT NULL,
  name TEXT,
  trip_date TEXT NOT NULL,
  pickup_time TEXT NOT NULL,  -- HH:MM
  estimated_end_time TEXT,
  estimated_duration_mins INTEGER,
  passenger_count INTEGER NOT NULL DEFAULT 1,
  passenger_notes TEXT,
  pickup_name TEXT NOT NULL,
  pickup_address TEXT,
  pickup_lat REAL,
  pickup_lng REAL,
  pickup_notes TEXT,
  dropoff_name TEXT NOT NULL,
  dropoff_address TEXT,
  dropoff_lat REAL,
  dropoff_lng REAL,
  dropoff_notes TEXT,
  vehicle_capacity_required INTEGER,
  vehicle_features_required TEXT,  -- JSON array: ["wheelchair", "ac"]
  assigned_vehicle_id TEXT REFERENCES vehicles(id),
  assigned_driver_id TEXT REFERENCES employees(id),
  operational_status TEXT DEFAULT 'draft',  -- draft, booked, in_progress, completed, cancelled
  billing_status TEXT DEFAULT 'not_invoiced',  -- not_invoiced, invoiced, paid
  cancelled_at TEXT,
  cancellation_reason TEXT,
  special_instructions TEXT,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now')),
  deleted_at TEXT
);

CREATE TABLE charter_journeys (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL DEFAULT 'default',
  trip_id TEXT NOT NULL REFERENCES charter_trips(id) ON DELETE CASCADE,
  sequence INTEGER NOT NULL DEFAULT 1,
  pickup_name TEXT,
  pickup_address TEXT,
  pickup_lat REAL,
  pickup_lng REAL,
  pickup_time TEXT,  -- HH:MM format
  dropoff_name TEXT,
  dropoff_address TEXT,
  dropoff_lat REAL,
  dropoff_lng REAL,
  notes TEXT,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now')),
  deleted_at TEXT
);

CREATE TABLE charter_trip_stops (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL DEFAULT 'default',
  trip_id TEXT NOT NULL REFERENCES charter_trips(id) ON DELETE CASCADE,
  sequence INTEGER NOT NULL,
  stop_name TEXT NOT NULL,
  stop_address TEXT,
  stop_lat REAL,
  stop_lng REAL,
  estimated_arrival TEXT,
  stop_duration_mins INTEGER DEFAULT 0,
  stop_type TEXT DEFAULT 'stop',  -- stop, pickup, dropoff, break
  notes TEXT,
  passengers_on INTEGER DEFAULT 0,
  passengers_off INTEGER DEFAULT 0,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE charter_trip_line_items (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL DEFAULT 'default',
  trip_id TEXT NOT NULL REFERENCES charter_trips(id) ON DELETE CASCADE,
  item_type TEXT NOT NULL,  -- base_rate, per_km, waiting, tolls, parking, admin, other
  description TEXT NOT NULL,
  quantity REAL DEFAULT 1,
  unit_price REAL NOT NULL,
  total_price REAL NOT NULL,
  is_taxable INTEGER DEFAULT 1,
  tax_amount REAL DEFAULT 0,
  display_order INTEGER DEFAULT 0,
  is_hidden INTEGER DEFAULT 0,  -- Hidden from customer documents
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE charter_documents (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL DEFAULT 'default',
  charter_id TEXT NOT NULL REFERENCES charters(id) ON DELETE CASCADE,
  document_type TEXT NOT NULL,  -- quote, invoice, booking_confirmation, run_sheet, statement
  document_number TEXT,
  status TEXT DEFAULT 'draft',  -- draft, sent, viewed, paid
  issue_date TEXT,
  due_date TEXT,
  sent_at TEXT,
  subtotal REAL,
  tax_total REAL,
  grand_total REAL,
  file_path TEXT,
  sent_to_email TEXT,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);

-- Charter indexes
CREATE INDEX idx_charter_customers_tenant ON charter_customers(tenant_id);
CREATE INDEX idx_charter_customers_status ON charter_customers(tenant_id, account_status);
CREATE INDEX idx_customer_contacts_customer ON charter_customer_contacts(customer_id);
CREATE INDEX idx_charters_tenant ON charters(tenant_id);
CREATE INDEX idx_charters_customer ON charters(customer_id);
CREATE INDEX idx_charters_status ON charters(tenant_id, status);
CREATE INDEX idx_charters_event_date ON charters(tenant_id, event_date);
CREATE INDEX idx_charter_trips_charter ON charter_trips(charter_id);
CREATE INDEX idx_charter_trips_date ON charter_trips(tenant_id, trip_date);
CREATE INDEX idx_charter_trips_dispatch ON charter_trips(tenant_id, trip_date, operational_status);
CREATE INDEX idx_charter_journeys_trip ON charter_journeys(trip_id);
CREATE INDEX idx_charter_journeys_sequence ON charter_journeys(trip_id, sequence);
CREATE INDEX idx_trip_stops_trip ON charter_trip_stops(trip_id);
CREATE INDEX idx_trip_line_items_trip ON charter_trip_line_items(trip_id);
CREATE INDEX idx_charter_documents_charter ON charter_documents(charter_id);
