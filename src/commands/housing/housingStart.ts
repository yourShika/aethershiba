import {
  ChannelType,
  MessageFlags,
  SlashCommandSubcommandBuilder,
  type ChatInputCommandInteraction,
  type ForumChannel,
  type AutocompleteInteraction,
} from 'discord.js';
import { configManager } from '../../handlers/configHandler.js';
import { HousingStart } from '../../schemas/housing.js';
import { PaissaProvider } from '../../functions/housing/housingProvider.paissa.js';
import { plotEmbed } from './embed.js';
import { DATACENTERS, DISTRICT_OPTIONS } from '../../const/housing/housing.js';
import { getWorldNamesByDC } from '../../functions/housing/housingWorlds.js';
import { z } from 'zod';
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import type { Plot } from '../../functions/housing/housingProvider.paissa.js';

const provider = new PaissaProvider();

function plotKey(p: Plot): string {
  return [p.dataCenter, p.world, p.district, p.ward, p.plot].join(':');
}

function plotHash(p: Plot): string {
  return JSON.stringify(p);
}

export default {
  name: 'start',
  description: 'Post a list of free housing plots grouped by district',
  build(sc: SlashCommandSubcommandBuilder) {
    sc
      .addStringOption(opt =>
        opt
          .setName('mode')
          .setDescription('Use saved config or provide values manually')
          .setRequired(true)
          .addChoices({ name: 'Config', value: 'config' }, { name: 'No Config', value: 'no_config' }),
      )
      .addStringOption(opt =>
        opt
          .setName('datacenter')
          .setDescription('Datacenter (required for no_config)')
          .addChoices(...DATACENTERS.map(dc => ({ name: dc, value: dc }))),
      )
      .addStringOption(opt =>
        opt
          .setName('worlds')
          .setDescription('Comma-separated worlds (required for no_config)')
          .setAutocomplete(true),
      )
      .addStringOption(opt =>
        opt
          .setName('districts')
          .setDescription('Comma-separated districts (required for no_config)')
          .setAutocomplete(true),
      )
      .addChannelOption(opt =>
        opt
          .setName('channel')
          .setDescription('Target forum channel (required for no_config)')
          .addChannelTypes(ChannelType.GuildForum),
      );
    return sc;
  },
  async execute(interaction: ChatInputCommandInteraction) {
    const guildID = interaction.guildId;
    if (!guildID) {
      await interaction.reply({ content: 'This command can only be used in a guild.', flags: MessageFlags.Ephemeral });
      return;
    }

    const mode = interaction.options.getString('mode', true);
    let hc: z.infer<typeof HousingStart>;

    if (mode === 'config') {
      const config = await configManager.get(guildID);
      const h = (config['housing'] as any) ?? null;
      const ok = HousingStart.safeParse(h);
      if (!ok.success) {
        await interaction.reply({ content: 'Housing is not configured.', flags: MessageFlags.Ephemeral });
        return;
      }
      hc = ok.data;
    } else {
      const dc = interaction.options.getString('datacenter', true);
      const worldsStr = interaction.options.getString('worlds', true);
      const districtsStr = interaction.options.getString('districts', true);
      const chOpt = interaction.options.getChannel('channel', true);

      if (!chOpt || chOpt.type !== ChannelType.GuildForum) {
        await interaction.reply({ content: 'Provided channel is not a forum.', flags: MessageFlags.Ephemeral });
        return;
      }

      const worlds = worldsStr.split(/[,\s]+/).filter(Boolean) as [string, ...string[]];
      const districts = districtsStr.split(/[,\s]+/).filter(Boolean) as [string, ...string[]];

      hc = {
        enabled: true,
        dataCenter: dc,
        worlds,
        districts,
        channelId: chOpt.id,
      };
    }

    const ch = await interaction.client.channels.fetch(hc.channelId).catch(() => null);
    if (!ch || ch.type !== ChannelType.GuildForum) {
      await interaction.reply({ content: 'Configured channel could not be found or is not a forum.', flags: MessageFlags.Ephemeral });
      return;
    }

    await interaction.deferReply({ flags: MessageFlags.Ephemeral });

    const plots = [] as Awaited<ReturnType<typeof provider.fetchFreePlots>>;
    for (const world of hc.worlds) {
      const p = await provider.fetchFreePlots(hc.dataCenter, world, hc.districts);
      plots.push(...p);
    }

    if (plots.length === 0) {
      await interaction.editReply({ content: 'No free plots available.' });
      return;
    }

    const byDistrict = new Map<string, typeof plots>();
    for (const p of plots) {
      const arr = byDistrict.get(p.district) ?? [];
      arr.push(p);
      byDistrict.set(p.district, arr);
    }

    const mention = [
      hc.pingUserId ? `<@${hc.pingUserId}>` : null,
      hc.pingRoleId ? `<@&${hc.pingRoleId}>` : null,
    ]
      .filter(Boolean)
      .join(' ');
    const filePath = path.join(process.cwd(), 'src', 'json', 'housing_messages.json');
    let store: Record<string, { channelId: string; threads: Record<string, string>; messages: Record<string, { threadId: string; messageId: string; hash: string }> }> = {};
    try {
      const raw = await readFile(filePath, 'utf8');
      store = JSON.parse(raw);
    } catch {
      store = {};
    }

    const rec = store[guildID] ?? { channelId: hc.channelId, threads: {}, messages: {} };
    rec.channelId = hc.channelId;
    store[guildID] = rec;

    let total = 0;
    for (const [district, list] of byDistrict) {
      let threadId = rec.threads[district];
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
          thread = await (ch as ForumChannel).threads.create({ name: district, message: msg });
          rec.threads[district] = thread.id;
          const starter = await thread.fetchStarterMessage();
          rec.messages[key] = { threadId: thread.id, messageId: starter?.id ?? '', hash: plotHash(p) };
        } else {
          const { embed, attachment } = plotEmbed(p);
          const m: any = { embeds: [embed], files: attachment ? [attachment] : [] };
          if (mention) m.content = mention;
          const sent = await thread.send(m);
          rec.messages[key] = { threadId: thread.id, messageId: sent.id, hash: plotHash(p) };
        }
        total++;
      }
    }

    await writeFile(filePath, JSON.stringify(store, null, 2), 'utf8');

    await interaction.editReply({ content: `Posted ${total} plots across ${byDistrict.size} districts to <#${hc.channelId}>` });
  },
  async autocomplete(interaction: AutocompleteInteraction) {
    const focused = interaction.options.getFocused(true);
    if (focused.name === 'worlds') {
      const dc = interaction.options.getString('datacenter');
      if (!dc) {
        await interaction.respond([]);
        return;
      }
      const parts = focused.value.split(/[,\s]+/);
      const last = parts.pop() ?? '';
      const already = parts.filter(Boolean);
      const worlds = await getWorldNamesByDC(dc);
      const choices = worlds
        .filter(w => !already.some(a => a.toLowerCase() === w.toLowerCase()))
        .filter(w => w.toLowerCase().startsWith(last.toLowerCase()))
        .slice(0, 25);
      const prefix = already.length ? already.join(', ') + ', ' : '';
      await interaction.respond(choices.map(w => ({ name: w, value: prefix + w })));
      return;
    }

    if (focused.name === 'districts') {
      const parts = focused.value.split(/[,\s]+/);
      const last = parts.pop() ?? '';
      const already = parts.filter(Boolean);
      const options = DISTRICT_OPTIONS.map(d => d.value);
      const choices = options
        .filter(d => !already.some(a => a.toLowerCase() === d.toLowerCase()))
        .filter(d => d.toLowerCase().startsWith(last.toLowerCase()))
        .slice(0, 25);
      const prefix = already.length ? already.join(', ') + ', ' : '';
      await interaction.respond(choices.map(d => ({ name: d, value: prefix + d })));
      return;
    }

    await interaction.respond([]);
  }
};
