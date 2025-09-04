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

        const sorted = [...commands].sort((a, b) => a.data.name.localeCompare(b.data.name));
        const embed = new EmbedBuilder().setTitle('Verfügbare Befehle');

        for (const cmd of sorted.slice(0, 25)) {
            const emoji = cmd.emoji ?? '❔';
            embed.addFields({
                name: `${emoji} /${cmd.data.name}`,
                value: cmd.data.description || 'Keine Beschreibung',
            });
        }

        await interaction.reply({
            embeds: [embed],
            flags: MessageFlags.Ephemeral,
        });
    },
    emoji: '❓',
};

export default command;
