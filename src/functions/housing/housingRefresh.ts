// functions/housing/housingRefresh.ts

import { Client, ForumChannel, ChannelType, ThreadChannel } from 'discord.js';
import type { TextBasedChannel } from 'discord.js';
import path from 'node:path';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { logger } from '../../lib/logger.js';
import { configManager } from '../../handlers/configHandler.js';
import { HousingRequired } from '../../schemas/housing.js';
import { PaissaProvider, type Plot } from './housingProvider.paissa.js';
import { plotEmbed } from '../../commands/housing/embed.js';
import { threadManager } from '../../lib/threadManager.js';

// ---------------------------------------------------
// Types & Constants
// ---------------------------------------------------

/**
 * Record of messages and threads we manage for a guild.
 * - threads: map of "Thread Title" → threadId
 * - messages: map of plotKey → message metadata
 */
type MsgRecord = {
  channelId: string;
  threads: Record<string, string>;
  messages: Record<
    string,
    { threadId: string; messageId: string; hash?: string; deleteAt?: number }
  >;
};

// PaissaDB API and file path for the JSON file
const provider = new PaissaProvider();
const filePath = path.join(process.cwd(), 'src', 'json', 'housing_messages.json');

// ---------------------------------------------------
// Helpers: keys & hashing
// ---------------------------------------------------

// Normalize district names (strip leading "the", lower-case, trim).
function normDistrict(d: string): string {
  return d.replace(/^the\s+/i, '').trim().toLowerCase();
}

/**
 * Create a stable, human-meaningful key for a plot.
 * This lets us correlate an API plot to an existing message.
 */
function plotKey(p: Plot): string {
  return [
    p.dataCenter.toLowerCase(),
    p.world.toLowerCase(),
    normDistrict(p.district),
    p.ward,
    p.plot
  ].join(':');
}

/**
 * Compute a stable hash for a plot's *displayed content*.
 * Only fields that change the embed output should be included here;
 * this ensures we only edit messages if something visible changed.
 */
function plotHash(p: Plot): string {
  const stable = {
    dataCenter: p.dataCenter,
    world: p.world,
    district: p.district,
    ward: p.ward,
    plot: p.plot,
    size: p.size,
    price: p.price,
    lottery: {
      phaseUntil: p.lottery?.phaseUntil ?? null,
      entrants: p.lottery?.entries ?? null,
    }
  };
  return JSON.stringify(stable);
}

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
      const startedAt = Date.now();
      logger.info(`[🏠Housing][${guildID}] Refresh started for the Server`);

  // ---------------------------------------------------    
  // Load & validate configuration
  // ---------------------------------------------------
  const config = await configManager.get(guildID).catch((err: any) => {
    logger.debug(`[🏠Housing][${guildID}] Config laden fehlgeschlagen: ${String(err)}`);
    return null;
  });
  if (!config) {
    return { added: 0, removed: 0, updated: 0 };
  }

  const h = (config['housing'] as any) ?? null;
  const ok = HousingRequired.safeParse(h);
  if (!ok.success) {
    logger.debug(
      `[🏠Housing][${guildID}] Housing-Config invalid (safeParse). Abbruch.`,
      (ok as any).error?.issues ?? undefined
    );
    return { added: 0, removed: 0, updated: 0 };
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
  const ch = await client.channels.fetch(hc.channelId).catch((e) => {
    logger.debug(`[🏠Housing][${guildID}] Channel fetch fehlgeschlagen (channelId=${hc.channelId}): ${String(e)}`);
    return null;
  });
  if (!ch) {
    return { added: 0, removed: 0, updated: 0 };
  }
  if (ch.type !== ChannelType.GuildForum) {
    logger.debug(`[🏠Housing][${guildID}] Channel ist kein GuildForum (type=${ch.type}) → abort`);
    return { added: 0, removed: 0, updated: 0 };
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

  // If this guild has no stored messages, they probably didn't run /housing setup yet.
  if (Object.keys(rec.messages).length === 0) {
    logger.debug(
      `[🏠Housing][${guildID}] No stored housing messages found – run /housing setup first. Aborting refresh.`
    );
    return null;
  }

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
  // Fetch plots from provider (filtered & valid)
  // ---------------------------------------------------
  const allPlots = [] as Awaited<ReturnType<typeof provider.fetchFreePlots>>;
  const worlds: string[] = (hc.worlds && Array.isArray(hc.worlds) && hc.worlds.length > 0)
    ? hc.worlds
    : [];

  if (!worlds.length) {
    logger.debug(`[🏠Housing][${guildID}] Keine Worlds in der Config. Abbruch.`);
    await writeSafe(filePath, store, guildID);
    return { added: 0, removed, updated: 0 };
  }

  const nowMs = Date.now();
  for (const world of worlds) {
    try {
      const p = await provider.fetchFreePlots(hc.dataCenter, world, hc.districts);
      // Filter out invalid/expired entries (e.g., lottery phase ended)
      const valid = p.filter(
        (pl) => pl.ward > 0 && !(pl.lottery?.phaseUntil && pl.lottery.phaseUntil <= nowMs)
      );
      allPlots.push(...valid);
    } catch (e: any) {
      logger.error(`[🏠Housing][${guildID}] Provider-Fehler (world=${world}): ${String(e)}`);
    }
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
    const channel = await client.channels.fetch(info.threadId).catch((e) => {
      logger.debug(
        `[🏠Housing][${guildID}] Edit-Pfad: Thread fetch fehlgeschlagen (threadId=${info.threadId}): ${String(e)}`
      );
      return null;
    });

    // If thread missing or not text-based -> drop this record
    if (!channel || !('isTextBased' in channel) || !(channel as any).isTextBased()) {
      delete rec.messages[key];
      removed++;
      continue;
    }

    const textChannel = channel as TextBasedChannel;

    // Resolve message; if gone, drop the record
    const msg = await textChannel.messages.fetch(info.messageId).catch(() => null);
    if (!msg) {
      delete rec.messages[key];
      removed++;
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
    if (plot.lottery?.phaseUntil) info.deleteAt = plot.lottery.phaseUntil;
    else delete info.deleteAt;

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
      thread = await client.channels.fetch(threadId).catch((e) => {
        logger.debug(
          `[🏠Housing][${guildID}] Gespeicherten Thread nicht fetchbar (thread=${threadName}, threadId=${threadId}): ${String(
            e
          )}`
        );
        return null;
      });

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

      // Track the starter message as the plot message
      const starter = await thread.fetchStarterMessage().catch(() => null);
      const starterId = starter?.id ?? '';

      rec.messages[key] = {
        threadId: thread.id,
        messageId: starterId,
        hash: plotHash(plot),
        ...(plot.lottery?.phaseUntil ? { deleteAt: plot.lottery.phaseUntil } : {})
      };

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
        ...(plot.lottery?.phaseUntil ? { deleteAt: plot.lottery.phaseUntil } : {})
      };

      added++;
    }
  }

  // ---------------------------------------------------
  // Persist state and log result
  // ---------------------------------------------------
  await writeSafe(filePath, store, guildID);

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
