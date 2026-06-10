import type { Client } from 'discord.js';

import { marketAlertTriggeredEmbed, newsEmbed, resetReminderEmbed, saucerEmbed } from '../../embeds/featureEmbeds.js';
import { logger } from '../../lib/logger.js';
import { startTaskLoop } from '../../lib/taskLoop.js';
import { fetchMarketQuote } from './marketProvider.js';
import { fetchNews } from './newsProvider.js';
import { loadFeatureStore, saveFeatureStore, type FeatureStore } from './featureStore.js';

const MARKET_ALERT_COOLDOWN_MS = 6 * 60 * 60 * 1000;
const FASHION_REPORT_URL = 'https://www.reddit.com/r/ffxiv/search/?q=fashion%20report&restrict_sr=1&sort=new';

function dateKey(date: Date) {
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}-${String(date.getUTCDate()).padStart(2, '0')}`;
}

function weekKey(date: Date) {
  const firstThursday = new Date(Date.UTC(date.getUTCFullYear(), 0, 4));
  const dayOffset = (firstThursday.getUTCDay() + 6) % 7;
  const weekOne = new Date(firstThursday);
  weekOne.setUTCDate(firstThursday.getUTCDate() - dayOffset);
  const diff = date.getTime() - weekOne.getTime();
  const week = Math.floor(diff / (7 * 24 * 60 * 60 * 1000)) + 1;
  return `${date.getUTCFullYear()}-W${String(week).padStart(2, '0')}`;
}

type SendableChannel = {
  send: (options: unknown) => Promise<unknown>;
};

async function fetchTextChannel(client: Client, channelId?: string): Promise<SendableChannel | null> {
  if (!channelId) return null;
  const channel = await client.channels.fetch(channelId).catch(() => null);
  if (!channel || !('isTextBased' in channel) || !channel.isTextBased()) return null;
  return channel as unknown as SendableChannel;
}

async function runResetReminders(client: Client, store: FeatureStore, now: Date) {
  const dailyReady = now.getUTCHours() >= 15;
  const weeklyReady = now.getUTCDay() === 2 && now.getUTCHours() >= 8;
  const today = dateKey(now);
  const thisWeek = weekKey(now);
  let changed = false;

  for (const [guildId, state] of Object.entries(store)) {
    const config = state.resets;
    if (!config?.channelId) continue;

    const channel = await fetchTextChannel(client, config.channelId);
    if (!channel) continue;
    const mention = config.roleId ? `<@&${config.roleId}>` : undefined;

    if (config.daily && dailyReady && config.lastDailyKey !== today) {
      await channel.send({ content: mention, embeds: [resetReminderEmbed('daily')] }).catch((error: unknown) => {
        logger.warn(`[Resets][${guildId}] Failed to send daily reminder`, error);
      });
      config.lastDailyKey = today;
      changed = true;
    }

    if (config.weekly && weeklyReady && config.lastWeeklyKey !== thisWeek) {
      await channel.send({ content: mention, embeds: [resetReminderEmbed('weekly')] }).catch((error: unknown) => {
        logger.warn(`[Resets][${guildId}] Failed to send weekly reminder`, error);
      });
      config.lastWeeklyKey = thisWeek;
      changed = true;
    }
  }

  return changed;
}

async function runSaucerReminders(client: Client, store: FeatureStore, now: Date) {
  const fridayFashionReady = now.getUTCDay() === 5 && now.getUTCHours() >= 8;
  const thisWeek = weekKey(now);
  let changed = false;

  for (const [guildId, state] of Object.entries(store)) {
    const config = state.saucer;
    if (!config?.channelId || !config.fashionReportReminder || !fridayFashionReady) continue;
    if (config.lastFashionKey === thisWeek) continue;

    const channel = await fetchTextChannel(client, config.channelId);
    if (!channel) continue;

    await channel.send({
      content: config.roleId ? `<@&${config.roleId}>` : undefined,
      embeds: [
        saucerEmbed(
          'Fashion Report Reminder',
          'The weekly Fashion Report judging window should be available. Check current community guides before locking dyes or glamour pieces.',
          FASHION_REPORT_URL,
        ),
      ],
    }).catch((error: unknown) => {
      logger.warn(`[GoldSaucer][${guildId}] Failed to send Fashion Report reminder`, error);
    });

    config.lastFashionKey = thisWeek;
    changed = true;
  }

  return changed;
}

async function runMarketAlerts(client: Client, store: FeatureStore) {
  let changed = false;
  const now = Date.now();

  for (const [guildId, state] of Object.entries(store)) {
    const alerts = state.marketAlerts ?? [];
    for (const alert of alerts.slice(0, 100)) {
      if (alert.lastTriggeredAt && now - alert.lastTriggeredAt < MARKET_ALERT_COOLDOWN_MS) continue;

      const quote = await fetchMarketQuote(alert.world, alert.itemId).catch((error: unknown) => {
        logger.debug(`[Market][${guildId}] Alert ${alert.id} failed`, error);
        return null;
      });
      const price = quote?.minPrice ?? null;
      if (!quote || !price) continue;

      alert.lastSeenPrice = price;
      const triggered = alert.direction === 'below'
        ? price <= alert.targetPrice
        : price >= alert.targetPrice;

      if (!triggered) {
        changed = true;
        continue;
      }

      const channel = await fetchTextChannel(client, alert.channelId);
      if (!channel) continue;

      await channel.send({
        content: `<@${alert.userId}>`,
        embeds: [marketAlertTriggeredEmbed(alert, quote)],
      }).catch((error: unknown) => {
        logger.warn(`[Market][${guildId}] Failed to send alert ${alert.id}`, error);
      });
      alert.lastTriggeredAt = now;
      changed = true;
    }
  }

  return changed;
}

async function runNewsPosts(client: Client, store: FeatureStore) {
  let changed = false;

  for (const [guildId, state] of Object.entries(store)) {
    const config = state.news;
    if (!config?.channelId) continue;

    const channel = await fetchTextChannel(client, config.channelId);
    if (!channel) continue;

    const items = await fetchNews(config.category, 3).catch((error: unknown) => {
      logger.debug(`[News][${guildId}] Failed to fetch ${config.category}`, error);
      return [];
    });

    const seen = new Set(config.seenLinks ?? []);
    const fresh = items.filter(item => !seen.has(item.link)).reverse();
    for (const item of fresh) {
      await channel.send({
        content: config.roleId ? `<@&${config.roleId}>` : undefined,
        embeds: [newsEmbed(item, config)],
      }).catch((error: unknown) => {
        logger.warn(`[News][${guildId}] Failed to send ${item.link}`, error);
      });
      seen.add(item.link);
      changed = true;
    }

    config.seenLinks = Array.from(seen).slice(-50);
  }

  return changed;
}

export function startFeatureScheduler(client: Client) {
  startTaskLoop(async () => {
    if (!client.isReady()) return;

    const store = await loadFeatureStore();
    const now = new Date();

    const changed = [
      await runResetReminders(client, store, now),
      await runSaucerReminders(client, store, now),
      await runMarketAlerts(client, store),
      await runNewsPosts(client, store),
    ].some(Boolean);

    if (changed) await saveFeatureStore(store);
  }, { intervalMs: 5 * 60 * 1000, jitterRatio: 0.15, immediate: true });
}
