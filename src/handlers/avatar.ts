import { Env, ProfileNotFoundError, ImageFetchError } from '../types';
import { NostrService } from '../services/nostr';
import { ImageService } from '../services/image';
import { StorageService } from '../services/storage';
import { getCorsHeaders } from '../utils/cors';
import { getCacheHeaders, getCacheKey, shouldRevalidate } from '../utils/cache';
import { parseAvatarRequest, isValidImageUrl } from '../utils/validation';

export async function handleAvatar(
  request: Request,
  env: Env,
  params: { pubkey: string },
): Promise<Response> {
  try {
    // Parse and validate request
    const avatarRequest = parseAvatarRequest(request, params.pubkey);
    const { pubkey, size, format } = avatarRequest;
    
    // Initialize services
    const storage = new StorageService(env);
    const imageService = new ImageService(
      parseInt(env.MAX_IMAGE_SIZE),
      env.ALLOWED_IMAGE_TYPES.split(','),
    );
    
    // Generate cache key
    const cacheKey = getCacheKey(pubkey, size, format);
    
    // Try to get from cache first
    const metadata = await storage.getProfileMetadata(pubkey);
    
    if (metadata && metadata.sizes[cacheKey]) {
      // Check if we should revalidate
      const maxAge = parseInt(env.IMAGE_CACHE_DURATION);
      
      if (!shouldRevalidate(metadata, maxAge)) {
        // Serve from R2
        const imageKey = metadata.sizes[cacheKey].key;
        const image = await storage.getImage(imageKey);
        
        if (image) {
          const headers = new Headers(getCorsHeaders(request, env));
          headers.set('Content-Type', metadata.sizes[cacheKey].contentType);
          headers.set('ETag', metadata.sizes[cacheKey].etag);
          headers.set('Last-Modified', new Date(metadata.sizes[cacheKey].lastModified).toUTCString());
          
          // Add cache headers
          const cacheHeaders = getCacheHeaders(true, maxAge);
          cacheHeaders.forEach((value, key) => headers.set(key, value));
          
          // Add security headers
          headers.set('X-Content-Type-Options', 'nosniff');
          headers.set('X-Frame-Options', 'DENY');
          
          return new Response(image.body, {
            status: 200,
            headers,
          });
        }
      }
    }
    
    // Not in cache or needs revalidation - fetch from relay
    const nostrService = new NostrService(env.RELAY_URL);
    
    try {
      await nostrService.connect();
      const profile = await nostrService.fetchProfile(pubkey);
      
      if (!profile || !profile.picture) {
        throw new ProfileNotFoundError(pubkey);
      }
      
      // Validate picture URL
      if (!isValidImageUrl(profile.picture)) {
        throw new ImageFetchError('Invalid profile picture URL', 400, profile.picture);
      }
      
      // Fetch the image
      const imageBuffer = await imageService.fetchImage(profile.picture);
      
      // Validate the image
      const contentType = await imageService.validateImage(imageBuffer);
      
      // Process the image (in MVP, this is just validation)
      const processedImage = await imageService.processImage(imageBuffer, {
        width: size,
        height: size,
        format: format,
      });
      
      // Generate R2 key and store the image
      const r2Key = imageService.generateR2Key(pubkey, size, format);
      const etag = `"${Date.now()}-${processedImage.size}"`;
      
      await storage.putImage(r2Key, processedImage.buffer, {
        contentType: processedImage.contentType,
        etag,
      });
      
      // Update metadata
      const newMetadata = metadata || {
        pubkey,
        originalUrl: profile.picture,
        sizes: {},
        fetchedAt: Date.now(),
        profileUpdatedAt: profile.created_at * 1000,
      };
      
      newMetadata.sizes[cacheKey] = {
        key: r2Key,
        contentType: processedImage.contentType,
        etag,
        lastModified: Date.now(),
      };
      
      newMetadata.fetchedAt = Date.now();
      newMetadata.failureCount = 0; // Reset failure count on success
      
      await storage.putProfileMetadata(newMetadata);
      
      // Return the image
      const headers = new Headers(getCorsHeaders(request, env));
      headers.set('Content-Type', processedImage.contentType);
      headers.set('ETag', etag);
      headers.set('Last-Modified', new Date().toUTCString());
      
      // Add cache headers
      const cacheHeaders = getCacheHeaders(false, parseInt(env.IMAGE_CACHE_DURATION));
      cacheHeaders.forEach((value, key) => headers.set(key, value));
      
      // Add security headers
      headers.set('X-Content-Type-Options', 'nosniff');
      headers.set('X-Frame-Options', 'DENY');
      
      return new Response(processedImage.buffer, {
        status: 200,
        headers,
      });
      
    } finally {
      nostrService.disconnect();
    }
    
  } catch (error) {
    console.error('Error handling avatar request:', error);
    
    // Return appropriate error response
    const headers = new Headers(getCorsHeaders(request, env));
    headers.set('Content-Type', 'application/json');
    
    if (error instanceof ProfileNotFoundError) {
      return new Response(
        JSON.stringify({ error: 'Profile not found', pubkey: error.pubkey }),
        { status: 404, headers },
      );
    }
    
    if (error instanceof ImageFetchError) {
      // Record failure
      const storage = new StorageService(env);
      await storage.recordFailure(params.pubkey, error.message);
      
      return new Response(
        JSON.stringify({ 
          error: error.message, 
          statusCode: error.statusCode,
          originalUrl: error.originalUrl,
        }),
        { status: error.statusCode, headers },
      );
    }
    
    if (error instanceof Error) {
      return new Response(
        JSON.stringify({ error: error.message }),
        { status: 500, headers },
      );
    }
    
    return new Response(
      JSON.stringify({ error: 'Internal server error' }),
      { status: 500, headers },
    );
  }
}