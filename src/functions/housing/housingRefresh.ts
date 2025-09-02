import { Client, ForumChannel, ChannelType } from 'discord.js';
import type { TextBasedChannel } from 'discord.js';
import path from 'node:path';
import { readFile, writeFile } from 'node:fs/promises';
import { logger } from '../../lib/logger.js';
import { configManager } from '../../handlers/configHandler.js';
import { HousingRequired } from '../../schemas/housing.js';
import { PaissaProvider, type Plot } from './housingProvider.paissa.js';
import { plotEmbed } from '../../commands/housing/embed.js';

type MsgRecord = {
  channelId: string;
  threads: Record<string, string>;
  messages: Record<
    string,
    { threadId: string; messageId: string; hash?: string; deleteAt?: number }
  >;
};

const provider = new PaissaProvider();
const filePath = path.join(process.cwd(), 'src', 'json', 'housing_messages.json');

function plotKey(p: Plot): string {
  return [p.dataCenter, p.world, p.district, p.ward, p.plot].join(':');
}

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


export async function refreshHousing(client: Client, guildID: string) {
  const startedAt = Date.now();
  logger.info(`[🏠Housing][${guildID}] Refresh started for the Server (AUTO)`);

  // 1) Config laden & validieren
  const config = await configManager.get(guildID).catch((err: any) => {
    logger.error(`[🏠Housing][${guildID}] Config laden fehlgeschlagen: ${String(err)}`);
    return null;
  });
  if (!config) {
    return { added: 0, removed: 0, updated: 0 };
  }

  const h = (config['housing'] as any) ?? null;
  const ok = HousingRequired.safeParse(h);
  if (!ok.success) {
    logger.warn(
      `[🏠Housing][${guildID}] Housing-Config invalid (safeParse). Abbruch.`,
      (ok as any).error?.issues ?? undefined
    );
    return { added: 0, removed: 0, updated: 0 };
  }

  const hc = ok.data;
  logger.info(`[🏠Housing][${guildID}] Config Loading OK`, {
    channelId: hc.channelId,
    dataCenter: hc.dataCenter,
    worlds: hc.worlds ?? [hc.worlds].filter(Boolean),
    districts: hc.districts
  });

  // 2) Forum-Channel holen
  const ch = await client.channels.fetch(hc.channelId).catch((e) => {
    logger.error(`[🏠Housing][${guildID}] Channel fetch fehlgeschlagen (channelId=${hc.channelId}): ${String(e)}`);
    return null;
  });
  if (!ch) {
    return { added: 0, removed: 0, updated: 0 };
  }
  if (ch.type !== ChannelType.GuildForum) {
    logger.warn(`[🏠Housing][${guildID}] Channel ist kein GuildForum (type=${ch.type}) → abort`);
    return { added: 0, removed: 0, updated: 0 };
  }
  const forum = ch as ForumChannel;

  // 3) Persistenz laden
  let store: Record<string, MsgRecord> = {};
  try {
    const raw = await readFile(filePath, 'utf8');
    store = JSON.parse(raw) as Record<string, MsgRecord>;
  } catch (e: any) {
    logger.warn(
      `[🏠Housing][${guildID}] Konnte ${filePath} nicht lesen oder parsen – starte mit leerem Store. Fehler: ${String(e)}`
    );
    store = {};
  }

  const rec: MsgRecord =
    store[guildID] ?? {
      channelId: hc.channelId,
      threads: {},
      messages: {}
    };
  rec.channelId = hc.channelId;
  store[guildID] = rec;

  let removed = 0;

  // 4) Plots vom Provider holen
  const allPlots = [] as Awaited<ReturnType<typeof provider.fetchFreePlots>>;
  const worlds: string[] = (hc.worlds && Array.isArray(hc.worlds) && hc.worlds.length > 0)
    ? hc.worlds
    : [];

  if (!worlds.length) {
    logger.warn(`[🏠Housing][${guildID}] Keine Worlds in der Config. Abbruch.`);
    await writeSafe(filePath, store, guildID);
    return { added: 0, removed, updated: 0 };
  }

  for (const world of worlds) {
    try {
      const p = await provider.fetchFreePlots(hc.dataCenter, world, hc.districts);
      allPlots.push(...p);
    } catch (e: any) {
      logger.error(`[🏠Housing][${guildID}] Provider-Fehler (world=${world}): ${String(e)}`);
    }
  }

  const now = new Date();
  const available = new Map<string, Plot>();
  for (const p of allPlots) available.set(plotKey(p), p);

  // 5) Aktualisieren/Löschen bestehender Nachrichten
  let updated = 0;
  for (const [key, info] of Object.entries(rec.messages)) {
    const plot = available.get(key);

    const channel = await client.channels.fetch(info.threadId).catch((e) => {
      logger.warn(
        `[🏠Housing][${guildID}] Edit-Pfad: Thread fetch fehlgeschlagen (threadId=${info.threadId}): ${String(e)}`
      );
      return null;
    });

    if (!channel || !('isTextBased' in channel) || !(channel as any).isTextBased()) {
      delete rec.messages[key];
      removed++;
      continue;
    }

    const textChan = channel as TextBasedChannel;

    const msg = await textChan.messages.fetch(info.messageId).catch(() => null);
    if (!msg) {
      delete rec.messages[key];
      removed++;
      continue;
    }

    if (!plot) {
      await msg.delete().catch((e) => {
        logger.warn(
          `[🏠Housing][${guildID}] Löschen (nicht mehr in API) fehlgeschlagen (messageId=${info.messageId}): ${String(e)}`
        );
      });
      delete rec.messages[key];
      removed++;
      continue;
    }

    if (plot.lottery?.phaseUntil && plot.lottery.phaseUntil <= Date.now()) {
      await msg.delete().catch((e) => {
        logger.warn(
          `[🏠Housing][${guildID}] Löschen (phaseUntil überschritten) fehlgeschlagen (messageId=${info.messageId}): ${String(e)}`
        );
      });
      delete rec.messages[key];
      removed++;
      continue;
    }

    const newHash = plotHash(plot);
    const { embed, attachment } = plotEmbed(plot, now);
    (embed as any).timestamp = now.toISOString();

    const opts: any = { embeds: [embed] };
    const hashChanged = info.hash !== newHash;
    if (hashChanged && attachment) opts.files = [attachment];

    await msg.edit(opts).catch((e) => {
      logger.warn(
        `[🏠Housing][${guildID}] Edit fehlgeschlagen (messageId=${info.messageId}, key=${key}): ${String(e)}`
      );
    });

    if (plot.lottery?.phaseUntil) info.deleteAt = plot.lottery.phaseUntil;
    else delete info.deleteAt;

    if (hashChanged) {
      info.hash = newHash;
      updated++;
    }

    // remove from available so it won't be treated as new
    available.delete(key);
  }

  // 6) Mentions vorbereiten
  const mention = [
    hc.pingUserId ? `<@${hc.pingUserId}>` : null,
    hc.pingRoleId ? `<@&${hc.pingRoleId}>` : null
  ]
    .filter(Boolean)
    .join(' ');

  // 7) Neue Plots posten
  let added = 0;
  for (const [key, plot] of available) {
    if (rec.messages[key]) continue;

    const { embed, attachment } = plotEmbed(plot, now);
    (embed as any).timestamp = now.toISOString();

    // Thread je Bezirk
    let threadId = rec.threads[plot.district];
    let thread: any = null;

    if (threadId) {
      thread = await client.channels.fetch(threadId).catch((e) => {
        logger.warn(
          `[🏠Housing][${guildID}] Gespeicherten Thread nicht fetchbar (district=${plot.district}, threadId=${threadId}): ${String(
            e
          )}`
        );
        return null;
      });

      if (!(thread && 'isTextBased' in thread && (thread as any).isTextBased())) {
        logger.info(
          `[🏠Housing][${guildID}] Gespeicherter Thread unbrauchbar → Erzeuge neuen (district=${plot.district})`
        );
        thread = null;
      }
    }

    if (!thread) {
      // neuen Thread mit Starter-Post
      const starterMsg: any = { embeds: [embed], files: attachment ? [attachment] : [] };
      if (mention) starterMsg.content = mention;

      thread = await forum.threads
        .create({
          name: plot.district,
          message: starterMsg
        })
        .catch((e) => {
          logger.error(
            `[🏠Housing][${guildID}] Thread-Erstellung fehlgeschlagen (district=${plot.district}): ${String(e)}`
          );
          return null;
        });

      if (!thread) continue;

      rec.threads[plot.district] = thread.id;

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
      // Nachricht in existierendem Thread senden
      const threadChan = thread as import('discord.js').ThreadChannel;
      const msg: any = { embeds: [embed], files: attachment ? [attachment] : [] };
      if (mention) msg.content = mention;

      const sent = await threadChan.send(msg).catch((e) => {
        logger.error(
          `[🏠Housing][${guildID}] Senden in Thread fehlgeschlagen (district=${plot.district}): ${String(e)}`
        );
        return null;
      });

      if (!sent) continue;

      rec.messages[key] = {
        threadId: thread.id,
        messageId: sent.id,
        hash: plotHash(plot),
        ...(plot.lottery?.phaseUntil ? { deleteAt: plot.lottery.phaseUntil } : {})
      };
      
      logger.info(`[🏠Housing][${guildID}] Refresh Ended for the Server`);
      added++;
    }
  }

  // 9) Persistenz speichern
  await writeSafe(filePath, store, guildID);

  const elapsedMs = Date.now() - startedAt;

  return { added, removed, updated, elapsedMs };
}

/** Safe write helper mit Logging */
async function writeSafe(fp: string, store: Record<string, MsgRecord>, guildId: string) {
  try {
    await writeFile(fp, JSON.stringify(store, null, 2), 'utf8');
    logger.info(
      `[🏠Housing][${guildId}] State gespeichert (${fp}) | threads=${Object.keys(store[guildId]?.threads ?? {}).length} messages=${Object.keys(store[guildId]?.messages ?? {}).length}`
    );
  } catch (e: any) {
    logger.error(`[🏠Housing][${guildId}] Fehler beim Schreiben von ${fp}: ${String(e)}`);
  }
}
