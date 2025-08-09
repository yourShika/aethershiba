// Slash command that lists all available commands using an embed.
import { SlashCommandBuilder, EmbedBuilder } from 'discord.js';
import type { ChatInputCommandInteraction } from 'discord.js';
import type { Command } from './types.js';

const command: Command = {
    // Command metadata for registration and help text.
    data: new SlashCommandBuilder()
        .setName('help')
        .setDescription('Zeigt eine Übersicht aller verfügbaren Befehle'),
    async execute(interaction: ChatInputCommandInteraction) {
        // Import the command list at runtime to avoid circular deps during module load.
        const { commands } = await import('./index.js');
        const embed = new EmbedBuilder()
            .setTitle('Verfügbare Befehle');
        // Add each known command to the embed so users can see what exists.
        for (const cmd of commands) {
            embed.addFields({ name: `/${cmd.data.name}`, value: cmd.data.description || 'Keine Beschreibung' });
        }
        await interaction.reply({ embeds: [embed], ephemeral: true });
    },
};

export default command;
