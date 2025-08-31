import type { Client } from 'discord.js';
import { ChannelType, ForumChannel } from 'discord.js';
import { configManager } from '../../handlers/configHandler.js';
import { HousingRequired } from '../../schemas/housing.js';
import { PaissaProvider, type Plot } from './housingProvider.paissa.js';
import { plotEmbed } from '../../commands/housing/embed.js';
import path from 'node:path';
import { readFile, writeFile } from 'node:fs/promises';

const provider = new PaissaProvider();
const filePath = path.join(process.cwd(), 'src', 'guildconfig', 'housing_messages.json');

function plotKey(p: Plot): string {
  return [p.dataCenter, p.world, p.district, p.ward, p.plot].join(':');
}

function plotHash(p: Plot): string {
  return JSON.stringify(p);
}

type MsgRecord = {
  channelId: string;
  threads: Record<string, string>;
  messages: Record<string, { threadId: string; messageId: string; hash?: string }>;
};

async function pruneMissingMessages(client: Client, rec: MsgRecord): Promise<number> {
  let removed = 0;
  for (const [key, info] of Object.entries(rec.messages)) {
    const thread = await client.channels.fetch(info.threadId).catch(() => null);
    if (!thread || !thread.isTextBased()) {
      delete rec.messages[key];
      removed++;
      continue;
    }
    const msg = await thread.messages.fetch(info.messageId).catch(() => null);
    if (!msg) {
      delete rec.messages[key];
      removed++;
    }
  }
  return removed;
}

export async function refreshHousing(client: Client, guildID: string) {
  const config = await configManager.get(guildID);
  const h = (config['housing'] as any) ?? null;
  const ok = HousingRequired.safeParse(h);
  if (!ok.success) return { added: 0, removed: 0, updated: 0 };
  const hc = ok.data;

  const ch = await client.channels.fetch(hc.channelId).catch(() => null);
  if (!ch || ch.type !== ChannelType.GuildForum) return { added: 0, removed: 0, updated: 0 };

  let store: Record<string, MsgRecord> = {};
  try {
    store = JSON.parse(await readFile(filePath, 'utf8')) as Record<string, MsgRecord>;
  } catch {
    store = {};
  }
  const rec: MsgRecord = store[guildID] ?? { channelId: hc.channelId, threads: {}, messages: {} };
  rec.channelId = hc.channelId;
  store[guildID] = rec;

  let removed = await pruneMissingMessages(client, rec);
  const allPlots = [] as Awaited<ReturnType<typeof provider.fetchFreePlots>>;
  for (const world of hc.worlds) {
    const p = await provider.fetchFreePlots(hc.dataCenter, world, hc.districts);
    allPlots.push(...p);
  }

  const now = new Date();
  const available = new Map<string, Plot>();
  for (const p of allPlots) {
    available.set(plotKey(p), p);
  }

  let updated = 0;
  for (const key of Object.keys(rec.messages)) {
    const info = rec.messages[key];
    if (!info) continue;
    const plot = available.get(key);
    const thread = await client.channels.fetch(info.threadId).catch(() => null);
    if (!plot) {
      if (thread && thread.isTextBased()) {
        await thread.messages.delete(info.messageId).catch(() => {});
      }
      delete rec.messages[key];
      removed++;
    } else if (thread && thread.isTextBased()) {
      const newHash = plotHash(plot);
      if (info.hash !== newHash) {
        const { embed, attachment } = plotEmbed(plot, now);
        await thread.messages
          .edit(info.messageId, { embeds: [embed], files: attachment ? [attachment] : [] })
          .catch(() => {});
        info.hash = newHash;
        updated++;
      }
    }
  }

  const mention = [
    hc.pingUserId ? `<@${hc.pingUserId}>` : null,
    hc.pingRoleId ? `<@&${hc.pingRoleId}>` : null,
  ]
    .filter(Boolean)
    .join(' ');

  let added = 0;
  for (const [key, plot] of available) {
    if (rec.messages[key]) continue;
    const { embed, attachment } = plotEmbed(plot, now);
    let threadId = rec.threads[plot.district];
    let thread: ForumChannel | any = await (threadId
      ? client.channels.fetch(threadId).catch(() => null)
      : null);
    if (!thread) {
      const msg: any = { embeds: [embed], files: attachment ? [attachment] : [] };
      if (mention) msg.content = mention;
      thread = await (ch as ForumChannel).threads.create({ name: plot.district, message: msg });
      rec.threads[plot.district] = thread.id;
      const starter = await thread.fetchStarterMessage();
      rec.messages[key] = { threadId: thread.id, messageId: starter?.id ?? '', hash: plotHash(plot) };
    } else if (thread.isTextBased()) {
      const m: any = { embeds: [embed], files: attachment ? [attachment] : [] };
      if (mention) m.content = mention;
      const sent = await thread.send(m);
      rec.messages[key] = { threadId: thread.id, messageId: sent.id, hash: plotHash(plot) };
    }
    added++;
  }

  await writeFile(filePath, JSON.stringify(store, null, 2), 'utf8');

  return { added, removed, updated };
}

