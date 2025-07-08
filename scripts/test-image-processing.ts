import { ImageService } from '../src/services/image';
import { NostrService } from '../src/services/nostr';
import { validatePubkey } from '../src/utils/validation';

// WebSocket polyfill for Node.js
import WebSocket from 'ws';
(global as any).WebSocket = WebSocket;

// Configuration matching the actual service
const MAX_IMAGE_SIZE = 5 * 1024 * 1024; // 5MB
const ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];
const RELAY_URL = 'wss://relay.yestr.social';

async function testImageProcessing(input: string) {
  let url = input;
  let pubkey: string | undefined;

  // Check if input is a pubkey or URL
  if (validatePubkey(input)) {
    pubkey = input;
    console.log(`\n🔑 Detected pubkey: ${pubkey}`);
    console.log(`📡 Fetching profile from ${RELAY_URL}...`);

    // Fetch profile from Nostr
    const nostrService = new NostrService(RELAY_URL);
    try {
      await nostrService.connect();
      const profile = await nostrService.fetchProfile(pubkey);

      if (!profile) {
        throw new Error('Profile not found on relay');
      }

      if (!profile.picture) {
        throw new Error('Profile has no picture URL');
      }

      url = profile.picture;
      console.log(`✅ Found profile picture: ${url}`);
      console.log(`👤 Name: ${profile.name || 'Unknown'}`);
      console.log(`📝 About: ${profile.about || 'No description'}\n`);
    } finally {
      nostrService.disconnect();
    }
  }

  console.log(`🔍 Testing image processing for: ${url}\n`);

  const imageService = new ImageService(MAX_IMAGE_SIZE, ALLOWED_TYPES);

  try {
    // Step 1: Fetch the image
    console.log('📥 Fetching image...');
    const buffer = await imageService.fetchImage(url);
    console.log(`✅ Image fetched successfully (${buffer.byteLength} bytes)`);

    // Step 2: Validate the image
    console.log('\n🔎 Validating image format...');
    const detectedType = await imageService.validateImage(buffer);
    console.log(`✅ Detected type: ${detectedType}`);

    // Step 3: Process the image (for now just returns original)
    console.log('\n⚙️  Processing image...');
    const processed = await imageService.processImage(buffer, {
      width: 400,
      height: 400,
      format: 'webp',
    });

    console.log('\n📊 Processing Results:');
    console.log(`  • Content Type: ${processed.contentType}`);
    console.log(`  • Size: ${processed.size} bytes`);
    console.log(`  • Dimensions: ${processed.width}x${processed.height}`);
    console.log(
      `  • Size reduction: ${((1 - processed.size / buffer.byteLength) * 100).toFixed(1)}%`,
    );

    // Test R2 key generation
    const r2Key = imageService.generateR2Key(pubkey || 'test-pubkey-123', 400, 'webp');
    console.log(`\n🗄️  R2 Key: ${r2Key}`);

    // Test headers generation
    const headers = imageService.getImageHeaders(processed.contentType, 'test-etag');
    console.log('\n📋 Response Headers:');
    headers.forEach((value, key) => {
      console.log(`  • ${key}: ${value}`);
    });
  } catch (error) {
    console.error('\n❌ Error:', error);
    if (error instanceof Error) {
      console.error('  • Message:', error.message);
      if ('status' in error) {
        console.error('  • Status:', (error as any).status);
      }
      if ('url' in error) {
        console.error('  • URL:', (error as any).url);
      }
    }
  }
}

// Get input from command line argument
const input = process.argv[2];

if (!input) {
  console.log('Usage: tsx scripts/test-image-processing.ts <image-url-or-pubkey>');
  console.log('\nExamples:');
  console.log('  # Test with direct image URL:');
  console.log('  tsx scripts/test-image-processing.ts https://example.com/image.jpg');
  console.log('  tsx scripts/test-image-processing.ts https://picsum.photos/200/300');
  console.log('\n  # Test with Nostr pubkey (fetches profile picture from relay.yestr.social):');
  console.log(
    '  tsx scripts/test-image-processing.ts 82341f882b6eabcd2ba7f1ef90aad961cf074af15b9ef44a09f9d2a8fbfbe6a2',
  );
  process.exit(1);
}

// Run the test
testImageProcessing(input).catch(console.error);
