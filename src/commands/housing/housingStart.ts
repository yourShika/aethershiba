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

const provider = new PaissaProvider();

export default {
  name: 'start',
  description: 'Post a list of free housing plots grouped by district',
  async execute(interaction: ChatInputCommandInteraction) {
    const guildID = interaction.guildId;
    if (!guildID) {
      await interaction.reply({ content: 'This command can only be used in a guild.', flags: MessageFlags.Ephemeral });
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
      await interaction.reply({ content: 'Configured channel could not be found or is not a forum.', flags: MessageFlags.Ephemeral });
      return;
    }

    const plots = [] as Awaited<ReturnType<typeof provider.fetchFreePlots>>;
    for (const world of hc.worlds) {
      const p = await provider.fetchFreePlots(hc.dataCenter, world, hc.districts);
      plots.push(...p);
    }

    if (plots.length === 0) {
      await interaction.reply({ content: 'No free plots available.', flags: MessageFlags.Ephemeral });
      return;
    }

    const byDistrict = new Map<string, typeof plots>();
    for (const p of plots) {
      const arr = byDistrict.get(p.district) ?? [];
      arr.push(p);
      byDistrict.set(p.district, arr);
    }

    let total = 0;
    for (const [district, list] of byDistrict) {
      const first = list[0]!;
      const { embed, attachment } = plotEmbed(first);
      const thread = await (ch as ForumChannel).threads.create({
        name: district,
        message: {
          embeds: [embed],
          files: attachment ? [attachment] : [],
        },
      });

      for (const p of list.slice(1)) {
        const { embed: e, attachment: a } = plotEmbed(p);
        await thread.send({ embeds: [e], files: a ? [a] : [] });
      }
      total += list.length;
    }

    await interaction.reply({ content: `Posted ${total} plots across ${byDistrict.size} districts to <#${hc.channelId}>`, flags: MessageFlags.Ephemeral });
  }
};
