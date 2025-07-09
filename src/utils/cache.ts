export function getCacheKey(pubkey: string, size?: number, format?: string): string {
  const parts = ['avatar', pubkey];
  if (size) parts.push(`s${size}`);
  if (format) parts.push(format);
  return parts.join(':');
}

export function getCacheHeaders(isHit: boolean, maxAge: number = 3600): Headers {
  const headers = new Headers();

  // Set cache control headers
  headers.set(
    'Cache-Control',
    `public, max-age=${maxAge}, s-maxage=${maxAge * 24}, stale-while-revalidate=${maxAge * 168}`,
  );

  // Add cache status header
  headers.set('X-Cache', isHit ? 'HIT' : 'MISS');
  headers.set('X-Cache-Date', new Date().toISOString());

  return headers;
}

export function shouldRevalidate(metadata: { fetchedAt: number }, maxAge: number): boolean {
  const age = Date.now() - metadata.fetchedAt;
  return age > maxAge * 1000;
}
