// functions/housing/housingRefresh.ts

import { Client, ForumChannel, ChannelType, ThreadChannel } from 'discord.js';
import type { TextBasedChannel } from 'discord.js';
import path from 'node:path';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { logger } from '../../lib/logger.js';
import { configManager } from '../../handlers/configHandler.js';
import { HousingRequired } from '../../schemas/housing.js';
import { PaissaProvider, PaissaUnavailableError, type Plot } from './housingProvider.paissa.js';
import { plotEmbed } from '../../embeds/housingEmbeds.js';
import { threadManager } from '../../lib/threadManager.js';
import { plotKey, plotHash } from './housingUtils.js';

// ---------------------------------------------------
// Types & Constants
// ---------------------------------------------------

/**
 * Record of messages and threads we manage for a guild.
 * - threads: map of "Thread Title" → threadId
 * - messages: map of plotKey → message metadata
 */
type StoredMessage = {
  threadId: string;
  messageId: string;
  hash?: string;
  deleteAt?: number;
  refreshedAt?: number;
};

type MsgRecord = {
  channelId: string;
  threads: Record<string, string>;
  messages: Record<string, StoredMessage>;
  config?: { dataCenter: string; worlds: string[]; districts: string[] };
};

// PaissaDB API and file path for the JSON file
const provider = new PaissaProvider();
const filePath = path.join(process.cwd(), 'src', 'json', 'housing_messages.json');

// ---------------------------------------------------
// Main: refreshHousing
// ---------------------------------------------------


/**
 * Refresh housing messages for a guild forum:
 *  - Validates housing config
 *  - Loads persisted message/thread map
 *  - Fetches current free plots
 *  - Updates existing messages (edit/delete)
 *  - Creates threads/messages for new plots
 *  - Persists updated state
 * 
 * Concurrency:
 *  Runs under threadManager lock "housing:refresh" and blocks with setup/reset.
 * 
 * @param client - Discord Client 
 * @param guildID - guildId
 */
export async function refreshHousing(client: Client, guildID: string) {
  return threadManager.run(
    'housing:refresh',
    async () => {

  // ---------------------------------------------------    
  // Load & validate configuration
  // ---------------------------------------------------
  const config = await configManager.get(guildID).catch((err: any) => {
    logger.debug(`[🏠Housing][${guildID}] Config laden fehlgeschlagen: ${String(err)}`);
    return null;
  });
  if (!config) {
    return null;
  }

  const h = (config['housing'] as any) ?? null;
  const ok = HousingRequired.safeParse(h);
  if (!ok.success) {
    logger.debug(
      `[🏠Housing][${guildID}] Housing-Config invalid (safeParse). Abbruch.`,
      (ok as any).error?.issues ?? undefined
    );
    return null;
  }

  const hc = ok.data;
  logger.debug(`[🏠Housing][${guildID}] Config Loading OK`, {
    channelId: hc.channelId,
    dataCenter: hc.dataCenter,
    worlds: hc.worlds ?? [hc.worlds].filter(Boolean),
    districts: hc.districts
  });

  // ---------------------------------------------------
  // Resolve target channel and ensure it is a forum
  // ---------------------------------------------------
  const channelCache = new Map<string, any>();
  const fetchChannelCached = async (id: string, context: string) => {
    if (channelCache.has(id)) return channelCache.get(id);
    const channel = await client.channels.fetch(id).catch((e) => {
      logger.debug(`[🏠Housing][${guildID}] ${context}: ${String(e)}`);
      return null;
    });
    channelCache.set(id, channel);
    return channel;
  };

  const ch = await fetchChannelCached(hc.channelId, `Channel fetch fehlgeschlagen (channelId=${hc.channelId})`);
  if (!ch) {
    return null;
  }
  if (ch.type !== ChannelType.GuildForum) {
    logger.debug(`[🏠Housing][${guildID}] Channel ist kein GuildForum (type=${ch.type}) → abort`);
    return null;
  }
  const forum = ch as ForumChannel;

  // ---------------------------------------------------
  // Load persisted store (threads/messages)
  // ---------------------------------------------------
  let store: Record<string, MsgRecord> = {};
  try {
    const raw = await readFile(filePath, 'utf8');
    store = JSON.parse(raw) as Record<string, MsgRecord>;
  } catch (e: any) {
    logger.debug(
      `[🏠Housing][${guildID}] Konnte ${filePath} nicht lesen oder parsen – starte mit leerem Store. Fehler: ${String(e)}`
    );
    store = {};
  }

  // Ensure we have a record for this guild
  const rec: MsgRecord =
    store[guildID] ?? {
      channelId: hc.channelId,
      threads: {},
      messages: {}
    };
  rec.channelId = hc.channelId;
  store[guildID] = rec;

  let storeChanged = false;
  const normalizedConfig = {
    dataCenter: hc.dataCenter,
    worlds: [...hc.worlds].sort(),
    districts: [...hc.districts].sort(),
  };
  const prevConfig = rec.config
    ? {
        dataCenter: rec.config.dataCenter,
        worlds: [...rec.config.worlds].sort(),
        districts: [...rec.config.districts].sort(),
      }
    : null;
  if (
    !prevConfig ||
    prevConfig.dataCenter !== normalizedConfig.dataCenter ||
    prevConfig.worlds.join('|') !== normalizedConfig.worlds.join('|') ||
    prevConfig.districts.join('|') !== normalizedConfig.districts.join('|')
  ) {
    rec.config = {
      dataCenter: normalizedConfig.dataCenter,
      worlds: [...normalizedConfig.worlds],
      districts: [...normalizedConfig.districts],
    };
    storeChanged = true;
  }

  const startedAt = Date.now();
  logger.info(`[🏠Housing][${guildID}] Refresh started for the Server`);

  // ---------------------------------------------------
  // Read existing threads, dedupe by name
  // (keep oldest; delete newer duplicates)
  // ---------------------------------------------------
  const threadsByName = new Map<string, ThreadChannel[]>();
  try {
    const active = await forum.threads.fetchActive();
    active.threads.forEach((t) => {
      const arr = threadsByName.get(t.name) ?? [];
      arr.push(t);
      threadsByName.set(t.name, arr);
    });
  } catch {}
  try {
    const archived = await forum.threads.fetch({ archived: { limit: 100 } });
    archived.threads.forEach((t) => {
      const arr = threadsByName.get(t.name) ?? [];
      arr.push(t);
      threadsByName.set(t.name, arr);
    });
  } catch {}

  // Choose oldest thread per name and delete duplicates
  for (const [name, arr] of threadsByName) {
    arr.sort((a, b) => (a.createdTimestamp ?? 0) - (b.createdTimestamp ?? 0));
    const keep = arr[0]!;
    rec.threads[name] = keep.id;
    for (const dupe of arr.slice(1)) {
      await dupe.delete().catch(() => null);
    }
  }

  let removed = 0;

  // ---------------------------------------------------
  // Fetch plots from provider (already filtered by provider)
  // ---------------------------------------------------
  const allPlots = [] as Awaited<ReturnType<typeof provider.fetchFreePlots>>;
  const worlds: string[] = (hc.worlds && Array.isArray(hc.worlds) && hc.worlds.length > 0)
    ? hc.worlds
    : [];

  if (!worlds.length) {
    logger.debug(`[🏠Housing][${guildID}] Keine Worlds in der Config. Abbruch.`);
    return null;
  }

  const results = await Promise.allSettled(
    worlds.map((world) => provider.fetchFreePlots(hc.dataCenter, world, hc.districts))
  );

  let apiDown = false;
  results.forEach((res, idx) => {
    if (res.status === 'fulfilled') {
      allPlots.push(...res.value);
      return;
    }

    const world = worlds[idx];
    const reason = res.reason;
    if (reason instanceof PaissaUnavailableError) {
      apiDown = true;
      logger.warn(
        `[🏠Housing][${guildID}] Paissa API unavailable during refresh (world=${world}): ${reason.status ?? 'network error'}`
      );
      return;
    }

    logger.error(`[🏠Housing][${guildID}] Provider-Fehler (world=${world}): ${String(reason)}`);
  });

  if (apiDown) {
    return null;
  }

  // Build quick-lookup map of the currently available plots
  const now = new Date();
  const available = new Map<string, Plot>();
  for (const p of allPlots) available.set(plotKey(p), p);

  // ---------------------------------------------------
  // Update/Delete existing messages based on current availability
  // ---------------------------------------------------
  let updated = 0;
  for (const [key, info] of Object.entries(rec.messages)) {
    const plot = available.get(key);

    // Resolve thread (text-based channel)
    const channel = await fetchChannelCached(
      info.threadId,
      `Edit-Pfad: Thread fetch fehlgeschlagen (threadId=${info.threadId})`
    );

    // If thread missing or not text-based -> drop this record
    if (!channel || !('isTextBased' in channel) || !(channel as any).isTextBased()) {
      delete rec.messages[key];
      removed++;
      storeChanged = true;
      continue;
    }

    const textChannel = channel as TextBasedChannel;

    // Resolve message; if gone, drop the record
    const msg = await textChannel.messages.fetch(info.messageId).catch(() => null);
    if (!msg) {
      delete rec.messages[key];
      removed++;
      storeChanged = true;
      continue;
    }

    // If plot no longer available, delete the message and drop the record
    if (!plot) {
      await msg.delete().catch((e) => {
        logger.debug(
          `[🏠Housing][${guildID}] Löschen (nicht mehr in API) fehlgeschlagen (messageId=${info.messageId}): ${String(e)}`
        );
      });
      delete rec.messages[key];
      removed++;
      storeChanged = true;
      continue;
    }

    // Past lottery cutoff? Clean up message & record.
    if (plot.lottery?.phaseUntil && plot.lottery.phaseUntil <= Date.now()) {
      await msg.delete().catch((e) => {
        logger.debug(
          `[🏠Housing][${guildID}] Löschen (phaseUntil überschritten) fehlgeschlagen (messageId=${info.messageId}): ${String(e)}`
        );
      });
      delete rec.messages[key];
      removed++;
      continue;
    }

    // Compute new hash from plot; edit message if something changed
    const newHash = plotHash(plot);
    const { embed, attachment } = plotEmbed(plot, now);
    (embed as any).timestamp = now.toISOString();

    const opts: any = { embeds: [embed] };
    const hashChanged = info.hash !== newHash;
    if (hashChanged && attachment) opts.files = [attachment];

    await msg.edit(opts).catch((e) => {
      logger.debug(
        `[🏠Housing][${guildID}] Edit fehlgeschlagen (messageId=${info.messageId}, key=${key}): ${String(e)}`
      );
    });

    // Keep deleteAt in sync with lottery phase
    if (plot.lottery?.phaseUntil) {
      if (info.deleteAt !== plot.lottery.phaseUntil) {
        info.deleteAt = plot.lottery.phaseUntil;
        storeChanged = true;
      }
    } else if (info.deleteAt) {
      delete info.deleteAt;
      storeChanged = true;
    }

    info.refreshedAt = Date.now();
    storeChanged = true;

    // Update stored hash if changed
    if (hashChanged) {
      info.hash = newHash;
      updated++;
    }

    // Remove from "available" so we don't post it again as "new"
    available.delete(key);
  }

  // ---------------------------------------------------
  // Build mention string based on config
  // ---------------------------------------------------
  const mention = [
    hc.pingUserId ? `<@${hc.pingUserId}>` : null,
    hc.pingRoleId ? `<@&${hc.pingRoleId}>` : null
  ]
  .filter(Boolean)
  .join(' ');
  
  // ---------------------------------------------------
  // Post new plots (create thread per "world - district" as needed)
  // ---------------------------------------------------
  let added = 0;
  for (const [key, plot] of available) {
    // Skip if already tracked (defensive check)
    if (rec.messages[key]) continue;

    const { embed, attachment } = plotEmbed(plot, now);
    (embed as any).timestamp = now.toISOString();

    // Thread pro world/district
    const threadName = `${plot.world} - ${plot.district}`;
    let threadId = rec.threads[threadName];
    let thread: any = null;

    // Try to reuse existing thread if it's still valid & text-based
    if (threadId) {
      thread = await fetchChannelCached(
        threadId,
        `Gespeicherten Thread nicht fetchbar (thread=${threadName}, threadId=${threadId})`
      );

      if (!(thread && 'isTextBased' in thread && (thread as any).isTextBased())) {
        logger.debug(
          `[🏠Housing][${guildID}] Gespeicherter Thread unbrauchbar → Erzeuge neuen (thread=${threadName})`
        );
        thread = null;
      }
    }

    if (!thread) {
      // Create a new forum thread with a starter message
      const starterMsg: any = { embeds: [embed], files: attachment ? [attachment] : [] };
      if (mention) starterMsg.content = mention;

      thread = await forum.threads
        .create({
          name: threadName,
          message: starterMsg
        })
        .catch((e) => {
          logger.debug(
            `[🏠Housing][${guildID}] Thread-Erstellung fehlgeschlagen (thread=${threadName}): ${String(e)}`
          );
          return null;
        });

      if (!thread) continue;

      // Persist thread ID
      rec.threads[threadName] = thread.id;
      storeChanged = true;

      // Track the starter message as the plot message
      const starter = await thread.fetchStarterMessage().catch(() => null);
      const starterId = starter?.id ?? '';

      rec.messages[key] = {
        threadId: thread.id,
        messageId: starterId,
        hash: plotHash(plot),
        refreshedAt: Date.now(),
        ...(plot.lottery?.phaseUntil ? { deleteAt: plot.lottery.phaseUntil } : {})
      };
      storeChanged = true;

      added++;
    } else {
      // Post into existing thread
      const threadChannel = thread as import('discord.js').ThreadChannel;
      const msg: any = { embeds: [embed], files: attachment ? [attachment] : [] };
      if (mention) msg.content = mention;

      const sent = await threadChannel.send(msg).catch((e) => {
        logger.debug(
          `[🏠Housing][${guildID}] Senden in Thread fehlgeschlagen (thread=${threadName}): ${String(e)}`
        );
        return null;
      });

      if (!sent) continue;

      // Track this newly created message
      rec.messages[key] = {
        threadId: thread.id,
        messageId: sent.id,
        hash: plotHash(plot),
        refreshedAt: Date.now(),
        ...(plot.lottery?.phaseUntil ? { deleteAt: plot.lottery.phaseUntil } : {})
      };
      storeChanged = true;

      added++;
    }
  }

  // ---------------------------------------------------
  // Persist state and log result
  // ---------------------------------------------------
  if (storeChanged || added || removed || updated) {
    await writeSafe(filePath, store, guildID);
  }

  const elapsedMs = Date.now() - startedAt;
  logger.info(`[🏠Housing][${guildID}] Refresh Ended for the Server`);

  return { added, removed, updated, elapsedMs };
    },
    // Concurrency: scope to guild; block when setup/reset are running
    { guildId: guildID, blockWith: ['housing:setup', 'housing:reset'] }
  );
}

// ---------------------------------------------------
// Safe write helper
// ---------------------------------------------------

/**
 * Write the store JSON to disk with directory creation and logging.
 * 
 * @param fp - Path
 * @param store - JSON File
 * @param guildId - guildID
 */
async function writeSafe(fp: string, store: Record<string, MsgRecord>, guildId: string) {
  try {
    await mkdir(path.dirname(fp), { recursive: true });
    await writeFile(fp, JSON.stringify(store, null, 2), 'utf8');
    logger.debug(
      `[🏠Housing][${guildId}] State gespeichert (${fp}) | threads=${Object.keys(store[guildId]?.threads ?? {}).length} messages=${Object.keys(store[guildId]?.messages ?? {}).length}`
    );
  } catch (e: any) {
    logger.error(`[🏠Housing][${guildId}] Fehler beim Schreiben von ${fp}: ${String(e)}`);
  }
}
