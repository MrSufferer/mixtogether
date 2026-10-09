import {
  createMigrationTimeline,
  parseMigrationTimeline,
  serializeMigrationTimeline,
  type MigrationTimeline,
} from "./timeline";

export interface TimelineStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

const KEY_PREFIX = "shroudly:midnight:timeline:";

export function migrationTimelineStore(storage: TimelineStorage) {
  return {
    load(account: string, network: string): MigrationTimeline {
      const saved = storage.getItem(keyFor(account, network));
      if (!saved) {
        return createMigrationTimeline({
          id: `${network}:${account}`,
          network,
          account,
        });
      }
      return parseMigrationTimeline(saved);
    },
    save(timeline: MigrationTimeline): void {
      storage.setItem(keyFor(timeline.account, timeline.network), serializeMigrationTimeline(timeline));
    },
    clear(account: string, network: string): void {
      storage.removeItem(keyFor(account, network));
    },
  };
}

function keyFor(account: string, network: string): string {
  return `${KEY_PREFIX}${network}:${account.toLowerCase()}`;
}
