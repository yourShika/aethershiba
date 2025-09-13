// commands/housing/housingInfo.ts

import { MessageFlags, type ChatInputCommandInteraction } from 'discord.js';
import { HOUSING_INFO } from '../../const/messages';

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
    const content = HOUSING_INFO;
      
    await interaction.reply({ content, flags: MessageFlags.Ephemeral });
  },
};
