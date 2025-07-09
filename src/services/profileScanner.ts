import { Env, NostrEvent, NostrProfile } from '../types';
import { NostrService } from './nostr';
import { StorageService } from './storage';

export class ProfileScanner {
  constructor(
    private env: Env,
    private nostrService: NostrService,
    private storageService: StorageService,
  ) {}

  async scanRecentProfiles(limit: number = 100): Promise<void> {
    try {
      await this.nostrService.connect();

      // Fetch recent profile events from the relay
      const profiles = await this.fetchRecentProfiles(limit);

      console.log(`Found ${profiles.size} recent profiles to process`);

      // Process each profile
      for (const [pubkey, profile] of profiles) {
        try {
          await this.processProfile(profile);
        } catch (error) {
          console.error(`Error processing profile ${pubkey}:`, error);
        }
      }
    } finally {
      this.nostrService.disconnect();
    }
  }

  private async fetchRecentProfiles(limit: number): Promise<Map<string, NostrProfile>> {
    return new Promise((resolve) => {
      const profiles = new Map<string, NostrProfile>();
      const subId = `recent_profiles_${Date.now()}`;

      // Set timeout
      const timeout = setTimeout(() => {
        this.nostrService['unsubscribe'](subId);
        resolve(profiles);
      }, 10000); // 10 seconds timeout

      // Subscribe to recent profile events
      this.nostrService['subscriptions'].set(subId, (event: NostrEvent) => {
        if (event.kind === 0) {
          try {
            const content = JSON.parse(event.content);
            if (content.picture) {
              // Only process profiles with pictures
              profiles.set(event.pubkey, {
                pubkey: event.pubkey,
                ...content,
                created_at: event.created_at,
              });
            }
          } catch (error) {
            console.error('Error parsing profile content:', error);
          }
        }
      });

      // Request recent profile events
      const since = Math.floor(Date.now() / 1000) - 24 * 60 * 60; // Last 24 hours
      const req = JSON.stringify([
        'REQ',
        subId,
        {
          kinds: [0],
          since: since,
          limit: limit,
        },
      ]);

      this.nostrService['ws']!.send(req);
    });
  }

  private async processProfile(profile: NostrProfile): Promise<void> {
    if (!profile.picture) {
      return;
    }

    // Check if we already have this profile
    const metadata = await this.storageService.getProfileMetadata(profile.pubkey);

    if (metadata) {
      // Check if profile has been updated
      const profileUpdatedAt = profile.created_at * 1000;
      if (metadata.profileUpdatedAt >= profileUpdatedAt) {
        // Profile hasn't been updated, skip
        return;
      }
    }

    // Queue the profile for processing
    // In a production system, this would add to a queue
    // For MVP, we just log it
    console.log(`Profile ${profile.pubkey} needs processing: ${profile.picture}`);

    // Update metadata to mark it as discovered
    await this.storageService.putProfileMetadata({
      pubkey: profile.pubkey,
      originalUrl: profile.picture,
      sizes: {},
      fetchedAt: 0, // Not fetched yet
      profileUpdatedAt: profile.created_at * 1000,
    });
  }

  async cleanupOldImages(daysOld: number = 30): Promise<void> {
    try {
      const cutoffTime = Date.now() - daysOld * 24 * 60 * 60 * 1000;

      // List all profiles in KV
      const profilesList = await this.env.PROFILE_KV.list({ limit: 1000 });

      let deletedCount = 0;

      for (const key of profilesList.keys) {
        const metadata = await this.storageService.getProfileMetadata(
          key.name.replace('profile:', ''),
        );

        if (metadata && metadata.fetchedAt < cutoffTime) {
          // Delete associated images from R2
          for (const size of Object.values(metadata.sizes)) {
            await this.storageService.deleteImage(size.key);
          }

          // Delete metadata
          await this.storageService.deleteProfileMetadata(metadata.pubkey);
          deletedCount++;
        }
      }

      console.log(`Cleaned up ${deletedCount} old profiles`);
    } catch (error) {
      console.error('Error during cleanup:', error);
    }
  }
}
