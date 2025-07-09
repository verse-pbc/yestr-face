import { Env, ProfileMetadata } from '../types';

export class StorageService {
  constructor(private env: Env) {}

  // R2 Storage Methods
  async getImage(key: string): Promise<R2ObjectBody | null> {
    try {
      return await this.env.AVATAR_BUCKET.get(key);
    } catch (error) {
      console.error(`Error getting image from R2: ${error}`);
      return null;
    }
  }

  async putImage(
    key: string,
    buffer: ArrayBuffer,
    metadata?: Record<string, string>,
  ): Promise<R2Object | null> {
    try {
      return await this.env.AVATAR_BUCKET.put(key, buffer, {
        httpMetadata: metadata,
      });
    } catch (error) {
      console.error(`Error putting image to R2: ${error}`);
      return null;
    }
  }

  async deleteImage(key: string): Promise<void> {
    try {
      await this.env.AVATAR_BUCKET.delete(key);
    } catch (error) {
      console.error(`Error deleting image from R2: ${error}`);
    }
  }

  async listImages(prefix: string): Promise<R2Objects> {
    return await this.env.AVATAR_BUCKET.list({ prefix });
  }

  // KV Storage Methods
  async getProfileMetadata(pubkey: string): Promise<ProfileMetadata | null> {
    try {
      const data = await this.env.PROFILE_KV.get(`profile:${pubkey}`, 'json');
      return data as ProfileMetadata | null;
    } catch (error) {
      console.error(`Error getting profile metadata: ${error}`);
      return null;
    }
  }

  async putProfileMetadata(metadata: ProfileMetadata): Promise<void> {
    try {
      await this.env.PROFILE_KV.put(`profile:${metadata.pubkey}`, JSON.stringify(metadata), {
        expirationTtl: 86400 * 30, // 30 days
      });
    } catch (error) {
      console.error(`Error putting profile metadata: ${error}`);
    }
  }

  async deleteProfileMetadata(pubkey: string): Promise<void> {
    try {
      await this.env.PROFILE_KV.delete(`profile:${pubkey}`);
    } catch (error) {
      console.error(`Error deleting profile metadata: ${error}`);
    }
  }

  // Batch operations
  async getProfileMetadataBatch(pubkeys: string[]): Promise<Map<string, ProfileMetadata>> {
    const result = new Map<string, ProfileMetadata>();

    // KV doesn't support batch get, so we need to fetch individually
    // In production, consider using Durable Objects for better batch operations
    const promises = pubkeys.map(async (pubkey) => {
      const metadata = await this.getProfileMetadata(pubkey);
      if (metadata) {
        result.set(pubkey, metadata);
      }
    });

    await Promise.all(promises);
    return result;
  }

  // Stats methods
  async getStats(): Promise<{
    totalProfiles: number;
    totalImages: number;
    storageUsed: number;
  }> {
    try {
      // Get approximate counts
      const profilesList = await this.env.PROFILE_KV.list({ limit: 1 });
      const imagesList = await this.env.AVATAR_BUCKET.list({ limit: 1 });

      return {
        totalProfiles: 0, // KV doesn't provide count
        totalImages: 0, // R2 doesn't provide count in list
        storageUsed: 0, // Would need to track separately
      };
    } catch (error) {
      console.error(`Error getting stats: ${error}`);
      return {
        totalProfiles: 0,
        totalImages: 0,
        storageUsed: 0,
      };
    }
  }

  // Helper to check if profile needs refresh
  shouldRefreshProfile(metadata: ProfileMetadata, maxAge: number): boolean {
    const age = Date.now() - metadata.fetchedAt;
    return age > maxAge;
  }

  // Helper to track failures
  async recordFailure(pubkey: string, error: string): Promise<void> {
    const metadata = await this.getProfileMetadata(pubkey);

    if (metadata) {
      metadata.failureCount = (metadata.failureCount || 0) + 1;
      metadata.lastFailure = Date.now();
      await this.putProfileMetadata(metadata);
    } else {
      // Create new metadata for failed profile
      await this.putProfileMetadata({
        pubkey,
        originalUrl: '',
        sizes: {},
        fetchedAt: Date.now(),
        profileUpdatedAt: Date.now(),
        failureCount: 1,
        lastFailure: Date.now(),
      });
    }
  }
}
