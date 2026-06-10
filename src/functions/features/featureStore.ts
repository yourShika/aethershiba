import { randomUUID } from 'node:crypto';

import { dataFile, legacyDataFile, readJsonWithLegacy, writeJson } from '../../lib/dataStore.js';

export type ResetReminderConfig = {
  channelId?: string;
  roleId?: string;
  daily: boolean;
  weekly: boolean;
  lastDailyKey?: string;
  lastWeeklyKey?: string;
};

export type MarketAlert = {
  id: string;
  userId: string;
  channelId: string;
  world: string;
  itemId: number;
  itemName?: string;
  targetPrice: number;
  direction: 'below' | 'above';
  createdAt: number;
  lastTriggeredAt?: number;
  lastSeenPrice?: number;
};

export type HuntConfig = {
  channelId?: string;
  roleId?: string;
  ranks: string[];
};

export type SaucerConfig = {
  channelId?: string;
  roleId?: string;
  fashionReportReminder: boolean;
  gateReminder: boolean;
  lastFashionKey?: string;
};

export type NewsConfig = {
  channelId?: string;
  roleId?: string;
  category: 'topics' | 'notices' | 'maintenance' | 'updates' | 'news';
  seenLinks: string[];
};

export type CommunityEventStatus = 'open' | 'cancelled' | 'done';

export type CommunityEvent = {
  id: string;
  guildId: string;
  ownerId: string;
  channelId: string;
  messageId?: string;
  title: string;
  description?: string;
  startsAt: number;
  type: 'raid' | 'treasure' | 'social' | 'other';
  guideUrl?: string;
  imageUrl?: string;
  attendees: string[];
  maybes: string[];
  status: CommunityEventStatus;
  createdAt: number;
};

export type FashionPost = {
  id: string;
  guildId: string;
  ownerId: string;
  channelId: string;
  messageId?: string;
  title: string;
  imageUrl?: string;
  notes?: string;
  upvotes: string[];
  downvotes: string[];
  createdAt: number;
};

export type GuildFeatureState = {
  resets?: ResetReminderConfig;
  marketAlerts?: MarketAlert[];
  hunt?: HuntConfig;
  saucer?: SaucerConfig;
  news?: NewsConfig;
  events?: CommunityEvent[];
  fashionPosts?: FashionPost[];
};

export type FeatureStore = Record<string, GuildFeatureState>;

const STORE_FILE = dataFile('features.json');
const LEGACY_STORE_FILE = legacyDataFile('features.json');

export function createId(prefix: string) {
  return `${prefix}_${randomUUID().slice(0, 8)}`;
}

export async function loadFeatureStore(): Promise<FeatureStore> {
  const store = await readJsonWithLegacy<FeatureStore>(STORE_FILE, LEGACY_STORE_FILE, {});
  return store && typeof store === 'object' && !Array.isArray(store) ? store : {};
}

export async function saveFeatureStore(store: FeatureStore): Promise<void> {
  await writeJson(STORE_FILE, store);
}

export async function getGuildFeatures(guildId: string): Promise<GuildFeatureState> {
  const store = await loadFeatureStore();
  return store[guildId] ?? {};
}

export async function updateGuildFeatures(
  guildId: string,
  updater: (state: GuildFeatureState) => GuildFeatureState | void,
): Promise<GuildFeatureState> {
  const store = await loadFeatureStore();
  const current = store[guildId] ?? {};
  const next = updater(current) ?? current;
  store[guildId] = next;
  await saveFeatureStore(store);
  return next;
}
