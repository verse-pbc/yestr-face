interface RateLimitOptions {
  windowMs: number;
  maxRequests: number;
}

export class RateLimiter {
  private requests: Map<string, number[]> = new Map();

  constructor(private options: RateLimitOptions) {}

  async isAllowed(identifier: string): Promise<boolean> {
    const now = Date.now();
    const windowStart = now - this.options.windowMs;

    // Get existing requests for this identifier
    const timestamps = this.requests.get(identifier) || [];

    // Filter out expired timestamps
    const validTimestamps = timestamps.filter((ts) => ts > windowStart);

    // Check if limit is exceeded
    if (validTimestamps.length >= this.options.maxRequests) {
      return false;
    }

    // Add current request
    validTimestamps.push(now);
    this.requests.set(identifier, validTimestamps);

    // Clean up old entries periodically
    if (Math.random() < 0.01) {
      // 1% chance
      this.cleanup();
    }

    return true;
  }

  private cleanup(): void {
    const now = Date.now();
    const windowStart = now - this.options.windowMs;

    for (const [identifier, timestamps] of this.requests.entries()) {
      const validTimestamps = timestamps.filter((ts) => ts > windowStart);
      if (validTimestamps.length === 0) {
        this.requests.delete(identifier);
      } else {
        this.requests.set(identifier, validTimestamps);
      }
    }
  }

  getRemainingRequests(identifier: string): number {
    const now = Date.now();
    const windowStart = now - this.options.windowMs;
    const timestamps = this.requests.get(identifier) || [];
    const validTimestamps = timestamps.filter((ts) => ts > windowStart);
    return Math.max(0, this.options.maxRequests - validTimestamps.length);
  }

  getResetTime(identifier: string): number {
    const timestamps = this.requests.get(identifier) || [];
    if (timestamps.length === 0) return 0;

    const oldestTimestamp = Math.min(...timestamps);
    return oldestTimestamp + this.options.windowMs;
  }
}

// Simple in-memory rate limiter for Workers
// In production, consider using Durable Objects for distributed rate limiting
const rateLimiters = new Map<string, RateLimiter>();

export function getRateLimiter(key: string, options: RateLimitOptions): RateLimiter {
  if (!rateLimiters.has(key)) {
    rateLimiters.set(key, new RateLimiter(options));
  }
  return rateLimiters.get(key)!;
}

export async function checkRateLimit(
  request: Request,
  limiterKey: string = 'global',
  options: RateLimitOptions = { windowMs: 60000, maxRequests: 60 },
): Promise<Response | null> {
  // Get client identifier (IP or CF-Connecting-IP)
  const clientIp =
    request.headers.get('CF-Connecting-IP') || request.headers.get('X-Forwarded-For') || 'unknown';

  const rateLimiter = getRateLimiter(limiterKey, options);
  const identifier = `${limiterKey}:${clientIp}`;

  if (!(await rateLimiter.isAllowed(identifier))) {
    const resetTime = rateLimiter.getResetTime(identifier);
    const retryAfter = Math.ceil((resetTime - Date.now()) / 1000);

    return new Response(
      JSON.stringify({
        error: 'Rate limit exceeded',
        retryAfter: retryAfter,
      }),
      {
        status: 429,
        headers: {
          'Content-Type': 'application/json',
          'Retry-After': retryAfter.toString(),
          'X-RateLimit-Limit': options.maxRequests.toString(),
          'X-RateLimit-Remaining': '0',
          'X-RateLimit-Reset': new Date(resetTime).toISOString(),
        },
      },
    );
  }

  // Request is allowed, return null to continue
  return null;
}
