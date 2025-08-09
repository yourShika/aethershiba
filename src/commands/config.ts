// Slash command that displays the current guild configuration to the user.
import { SlashCommandBuilder } from 'discord.js';
import type { ChatInputCommandInteraction } from 'discord.js';
import { configManager } from '../lib/config/index.js';
import type { Command } from './types.js';

const command: Command = {
    // Define the command metadata used by Discord for registration.
    data: new SlashCommandBuilder()
        .setName('config')
        .setDescription('Zeigt die Serverkonfiguration an'),
    async execute(interaction: ChatInputCommandInteraction) {
        // Ensure the command is executed within a guild context.
        if (!interaction.guildId) {
            await interaction.reply({ content: 'Dieser Befehl kann nur auf einem Server verwendet werden.', ephemeral: true });
            return;
        }
        // Retrieve the guild configuration and display it as JSON.
        const config = await configManager.get(interaction.guildId);
        await interaction.reply({
            content: `\`\`\`json\n${JSON.stringify(config, null, 2)}\n\`\`\``,
            ephemeral: true,
        });
    },
};

export default command;
