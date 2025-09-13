// functions/housing/housingRunner.ts

import type { Client, TextChannel, ForumChannel, ThreadChannel } from 'discord.js';
import { ChannelType } from 'discord.js';
import { configManager } from '../../handlers/configHandler';
import { HousingRequired } from '../../schemas/housing';
import { PaissaProvider } from './housingProvider.paissa';
import { plotEmbed } from '../../embeds/housingEmbeds.js';
import * as seen from './housingSaveConfig';
import { logError } from '../../handlers/errorHandler.js';

// Data provider for housing plot information (PaissaDB-backed)
const provider = new PaissaProvider();

// Options influencing one run of the checker.
type RunOptions = {
  // If true, do not de-duplicate agains previously seen entries.
  ignoreSeen?: boolean;
};

/**
 * Run a single housing check for a specific guild.
 * 
 * Flow:
 *  - Load and validate housing config for the guild.
 *  - Fetch free plots for the configured data center/worlds/districts.
 *  - Filter out plots already announced recently (unless ignoreSeen).
 *  - Post results to the configured channel:
 *    - In Forum channels: group posts by district into threads.
 *    - In text channels: send up to 10 messages + a truncation notice.
 * 
 * @param client - Discord Client
 * @param guildID - guildID to run for
 * @param opts - Run Options (e.g., ignoreSeen)
 * @returns number of messages sent (threads created + posts), or 0 on no-op/error
 */
export async function runHousingCheck(client: Client, guildID: string, opts: RunOptions = {}): Promise<number> {
  try {

    // Load config and validate required fields
    const config = await configManager.get(guildID);
    const h = (config['housing'] as any) ?? null;
    if (!h?.enabled) return 0;

    const ok = HousingRequired.safeParse(h);
    if (!ok.success) return 0;
    const hc = ok.data;

    // Resolve the target channel from config
    const ch = await client.channels.fetch(hc.channelId).catch(() => null);
    if (!ch) return 0;

    /**
     * Fetch all Plots for configured worlds/districts.
     * Collect results from all worlds into a single array.
     */
    const allPlots = [] as Awaited<ReturnType<typeof provider.fetchFreePlots>>;
    for (const world of hc.worlds) {
      const p = await provider.fetchFreePlots(hc.dataCenter, world, hc.districts);
      allPlots.push(...p);
    }

    // Periodically remove stale "seen" entries unless de-duplication is disabled
    if (!opts.ignoreSeen) {
      await seen.cleanup(guildID);
    }

    // De-duplicate (skip already annouced plots unless ignoreSeen is true)
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

    // Build optional mention string based on config
    const mention = hc.pingUserId
      ? `<@${hc.pingUserId}>`
      : hc.pingRoleId
      ? `<@&${hc.pingRoleId}>`
      : '';

    // Post results, handle "no results" early
    if (fresh.length === 0) {
      // If posting into a Forum channel, create a simple thread message
      if (ch.type === ChannelType.GuildForum) {
        await (ch as ForumChannel).threads.create({
          name: 'No free plots',
          message: {
            content: `${mention}No new free plots for ${hc.dataCenter}/${hc.worlds.join(', ')} in ${hc.districts.join(',')}`,
          },
        });
        // Otherwise, send into a text-capable channel
      } else if ('send' in ch) {
        await (ch as TextChannel).send({
          content: `${mention}No new free plots for ${hc.dataCenter}/${hc.worlds.join(', ')} in ${hc.districts.join(',')}`,
        });
      }
      return 1; // one message/thread created
    }

    // Forum flow: group messages by district into threads
    if (ch.type === ChannelType.GuildForum) {
      const forum = ch as ForumChannel;

      // Group new plots by district so each district can have a dedicated thread
      const byDistrict = new Map<string, typeof fresh>();
      for (const p of fresh) {
        const arr = byDistrict.get(p.district) ?? [];
        arr.push(p);
        byDistrict.set(p.district, arr);
      }

      // Map of existing threads by name for quick lookup (active + archived)
      const existing = new Map<string, ThreadChannel>();
      try {
        const active = await forum.threads.fetchActive();
        active.threads.forEach((t) => existing.set(t.name, t));
      } catch {
        // ignore fetch errors for active threads
      }
      try {
        const archived = await forum.threads.fetch({ archived: { limit: 100 } });
        archived.threads.forEach((t) => existing.set(t.name, t));
      } catch {
        // ignore fetch errors for archived threads
      }

      // Send content: create thread per district if needed, then post all plots
      let sent = 0;
      for (const [district, list] of byDistrict) {
        let thread = existing.get(district);

        // If there's no thread for the district, create on seeded with the first plot
        if (!thread) {
          const first = list[0]!;
          const { embed, attachment } = plotEmbed(first);
          thread = await forum.threads.create({
            name: district,
            message: { content: mention, embeds: [embed], files: attachment ? [attachment] : [] },
          });
          existing.set(district, thread);
          sent++;

          // Post remaining plots into the new thread
          for (const p of list.slice(1)) {
            const { embed: e, attachment: a } = plotEmbed(p);
            await thread.send({ content: mention, embeds: [e], files: a ? [a] : [] });
            sent++;
          }
        } else {
          // Thread already exists -> append all plots
          for (const p of list) {
            const { embed: e, attachment: a } = plotEmbed(p);
            await thread.send({ content: mention, embeds: [e], files: a ? [a] : [] });
            sent++;
          }
        }
      }
      return sent;
    }

    // Text-Channel flow: send up to 10 messages, then truncate notice
    if (!('send' in ch)) return 0;

    let sent = 0;

    // Send at most 10 embed to avoid flooding the channel
    for (const p of fresh.slice(0, 10)) {
      const { embed, attachment } = plotEmbed(p);
      await (ch as TextChannel).send({ content: mention, embeds: [embed], files: attachment ? [attachment] : [] });
      sent++;
    }

    // If there are more than 10, append a short summary line
    if (fresh.length > 10) {
      await (ch as TextChannel).send({ content: `${mention}+${fresh.length - 10} more... (truncated)` });
    }

    return sent;
  } catch (err) {
    // Never throw out of the scheduler/runner; log and return 0
    logError(`housing check for guild ${guildID}`, err);
    return 0;
  }
}
