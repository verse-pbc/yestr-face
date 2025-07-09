import { Env, HealthCheckResponse } from '../types';
import { getCorsHeaders } from '../utils/cors';

export async function handleHealth(request: Request, env: Env): Promise<Response> {
  const startTime = Date.now();

  // Check R2 connectivity
  let r2Status: 'connected' | 'error' = 'error';
  try {
    // Try to list with limit 1 to check connectivity
    await env.AVATAR_BUCKET.list({ limit: 1 });
    r2Status = 'connected';
  } catch (error) {
    console.error('R2 health check failed:', error);
  }

  // Check KV connectivity
  let kvStatus: 'connected' | 'error' = 'error';
  try {
    // Try to get a non-existent key to check connectivity
    await env.PROFILE_KV.get('health-check-' + Date.now());
    kvStatus = 'connected';
  } catch (error) {
    console.error('KV health check failed:', error);
  }

  // For now, relay status is always 'connected' as we create connections on demand
  const relayStatus: 'connected' | 'error' = 'connected';

  // Determine overall health status
  let overallStatus: 'healthy' | 'degraded' | 'unhealthy' = 'healthy';
  if (r2Status === 'error' && kvStatus === 'error') {
    overallStatus = 'unhealthy';
  } else if (r2Status === 'error' || kvStatus === 'error') {
    overallStatus = 'degraded';
  }

  const response: HealthCheckResponse = {
    status: overallStatus,
    version: '1.0.0',
    timestamp: Date.now(),
    services: {
      r2: r2Status,
      kv: kvStatus,
      relay: relayStatus,
    },
  };

  const headers = new Headers(getCorsHeaders(request, env));
  headers.set('Content-Type', 'application/json');
  headers.set('X-Response-Time', `${Date.now() - startTime}ms`);

  return new Response(JSON.stringify(response, null, 2), {
    status: overallStatus === 'unhealthy' ? 503 : 200,
    headers,
  });
}
