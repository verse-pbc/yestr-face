# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Common Development Commands

### Build and Run
- `npm run dev` - Start local development server with Wrangler
- `npm run deploy` - Deploy to Cloudflare Workers production

### Testing and Quality
- `npm test` - Run all tests with Vitest
- `npm run lint` - Run ESLint for code quality checks
- `npm run format` - Format code with Prettier
- `npm run type-check` - Run TypeScript type checking

### Setup and Configuration
- `npm install` - Install dependencies
- `npx wrangler login` - Authenticate with Cloudflare
- `npm run setup` - Run interactive setup script for first-time configuration

## Architecture Overview

Yestr Face is a profile picture proxy server built on Cloudflare Workers that solves CORS issues for the Yestr Nostr client. It caches profile images from Nostr relays in Cloudflare R2 storage.

### Core Components

1. **Request Flow** (`src/index.ts`)
   - Routes: `/health` (status check) and `/avatar/:pubkey` (profile images)
   - Rate limiting: 60 requests/minute per IP address
   - CORS handling for cross-origin requests
   - Scheduled cron job every 5 minutes for profile scanning

2. **Service Layer** (`src/services/`)
   - `NostrService`: Connects to Nostr relays, fetches profile metadata
   - `StorageService`: Manages R2 bucket (images) and KV namespace (metadata)
   - `ImageService`: Validates, fetches, and processes images
   - `ProfileScanner`: Background service that scans and updates profiles

3. **Request Handlers** (`src/handlers/`)
   - `AvatarHandler`: Main logic for serving profile pictures
     - Check KV cache for metadata
     - Check R2 for cached image
     - Fallback to Nostr relay if not cached
     - Process and store new images
   - `HealthHandler`: Returns service status

4. **Storage Strategy**
   - KV Namespace (`PROFILE_KV`): Stores profile metadata and image locations
   - R2 Bucket (`AVATAR_BUCKET`): Stores actual image files
   - Cache headers: 7-day browser cache, 1-day CDN cache

### Environment Configuration

Key settings in `wrangler.toml`:
- `RELAY_URL`: Default Nostr relay (wss://relay.yestr.social)
- `MAX_IMAGE_SIZE`: 10MB limit
- `IMAGE_CACHE_DURATION`: 604800 seconds (7 days)
- R2 bucket binding: `yestr-avatars`
- KV namespace binding: Must be created and configured

### Development Notes

- The project uses TypeScript with strict mode
- Error handling includes custom error types (ProfileNotFoundError, ImageFetchError)
- Rate limiting is implemented using Cloudflare's built-in features
- Image processing supports multiple sizes (200, 400, 800px) and formats
- Background profile scanning prevents stale cache entries

### Testing

Tests use Vitest and cover:
- Utility functions (validation, cache keys)
- Service logic isolation
- Run specific test: `npm test -- <test-name>`