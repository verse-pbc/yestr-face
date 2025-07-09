import { NostrEvent, NostrProfile } from '../types';
import { validateEvent, getPublicKey } from 'nostr-tools';

export class NostrService {
  private ws: WebSocket | null = null;
  private subscriptions = new Map<string, (event: NostrEvent) => void>();

  constructor(private relayUrl: string) {}

  async connect(): Promise<void> {
    return new Promise((resolve, reject) => {
      try {
        this.ws = new WebSocket(this.relayUrl);

        this.ws.addEventListener('open', () => {
          console.log(`Connected to relay: ${this.relayUrl}`);
          resolve();
        });

        this.ws.addEventListener('error', (error) => {
          console.error('WebSocket error:', error);
          reject(error);
        });

        this.ws.addEventListener('message', (event) => {
          this.handleMessage(event.data);
        });

        // Set timeout for connection
        setTimeout(() => {
          if (this.ws?.readyState !== WebSocket.OPEN) {
            reject(new Error('WebSocket connection timeout'));
          }
        }, 5000);
      } catch (error) {
        reject(error);
      }
    });
  }

  disconnect(): void {
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
    this.subscriptions.clear();
  }

  async fetchProfile(pubkey: string): Promise<NostrProfile | null> {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      await this.connect();
    }

    return new Promise((resolve) => {
      const subId = `profile_${pubkey}_${Date.now()}`;
      let profile: NostrProfile | null = null;

      // Set timeout
      const timeout = setTimeout(() => {
        this.unsubscribe(subId);
        resolve(profile);
      }, 3000);

      // Subscribe to profile events
      this.subscriptions.set(subId, (event: NostrEvent) => {
        if (event.kind === 0 && event.pubkey === pubkey) {
          try {
            const content = JSON.parse(event.content);
            profile = {
              pubkey: event.pubkey,
              ...content,
              created_at: event.created_at,
            };
          } catch (error) {
            console.error('Error parsing profile content:', error);
          }
        }
      });

      // Send subscription request
      const req = JSON.stringify([
        'REQ',
        subId,
        {
          kinds: [0],
          authors: [pubkey],
          limit: 1,
        },
      ]);

      this.ws!.send(req);
    });
  }

  async fetchMultipleProfiles(pubkeys: string[]): Promise<Map<string, NostrProfile>> {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      await this.connect();
    }

    return new Promise((resolve) => {
      const profiles = new Map<string, NostrProfile>();
      const subId = `profiles_batch_${Date.now()}`;

      // Set timeout
      const timeout = setTimeout(() => {
        this.unsubscribe(subId);
        resolve(profiles);
      }, 5000);

      // Subscribe to profile events
      this.subscriptions.set(subId, (event: NostrEvent) => {
        if (event.kind === 0) {
          try {
            const content = JSON.parse(event.content);
            profiles.set(event.pubkey, {
              pubkey: event.pubkey,
              ...content,
              created_at: event.created_at,
            });
          } catch (error) {
            console.error('Error parsing profile content:', error);
          }
        }
      });

      // Send subscription request
      const req = JSON.stringify([
        'REQ',
        subId,
        {
          kinds: [0],
          authors: pubkeys,
        },
      ]);

      this.ws!.send(req);
    });
  }

  private handleMessage(data: string): void {
    try {
      const message = JSON.parse(data);

      if (message[0] === 'EVENT') {
        const subId = message[1];
        const event = message[2];

        // Notify subscription handler
        const handler = this.subscriptions.get(subId);
        if (handler) {
          handler(event);
        }
      } else if (message[0] === 'EOSE') {
        // End of stored events
        const subId = message[1];
        console.log(`End of stored events for subscription: ${subId}`);
      }
    } catch (error) {
      console.error('Error handling WebSocket message:', error);
    }
  }

  private unsubscribe(subId: string): void {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      const close = JSON.stringify(['CLOSE', subId]);
      this.ws.send(close);
    }
    this.subscriptions.delete(subId);
  }
}
