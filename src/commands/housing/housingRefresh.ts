import { MessageFlags, type ChatInputCommandInteraction } from 'discord.js';
import { refreshHousing } from '../../functions/housing/housingRefresh.js';

export default {
  name: 'refresh',
  description: 'Refresh housing messages and update availability',
  async execute(interaction: ChatInputCommandInteraction) {
    const guildID = interaction.guildId;
    if (!guildID) {
      await interaction.reply({ content: 'This command can only be used in a guild.', flags: MessageFlags.Ephemeral });
      return;
    }
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    const { added, removed } = await refreshHousing(interaction.client, guildID);
    await interaction.editReply({ content: `Housing refreshed. ${added} added, ${removed} removed.` });
  }
};
