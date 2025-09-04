import { MessageFlags, type ChatInputCommandInteraction } from 'discord.js';

export default {
  name: 'info',
  description: 'Information about housing data and limitations',
  async execute(interaction: ChatInputCommandInteraction) {
    const content =
      'Provides housing plot listings using the PaissaDB API. ' +
      'Data may be incomplete and not always match in-game status 1:1, so some posted plots could be inaccurate.';
    await interaction.reply({ content, flags: MessageFlags.Ephemeral });
  },
};
