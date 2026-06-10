// commands/admin/adminReloadCommands.ts

import { MessageFlags, type ChatInputCommandInteraction } from "discord.js";
import { commandHandler } from "../../handlers/commandHandler.js";
import { logger } from "../../lib/logger.js";
import type { AdminSubcommand } from "./admin.js";

const reloadCommands: AdminSubcommand = {
    name: 'reload-commands',
    description: 'Reload all slash commands from the latest source.',
    async execute(interaction: ChatInputCommandInteraction) {
        await interaction.deferReply({ flags: MessageFlags.Ephemeral });

        try {
            const { commands } = await import('../../handlers/commandInit.js');
            commandHandler.registerAll(commands);

            await commandHandler.deploy(interaction.client);
            await interaction.editReply('✅ Slash commands have been reloaded.');
        } catch (error) {
            logger.error('❌ Failed to reload slash commands via /admin reload-commands', error);
            await interaction.editReply('❌ Failed to reload slash commands. Check logs for details.');
        }
    },
};

export default reloadCommands;
