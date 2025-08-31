import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  MessageFlags,
  type ChatInputCommandInteraction,
  type TextChannel,
} from 'discord.js';
import { configManager } from '../../handlers/configHandler.js';
import { HousingRequired } from '../../schemas/housing.js';
import { PaissaProvider } from '../../functions/housing/housingProvider.paissa.js';
import { plotEmbed } from './embed.js';

const provider = new PaissaProvider();

export default {
  name: 'start',
  description: 'Post a paginated list of free housing plots',
  async execute(interaction: ChatInputCommandInteraction) {
    const guildID = interaction.guildId;
    if (!guildID) {
      await interaction.reply({ content: 'This command can only be used in a guild.', flags: MessageFlags.Ephemeral });
      return;
    }

    const config = await configManager.get(guildID);
    const h = (config['housing'] as any) ?? null;
    const ok = HousingRequired.safeParse(h);
    if (!ok.success) {
      await interaction.reply({ content: 'Housing is not configured.', flags: MessageFlags.Ephemeral });
      return;
    }
    const hc = ok.data;

    const ch = await interaction.client.channels.fetch(hc.channelId).catch(() => null);
    if (!ch || !('send' in ch)) {
      await interaction.reply({ content: 'Configured channel could not be found.', flags: MessageFlags.Ephemeral });
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

    const embeds = plots.map(plotEmbed);
    let page = 0;

    const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder().setCustomId('housing:prev').setLabel('Prev').setStyle(ButtonStyle.Secondary),
      new ButtonBuilder().setCustomId('housing:next').setLabel('Next').setStyle(ButtonStyle.Secondary),
    );

    const msg = await (ch as TextChannel).send({
      embeds: [embeds[page]!],
      components: embeds.length > 1 ? [row] : [],
    });

    if (embeds.length > 1) {
      const collector = msg.createMessageComponentCollector({ time: 5 * 60_000 });
      collector.on('collect', async i => {
        if (i.customId === 'housing:prev') {
          page = (page - 1 + embeds.length) % embeds.length;
        } else if (i.customId === 'housing:next') {
          page = (page + 1) % embeds.length;
        }
        await i.update({ embeds: [embeds[page]!] });
      });
    }

    await interaction.reply({ content: `Posted ${embeds.length} plots to <#${hc.channelId}>`, flags: MessageFlags.Ephemeral });
  }
};
