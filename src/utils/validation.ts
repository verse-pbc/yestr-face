import { AvatarRequest } from '../types';

const HEX_REGEX = /^[0-9a-fA-F]{64}$/;
const VALID_SIZES = [200, 400, 800];
const VALID_FORMATS = ['webp', 'jpeg', 'png'];

export function validatePubkey(pubkey: string): boolean {
  return HEX_REGEX.test(pubkey);
}

export function parseAvatarRequest(request: Request, pubkey: string): AvatarRequest {
  const url = new URL(request.url);

  // Validate pubkey
  if (!validatePubkey(pubkey)) {
    throw new Error('Invalid pubkey format');
  }

  // Parse size parameter
  const sizeParam = url.searchParams.get('size');
  let size: number | undefined;
  if (sizeParam) {
    size = parseInt(sizeParam, 10);
    if (!VALID_SIZES.includes(size)) {
      size = 400; // Default to medium size
    }
  }

  // Parse format parameter
  const formatParam = url.searchParams.get('format');
  let format: 'webp' | 'jpeg' | 'png' | undefined;
  if (formatParam && VALID_FORMATS.includes(formatParam)) {
    format = formatParam as 'webp' | 'jpeg' | 'png';
  }

  return { pubkey, size, format };
}

export function isValidImageUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    return ['http:', 'https:'].includes(parsed.protocol);
  } catch {
    return false;
  }
}

export function getContentTypeFromUrl(url: string): string | null {
  const extension = url.split('.').pop()?.toLowerCase();
  switch (extension) {
    case 'jpg':
    case 'jpeg':
      return 'image/jpeg';
    case 'png':
      return 'image/png';
    case 'webp':
      return 'image/webp';
    case 'gif':
      return 'image/gif';
    default:
      return null;
  }
}
