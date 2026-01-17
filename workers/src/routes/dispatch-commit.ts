/**
 * Dispatch Commit API Routes
 * /api/dispatch/commit/*
 * 
 * Handles committing dispatch days and generating pay records
 * Phase 3 of Pay Management System
 */

import { Env, json, error, uuid } from '../index';
import { TENANT_ID } from '../constants';

interface CommitInput {
  date: string;
  scope: 'all' | 'individual';
  employee_id?: string;
  notes?: string;
}

// ============================================
// COMMIT STATUS
// ============================================

export async function getCommitStatus(env: Env, date: string): Promise<Response> {
  // Get all commits for this date
  const commits = await env.DB.prepare(`
    SELECT dc.*, e.first_name, e.last_name
    FROM dispatch_commits dc
    LEFT JOIN employees e ON dc.employee_id = e.id
    WHERE dc.tenant_id = ? AND dc.commit_date = ?
  `).bind(TENANT_ID, date).all();

  // Check if there's an 'all' commit
  const allCommit = (commits.results as any[]).find(c => c.scope === 'all');
  
  // Get individual commits
  const individualCommits = (commits.results as any[]).filter(c => c.scope === 'individual');

  return json({
    success: true,
    data: {
      date,
      is_fully_committed: !!allCommit,
      all_commit: allCommit || null,
      individual_commits: individualCommits,
      committed_employee_ids: individualCommits.map(c => c.employee_id)
    }
  });
}

// ============================================
// COMMIT DAY
// ============================================

export async function commitDay(env: Env, input: CommitInput): Promise<Response> {
  const { date, scope, employee_id, notes } = input;

  if (!date) {
    return error('Date is required');
  }

  if (scope === 'individual' && !employee_id) {
    return error('Employee ID is required for individual commit');
  }

  const now = new Date().toISOString();
  let commitId: string;

  // Check if already committed - if so, update timestamp instead of error
  const existingCommit = await env.DB.prepare(`
    SELECT id FROM dispatch_commits 
    WHERE tenant_id = ? AND commit_date = ? AND scope = ? AND (employee_id = ? OR (employee_id IS NULL AND ? IS NULL))
  `).bind(TENANT_ID, date, scope, employee_id || null, employee_id || null).first();

  if (existingCommit) {
    // Update existing commit timestamp
    commitId = (existingCommit as any).id;
    await env.DB.prepare(`
      UPDATE dispatch_commits SET committed_at = ?, notes = ? WHERE id = ?
    `).bind(now, notes || null, commitId).run();
  } else {
    // Create new commit record
    commitId = uuid();
    await env.DB.prepare(`
      INSERT INTO dispatch_commits (id, tenant_id, commit_date, scope, employee_id, committed_by, committed_at, notes)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).bind(commitId, TENANT_ID, date, scope, employee_id || null, 'system', now, notes || null).run();
  }

  // Generate pay records from duty lines (skips already-committed and cancelled)
  const payRecordsCreated = await generatePayRecords(env, date, scope, employee_id);

  // Audit log
  await env.DB.prepare(`
    INSERT INTO audit_log (id, tenant_id, entity_type, entity_id, action, changed_by, changed_at, notes)
    VALUES (?, ?, 'dispatch_commit', ?, ?, 'system', ?, ?)
  `).bind(
    uuid(), 
    TENANT_ID, 
    commitId, 
    existingCommit ? 'update' : 'create', 
    now, 
    `${existingCommit ? 'Re-committed' : 'Committed'} ${scope === 'all' ? 'all drivers' : 'individual driver'} for ${date}. ${payRecordsCreated} new records.`
  ).run();

  return json({
    success: true,
    data: {
      commit_id: commitId,
      date,
      scope,
      employee_id,
      pay_records_created: payRecordsCreated,
      was_update: !!existingCommit
    }
  }, existingCommit ? 200 : 201);
}

// ============================================
// GENERATE PAY RECORDS
// ============================================

async function generatePayRecords(
  env: Env, 
  date: string, 
  scope: 'all' | 'individual', 
  employeeId?: string
): Promise<number> {
  // Get all duty lines for this date from published rosters
  // Exclude cancelled duties (those with entries in dispatch_duty_cancellations)
  let rosterQuery = `
    SELECT 
      rdl.id as duty_line_id,
      rdl.duty_type,
      rdl.start_time,
      rdl.end_time,
      rdl.pay_type,
      re.driver_id,
      re.duty_block_id,
      stdb.name as block_name,
      st.id as shift_template_id,
      st.name as shift_name,
      e.default_pay_type_id,
      'roster' as source_type
    FROM roster_duty_lines rdl
    JOIN roster_entries re ON rdl.roster_entry_id = re.id
    JOIN rosters r ON re.roster_id = r.id
    JOIN shift_template_duty_blocks stdb ON re.duty_block_id = stdb.id
    JOIN shift_templates st ON stdb.shift_template_id = st.id
    LEFT JOIN employees e ON re.driver_id = e.id
    LEFT JOIN dispatch_duty_cancellations ddc ON rdl.id = ddc.roster_duty_line_id
    WHERE r.tenant_id = ?
      AND r.status = 'published'
      AND re.date = ?
      AND re.driver_id IS NOT NULL
      AND rdl.deleted_at IS NULL
      AND ddc.id IS NULL
  `;
  
  const rosterBindings: any[] = [TENANT_ID, date];
  
  if (scope === 'individual' && employeeId) {
    rosterQuery += ` AND re.driver_id = ?`;
    rosterBindings.push(employeeId);
  }

  const rosterDutyLines = await env.DB.prepare(rosterQuery).bind(...rosterBindings).all();

  // Get adhoc duty lines for this date
  let adhocQuery = `
    SELECT 
      dadl.id as duty_line_id,
      dadl.duty_type,
      dadl.start_time,
      dadl.end_time,
      dadl.pay_type,
      das.employee_id as driver_id,
      NULL as duty_block_id,
      'Adhoc' as block_name,
      NULL as shift_template_id,
      'ADHOC' as shift_name,
      e.default_pay_type_id,
      'adhoc' as source_type
    FROM dispatch_adhoc_duty_lines dadl
    JOIN dispatch_adhoc_shifts das ON dadl.adhoc_shift_id = das.id
    LEFT JOIN employees e ON das.employee_id = e.id
    WHERE das.tenant_id = ?
      AND das.date = ?
      AND das.deleted_at IS NULL
      AND dadl.deleted_at IS NULL
  `;
  
  const adhocBindings: any[] = [TENANT_ID, date];
  
  if (scope === 'individual' && employeeId) {
    adhocQuery += ` AND das.employee_id = ?`;
    adhocBindings.push(employeeId);
  }

  const adhocDutyLines = await env.DB.prepare(adhocQuery).bind(...adhocBindings).all();

  // Merge all duty lines
  const allDutyLines = [
    ...(rosterDutyLines.results || []),
    ...(adhocDutyLines.results || [])
  ] as any[];

  if (allDutyLines.length === 0) {
    return 0;
  }

  // Get pay types for rate lookup
  const payTypes = await env.DB.prepare(`
    SELECT id, code, hourly_rate FROM pay_types WHERE tenant_id = ? AND deleted_at IS NULL
  `).bind(TENANT_ID).all();

  const payTypeMap = new Map((payTypes.results as any[]).map(pt => [pt.code, pt]));
  const payTypeIdMap = new Map((payTypes.results as any[]).map(pt => [pt.id, pt]));

  const now = new Date().toISOString();
  let recordsCreated = 0;

  // Batch fetch all existing pay records for these duty lines (fixes N+1 query pattern)
  const dutyLineIds = allDutyLines.map(l => l.duty_line_id).filter(Boolean);
  let existingIds = new Set<string>();

  if (dutyLineIds.length > 0) {
    const placeholders = dutyLineIds.map(() => '?').join(',');
    const existingRecords = await env.DB.prepare(`
      SELECT source_duty_line_id FROM employee_pay_records
      WHERE source_duty_line_id IN (${placeholders})
    `).bind(...dutyLineIds).all();

    existingIds = new Set((existingRecords.results as any[]).map(r => r.source_duty_line_id));
  }

  for (const line of allDutyLines) {
    // Skip if pay record already exists for this duty line
    if (existingIds.has(line.duty_line_id)) continue;

    // Calculate hours
    const hours = (line.end_time - line.start_time);
    if (hours <= 0) continue;

    // Determine pay type: line pay_type -> employee default -> STD
    let payTypeCode = line.pay_type || 'STD';
    let payType = payTypeMap.get(payTypeCode);

    // If line has no pay type, check employee default
    if (!line.pay_type && line.default_pay_type_id) {
      const empDefault = payTypeIdMap.get(line.default_pay_type_id);
      if (empDefault) {
        payType = empDefault;
        payTypeCode = empDefault.code;
      }
    }

    // Fallback to STD if still not found
    if (!payType) {
      payType = payTypeMap.get('STD') || { id: null, code: 'STD', hourly_rate: 0 };
    }

    const rate = payType.hourly_rate || 0;
    const totalAmount = hours * rate;

    // Create pay record
    await env.DB.prepare(`
      INSERT INTO employee_pay_records (
        id, tenant_id, employee_id, work_date, 
        shift_template_id, shift_name, duty_block_id, duty_name,
        pay_type_id, pay_type_code, hours, rate, total_amount,
        source_duty_line_id, source_type, is_manual, notes,
        created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, NULL, ?, ?)
    `).bind(
      uuid(),
      TENANT_ID,
      line.driver_id,
      date,
      line.shift_template_id,
      line.shift_name,
      line.duty_block_id,
      line.block_name,
      payType.id,
      payTypeCode,
      hours,
      rate,
      totalAmount,
      line.duty_line_id,
      line.source_type,
      now,
      now
    ).run();

    recordsCreated++;
  }

  return recordsCreated;
}

// ============================================
// UNCOMMIT - DISABLED (P2.1)
// Commits are now permanent and additive-only.
// Pay record corrections should be made in HRM.
// ============================================

// Function retained but not exported for potential admin use
async function uncommitDay_DISABLED(env: Env, commitId: string): Promise<Response> {
  // Get commit info
  const commit = await env.DB.prepare(`
    SELECT * FROM dispatch_commits WHERE id = ? AND tenant_id = ?
  `).bind(commitId, TENANT_ID).first();

  if (!commit) {
    return error('Commit not found', 404);
  }

  const commitData = commit as any;
  const now = new Date().toISOString();

  // Delete associated pay records
  let deleteQuery = `
    DELETE FROM employee_pay_records 
    WHERE tenant_id = ? AND work_date = ? AND is_manual = 0
  `;
  const bindings: any[] = [TENANT_ID, commitData.commit_date];

  if (commitData.scope === 'individual') {
    deleteQuery += ` AND employee_id = ?`;
    bindings.push(commitData.employee_id);
  }

  await env.DB.prepare(deleteQuery).bind(...bindings).run();

  // Delete commit record
  await env.DB.prepare(`
    DELETE FROM dispatch_commits WHERE id = ?
  `).bind(commitId).run();

  // Audit log
  await env.DB.prepare(`
    INSERT INTO audit_log (id, tenant_id, entity_type, entity_id, action, changed_by, changed_at, notes)
    VALUES (?, ?, 'dispatch_commit', ?, 'delete', 'system', ?, ?)
  `).bind(uuid(), TENANT_ID, commitId, now, `Uncommitted ${commitData.commit_date}`).run();

  return json({ success: true });
}

// ============================================
// GET PAY RECORDS FOR DATE
// ============================================

export async function getPayRecordsForDate(env: Env, date: string): Promise<Response> {
  const records = await env.DB.prepare(`
    SELECT 
      epr.*,
      e.first_name,
      e.last_name,
      e.employee_number
    FROM employee_pay_records epr
    JOIN employees e ON epr.employee_id = e.id
    WHERE epr.tenant_id = ? AND epr.work_date = ?
    ORDER BY e.last_name, e.first_name, epr.shift_name
  `).bind(TENANT_ID, date).all();

  // Calculate totals
  const totals = {
    total_hours: 0,
    total_amount: 0,
    by_pay_type: {} as Record<string, { hours: number; amount: number }>
  };

  for (const rec of records.results as any[]) {
    totals.total_hours += rec.hours;
    totals.total_amount += rec.total_amount;
    
    if (!totals.by_pay_type[rec.pay_type_code]) {
      totals.by_pay_type[rec.pay_type_code] = { hours: 0, amount: 0 };
    }
    totals.by_pay_type[rec.pay_type_code].hours += rec.hours;
    totals.by_pay_type[rec.pay_type_code].amount += rec.total_amount;
  }

  return json({
    success: true,
    data: {
      records: records.results,
      totals
    }
  });
}
