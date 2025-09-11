// commands/help/help.ts

// Slash command that lists all available commands using an embed.
import { SlashCommandBuilder, EmbedBuilder, MessageFlags } from 'discord.js';
import type { ChatInputCommandInteraction } from 'discord.js';
import type { Command } from '../../handlers/commandHandler.js';

const command: Command = {

    // Command metadata for registration and help text.
    data: new SlashCommandBuilder()
        .setName('help')
        .setDescription('Zeigt eine Übersicht aller verfügbaren Befehle'),

    async execute(interaction: ChatInputCommandInteraction) {
        // Import the command list at runtime to avoid circular deps during module load.
        const { commands } = await import('../../handlers/commandInit.js');

        // Sort commands alphabetically by name for consistent listing
        const sorted = [...commands].sort((a, b) => a.data.name.localeCompare(b.data.name));

        // Create the embed to show the list of commands
        const embed = new EmbedBuilder().setTitle('Verfügbare Befehle');

        // Add each command as a field (Discord embeds are limited to 25 fields)
        for (const cmd of sorted.slice(0, 25)) {
            const emoji = cmd.emoji ?? '❔';                            // Default emoji if none provided
            embed.addFields({
                name: `${emoji} /${cmd.data.name}`,                     // Show command name with emoji
                value: cmd.data.description || 'Keine Beschreibung',    // Show description or fallback
            });
        }

        // Send the embed as an ephemeral message (only visible to the user)
        await interaction.reply({
            embeds: [embed],
            flags: MessageFlags.Ephemeral,
        });
    },

    // Emoji used to represent this command in listings.
    emoji: '❓',
};

export default command;
