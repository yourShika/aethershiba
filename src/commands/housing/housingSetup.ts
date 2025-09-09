// commands/housing/housingSetup.ts

// ---------------------------------------------------
// Dependencies
// ---------------------------------------------------
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

// PaissaDB API 
const provider = new PaissaProvider();

// Build a stable key for a plot, used to de-duplicate/store messages.
function plotKey(p: Plot): string {
  return [p.dataCenter, p.world, p.district, p.ward, p.plot].join(':');
}

// Hash only the content that affects the embed; used to detect edits.
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

// ---------------------------------------------------
// /housing Setup - Command
// ---------------------------------------------------
export default {
  name: 'setup',
  description: 'Post a list of free housing plots grouped by district',

  /**
   * Slash command entrypoint:
   *  - Validates config (housingStart)
   *  - Fetches free plots per configured world/district
   *  - Posts them into a forum, grouped by `${world} - ${district}`
   *  - Persists thread+message mapping in housing_messages.json
   * @param interaction - Discord Chat Input Command Interaction
   * @returns Messages on the ForumChannel 
   */
  async execute(interaction: ChatInputCommandInteraction) {

    // Make sure the command is only useable in a guild.
    const guildID = interaction.guildId;
    if (!guildID) {
      await interaction.reply({ content: 'This command can only be used in a guild.', flags: MessageFlags.Ephemeral });
      return;
    }

    // Prevent concurrent housing tasks in the same guild (setup/refresh/reset)
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

    // Load and validate minimal config required to post once
    const config = await configManager.get(guildID);
    const h = (config['housing'] as any) ?? null;
    const ok = HousingStart.safeParse(h);

    if (!ok.success) {
      await interaction.reply({ content: 'Housing is not configured.', flags: MessageFlags.Ephemeral });
      return;
    }

    const hc = ok.data;

    // Resolve target channel; must be a forum
    const ch = await interaction.client.channels.fetch(hc.channelId).catch(() => null);
    if (!ch || ch.type !== ChannelType.GuildForum) {
      await interaction.reply({ 
        content: 'Configured channel could not be found or is not a forum.', 
        flags: MessageFlags.Ephemeral 
      });
      return;
    }

    // Load existing state to detect if we already have messages recorded
    const filePath = path.join(process.cwd(), 'src', 'json', 'housing_messages.json');
    let store: Record<string, { channelId: string, threads: Record<string, string>; messages: Record<string, unknown> }> = {};
    try {
      const raw = await readFile(filePath, 'utf8');
      store = JSON.parse(raw);
    } catch {
      store = {};
    }

    // If we already have stored messages for this guild, avoid double-posting
    const rec = store[guildID];
    if (rec && Object.keys(rec.messages).length > 0) {
      await interaction.reply({
        content: 'Housing refresh is currently running. Please try again later.',
        flags: MessageFlags.Ephemeral,
      });
      return;
    }
    
    // Acknowledge command (ephemeral) while we work
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });

    // Run under a lock to ensure exclusive setup per guild
    await threadManager.run(
      'housing:setup',
      async () => {
        // ---------------------------------------------------
        // Fetch/Filter available plots
        // ---------------------------------------------------
        const plots = [] as Awaited<ReturnType<typeof provider.fetchFreePlots>>;
        const now = Date.now();

        // Fetch all plots
        for (const world of hc.worlds) {
          const p = await provider
            .fetchFreePlots(hc.dataCenter, world, hc.districts)
            // Filter invalid or expired lottery entries.
            .then(list => list.filter(pl => pl.ward > 0 && !(pl.lottery?.phaseUntil && pl.lottery.phaseUntil <= now)));
          plots.push(...p);
        }

      // When no plots were found.
      if (plots.length === 0) {
        await interaction.editReply({ content: 'No free plots available.' });
        return;
      }

      // ---------------------------------------------------
      // Group by thread name: `${world} - ${district}`
      // ---------------------------------------------------
      const byThread = new Map<string, typeof plots>();
      for (const p of plots) {
        const name = `${p.world} - ${p.district}`;
        const arr = byThread.get(name) ?? [];
        arr.push(p);
        byThread.set(name, arr);
      }

      // Optional mention string from config
      const mention = [
        hc.pingUserId ? `<@${hc.pingUserId}>` : null,
        hc.pingRoleId ? `<@&${hc.pingRoleId}>` : null,
      ]
        .filter(Boolean)
        .join(' ');

      // ---------------------------------------------------
      // Load/Update persistent message map for this guild
      // ---------------------------------------------------
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

      // ---------------------------------------------------
      // Create threads (as needed) and post plot messages
      // ---------------------------------------------------
      let total = 0;
      for (const [threadName, list] of byThread) {
        // Reuse previously recorded thread if we have one
        let threadId = rec.threads[threadName];
        let thread: ForumChannel | any = threadId
          ? await interaction.client.channels.fetch(threadId).catch(() => null)
          : null;

        for (const p of list) {
          const key = plotKey(p);
          // If we arleady recorded this plot, skip
          if (rec.messages[key]) continue;

          // Create a new forum thread with the first plot as starter
            if (!thread) {
              const { embed, attachment } = plotEmbed(p);
              const msg: any = { embeds: [embed], files: attachment ? [attachment] : [] };
              if (mention) msg.content = mention;

              thread = await (ch as ForumChannel).threads.create({ name: threadName, message: msg });
              rec.threads[threadName] = thread.id;

              // Record starter message
              const starter = await thread.fetchStarterMessage();
              rec.messages[key] = {
                threadId: thread.id,
                messageId: starter?.id ?? '',
                hash: plotHash(p),
                ...(p.lottery?.phaseUntil ? { deleteAt: p.lottery.phaseUntil } : {}),
              };
            } else {
              // Post additional plots into existing thread
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

      // ---------------------------------------------------
      // Persist updated message map
      // ---------------------------------------------------
      try {
        await writeFile(filePath, JSON.stringify(st, null, 2), 'utf8');
      } catch (err) {
        logger.error(`[🏠Housing][${guildID}] Fehler beim Schreiben von ${filePath}: ${String(err)}`);
      }

      // Final ephemeral confirmation to the invoker
      await interaction.editReply({ 
          content: `Posted ${total} plots across ${byThread.size} threads to <#${hc.channelId}>` 
        });
      },
      // Concurrency scope and conflicts for setup
      { guildId: guildID, blockWith: ['housing:refresh', 'housing:reset'] }
    );
  },
};
