import { ImageFetchError, ProcessedImage, ImageProcessingOptions } from '../types';
import { getContentTypeFromUrl } from '../utils/validation';

export class ImageService {
  constructor(
    private maxImageSize: number,
    private allowedTypes: string[],
  ) {}

  async fetchImage(url: string): Promise<ArrayBuffer> {
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 10000); // 10 second timeout

      const response = await fetch(url, {
        signal: controller.signal,
        headers: {
          'User-Agent': 'YestrFace/1.0 (Nostr Profile Picture Proxy)',
        },
      });

      clearTimeout(timeout);

      if (!response.ok) {
        throw new ImageFetchError(
          `Failed to fetch image: ${response.status} ${response.statusText}`,
          response.status,
          url,
        );
      }

      // Check content type
      let contentType = response.headers.get('content-type');

      // If content type is missing or not allowed, try to infer from URL
      if (!contentType || !this.allowedTypes.includes(contentType)) {
        const urlBasedContentType = getContentTypeFromUrl(url);

        // If we can determine content type from URL and it's allowed, use it
        if (urlBasedContentType && this.allowedTypes.includes(urlBasedContentType)) {
          contentType = urlBasedContentType;
        } else {
          // Otherwise, throw an error with the original content type
          throw new ImageFetchError(`Invalid content type: ${contentType || 'unknown'}`, 415, url);
        }
      }

      // Check content length
      const contentLength = response.headers.get('content-length');
      if (contentLength && parseInt(contentLength) > this.maxImageSize) {
        throw new ImageFetchError(`Image too large: ${contentLength} bytes`, 413, url);
      }

      const buffer = await response.arrayBuffer();

      // Double check size after download
      if (buffer.byteLength > this.maxImageSize) {
        throw new ImageFetchError(
          `Image too large after download: ${buffer.byteLength} bytes`,
          413,
          url,
        );
      }

      return buffer;
    } catch (error) {
      if (error instanceof ImageFetchError) {
        throw error;
      }

      if (error instanceof Error) {
        if (error.name === 'AbortError') {
          throw new ImageFetchError('Image fetch timeout', 504, url);
        }
        throw new ImageFetchError(`Failed to fetch image: ${error.message}`, 500, url);
      }

      throw new ImageFetchError('Unknown error fetching image', 500, url);
    }
  }

  async validateImage(buffer: ArrayBuffer): Promise<string> {
    // Check magic bytes to determine actual image type
    const bytes = new Uint8Array(buffer);

    // JPEG
    if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) {
      return 'image/jpeg';
    }

    // PNG
    if (bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47) {
      return 'image/png';
    }

    // GIF
    if (bytes[0] === 0x47 && bytes[1] === 0x49 && bytes[2] === 0x46) {
      return 'image/gif';
    }

    // WebP
    if (
      bytes[0] === 0x52 &&
      bytes[1] === 0x49 &&
      bytes[2] === 0x46 &&
      bytes[3] === 0x46 &&
      bytes[8] === 0x57 &&
      bytes[9] === 0x45 &&
      bytes[10] === 0x42 &&
      bytes[11] === 0x50
    ) {
      return 'image/webp';
    }

    throw new Error('Unknown or invalid image format');
  }

  // Basic image processing (no actual resizing in this MVP)
  // In production, you'd use Cloudflare Image Resizing or a WASM library
  async processImage(
    buffer: ArrayBuffer,
    options: ImageProcessingOptions,
  ): Promise<ProcessedImage> {
    const contentType = await this.validateImage(buffer);

    // For MVP, we just return the original image
    // In production, implement actual resizing/conversion
    return {
      buffer,
      contentType,
      width: options.width || 400,
      height: options.height || 400,
      size: buffer.byteLength,
    };
  }

  generateR2Key(pubkey: string, size?: number, format?: string): string {
    const parts = ['avatars', pubkey];

    if (size && format) {
      parts.push(`${size}x${size}.${format}`);
    } else {
      parts.push('original');
    }

    return parts.join('/');
  }

  getImageHeaders(contentType: string, etag?: string): Headers {
    const headers = new Headers();
    headers.set('Content-Type', contentType);

    if (etag) {
      headers.set('ETag', etag);
    }

    // Security headers
    headers.set('X-Content-Type-Options', 'nosniff');
    headers.set('X-Frame-Options', 'DENY');

    return headers;
  }
}
