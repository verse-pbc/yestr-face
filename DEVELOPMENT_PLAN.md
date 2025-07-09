# Yestr Face - Profile Picture Proxy Server Development Plan

## Overview

Yestr Face is a Cloudflare Workers-based proxy server that caches Nostr profile pictures using R2 storage. It queries user profiles from relay.yestr.social, downloads profile pictures, and serves them with proper CORS headers to ensure reliable image loading in the Yestr web application.

## Architecture

### Components

1. **Cloudflare Worker** - Main application logic
2. **R2 Storage** - Object storage for profile pictures
3. **KV Store** - Metadata storage for profile mappings
4. **Durable Objects** (optional) - Rate limiting and queue management

### Data Flow

```
1. Worker receives request for profile picture
2. Check KV store for cached metadata
3. If exists and not expired:
   - Serve image from R2 with proper CORS headers
4. If not exists or expired:
   - Query relay.yestr.social for profile data
   - Download original profile picture
   - Store in R2 with optimized format
   - Update KV metadata
   - Serve image with CORS headers
```

## Technical Implementation

### 1. Worker Endpoints

#### GET `/avatar/:pubkey`

- Returns profile picture for given pubkey
- Parameters:
  - `pubkey`: Nostr public key (hex format)
  - `size`: Optional size parameter (e.g., ?size=200)
  - `format`: Optional format (webp, jpg, png)

#### POST `/webhook/profile-update`

- Webhook endpoint for profile updates
- Triggers re-fetch of profile picture

#### GET `/health`

- Health check endpoint
- Returns worker status and R2 connectivity

### 2. Profile Fetching Service

```typescript
interface ProfileFetcher {
  fetchProfile(pubkey: string): Promise<NostrProfile>;
  subscribeToProfiles(): AsyncGenerator<NostrProfile>;
}
```

- Connect to relay.yestr.social via WebSocket
- Query for kind:0 (profile metadata) events
- Parse profile data and extract picture URLs
- Handle various URL formats and protocols

### 3. Image Processing Pipeline

```typescript
interface ImageProcessor {
  downloadImage(url: string): Promise<ArrayBuffer>;
  optimizeImage(buffer: ArrayBuffer, options: ImageOptions): Promise<ProcessedImage>;
  generateSizes(image: ProcessedImage): Promise<ImageSizeMap>;
}
```

- Download images with timeout and retry logic
- Validate image format and size
- Optimize images (compress, resize, format conversion)
- Generate multiple sizes (thumbnail, medium, large)
- Convert to WebP for better compression

### 4. Storage Layer

#### R2 Storage Structure

```
/avatars/
  /{pubkey}/
    /original.{ext}
    /200x200.webp
    /400x400.webp
    /800x800.webp
```

#### KV Store Schema

```typescript
interface ProfileMetadata {
  pubkey: string;
  originalUrl: string;
  sizes: {
    [size: string]: {
      key: string;
      contentType: string;
      lastModified: number;
    };
  };
  fetchedAt: number;
  profileUpdatedAt: number;
}
```

### 5. Background Jobs

#### Profile Scanner

- Runs on cron schedule (every 5 minutes)
- Queries relay for recent profile updates
- Queues profiles for image processing

#### Image Refresh Job

- Runs daily
- Checks for stale images (>7 days old)
- Re-fetches updated profile pictures

#### Cleanup Job

- Runs weekly
- Removes orphaned images
- Cleans up failed downloads

## Security Considerations

1. **Rate Limiting**
   - Per-IP rate limiting on API endpoints
   - Queue throttling for background jobs

2. **Content Validation**
   - Verify image MIME types
   - Maximum file size limits (10MB)
   - Scan for malicious content

3. **CORS Policy**
   - Allow specific origins (yestr.app domains)
   - Proper preflight handling

4. **Access Control**
   - Optional API key authentication
   - Webhook signature verification

## Performance Optimizations

1. **Edge Caching**
   - Cache headers for CDN
   - Stale-while-revalidate strategy

2. **Image Optimization**
   - Lazy loading support (blur placeholders)
   - Progressive JPEG encoding
   - WebP with fallback

3. **Request Coalescing**
   - Deduplicate concurrent requests
   - Batch profile queries

## Monitoring & Analytics

1. **Metrics to Track**
   - Cache hit rate
   - Image processing time
   - Storage usage
   - Request latency
   - Error rates

2. **Logging**
   - Request logs
   - Error tracking
   - Performance metrics

## Development Phases

### Phase 1: MVP (Week 1)

- [x] Project setup with Wrangler
- [ ] Basic Worker with health endpoint
- [ ] R2 integration for image storage
- [ ] Simple profile fetch from relay
- [ ] Basic image proxy functionality

### Phase 2: Image Processing (Week 2)

- [ ] Image download with retry logic
- [ ] Image format validation
- [ ] Basic image optimization
- [ ] Multiple size generation

### Phase 3: Caching & Performance (Week 3)

- [ ] KV store for metadata
- [ ] Cache headers implementation
- [ ] Request coalescing
- [ ] Background job scheduler

### Phase 4: Production Ready (Week 4)

- [ ] Rate limiting
- [ ] Monitoring and analytics
- [ ] Error handling and recovery
- [ ] Documentation and deployment

## Testing Strategy

1. **Unit Tests**
   - Image processing functions
   - Nostr event parsing
   - URL validation

2. **Integration Tests**
   - R2 storage operations
   - KV store operations
   - Relay connectivity

3. **Load Testing**
   - Concurrent request handling
   - Cache performance
   - Rate limit validation

## Dependencies

```json
{
  "devDependencies": {
    "@cloudflare/workers-types": "^4.x",
    "wrangler": "^3.x",
    "typescript": "^5.x",
    "vitest": "^1.x"
  },
  "dependencies": {
    "nostr-tools": "^2.x",
    "@cloudflare/images": "^1.x"
  }
}
```

## Configuration

### Environment Variables

```
RELAY_URL=wss://relay.yestr.social
R2_BUCKET_NAME=yestr-avatars
KV_NAMESPACE=yestr-profiles
ALLOWED_ORIGINS=https://yestr.app,http://localhost:3000
MAX_IMAGE_SIZE=10485760
IMAGE_CACHE_DURATION=604800
```

## Success Criteria

1. **Reliability**
   - 99.9% uptime for image serving
   - <100ms latency for cached images
   - Graceful fallbacks for failures

2. **Scalability**
   - Handle 100k+ unique profiles
   - Support 1M+ requests/day
   - Storage growth management

3. **User Experience**
   - No CORS errors in Yestr app
   - Fast image loading
   - Proper image optimization

## Future Enhancements

1. **AI-Powered Features**
   - NSFW content detection
   - Face detection for better cropping
   - Image quality enhancement

2. **Advanced Caching**
   - Predictive pre-fetching
   - Geographic distribution
   - P2P caching network

3. **Analytics Dashboard**
   - Popular profiles tracking
   - Performance metrics UI
   - Cost analysis tools
