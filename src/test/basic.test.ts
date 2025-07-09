import { describe, it, expect } from 'vitest';
import { validatePubkey, parseAvatarRequest } from '../utils/validation';
import { getCacheKey } from '../utils/cache';

describe('Validation Utils', () => {
  it('should validate valid pubkey', () => {
    const validPubkey = 'e0f6050d930a61323bac4a5b47d58e961da2919834f3f58f3b312c2918852b55';
    expect(validatePubkey(validPubkey)).toBe(true);
  });

  it('should reject invalid pubkey', () => {
    expect(validatePubkey('invalid')).toBe(false);
    expect(validatePubkey('e0f6050d930a61323bac4a5b47d58e961da2919834f3f58f3b312c2918852b5')).toBe(
      false,
    ); // too short
    expect(
      validatePubkey('e0f6050d930a61323bac4a5b47d58e961da2919834f3f58f3b312c2918852b55a'),
    ).toBe(false); // too long
    expect(validatePubkey('g0f6050d930a61323bac4a5b47d58e961da2919834f3f58f3b312c2918852b55')).toBe(
      false,
    ); // invalid char
  });

  it('should parse avatar request correctly', () => {
    const request = new Request(
      'https://example.com/avatar/e0f6050d930a61323bac4a5b47d58e961da2919834f3f58f3b312c2918852b55?size=400&format=webp',
    );
    const pubkey = 'e0f6050d930a61323bac4a5b47d58e961da2919834f3f58f3b312c2918852b55';

    const parsed = parseAvatarRequest(request, pubkey);
    expect(parsed.pubkey).toBe(pubkey);
    expect(parsed.size).toBe(400);
    expect(parsed.format).toBe('webp');
  });
});

describe('Cache Utils', () => {
  it('should generate correct cache keys', () => {
    const pubkey = 'e0f6050d930a61323bac4a5b47d58e961da2919834f3f58f3b312c2918852b55';

    expect(getCacheKey(pubkey)).toBe(`avatar:${pubkey}`);
    expect(getCacheKey(pubkey, 400)).toBe(`avatar:${pubkey}:s400`);
    expect(getCacheKey(pubkey, 400, 'webp')).toBe(`avatar:${pubkey}:s400:webp`);
  });
});
