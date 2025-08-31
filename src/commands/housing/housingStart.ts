import {
  ChannelType,
  MessageFlags,
  SlashCommandSubcommandBuilder,
  type ChatInputCommandInteraction,
  type ForumChannel,
} from 'discord.js';
import { configManager } from '../../handlers/configHandler.js';
import { HousingStart } from '../../schemas/housing.js';
import { PaissaProvider } from '../../functions/housing/housingProvider.paissa.js';
import { plotEmbed } from './embed.js';
import { DATACENTERS, DISTRICT_OPTIONS } from '../../const/housing/housing.js';
import { z } from 'zod';
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

const provider = new PaissaProvider();

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
          .setDescription('Comma-separated worlds (required for no_config)'),
      )
      .addStringOption(opt =>
        opt
          .setName('districts')
          .setDescription('Comma-separated districts (required for no_config)')
          .addChoices(...DISTRICT_OPTIONS.map(d => ({ name: d.label, value: d.value }))),
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

    const categorized: Record<string, typeof plots> = {};
    for (const [district, list] of byDistrict) {
      categorized[district] = list;
    }
    const filePath = path.join(process.cwd(), 'src', 'guildconfig', 'housing_messages.json');
    let existing: Record<string, Record<string, typeof plots>> = {};
    try {
      const raw = await readFile(filePath, 'utf8');
      existing = JSON.parse(raw);
    } catch {
      existing = {};
    }
    existing[guildID] = categorized;
    await writeFile(filePath, JSON.stringify(existing, null, 2), 'utf8');

    const mention = [
      hc.pingUserId ? `<@${hc.pingUserId}>` : null,
      hc.pingRoleId ? `<@&${hc.pingRoleId}>` : null,
    ]
      .filter(Boolean)
      .join(' ');

    let total = 0;
    for (const [district, list] of byDistrict) {
      const first = list[0]!;
      const { embed, attachment } = plotEmbed(first);
      const msg: any = { embeds: [embed], files: attachment ? [attachment] : [] };
      if (mention) msg.content = mention;
      const thread = await (ch as ForumChannel).threads.create({
        name: district,
        message: msg,
      });

      for (const p of list.slice(1)) {
        const { embed: e, attachment: a } = plotEmbed(p);
        const m: any = { embeds: [e], files: a ? [a] : [] };
        if (mention) m.content = mention;
        await thread.send(m);
      }
      total += list.length;
    }

    await interaction.editReply({ content: `Posted ${total} plots across ${byDistrict.size} districts to <#${hc.channelId}>` });
  }
};
