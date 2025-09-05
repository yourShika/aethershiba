import {
  ChannelType,
  MessageFlags,
  type ChatInputCommandInteraction,
  type ForumChannel,
} from 'discord.js';
import { configManager } from '../../handlers/configHandler.js';
import { HousingStart } from '../../schemas/housing.js';
import { PaissaProvider } from '../../functions/housing/housingProvider.paissa.js';
import { plotEmbed } from './embed.js';
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import type { Plot } from '../../functions/housing/housingProvider.paissa.js';
import { threadManager } from '../../lib/threadManager.js';
import { logger } from '../../lib/logger.js';

const provider = new PaissaProvider();

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
    },
  };
  return JSON.stringify(stable);
}

export default {
  name: 'setup',
  description: 'Post a list of free housing plots grouped by district',

  async execute(interaction: ChatInputCommandInteraction) {
    const guildID = interaction.guildId;
    if (!guildID) {
      await interaction.reply({ content: 'This command can only be used in a guild.', flags: MessageFlags.Ephemeral });
      return;
    }

    if (
      threadManager.isLocked('housing:setup', { guildId: guildID }) ||
      threadManager.isLocked('housing:refresh', { guildId: guildID }) ||
      threadManager.isLocked('housing:reset', { guildId: guildID }) 
    ) {
      await interaction.reply({
        content: 'Another housing task is currently running. Please try again later.',
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    const config = await configManager.get(guildID);
    const h = (config['housing'] as any) ?? null;
    const ok = HousingStart.safeParse(h);

    if (!ok.success) {
      await interaction.reply({ content: 'Housing is not configured.', flags: MessageFlags.Ephemeral });
      return;
    }

    const hc = ok.data;

    const ch = await interaction.client.channels.fetch(hc.channelId).catch(() => null);
    if (!ch || ch.type !== ChannelType.GuildForum) {
      await interaction.reply({ 
        content: 'Configured channel could not be found or is not a forum.', 
        flags: MessageFlags.Ephemeral 
      });
      return;
    }

    const filePath = path.join(process.cwd(), 'src', 'json', 'housing_messages.json');
    let store: Record<string, { channelId: string, threads: Record<string, string>; messages: Record<string, unknown> }> = {};
    try {
      const raw = await readFile(filePath, 'utf8');
      store = JSON.parse(raw);
    } catch {
      store = {};
    }
    const rec = store[guildID];
    if (rec && Object.keys(rec.messages).length > 0) {
      await interaction.reply({
        content: 'Housing refresh is currently running. Please try again later.',
        flags: MessageFlags.Ephemeral,
      });
      return;
    }
    
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });

    await threadManager.run(
      'housing:setup',
      async () => {
        const plots = [] as Awaited<ReturnType<typeof provider.fetchFreePlots>>;
        const now = Date.now();
        for (const world of hc.worlds) {
          const p = await provider
            .fetchFreePlots(hc.dataCenter, world, hc.districts)
            .then(list => list.filter(pl => pl.ward > 0 && !(pl.lottery?.phaseUntil && pl.lottery.phaseUntil <= now)));
          plots.push(...p);
        }

      if (plots.length === 0) {
        await interaction.editReply({ content: 'No free plots available.' });
        return;
      }

      const byThread = new Map<string, typeof plots>();
      for (const p of plots) {
        const name = `${p.world} - ${p.district}`;
        const arr = byThread.get(name) ?? [];
        arr.push(p);
        byThread.set(name, arr);
      }

      const mention = [
        hc.pingUserId ? `<@${hc.pingUserId}>` : null,
        hc.pingRoleId ? `<@&${hc.pingRoleId}>` : null,
      ]
        .filter(Boolean)
        .join(' ');

      let st: Record<string, { 
        channelId: string; 
        threads: Record<string, string>; 
        messages: Record<string, 
        { threadId: string; messageId: string; hash: string; deleteAt?: number }> }> = {};
      try {
        const raw = await readFile(filePath, 'utf8');
        st = JSON.parse(raw);
      } catch {
        st = {};
      }

      const rec = st[guildID] ?? { channelId: hc.channelId, threads: {}, messages: {} };
      rec.channelId = hc.channelId;
      st[guildID] = rec;

      let total = 0;
      for (const [threadName, list] of byThread) {
        let threadId = rec.threads[threadName];
        let thread: ForumChannel | any = threadId
          ? await interaction.client.channels.fetch(threadId).catch(() => null)
          : null;

        for (const p of list) {
          const key = plotKey(p);
          if (rec.messages[key]) continue;

            if (!thread) {
              const { embed, attachment } = plotEmbed(p);
              const msg: any = { embeds: [embed], files: attachment ? [attachment] : [] };
              if (mention) msg.content = mention;
              thread = await (ch as ForumChannel).threads.create({ name: threadName, message: msg });
              rec.threads[threadName] = thread.id;
              const starter = await thread.fetchStarterMessage();
              rec.messages[key] = {
                threadId: thread.id,
                messageId: starter?.id ?? '',
                hash: plotHash(p),
                ...(p.lottery?.phaseUntil ? { deleteAt: p.lottery.phaseUntil } : {}),
              };
            } else {
              const { embed, attachment } = plotEmbed(p);
              const m: any = { embeds: [embed], files: attachment ? [attachment] : [] };
              if (mention) m.content = mention;
              const sent = await thread.send(m);
              rec.messages[key] = {
                threadId: thread.id,
                messageId: sent.id,
                hash: plotHash(p),
                ...(p.lottery?.phaseUntil ? { deleteAt: p.lottery.phaseUntil } : {}),
              };
            }
          total++;
        }
      }

      try {
        await writeFile(filePath, JSON.stringify(st, null, 2), 'utf8');
      } catch (err) {
        logger.error(`[🏠Housing][${guildID}] Fehler beim Schreiben von ${filePath}: ${String(err)}`);
      }

        await interaction.editReply({ content: `Posted ${total} plots across ${byThread.size} threads to <#${hc.channelId}>` });
      },
      { guildId: guildID, blockWith: ['housing:refresh', 'housing:reset'] }
    );
  },
};
