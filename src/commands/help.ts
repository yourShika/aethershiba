import { SlashCommandBuilder, EmbedBuilder } from 'discord.js';
import type { ChatInputCommandInteraction } from 'discord.js';
import type { Command } from './types.js';

const command: Command = {
    data: new SlashCommandBuilder()
        .setName('help')
        .setDescription('Zeigt eine Übersicht aller verfügbaren Befehle'),
    async execute(interaction: ChatInputCommandInteraction) {
        const { commands } = await import('./index.js');
        const embed = new EmbedBuilder()
            .setTitle('Verfügbare Befehle');
        for (const cmd of commands) {
            embed.addFields({ name: `/${cmd.data.name}`, value: cmd.data.description || 'Keine Beschreibung' });
        }
        await interaction.reply({ embeds: [embed], ephemeral: true });
    },
};

export default command;
