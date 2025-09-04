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
      const res = await refreshHousing(interaction.client, guildID);
      if (!res) {
        await interaction.editReply({ content: 'No housing messages found. Run /housing setup first.' });
        return;
      }
      const { added, removed, updated, elapsedMs = 0 } = res;
      const secs = Math.floor(elapsedMs / 1000);
      const hh = String(Math.floor(secs / 3600)).padStart(2, '0');
      const mm = String(Math.floor((secs % 3600) / 60)).padStart(2, '0');
      const ss = String(secs % 60).padStart(2, '0');
      await interaction.editReply({ content: `Housing refreshed in ${hh}:${mm}:${ss}. ${added} added, ${removed} removed, ${updated} updated.` });
    }
};
