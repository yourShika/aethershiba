import { SlashCommandBuilder } from 'discord.js';
import type { ChatInputCommandInteraction } from 'discord.js';
import { configManager } from '../lib/config/index.js';
import type { Command } from './types.js';

const command: Command = {
    data: new SlashCommandBuilder()
        .setName('config')
        .setDescription('Zeigt die Serverkonfiguration an'),
    async execute(interaction: ChatInputCommandInteraction) {
        if (!interaction.guildId) {
            await interaction.reply({ content: 'Dieser Befehl kann nur auf einem Server verwendet werden.', ephemeral: true });
            return;
        }
        const config = await configManager.get(interaction.guildId);
        await interaction.reply({
            content: `\`\`\`json\n${JSON.stringify(config, null, 2)}\n\`\`\``,
            ephemeral: true,
        });
    },
};

export default command;
