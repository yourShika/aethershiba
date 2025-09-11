// commands/housing/housingInfo.ts

import { MessageFlags, type ChatInputCommandInteraction } from 'discord.js';

export default {
  name: 'info',
  description: 'Information about housing data and limitations',

  /**
   * /housing info
   * 
   * Provides context about how housing data is sourced and what
   * limitations may apply. This is a simple informational command,
   * always replied to ephemerally (only visible to the invoker).
   * @param interaction 
   */
  async execute(interaction: ChatInputCommandInteraction) {
    // Build a nicely formatted, readable info message
    const content =
      '🏠 **Housing Information**\n\n' +
      'This bot provides housing plot listings using the **PaissaDB API**.\n' +
      'While the data is generally reliable, please note:\n\n' +
      '• Data may be **incomplete** or **delayed**.\n' +
      '• Listings may not always match in-game status **1:1**.\n' +
      '• Some posted plots might already be sold or otherwise unavailable.\n\n' +
      'Use this as a helpful guide, but always verify availability **in-game**.';
      
    await interaction.reply({ content, flags: MessageFlags.Ephemeral });
  },
};
