import { Env } from './types';
import { handleHealth } from './handlers/health';
import { handleAvatar } from './handlers/avatar';
import { handleOptions, getCorsHeaders } from './utils/cors';
import { checkRateLimit } from './utils/rateLimit';

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);
    
    // Handle CORS preflight
    if (request.method === 'OPTIONS') {
      return handleOptions(request, env);
    }
    
    // Apply rate limiting (except for health checks)
    if (url.pathname !== '/health' && url.pathname !== '/') {
      const rateLimitResponse = await checkRateLimit(request, 'avatar', {
        windowMs: 60000, // 1 minute
        maxRequests: 60, // 60 requests per minute per IP
      });
      
      if (rateLimitResponse) {
        // Add CORS headers to rate limit response
        const headers = new Headers(rateLimitResponse.headers);
        const corsHeaders = getCorsHeaders(request, env);
        corsHeaders.forEach((value, key) => headers.set(key, value));
        
        return new Response(rateLimitResponse.body, {
          status: rateLimitResponse.status,
          headers,
        });
      }
    }
    
    // Route handling
    if (url.pathname === '/health' || url.pathname === '/') {
      return handleHealth(request, env);
    }
    
    // Avatar endpoint - extract pubkey from path
    const avatarMatch = url.pathname.match(/^\/avatar\/([0-9a-fA-F]{64})$/);
    if (avatarMatch && request.method === 'GET') {
      const pubkey = avatarMatch[1];
      return handleAvatar(request, env, { pubkey });
    }
    
    // 404 for unknown routes
    const headers = new Headers(getCorsHeaders(request, env));
    headers.set('Content-Type', 'application/json');
    
    return new Response(
      JSON.stringify({ error: 'Not found' }),
      { 
        status: 404,
        headers,
      }
    );
  },
  
  // Scheduled handler for background jobs
  async scheduled(event: ScheduledEvent, env: Env, ctx: ExecutionContext): Promise<void> {
    console.log(`Scheduled event at ${new Date(event.scheduledTime).toISOString()}`);
    
    switch (event.cron) {
      case '*/5 * * * *': // Every 5 minutes
        console.log('Running profile scanner...');
        
        // Import services dynamically to avoid issues with top-level imports
        const { NostrService } = await import('./services/nostr');
        const { StorageService } = await import('./services/storage');
        const { ProfileScanner } = await import('./services/profileScanner');
        
        const nostrService = new NostrService(env.RELAY_URL);
        const storageService = new StorageService(env);
        const scanner = new ProfileScanner(env, nostrService, storageService);
        
        try {
          // Scan for recent profiles
          await scanner.scanRecentProfiles(50); // Scan up to 50 profiles
          
          // Run cleanup once a day (at midnight)
          const hour = new Date(event.scheduledTime).getUTCHours();
          if (hour === 0) {
            console.log('Running daily cleanup...');
            await scanner.cleanupOldImages(30); // Clean images older than 30 days
          }
        } catch (error) {
          console.error('Error in scheduled job:', error);
        }
        break;
        
      default:
        console.log('Unknown cron trigger:', event.cron);
    }
  },
};