import type { Client, TextChannel, ForumChannel, ThreadChannel } from 'discord.js';
import { ChannelType } from 'discord.js';
import { configManager } from '../../handlers/configHandler';
import { HousingRequired } from '../../schemas/housing';
import { PaissaProvider } from './housingProvider.paissa';
import { plotEmbed } from '../../commands/housing/embed';
import * as seen from './housingSaveConfig';
import { logError } from '../../handlers/errorHandler.js';

const provider = new PaissaProvider();

type RunOptions = {
  ignoreSeen?: boolean;
};

export async function runHousingCheckt(client: Client, guildID: string, opts: RunOptions = {}): Promise<number> {
  try {
    const config = await configManager.get(guildID);
    const h = (config['housing'] as any) ?? null;
    if (!h?.enabled) return 0;

    const ok = HousingRequired.safeParse(h);
    if (!ok.success) return 0;
    const hc = ok.data;

    const ch = await client.channels.fetch(hc.channelId).catch(() => null);
    if (!ch) return 0;

    const allPlots = [] as Awaited<ReturnType<typeof provider.fetchFreePlots>>;
    for (const world of hc.worlds) {
      const p = await provider.fetchFreePlots(hc.dataCenter, world, hc.districts);
      allPlots.push(...p);
    }
    if (!opts.ignoreSeen) {
      await seen.cleanup(guildID);
    }

    const fresh = [] as typeof allPlots;
    for (const p of allPlots) {
      const key = seen.makeKey(p);
      if (opts.ignoreSeen || !(await seen.has(guildID, key))) {
        fresh.push(p);
        if (!opts.ignoreSeen) {
          await seen.add(guildID, key);
        }
      }
    }

    const mention = hc.pingUserId
      ? `<@${hc.pingUserId}>`
      : hc.pingRoleId
      ? `<@&${hc.pingRoleId}>`
      : '';

    if (fresh.length === 0) {
      if (ch.type === ChannelType.GuildForum) {
        await (ch as ForumChannel).threads.create({
          name: 'No free plots',
          message: {
            content: `${mention}No new free plots for ${hc.dataCenter}/${hc.worlds.join(', ')} in ${hc.districts.join(',')}`,
          },
        });
      } else if ('send' in ch) {
        await (ch as TextChannel).send({
          content: `${mention}No new free plots for ${hc.dataCenter}/${hc.worlds.join(', ')} in ${hc.districts.join(',')}`,
        });
      }
      return 1;
    }

    if (ch.type === ChannelType.GuildForum) {
      const forum = ch as ForumChannel;
      const byDistrict = new Map<string, typeof fresh>();
      for (const p of fresh) {
        const arr = byDistrict.get(p.district) ?? [];
        arr.push(p);
        byDistrict.set(p.district, arr);
      }

      const existing = new Map<string, ThreadChannel>();
      try {
        const active = await forum.threads.fetchActive();
        active.threads.forEach((t) => existing.set(t.name, t));
      } catch {}
      try {
        const archived = await forum.threads.fetch({ archived: { limit: 100 } });
        archived.threads.forEach((t) => existing.set(t.name, t));
      } catch {}

      let sent = 0;
      for (const [district, list] of byDistrict) {
        let thread = existing.get(district);
        if (!thread) {
          const first = list[0]!;
          const { embed, attachment } = plotEmbed(first);
          thread = await forum.threads.create({
            name: district,
            message: { content: mention, embeds: [embed], files: attachment ? [attachment] : [] },
          });
          existing.set(district, thread);
          sent++;
          for (const p of list.slice(1)) {
            const { embed: e, attachment: a } = plotEmbed(p);
            await thread.send({ content: mention, embeds: [e], files: a ? [a] : [] });
            sent++;
          }
        } else {
          for (const p of list) {
            const { embed: e, attachment: a } = plotEmbed(p);
            await thread.send({ content: mention, embeds: [e], files: a ? [a] : [] });
            sent++;
          }
        }
      }
      return sent;
    }

    if (!('send' in ch)) return 0;

    let sent = 0;
    for (const p of fresh.slice(0, 10)) {
      const { embed, attachment } = plotEmbed(p);
      await (ch as TextChannel).send({ content: mention, embeds: [embed], files: attachment ? [attachment] : [] });
      sent++;
    }
    if (fresh.length > 10) {
      await (ch as TextChannel).send({ content: `${mention}+${fresh.length - 10} more... (truncated)` });
    }

    return sent;
  } catch (err) {
    logError(`housing check for guild ${guildID}`, err);
    return 0;
  }
}
