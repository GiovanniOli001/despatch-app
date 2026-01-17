-- ============================================
-- CHARTER MODULE - DATABASE SCHEMA
-- Phase 1: Foundation Tables
-- ============================================

-- ============================================
-- VEHICLE FEATURES (for requirement matching)
-- ============================================

CREATE TABLE IF NOT EXISTS vehicle_features (
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

-- Link vehicles to their features
CREATE TABLE IF NOT EXISTS vehicle_feature_assignments (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL DEFAULT 'default',
  vehicle_id TEXT NOT NULL REFERENCES vehicles(id) ON DELETE CASCADE,
  feature_id TEXT NOT NULL REFERENCES vehicle_features(id) ON DELETE CASCADE,
  created_at TEXT DEFAULT (datetime('now')),
  UNIQUE(vehicle_id, feature_id)
);

-- ============================================
-- CHARTER CUSTOMERS
-- ============================================

CREATE TABLE IF NOT EXISTS charter_customers (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL DEFAULT 'default',

  -- Company details
  company_name TEXT NOT NULL,
  trading_name TEXT,
  abn TEXT,

  -- Addresses
  billing_address TEXT,
  billing_suburb TEXT,
  billing_state TEXT,
  billing_postcode TEXT,
  physical_address TEXT,
  physical_suburb TEXT,
  physical_state TEXT,
  physical_postcode TEXT,

  -- Account settings
  payment_terms INTEGER DEFAULT 14,
  credit_limit REAL DEFAULT 0,
  account_status TEXT DEFAULT 'active',  -- active, on_hold, closed

  -- Contact defaults
  primary_email TEXT,
  primary_phone TEXT,
  website TEXT,

  -- Metadata
  notes TEXT,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now')),
  deleted_at TEXT
);

CREATE INDEX IF NOT EXISTS idx_charter_customers_tenant ON charter_customers(tenant_id);
CREATE INDEX IF NOT EXISTS idx_charter_customers_status ON charter_customers(tenant_id, account_status);
CREATE INDEX IF NOT EXISTS idx_charter_customers_company ON charter_customers(tenant_id, company_name);

-- ============================================
-- CHARTER CUSTOMER CONTACTS
-- ============================================

CREATE TABLE IF NOT EXISTS charter_customer_contacts (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL DEFAULT 'default',
  customer_id TEXT NOT NULL REFERENCES charter_customers(id) ON DELETE CASCADE,

  -- Contact details
  first_name TEXT NOT NULL,
  last_name TEXT NOT NULL,
  role TEXT,  -- e.g., "Booking Manager", "Accounts", "Director"
  email TEXT,
  phone TEXT,
  mobile TEXT,

  -- Flags
  is_primary INTEGER DEFAULT 0,
  receives_invoices INTEGER DEFAULT 0,
  receives_quotes INTEGER DEFAULT 0,

  -- Metadata
  notes TEXT,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now')),
  deleted_at TEXT
);

CREATE INDEX IF NOT EXISTS idx_customer_contacts_customer ON charter_customer_contacts(customer_id);

-- ============================================
-- CHARTERS (Booking Container)
-- ============================================

CREATE TABLE IF NOT EXISTS charters (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL DEFAULT 'default',
  customer_id TEXT NOT NULL REFERENCES charter_customers(id),

  -- Reference
  charter_number TEXT NOT NULL,  -- Auto-generated: CHT-2026-0001

  -- Details
  name TEXT,  -- Event/booking name: "Smith Wedding", "School Excursion"
  description TEXT,

  -- Status workflow: enquiry -> quoted -> confirmed -> completed -> invoiced -> paid
  status TEXT DEFAULT 'enquiry',

  -- Cancellation
  cancelled_at TEXT,
  cancellation_reason TEXT,

  -- Dates
  booking_date TEXT NOT NULL,  -- When booking was made
  event_date TEXT,  -- Primary event date (for sorting/display)

  -- Financials (aggregated from trips)
  quoted_total REAL DEFAULT 0,
  invoiced_total REAL DEFAULT 0,
  paid_total REAL DEFAULT 0,

  -- Contact for this booking (may differ from primary)
  contact_id TEXT REFERENCES charter_customer_contacts(id),

  -- Metadata
  notes TEXT,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now')),
  deleted_at TEXT,

  UNIQUE(tenant_id, charter_number)
);

CREATE INDEX IF NOT EXISTS idx_charters_tenant ON charters(tenant_id);
CREATE INDEX IF NOT EXISTS idx_charters_customer ON charters(customer_id);
CREATE INDEX IF NOT EXISTS idx_charters_status ON charters(tenant_id, status);
CREATE INDEX IF NOT EXISTS idx_charters_event_date ON charters(tenant_id, event_date);
CREATE INDEX IF NOT EXISTS idx_charters_number ON charters(tenant_id, charter_number);

-- ============================================
-- CHARTER NOTES (Timestamped notes history)
-- ============================================

CREATE TABLE IF NOT EXISTS charter_notes (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL DEFAULT 'default',
  charter_id TEXT NOT NULL REFERENCES charters(id) ON DELETE CASCADE,

  note_text TEXT NOT NULL,
  created_by TEXT,
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_charter_notes_charter ON charter_notes(charter_id);

-- ============================================
-- CHARTER TRIPS (Individual Legs)
-- ============================================

CREATE TABLE IF NOT EXISTS charter_trips (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL DEFAULT 'default',
  charter_id TEXT NOT NULL REFERENCES charters(id) ON DELETE CASCADE,

  -- Trip reference
  trip_number INTEGER NOT NULL,  -- Sequential within charter: 1, 2, 3...
  name TEXT,  -- Optional name: "Outbound", "Return", "Day 2 Morning"

  -- Schedule
  trip_date TEXT NOT NULL,
  pickup_time TEXT NOT NULL,  -- HH:MM format
  estimated_end_time TEXT,
  estimated_duration_mins INTEGER,

  -- Passenger info
  passenger_count INTEGER NOT NULL DEFAULT 1,
  passenger_notes TEXT,  -- "3 wheelchairs", "includes 5 children"

  -- Pickup location
  pickup_name TEXT NOT NULL,
  pickup_address TEXT,
  pickup_lat REAL,
  pickup_lng REAL,
  pickup_notes TEXT,  -- "Meet at main entrance"

  -- Dropoff location
  dropoff_name TEXT NOT NULL,
  dropoff_address TEXT,
  dropoff_lat REAL,
  dropoff_lng REAL,
  dropoff_notes TEXT,

  -- Vehicle requirements
  vehicle_capacity_required INTEGER,
  vehicle_features_required TEXT,  -- JSON array of feature codes: ["wheelchair", "ac", "toilet"]

  -- Pre-assignment (optional)
  assigned_vehicle_id TEXT REFERENCES vehicles(id),
  assigned_driver_id TEXT REFERENCES employees(id),

  -- Operational status: draft -> booked -> in_progress -> completed | cancelled
  operational_status TEXT DEFAULT 'draft',

  -- Billing status: not_invoiced -> invoiced -> paid
  billing_status TEXT DEFAULT 'not_invoiced',

  -- Cancellation
  cancelled_at TEXT,
  cancellation_reason TEXT,

  -- Special requirements
  special_instructions TEXT,

  -- Metadata
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now')),
  deleted_at TEXT
);

CREATE INDEX IF NOT EXISTS idx_charter_trips_charter ON charter_trips(charter_id);
CREATE INDEX IF NOT EXISTS idx_charter_trips_date ON charter_trips(tenant_id, trip_date);
CREATE INDEX IF NOT EXISTS idx_charter_trips_status ON charter_trips(tenant_id, operational_status);
CREATE INDEX IF NOT EXISTS idx_charter_trips_dispatch ON charter_trips(tenant_id, trip_date, operational_status)
  WHERE operational_status = 'booked';

-- ============================================
-- CHARTER TRIP STOPS (Multi-stop support)
-- ============================================

CREATE TABLE IF NOT EXISTS charter_trip_stops (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL DEFAULT 'default',
  trip_id TEXT NOT NULL REFERENCES charter_trips(id) ON DELETE CASCADE,

  -- Stop sequence (between pickup and dropoff)
  sequence INTEGER NOT NULL,

  -- Location
  stop_name TEXT NOT NULL,
  stop_address TEXT,
  stop_lat REAL,
  stop_lng REAL,

  -- Timing
  estimated_arrival TEXT,  -- HH:MM
  stop_duration_mins INTEGER DEFAULT 0,  -- How long at this stop

  -- Details
  stop_type TEXT DEFAULT 'stop',  -- stop, pickup, dropoff, break
  notes TEXT,

  -- Passenger changes
  passengers_on INTEGER DEFAULT 0,   -- Boarding at this stop
  passengers_off INTEGER DEFAULT 0,  -- Alighting at this stop

  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_trip_stops_trip ON charter_trip_stops(trip_id);

-- ============================================
-- CHARTER TRIP LINE ITEMS (Billing)
-- ============================================

CREATE TABLE IF NOT EXISTS charter_trip_line_items (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL DEFAULT 'default',
  trip_id TEXT NOT NULL REFERENCES charter_trips(id) ON DELETE CASCADE,

  -- Line item details
  item_type TEXT NOT NULL,  -- base_rate, per_km, waiting, tolls, parking, admin, other
  description TEXT NOT NULL,

  -- Pricing
  quantity REAL DEFAULT 1,
  unit_price REAL NOT NULL,
  total_price REAL NOT NULL,  -- quantity * unit_price

  -- Tax
  is_taxable INTEGER DEFAULT 1,  -- GST applicable
  tax_amount REAL DEFAULT 0,

  -- Display
  display_order INTEGER DEFAULT 0,
  is_hidden INTEGER DEFAULT 0,  -- Hidden from customer-facing documents

  -- Metadata
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_trip_line_items_trip ON charter_trip_line_items(trip_id);

-- ============================================
-- CHARTER DOCUMENTS (Generated PDFs)
-- ============================================

CREATE TABLE IF NOT EXISTS charter_documents (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL DEFAULT 'default',
  charter_id TEXT NOT NULL REFERENCES charters(id) ON DELETE CASCADE,

  -- Document info
  document_type TEXT NOT NULL,  -- quote, invoice, booking_confirmation, run_sheet, statement
  document_number TEXT,  -- INV-2026-0001, QUO-2026-0001

  -- Status
  status TEXT DEFAULT 'draft',  -- draft, sent, viewed, paid

  -- Dates
  issue_date TEXT,
  due_date TEXT,  -- For invoices
  sent_at TEXT,

  -- Totals (snapshot at generation time)
  subtotal REAL,
  tax_total REAL,
  grand_total REAL,

  -- Storage (could be R2 bucket path or base64)
  file_path TEXT,

  -- Email tracking
  sent_to_email TEXT,

  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_charter_documents_charter ON charter_documents(charter_id);
CREATE INDEX IF NOT EXISTS idx_charter_documents_type ON charter_documents(tenant_id, document_type);

-- ============================================
-- INSERT DEFAULT VEHICLE FEATURES
-- ============================================

INSERT OR IGNORE INTO vehicle_features (id, tenant_id, code, name, description, display_order) VALUES
  ('vf_wheelchair', 'default', 'wheelchair', 'Wheelchair Accessible', 'Vehicle has wheelchair ramp/lift and tie-down points', 1),
  ('vf_ac', 'default', 'ac', 'Air Conditioning', 'Vehicle has working air conditioning', 2),
  ('vf_toilet', 'default', 'toilet', 'Onboard Toilet', 'Vehicle has toilet facilities', 3),
  ('vf_luggage', 'default', 'luggage', 'Luggage Storage', 'Vehicle has dedicated luggage compartment', 4),
  ('vf_wifi', 'default', 'wifi', 'WiFi', 'Vehicle has passenger WiFi', 5),
  ('vf_usb', 'default', 'usb', 'USB Charging', 'Seats have USB charging ports', 6),
  ('vf_seatbelts', 'default', 'seatbelts', 'Seatbelts', 'All seats have seatbelts fitted', 7),
  ('vf_video', 'default', 'video', 'Video/Entertainment', 'Vehicle has video/entertainment system', 8);
