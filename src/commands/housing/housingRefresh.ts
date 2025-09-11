// commands/housing/housingRefresh.ts

import { MessageFlags, type ChatInputCommandInteraction } from 'discord.js';
import { refreshHousing } from '../../functions/housing/housingRefresh.js';
import { threadManager } from '../../lib/threadManager.js';

export default {
  name: 'refresh',
  description: 'Refresh housing messages and update availability',

  /**
   * /housing refresh
   * 
   * Triggers a one-off refresh against the persisted housing state:
   *  - Ensures no conflicting housing task is running (setup/reset/refresh).
   *  - Defers reply (ephemeral) to avoid interaction timeout.
   *  - Calls the refresher, which edits/deletes/creates messages as needed.
   *  - Reports a short summary: runtime + added/removed/updated counts.
   * 
   * @param interaction - Discord Chat Input Command Interaction
   */
  async execute(interaction: ChatInputCommandInteraction) {
    const guildID = interaction.guildId;

    // This command only makes sense in a guild context.
    if (!guildID) {
      await interaction.reply({ content: 'This command can only be used in a guild.', flags: MessageFlags.Ephemeral });
      return;
    }

    // Do not start when a refresh is already running
    if (threadManager.isLocked('housing:refresh', { guildId: guildID } )) {
      await interaction.reply({ content: 'Housing refresh is currently running. Please try again later.', flags: MessageFlags.Ephemeral });
      return;
    }

    // Avoid conflicts with setup/reset
    if (
      threadManager.isLocked('housing:setup', { guildId: guildID }) ||
      threadManager.isLocked('housing:reset', { guildId: guildID })
    ) {
      await interaction.reply({ content: 'Another housing task is currently running. Please try again later.', flags: MessageFlags.Ephemeral });
      return;
    }

      // Acknowledge the command while the refresh runs.
      await interaction.deferReply({ flags: MessageFlags.Ephemeral });

      // Execute refresh; it returns null if the store is empty (no setup yet)
      const res = await refreshHousing(interaction.client, guildID);
      if (!res) {
        await interaction.editReply({ content: 'No housing messages found. Run /housing setup first.' });
        return;
      }

      // Format elapsed time nicely as HH:MM:SS
      const { added, removed, updated, elapsedMs = 0 } = res;
      const secs = Math.floor(elapsedMs / 1000);
      const hh = String(Math.floor(secs / 3600)).padStart(2, '0');
      const mm = String(Math.floor((secs % 3600) / 60)).padStart(2, '0');
      const ss = String(secs % 60).padStart(2, '0');

      // Final ephemeral summary back to the invoker.
      await interaction.editReply({ content: `Housing refreshed in ${hh}:${mm}:${ss}. ${added} added, ${removed} removed, ${updated} updated.` });
    }
};
