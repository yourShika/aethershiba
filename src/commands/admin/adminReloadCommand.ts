// commands/admin/adminReloadCommands.ts

import { MessageFlags, type ChatInputCommandInteraction } from "discord.js";
import { commandHandler, CommandHandler } from "../../handlers/commandHandler";
import { logger } from "../../lib/logger";
import type { AdminSubcommand } from "./admin";

const reloadCommands: AdminSubcommand = {
    name: 'reload-commands',
    description: 'Reload all slash commands from the latest source.',
    async execute(interaction: ChatInputCommandInteraction) {
        await interaction.deferReply({ flags: MessageFlags.Ephemeral });

        try {
            const { commands } = await import('../../handlers/commandInit');
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