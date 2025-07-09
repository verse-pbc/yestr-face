import { ImageFetchError, ProcessedImage, ImageProcessingOptions, Env } from '../types';
import { getContentTypeFromUrl } from '../utils/validation';
import { parse } from 'file-type-mime';

export class ImageService {
  constructor(
    private maxImageSize: number,
    private allowedTypes: string[],
    private env?: Env,
  ) {}

  async fetchImage(url: string): Promise<ArrayBuffer> {
    try {
      return await this.fetchImageDirect(url);
    } catch (error) {
      // If we have env and proxy secret, and it's a 403 error, try proxy
      if (
        this.env?.IMAGE_PROXY_SECRET &&
        error instanceof ImageFetchError &&
        error.statusCode === 403
      ) {
        console.log('403 error detected, attempting to fetch via proxy');
        return await this.fetchImageViaProxy(url);
      }
      throw error;
    }
  }

  private async fetchImageDirect(url: string): Promise<ArrayBuffer> {
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

      // Check if we received HTML instead of an image
      const bytes = new Uint8Array(buffer).slice(0, 20);
      const isHtml =
        bytes[0] === 0x3c && // <
        (bytes[1] === 0x68 || bytes[1] === 0x48) && // h or H
        (bytes[2] === 0x74 || bytes[2] === 0x54) && // t or T
        (bytes[3] === 0x6d || bytes[3] === 0x4d) && // m or M
        (bytes[4] === 0x6c || bytes[4] === 0x4c); // l or L

      if (isHtml) {
        const htmlContent = new TextDecoder().decode(buffer);
        console.error('Received HTML instead of image:', htmlContent);

        // Check for common bot protection systems
        if (htmlContent.includes('sgcaptcha') || htmlContent.includes('/.well-known/sgcaptcha/')) {
          throw new ImageFetchError(
            'Image blocked by SiteGround CAPTCHA protection. This domain requires browser verification.',
            403,
            url,
          );
        }

        if (
          htmlContent.includes('cf-browser-verification') ||
          htmlContent.includes('Checking your browser')
        ) {
          throw new ImageFetchError(
            'Image blocked by Cloudflare browser verification. This domain requires browser verification.',
            403,
            url,
          );
        }

        throw new ImageFetchError(
          `Server returned HTML instead of image (${buffer.byteLength} bytes). The image host may be blocking automated requests.`,
          403,
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

  private async fetchImageViaProxy(url: string): Promise<ArrayBuffer> {
    if (!this.env?.IMAGE_PROXY_SECRET) {
      throw new ImageFetchError('Proxy secret not configured', 500, url);
    }

    const proxyUrl = new URL('https://relay.yestr.social/proxy-image');
    proxyUrl.searchParams.set('url', url);
    proxyUrl.searchParams.set('secret', this.env.IMAGE_PROXY_SECRET);

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 15000); // 15 second timeout for proxy

    try {
      const response = await fetch(proxyUrl.toString(), {
        signal: controller.signal,
        headers: {
          'User-Agent': 'YestrFace/1.0 (https://yestr.social)',
        },
      });

      clearTimeout(timeout);

      if (!response.ok) {
        throw new ImageFetchError(
          `Proxy failed to fetch image: ${response.status} ${response.statusText}`,
          response.status,
          url,
        );
      }

      const buffer = await response.arrayBuffer();

      // Validate size
      if (buffer.byteLength > this.maxImageSize) {
        throw new ImageFetchError(
          `Image too large from proxy: ${buffer.byteLength} bytes`,
          413,
          url,
        );
      }

      return buffer;
    } catch (error) {
      clearTimeout(timeout);

      if (error instanceof ImageFetchError) {
        throw error;
      }

      if (error instanceof Error) {
        if (error.name === 'AbortError') {
          throw new ImageFetchError('Proxy fetch timeout', 504, url);
        }
        throw new ImageFetchError(`Proxy failed to fetch image: ${error.message}`, 500, url);
      }

      throw new ImageFetchError('Unknown error fetching image via proxy', 500, url);
    }
  }

  async validateImage(buffer: ArrayBuffer): Promise<string> {
    // Debug logging
    const bytes = new Uint8Array(buffer).slice(0, 16);
    console.log('Buffer size:', buffer.byteLength);
    console.log(
      'First 16 bytes:',
      Array.from(bytes)
        .map((b) => b.toString(16).padStart(2, '0'))
        .join(' '),
    );

    // Use file-type-mime library for robust file type detection
    const result = parse(buffer);

    console.log('file-type-mime result:', result);

    if (!result) {
      throw new Error('Unknown or invalid image format');
    }

    // Check if it's an image type
    if (!result.mime.startsWith('image/')) {
      throw new Error('Not an image file');
    }

    return result.mime;
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
