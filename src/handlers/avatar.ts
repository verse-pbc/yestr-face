import { Env, ProfileNotFoundError, ImageFetchError } from '../types';
import { NostrService } from '../services/nostr';
import { ImageService } from '../services/image';
import { StorageService } from '../services/storage';
import { getCorsHeaders } from '../utils/cors';
import { getCacheHeaders, getCacheKey, shouldRevalidate } from '../utils/cache';
import { parseAvatarRequest, isValidImageUrl } from '../utils/validation';
import type { ProfileMetadata } from '../types';

async function serveCachedImage(
  request: Request,
  env: Env,
  metadata: ProfileMetadata,
  cacheKey: string,
  storage: StorageService,
): Promise<Response | null> {
  const imageMetadata = metadata.sizes[cacheKey];
  if (!imageMetadata) return null;

  const maxAge = parseInt(env.IMAGE_CACHE_DURATION);
  if (shouldRevalidate(metadata, maxAge)) return null;

  const imageKey = imageMetadata.key;
  const image = await storage.getImage(imageKey);
  if (!image) return null;

  const headers = buildImageHeaders(request, env, {
    contentType: imageMetadata.contentType,
    etag: imageMetadata.etag,
    lastModified: new Date(imageMetadata.lastModified).toUTCString(),
    cacheHeaders: getCacheHeaders(true, maxAge),
  });

  return new Response(image.body, {
    status: 200,
    headers,
  });
}

function buildImageHeaders(
  request: Request,
  env: Env,
  options: {
    contentType: string;
    etag: string;
    lastModified: string;
    cacheHeaders: Headers;
  },
): Headers {
  const headers = new Headers(getCorsHeaders(request, env));
  headers.set('Content-Type', options.contentType);
  headers.set('ETag', options.etag);
  headers.set('Last-Modified', options.lastModified);

  options.cacheHeaders.forEach((value, key) => headers.set(key, value));

  headers.set('X-Content-Type-Options', 'nosniff');
  headers.set('X-Frame-Options', 'DENY');

  return headers;
}

async function handleErrorResponse(
  request: Request,
  env: Env,
  error: unknown,
  pubkey: string,
): Promise<Response> {
  const headers = new Headers(getCorsHeaders(request, env));
  headers.set('Content-Type', 'application/json');

  if (error instanceof ProfileNotFoundError) {
    return new Response(JSON.stringify({ error: 'Profile not found', pubkey: error.pubkey }), {
      status: 404,
      headers,
    });
  }

  if (error instanceof ImageFetchError) {
    const storage = new StorageService(env);
    await storage.recordFailure(pubkey, error.message);

    if (error.statusCode === 403 && error.message.includes('browser verification')) {
      return new Response(
        JSON.stringify({
          error: error.message,
          statusCode: error.statusCode,
          originalUrl: error.originalUrl,
          suggestion:
            'This image is protected by bot detection. Client should fetch directly from originalUrl or use ?fallback=true for generated avatar.',
          botProtection: true,
        }),
        { status: error.statusCode, headers },
      );
    }

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
    return new Response(JSON.stringify({ error: error.message }), { status: 500, headers });
  }

  return new Response(JSON.stringify({ error: 'Internal server error' }), {
    status: 500,
    headers,
  });
}

async function fetchAndProcessNewImage(
  request: Request,
  env: Env,
  pubkey: string,
  size: number,
  format: 'webp' | 'jpeg' | 'png' | undefined,
  cacheKey: string,
  metadata: ProfileMetadata | null,
  storage: StorageService,
  imageService: ImageService,
): Promise<Response> {
  const nostrService = new NostrService(env.RELAY_URL);

  try {
    await nostrService.connect();
    const profile = await nostrService.fetchProfile(pubkey);

    if (!profile || !profile.picture) {
      throw new ProfileNotFoundError(pubkey);
    }

    if (!isValidImageUrl(profile.picture)) {
      throw new ImageFetchError('Invalid profile picture URL', 400, profile.picture);
    }

    const imageBuffer = await imageService.fetchImage(profile.picture);
    const processedImage = await imageService.processImage(imageBuffer, {
      width: size,
      height: size,
      format: format,
    });

    const r2Key = imageService.generateR2Key(pubkey, size, format);
    const etag = `"${Date.now()}-${processedImage.size}"`;

    await storage.putImage(r2Key, processedImage.buffer, {
      contentType: processedImage.contentType,
      etag,
    });

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
    newMetadata.failureCount = 0;

    await storage.putProfileMetadata(newMetadata);

    const headers = buildImageHeaders(request, env, {
      contentType: processedImage.contentType,
      etag,
      lastModified: new Date().toUTCString(),
      cacheHeaders: getCacheHeaders(false, parseInt(env.IMAGE_CACHE_DURATION)),
    });

    return new Response(processedImage.buffer, {
      status: 200,
      headers,
    });
  } finally {
    nostrService.disconnect();
  }
}

export async function handleAvatar(
  request: Request,
  env: Env,
  params: { pubkey: string },
): Promise<Response> {
  try {
    const avatarRequest = parseAvatarRequest(request, params.pubkey);
    const { pubkey, size, format } = avatarRequest;

    const storage = new StorageService(env);
    const imageService = new ImageService(
      parseInt(env.MAX_IMAGE_SIZE),
      env.ALLOWED_IMAGE_TYPES.split(','),
      env,
    );

    const cacheKey = getCacheKey(pubkey, size, format);
    const metadata = await storage.getProfileMetadata(pubkey);

    if (metadata && metadata.sizes[cacheKey]) {
      const cachedResponse = await serveCachedImage(request, env, metadata, cacheKey, storage);
      if (cachedResponse) return cachedResponse;
    }

    return await fetchAndProcessNewImage(
      request,
      env,
      pubkey,
      size || 400,
      format,
      cacheKey,
      metadata,
      storage,
      imageService,
    );
  } catch (error) {
    console.error('Error handling avatar request:', error);
    return handleErrorResponse(request, env, error, params.pubkey);
  }
}
