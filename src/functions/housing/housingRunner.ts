import type { Client, TextChannel } from 'discord.js';
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
    if (!ch || !('send' in ch)) return 0;

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
      await (ch as TextChannel).send({
        content: `${mention}No new free plots for ${hc.dataCenter}/${hc.worlds.join(', ')} in ${hc.districts.join(',')}`,
      });
      return 1;
    }

    let sent = 0;
    for (const p of fresh.slice(0, 10)) {
      await (ch as TextChannel).send({ content: mention, embeds: [plotEmbed(p)] });
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
