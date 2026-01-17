## Summary

Build a comprehensive Charter module for managing customer accounts and charter bookings. This is a major new module that integrates with the existing Dispatch system, enabling the business to handle complex multi-leg tour bookings with full quote-to-invoice workflow.

## Business Value

- **Revenue tracking**: Full visibility into charter bookings, quotes, and invoicing
- **Operational efficiency**: Charter trips flow directly into Dispatch for assignment
- **Customer management**: CRM capabilities with booking history and account management
- **Smart assignments**: Location data enables intelligent driver/vehicle suggestions based on proximity

## User Story

As a dispatcher, I want to manage charter bookings from enquiry through to payment, so that I can track all charter work, generate professional documents, and seamlessly integrate charter trips into daily dispatch operations.

---

## Data Model

```
customers
    └── charters (the booking container)
            └── charter_trips (individual legs/journeys)
                    └── trip_line_items (itemized billing)
```

### Entity Relationships
- A **Customer** has many **Charters**
- A **Charter** has many **Trips**
- A **Trip** has many **Line Items**
- A **Trip** can be assigned to a **Driver** and **Vehicle** (pre-assignment)
- Trips with status "Booked" appear in **Dispatch** automatically

---

## Requirements

### Phase 1: Foundation

#### Customer Management
- [ ] Customer CRUD (create, read, update, soft delete)
- [ ] Company details: name, ABN, billing address, physical address
- [ ] Multiple contacts per customer (name, role, phone, email, primary flag)
- [ ] Account settings: payment terms (days), credit limit, account status (active/on-hold/closed)
- [ ] Customer notes with timestamps
- [ ] Booking history view (list of all charters for customer)
- [ ] Customer search and filtering

#### Charter Management
- [ ] Charter CRUD operations
- [ ] Charter status workflow: Enquiry → Quoted → Confirmed → Completed → Invoiced → Paid
- [ ] Cancelled status with cancellation reason and date
- [ ] Charter details: reference number (auto-generated), customer link, booking date, event name/description
- [ ] Charter notes with timestamps
- [ ] Charter summary view showing all trips

#### Trip Management
- [ ] Trip CRUD within a charter
- [ ] Trip operational status: Draft → Booked → In Progress → Completed → Cancelled
- [ ] Trip billing status: Not Invoiced → Invoiced → Paid
- [ ] Trip details:
  - Date and time (pickup time, estimated end time)
  - Passenger count
  - Vehicle requirements (capacity needed + features: wheelchair, A/C, luggage, toilet, etc.)
  - Special instructions/notes
- [ ] **Location capture with override capability**:
  - Pickup location: name, address, lat/lng (Nominatim autocomplete + manual override)
  - Dropoff location: name, address, lat/lng (Nominatim autocomplete + manual override)
  - User can edit any field including coordinates
- [ ] Multi-stop support (optional intermediate stops)
- [ ] Trip duplication (copy trip for return journey)

---

### Phase 2: Billing & Documents

#### Trip Line Items
- [ ] Line item types: Base rate, Per KM, Waiting time, Tolls, Parking, Admin fee, Other
- [ ] Each line item: description, quantity, unit price, total, GST applicable flag
- [ ] **Hidden line items**: Flag to hide from customer-facing documents (e.g., internal admin fees)
- [ ] Line item templates (pre-defined common charges)

#### Billing Views
- [ ] Trip-level billing summary
- [ ] Charter-level billing summary (aggregate all trips)
- [ ] Show/hide itemization toggle for customer documents

#### Document Generation (PDF)
- [ ] **Quote**: Customer details, trip summary, itemized or summary pricing, terms & conditions
- [ ] **Tax Invoice**: Invoice number, ABN, itemized charges, GST breakdown, payment terms, due date
- [ ] Company branding (logo, header, footer)
- [ ] Email document to customer (or download)

---

### Phase 3: Dispatch Integration

#### Auto-Population
- [ ] Trips with status "Booked" automatically appear in Dispatch for their scheduled date
- [ ] Display as unassigned charter work (distinguished from roster duties)
- [ ] Show customer name, pickup/dropoff, passenger count, vehicle requirements

#### Pre-Assignment
- [ ] Allow driver pre-assignment in trip management screen
- [ ] Allow vehicle pre-assignment in trip management screen
- [ ] **Conflict checking**: Warn if driver/vehicle already assigned to other work at that time
- [ ] Pre-assignments carry through to Dispatch

#### Smart Assignment Support
- [ ] Location data (lat/lng) available for proximity calculations
- [ ] Foundation for suggesting drivers whose last duty ends near charter pickup
- [ ] Foundation for minimizing deadhead (empty running)

#### Driver Run Sheet
- [ ] Generate run sheet PDF for driver
- [ ] Includes: Trip details, pickup/dropoff locations, passenger info, special instructions, contact numbers

---

### Phase 4: Advanced Features

#### Additional Documents
- [ ] Booking Confirmation PDF (sent when charter confirmed)
- [ ] Statement PDF (all outstanding invoices for a customer)

#### Export & Integration
- [ ] CSV export of invoices/billing data (for manual Xero import)
- [ ] Export format compatible with Xero invoice import
- [ ] Future: Direct Xero API integration (separate issue)

#### Reporting
- [ ] Charter revenue by period
- [ ] Customer spending history
- [ ] Outstanding invoices aging report

---

## UI/UX

### Navigation
- New "Charters" menu item in main navigation
- Sub-sections: Customers | Bookings | (future: Reports)

### Customers Screen
- Table view with search/filter (similar to Employees screen)
- Click to view/edit customer modal with tabs: Details | Contacts | Bookings | Notes

### Charters Screen
- List view of all charters with status badges
- Filter by status, customer, date range
- Click to open charter detail view

### Charter Detail View
- Header: Charter reference, customer, status, dates
- Trips section: List/card view of all trips with status indicators
- Billing section: Summary totals, itemization toggle
- Actions: Generate Quote, Generate Invoice, Change Status

### Trip Editor Modal
- Location fields with Nominatim autocomplete + edit capability
- Vehicle requirements checkboxes
- Line items table with add/edit/delete/hide

---

## Technical Notes

### Database Tables (proposed)
```sql
charter_customers (or extend existing customers table)
charter_customer_contacts
charters
charter_notes
charter_trips
charter_trip_stops
charter_trip_line_items
charter_documents
```

### Affected Files
- **Frontend**: New charters.js module, updates to dispatch.js for charter display
- **Backend**: New route files charters.ts, charter-trips.ts, charter-customers.ts
- **Shared**: PDF generation utility (new capability)

### Related Features
- Dispatch integration (charter trips appear as assignable work)
- Vehicle features (need to track vehicle capabilities for requirement matching)
- Smart assignments (location-based suggestions)

---

## Out of Scope (Future Considerations)

- Customer self-service portal
- Online booking/quote requests
- Recurring charter templates
- Direct Xero API integration (separate issue)
- SMS notifications
- Real-time vehicle tracking

---

## Acceptance Criteria

### Phase 1 Complete When:
- [ ] Can create and manage customers with contacts
- [ ] Can create charters and progress through status workflow
- [ ] Can add trips to charters with locations (autocomplete + override)
- [ ] Can specify vehicle requirements on trips
- [ ] Data persists correctly in database

### Phase 2 Complete When:
- [ ] Can add itemized line items to trips (with hide option)
- [ ] Can view billing summary at trip and charter level
- [ ] Can generate Quote PDF
- [ ] Can generate Tax Invoice PDF

### Phase 3 Complete When:
- [ ] Booked charter trips appear in Dispatch view
- [ ] Can pre-assign driver/vehicle with conflict warnings
- [ ] Can generate Driver Run Sheet PDF
- [ ] Location data available for smart assignment calculations

---

*Created via /new-feature command*
