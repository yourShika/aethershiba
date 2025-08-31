import { MessageFlags, type ChatInputCommandInteraction } from 'discord.js';

export default {
  name: 'research',
  description: 'Placeholder for housing research',
  async execute(interaction: ChatInputCommandInteraction) {
    await interaction.reply({ content: 'Research command not implemented.', flags: MessageFlags.Ephemeral });
  }
};
