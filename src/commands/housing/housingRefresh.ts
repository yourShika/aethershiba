import { MessageFlags, type ChatInputCommandInteraction } from 'discord.js';

export default {
  name: 'refresh',
  description: 'Placeholder for housing refresh',
  async execute(interaction: ChatInputCommandInteraction) {
    await interaction.reply({ content: 'Refresh command not implemented.', flags: MessageFlags.Ephemeral });
  }
};
