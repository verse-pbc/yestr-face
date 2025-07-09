// Cloudflare Worker Environment
export interface Env {
  // R2 bucket binding
  AVATAR_BUCKET: R2Bucket;

  // KV namespace binding
  PROFILE_KV: KVNamespace;

  // Environment variables
  RELAY_URL: string;
  MAX_IMAGE_SIZE: string;
  IMAGE_CACHE_DURATION: string;
  DEFAULT_CACHE_CONTROL: string;
  ALLOWED_IMAGE_TYPES: string;

  // Secrets
  R2_ACCESS_KEY_ID?: string;
  R2_SECRET_ACCESS_KEY?: string;
  ALLOWED_ORIGINS?: string;
  IMAGE_PROXY_SECRET: string;
}

// Nostr types
export interface NostrEvent {
  id: string;
  pubkey: string;
  created_at: number;
  kind: number;
  tags: string[][];
  content: string;
  sig: string;
}

export interface NostrProfile {
  pubkey: string;
  name?: string;
  display_name?: string;
  about?: string;
  picture?: string;
  banner?: string;
  nip05?: string;
  lud16?: string;
  created_at: number;
}

// Storage types
export interface ProfileMetadata {
  pubkey: string;
  originalUrl: string;
  sizes: {
    [size: string]: {
      key: string;
      contentType: string;
      etag: string;
      lastModified: number;
    };
  };
  fetchedAt: number;
  profileUpdatedAt: number;
  failureCount?: number;
  lastFailure?: number;
}

export interface ImageProcessingOptions {
  width?: number;
  height?: number;
  format?: 'webp' | 'jpeg' | 'png';
  quality?: number;
}

export interface ProcessedImage {
  buffer: ArrayBuffer;
  contentType: string;
  width: number;
  height: number;
  size: number;
}

// API types
export interface AvatarRequest {
  pubkey: string;
  size?: number;
  format?: 'webp' | 'jpeg' | 'png';
}

export interface HealthCheckResponse {
  status: 'healthy' | 'degraded' | 'unhealthy';
  version: string;
  timestamp: number;
  services: {
    r2: 'connected' | 'error';
    kv: 'connected' | 'error';
    relay: 'connected' | 'error';
  };
  stats?: {
    totalProfiles: number;
    totalImages: number;
    cacheHitRate: number;
  };
}

// Error types
export class ImageFetchError extends Error {
  constructor(
    message: string,
    public statusCode: number = 500,
    public originalUrl?: string,
  ) {
    super(message);
    this.name = 'ImageFetchError';
  }
}

export class ProfileNotFoundError extends Error {
  constructor(public pubkey: string) {
    super(`Profile not found: ${pubkey}`);
    this.name = 'ProfileNotFoundError';
  }
}
