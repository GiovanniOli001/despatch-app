/**
 * Dispatch API Worker
 * Main entry point
 */

import { handleEmployees } from './routes/employees';
import { handleEmployeeFields } from './routes/employee-fields';
import { handleVehicles } from './routes/vehicles';
import { handleShifts } from './routes/shifts';
import { handleRoster } from './routes/roster';
import { handleDispatch } from './routes/dispatch';
import { handleConfig } from './routes/config';
import { handleOpsCalendar } from './routes/ops-calendar';
import { handlePayTypes } from './routes/pay-types';

export interface Env {
  DB: D1Database;
  ENVIRONMENT: string;
}

// CORS headers
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
};

// JSON response helper
export function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'Content-Type': 'application/json',
      ...corsHeaders,
    },
  });
}

// Error response helper
export function error(message: string, status = 400): Response {
  return json({ error: message }, status);
}

// Generate UUID
export function uuid(): string {
  return crypto.randomUUID();
}

// Parse request body
export async function parseBody<T>(request: Request): Promise<T | null> {
  try {
    return await request.json() as T;
  } catch {
    return null;
  }
}

// Router
export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    // Handle CORS preflight
    if (request.method === 'OPTIONS') {
      return new Response(null, { headers: corsHeaders });
    }

    const url = new URL(request.url);
    const path = url.pathname;
    const method = request.method;

    // API versioning
    if (!path.startsWith('/api/')) {
      return error('Not found', 404);
    }

    const apiPath = path.replace('/api/', '');
    const segments = apiPath.split('/').filter(Boolean);
    const resource = segments[0];

    try {
      // Route to handlers
      switch (resource) {
        case 'health':
          return json({ status: 'ok', environment: env.ENVIRONMENT, timestamp: new Date().toISOString() });

        case 'employees':
          return handleEmployees(request, env, segments.slice(1));

        case 'employee-fields':
          return handleEmployeeFields(request, env, segments.slice(1));

        case 'vehicles':
          return handleVehicles(request, env, segments.slice(1));

        case 'shifts':
          return handleShifts(request, env, segments.slice(1));

        case 'roster':
          return handleRoster(request, env, segments.slice(1));

        case 'dispatch':
          return handleDispatch(request, env, segments.slice(1));

        case 'config':
          return handleConfig(request, env, segments.slice(1));

        case 'ops-calendar':
          return handleOpsCalendar(request, env, segments.slice(1));

        case 'pay-types':
          return handlePayTypes(request, env, segments.slice(1));

        default:
          return error('Not found', 404);
      }
    } catch (err) {
      console.error('API Error:', err);
      return error(err instanceof Error ? err.message : 'Internal server error', 500);
    }
  },
};
