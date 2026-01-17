/**
 * Charter Customers API Routes
 * /api/charter-customers/*
 */

import { Env, json, error, uuid, parseBody } from '../index';
import { TENANT_ID } from '../constants';

interface CustomerInput {
  company_name: string;
  trading_name?: string;
  abn?: string;
  billing_address?: string;
  billing_suburb?: string;
  billing_state?: string;
  billing_postcode?: string;
  physical_address?: string;
  physical_suburb?: string;
  physical_state?: string;
  physical_postcode?: string;
  payment_terms?: number;
  credit_limit?: number;
  account_status?: string;
  primary_email?: string;
  primary_phone?: string;
  website?: string;
  notes?: string;
}

interface ContactInput {
  first_name: string;
  last_name: string;
  role?: string;
  email?: string;
  phone?: string;
  mobile?: string;
  is_primary?: number;
  receives_invoices?: number;
  receives_quotes?: number;
  notes?: string;
}

export async function handleCharterCustomers(
  request: Request,
  env: Env,
  segments: string[]
): Promise<Response> {
  const method = request.method;
  const id = segments[0];
  const subResource = segments[1];
  const contactId = segments[2];

  // GET /api/charter-customers
  if (method === 'GET' && !id) {
    return listCustomers(env, new URL(request.url).searchParams);
  }

  // GET /api/charter-customers/:id
  if (method === 'GET' && id && !subResource) {
    return getCustomer(env, id);
  }

  // GET /api/charter-customers/:id/contacts
  if (method === 'GET' && id && subResource === 'contacts' && !contactId) {
    return listContacts(env, id);
  }

  // POST /api/charter-customers
  if (method === 'POST' && !id) {
    const body = await parseBody<CustomerInput>(request);
    if (!body) return error('Invalid request body');
    return createCustomer(env, body);
  }

  // POST /api/charter-customers/:id/contacts
  if (method === 'POST' && id && subResource === 'contacts' && !contactId) {
    const body = await parseBody<ContactInput>(request);
    if (!body) return error('Invalid request body');
    return createContact(env, id, body);
  }

  // PUT /api/charter-customers/:id
  if (method === 'PUT' && id && !subResource) {
    const body = await parseBody<Partial<CustomerInput>>(request);
    if (!body) return error('Invalid request body');
    return updateCustomer(env, id, body);
  }

  // PUT /api/charter-customers/:id/contacts/:contactId
  if (method === 'PUT' && id && subResource === 'contacts' && contactId) {
    const body = await parseBody<Partial<ContactInput>>(request);
    if (!body) return error('Invalid request body');
    return updateContact(env, id, contactId, body);
  }

  // DELETE /api/charter-customers/:id
  if (method === 'DELETE' && id && !subResource) {
    return deleteCustomer(env, id);
  }

  // DELETE /api/charter-customers/:id/contacts/:contactId
  if (method === 'DELETE' && id && subResource === 'contacts' && contactId) {
    return deleteContact(env, id, contactId);
  }

  return error('Method not allowed', 405);
}

async function listCustomers(env: Env, params: URLSearchParams): Promise<Response> {
  const search = params.get('search');
  const status = params.get('status');
  const limit = Math.min(parseInt(params.get('limit') || '100'), 500);
  const offset = parseInt(params.get('offset') || '0');

  let query = `
    SELECT
      c.*,
      (SELECT COUNT(*) FROM charter_customer_contacts
       WHERE customer_id = c.id AND deleted_at IS NULL) as contact_count
    FROM charter_customers c
    WHERE c.tenant_id = ? AND c.deleted_at IS NULL
  `;
  const bindings: (string | number)[] = [TENANT_ID];

  if (search) {
    query += ` AND (c.company_name LIKE ? OR c.trading_name LIKE ? OR c.abn LIKE ?)`;
    const searchPattern = `%${search}%`;
    bindings.push(searchPattern, searchPattern, searchPattern);
  }

  if (status) {
    query += ` AND c.account_status = ?`;
    bindings.push(status);
  }

  query += ` ORDER BY c.company_name LIMIT ? OFFSET ?`;
  bindings.push(limit, offset);

  const result = await env.DB.prepare(query).bind(...bindings).all();

  // Count
  let countQuery = `SELECT COUNT(*) as total FROM charter_customers WHERE tenant_id = ? AND deleted_at IS NULL`;
  const countBindings: (string | number)[] = [TENANT_ID];
  if (search) {
    countQuery += ` AND (company_name LIKE ? OR trading_name LIKE ? OR abn LIKE ?)`;
    const searchPattern = `%${search}%`;
    countBindings.push(searchPattern, searchPattern, searchPattern);
  }
  if (status) {
    countQuery += ` AND account_status = ?`;
    countBindings.push(status);
  }

  const countResult = await env.DB.prepare(countQuery).bind(...countBindings).first<{ total: number }>();

  return json({
    success: true,
    data: result.results,
    meta: { total: countResult?.total || 0, limit, offset },
  });
}

async function getCustomer(env: Env, id: string): Promise<Response> {
  const customer = await env.DB.prepare(`
    SELECT * FROM charter_customers WHERE id = ? AND tenant_id = ? AND deleted_at IS NULL
  `).bind(id, TENANT_ID).first();

  if (!customer) return error('Customer not found', 404);

  // Get contacts
  const contacts = await env.DB.prepare(`
    SELECT * FROM charter_customer_contacts
    WHERE customer_id = ? AND tenant_id = ? AND deleted_at IS NULL
    ORDER BY is_primary DESC, last_name, first_name
  `).bind(id, TENANT_ID).all();

  return json({
    success: true,
    data: {
      ...customer,
      contacts: contacts.results
    }
  });
}

async function createCustomer(env: Env, input: CustomerInput): Promise<Response> {
  if (!input.company_name) {
    return error('company_name is required');
  }

  const id = uuid();
  const now = new Date().toISOString();

  await env.DB.prepare(`
    INSERT INTO charter_customers (
      id, tenant_id, company_name, trading_name, abn,
      billing_address, billing_suburb, billing_state, billing_postcode,
      physical_address, physical_suburb, physical_state, physical_postcode,
      payment_terms, credit_limit, account_status,
      primary_email, primary_phone, website, notes,
      created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).bind(
    id, TENANT_ID, input.company_name,
    input.trading_name || null,
    input.abn || null,
    input.billing_address || null,
    input.billing_suburb || null,
    input.billing_state || null,
    input.billing_postcode || null,
    input.physical_address || null,
    input.physical_suburb || null,
    input.physical_state || null,
    input.physical_postcode || null,
    input.payment_terms ?? 14,
    input.credit_limit ?? 0,
    input.account_status || 'active',
    input.primary_email || null,
    input.primary_phone || null,
    input.website || null,
    input.notes || null,
    now, now
  ).run();

  return getCustomer(env, id);
}

async function updateCustomer(env: Env, id: string, input: Partial<CustomerInput>): Promise<Response> {
  const existing = await env.DB.prepare(`
    SELECT id FROM charter_customers WHERE id = ? AND tenant_id = ? AND deleted_at IS NULL
  `).bind(id, TENANT_ID).first();

  if (!existing) return error('Customer not found', 404);

  const updates: string[] = [];
  const bindings: (string | number | null)[] = [];

  const fields: (keyof CustomerInput)[] = [
    'company_name', 'trading_name', 'abn',
    'billing_address', 'billing_suburb', 'billing_state', 'billing_postcode',
    'physical_address', 'physical_suburb', 'physical_state', 'physical_postcode',
    'payment_terms', 'credit_limit', 'account_status',
    'primary_email', 'primary_phone', 'website', 'notes'
  ];

  for (const field of fields) {
    if (field in input) {
      updates.push(`${field} = ?`);
      bindings.push(input[field] ?? null);
    }
  }

  if (updates.length === 0) return error('No fields to update');

  updates.push('updated_at = ?');
  bindings.push(new Date().toISOString(), id, TENANT_ID);

  await env.DB.prepare(`
    UPDATE charter_customers SET ${updates.join(', ')} WHERE id = ? AND tenant_id = ?
  `).bind(...bindings).run();

  return getCustomer(env, id);
}

async function deleteCustomer(env: Env, id: string): Promise<Response> {
  const result = await env.DB.prepare(`
    UPDATE charter_customers SET deleted_at = ?, updated_at = ?
    WHERE id = ? AND tenant_id = ? AND deleted_at IS NULL
  `).bind(new Date().toISOString(), new Date().toISOString(), id, TENANT_ID).run();

  if (result.meta.changes === 0) return error('Customer not found', 404);
  return json({ success: true });
}

async function listContacts(env: Env, customerId: string): Promise<Response> {
  // Verify customer exists
  const customer = await env.DB.prepare(`
    SELECT id FROM charter_customers WHERE id = ? AND tenant_id = ? AND deleted_at IS NULL
  `).bind(customerId, TENANT_ID).first();

  if (!customer) return error('Customer not found', 404);

  const contacts = await env.DB.prepare(`
    SELECT * FROM charter_customer_contacts
    WHERE customer_id = ? AND tenant_id = ? AND deleted_at IS NULL
    ORDER BY is_primary DESC, last_name, first_name
  `).bind(customerId, TENANT_ID).all();

  return json({ success: true, data: contacts.results });
}

async function createContact(env: Env, customerId: string, input: ContactInput): Promise<Response> {
  // Verify customer exists
  const customer = await env.DB.prepare(`
    SELECT id FROM charter_customers WHERE id = ? AND tenant_id = ? AND deleted_at IS NULL
  `).bind(customerId, TENANT_ID).first();

  if (!customer) return error('Customer not found', 404);

  if (!input.first_name || !input.last_name) {
    return error('first_name and last_name are required');
  }

  const id = uuid();
  const now = new Date().toISOString();

  await env.DB.prepare(`
    INSERT INTO charter_customer_contacts (
      id, tenant_id, customer_id,
      first_name, last_name, role,
      email, phone, mobile,
      is_primary, receives_invoices, receives_quotes,
      notes, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).bind(
    id, TENANT_ID, customerId,
    input.first_name, input.last_name,
    input.role || null,
    input.email || null,
    input.phone || null,
    input.mobile || null,
    input.is_primary ?? 0,
    input.receives_invoices ?? 0,
    input.receives_quotes ?? 0,
    input.notes || null,
    now, now
  ).run();

  const contact = await env.DB.prepare(`
    SELECT * FROM charter_customer_contacts WHERE id = ? AND tenant_id = ?
  `).bind(id, TENANT_ID).first();

  return json({ success: true, data: contact });
}

async function updateContact(
  env: Env,
  customerId: string,
  contactId: string,
  input: Partial<ContactInput>
): Promise<Response> {
  // Verify customer exists
  const customer = await env.DB.prepare(`
    SELECT id FROM charter_customers WHERE id = ? AND tenant_id = ? AND deleted_at IS NULL
  `).bind(customerId, TENANT_ID).first();

  if (!customer) return error('Customer not found', 404);

  // Verify contact exists and belongs to customer
  const existing = await env.DB.prepare(`
    SELECT id FROM charter_customer_contacts
    WHERE id = ? AND customer_id = ? AND tenant_id = ? AND deleted_at IS NULL
  `).bind(contactId, customerId, TENANT_ID).first();

  if (!existing) return error('Contact not found', 404);

  const updates: string[] = [];
  const bindings: (string | number | null)[] = [];

  const fields: (keyof ContactInput)[] = [
    'first_name', 'last_name', 'role',
    'email', 'phone', 'mobile',
    'is_primary', 'receives_invoices', 'receives_quotes',
    'notes'
  ];

  for (const field of fields) {
    if (field in input) {
      updates.push(`${field} = ?`);
      bindings.push(input[field] ?? null);
    }
  }

  if (updates.length === 0) return error('No fields to update');

  updates.push('updated_at = ?');
  bindings.push(new Date().toISOString(), contactId, TENANT_ID);

  await env.DB.prepare(`
    UPDATE charter_customer_contacts SET ${updates.join(', ')} WHERE id = ? AND tenant_id = ?
  `).bind(...bindings).run();

  const contact = await env.DB.prepare(`
    SELECT * FROM charter_customer_contacts WHERE id = ? AND tenant_id = ?
  `).bind(contactId, TENANT_ID).first();

  return json({ success: true, data: contact });
}

async function deleteContact(env: Env, customerId: string, contactId: string): Promise<Response> {
  // Verify customer exists
  const customer = await env.DB.prepare(`
    SELECT id FROM charter_customers WHERE id = ? AND tenant_id = ? AND deleted_at IS NULL
  `).bind(customerId, TENANT_ID).first();

  if (!customer) return error('Customer not found', 404);

  const result = await env.DB.prepare(`
    UPDATE charter_customer_contacts SET deleted_at = ?, updated_at = ?
    WHERE id = ? AND customer_id = ? AND tenant_id = ? AND deleted_at IS NULL
  `).bind(new Date().toISOString(), new Date().toISOString(), contactId, customerId, TENANT_ID).run();

  if (result.meta.changes === 0) return error('Contact not found', 404);
  return json({ success: true });
}
