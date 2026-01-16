/**
 * Employees API Routes
 * /api/employees/*
 */

import { Env, json, error, uuid, parseBody } from '../index';

interface Employee {
  id: string;
  tenant_id: string;
  depot_id: string | null;
  employee_number: string;
  first_name: string;
  last_name: string;
  email: string | null;
  phone: string | null;
  licence_number: string | null;
  licence_expiry: string | null;
  role: string;
  status: string;
  hire_date: string | null;
  notes: string | null;
  default_pay_type_id: string | null;
}

interface EmployeeInput {
  employee_number: string;
  first_name: string;
  last_name: string;
  email?: string;
  phone?: string;
  licence_number?: string;
  licence_expiry?: string;
  role?: string;
  status?: string;
  depot_id?: string;
  hire_date?: string;
  notes?: string;
  default_pay_type_id?: string;
}

interface DailyStatusInput {
  status: string;
  leave_type?: string;
  notes?: string;
}

const TENANT_ID = 'default'; // MVP: single tenant

export async function handleEmployees(
  request: Request,
  env: Env,
  segments: string[]
): Promise<Response> {
  const method = request.method;
  const id = segments[0];
  const subResource = segments[1];

  // GET /api/employees - List all
  if (method === 'GET' && !id) {
    return listEmployees(env, new URL(request.url).searchParams);
  }

  // GET /api/employees/:id - Get one
  if (method === 'GET' && id && !subResource) {
    return getEmployee(env, id);
  }

  // GET /api/employees/:id/status/:date - Get daily status
  if (method === 'GET' && id && subResource === 'status' && segments[2]) {
    return getEmployeeStatus(env, id, segments[2]);
  }

  // POST /api/employees - Create
  if (method === 'POST' && !id) {
    const body = await parseBody<EmployeeInput>(request);
    if (!body) return error('Invalid request body');
    return createEmployee(env, body);
  }

  // PUT /api/employees/:id - Update
  if (method === 'PUT' && id && !subResource) {
    const body = await parseBody<Partial<EmployeeInput>>(request);
    if (!body) return error('Invalid request body');
    return updateEmployee(env, id, body);
  }

  // PUT /api/employees/:id/status/:date - Set daily status
  if (method === 'PUT' && id && subResource === 'status' && segments[2]) {
    const body = await parseBody<DailyStatusInput>(request);
    if (!body) return error('Invalid request body');
    return setEmployeeStatus(env, id, segments[2], body);
  }

  // DELETE /api/employees/:id - Soft delete
  if (method === 'DELETE' && id && !subResource) {
    return deleteEmployee(env, id);
  }

  return error('Method not allowed', 405);
}

async function listEmployees(env: Env, params: URLSearchParams): Promise<Response> {
  const status = params.get('status');
  const role = params.get('role');
  const search = params.get('search');
  const limit = Math.min(parseInt(params.get('limit') || '100'), 500);
  const offset = parseInt(params.get('offset') || '0');

  let query = `
    SELECT * FROM employees 
    WHERE tenant_id = ? AND deleted_at IS NULL
  `;
  const bindings: (string | number)[] = [TENANT_ID];

  if (status) {
    query += ` AND status = ?`;
    bindings.push(status);
  }

  if (role) {
    query += ` AND role = ?`;
    bindings.push(role);
  }

  if (search) {
    query += ` AND (
      first_name LIKE ? OR 
      last_name LIKE ? OR 
      employee_number LIKE ? OR
      email LIKE ?
    )`;
    const searchPattern = `%${search}%`;
    bindings.push(searchPattern, searchPattern, searchPattern, searchPattern);
  }

  query += ` ORDER BY last_name, first_name LIMIT ? OFFSET ?`;
  bindings.push(limit, offset);

  const result = await env.DB.prepare(query).bind(...bindings).all();

  // Get total count
  let countQuery = `
    SELECT COUNT(*) as total FROM employees 
    WHERE tenant_id = ? AND deleted_at IS NULL
  `;
  const countBindings: (string | number)[] = [TENANT_ID];
  
  if (status) {
    countQuery += ` AND status = ?`;
    countBindings.push(status);
  }
  if (role) {
    countQuery += ` AND role = ?`;
    countBindings.push(role);
  }
  if (search) {
    countQuery += ` AND (first_name LIKE ? OR last_name LIKE ? OR employee_number LIKE ? OR email LIKE ?)`;
    const searchPattern = `%${search}%`;
    countBindings.push(searchPattern, searchPattern, searchPattern, searchPattern);
  }

  const countResult = await env.DB.prepare(countQuery).bind(...countBindings).first<{ total: number }>();

  return json({
    data: result.results,
    meta: {
      total: countResult?.total || 0,
      limit,
      offset,
    },
  });
}

async function getEmployee(env: Env, id: string): Promise<Response> {
  const result = await env.DB.prepare(`
    SELECT * FROM employees 
    WHERE id = ? AND tenant_id = ? AND deleted_at IS NULL
  `).bind(id, TENANT_ID).first();

  if (!result) {
    return error('Employee not found', 404);
  }

  return json({ data: result });
}

async function createEmployee(env: Env, input: EmployeeInput): Promise<Response> {
  // Validate required fields
  if (!input.employee_number || !input.first_name || !input.last_name) {
    return error('employee_number, first_name, and last_name are required');
  }

  // Check for duplicate employee number
  const existing = await env.DB.prepare(`
    SELECT id FROM employees 
    WHERE tenant_id = ? AND employee_number = ? AND deleted_at IS NULL
  `).bind(TENANT_ID, input.employee_number).first();

  if (existing) {
    return error('Employee number already exists');
  }

  const id = uuid();
  const now = new Date().toISOString();

  await env.DB.prepare(`
    INSERT INTO employees (
      id, tenant_id, employee_number, first_name, last_name,
      email, phone, licence_number, licence_expiry,
      role, status, depot_id, hire_date, notes, default_pay_type_id,
      created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).bind(
    id,
    TENANT_ID,
    input.employee_number,
    input.first_name,
    input.last_name,
    input.email || null,
    input.phone || null,
    input.licence_number || null,
    input.licence_expiry || null,
    input.role || 'driver',
    input.status || 'active',
    input.depot_id || null,
    input.hire_date || null,
    input.notes || null,
    input.default_pay_type_id || null,
    now,
    now
  ).run();

  return getEmployee(env, id);
}

async function updateEmployee(env: Env, id: string, input: Partial<EmployeeInput>): Promise<Response> {
  // Check exists
  const existing = await env.DB.prepare(`
    SELECT id FROM employees 
    WHERE id = ? AND tenant_id = ? AND deleted_at IS NULL
  `).bind(id, TENANT_ID).first();

  if (!existing) {
    return error('Employee not found', 404);
  }

  // Check duplicate employee number if changing
  if (input.employee_number) {
    const duplicate = await env.DB.prepare(`
      SELECT id FROM employees 
      WHERE tenant_id = ? AND employee_number = ? AND id != ? AND deleted_at IS NULL
    `).bind(TENANT_ID, input.employee_number, id).first();

    if (duplicate) {
      return error('Employee number already exists');
    }
  }

  // Build dynamic update
  const updates: string[] = [];
  const bindings: (string | number | null)[] = [];

  const fields: (keyof EmployeeInput)[] = [
    'employee_number', 'first_name', 'last_name', 'email', 'phone',
    'licence_number', 'licence_expiry', 'role', 'status', 'depot_id', 
    'hire_date', 'notes', 'default_pay_type_id'
  ];

  for (const field of fields) {
    if (field in input) {
      updates.push(`${field} = ?`);
      bindings.push(input[field] ?? null);
    }
  }

  if (updates.length === 0) {
    return error('No fields to update');
  }

  updates.push('updated_at = ?');
  bindings.push(new Date().toISOString());
  bindings.push(id, TENANT_ID);

  await env.DB.prepare(`
    UPDATE employees SET ${updates.join(', ')}
    WHERE id = ? AND tenant_id = ?
  `).bind(...bindings).run();

  return getEmployee(env, id);
}

async function deleteEmployee(env: Env, id: string): Promise<Response> {
  const result = await env.DB.prepare(`
    UPDATE employees 
    SET deleted_at = ?, updated_at = ?
    WHERE id = ? AND tenant_id = ? AND deleted_at IS NULL
  `).bind(
    new Date().toISOString(),
    new Date().toISOString(),
    id,
    TENANT_ID
  ).run();

  if (result.meta.changes === 0) {
    return error('Employee not found', 404);
  }

  return json({ success: true });
}

async function getEmployeeStatus(env: Env, employeeId: string, date: string): Promise<Response> {
  const status = await env.DB.prepare(`
    SELECT * FROM employee_daily_status
    WHERE employee_id = ? AND date = ?
  `).bind(employeeId, date).first();

  if (!status) {
    return json({ data: { employee_id: employeeId, date, status: 'available' } });
  }

  return json({ data: status });
}

async function setEmployeeStatus(
  env: Env,
  employeeId: string,
  date: string,
  input: DailyStatusInput
): Promise<Response> {
  // Verify employee exists
  const employee = await env.DB.prepare(`
    SELECT id FROM employees 
    WHERE id = ? AND tenant_id = ? AND deleted_at IS NULL
  `).bind(employeeId, TENANT_ID).first();

  if (!employee) {
    return error('Employee not found', 404);
  }

  const id = uuid();
  const now = new Date().toISOString();

  // Upsert
  await env.DB.prepare(`
    INSERT INTO employee_daily_status (id, employee_id, date, status, leave_type, notes, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT (employee_id, date) DO UPDATE SET
      status = excluded.status,
      leave_type = excluded.leave_type,
      notes = excluded.notes,
      updated_at = excluded.updated_at
  `).bind(
    id,
    employeeId,
    date,
    input.status,
    input.leave_type || null,
    input.notes || null,
    now,
    now
  ).run();

  return getEmployeeStatus(env, employeeId, date);
}
