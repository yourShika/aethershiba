import {
    SlashCommandSubcommandBuilder,
    ChatInputCommandInteraction,
    MessageFlags
} from 'discord.js';

type Sub = {
    name: string;
    description: string,
    build?: (sc: SlashCommandSubcommandBuilder) => SlashCommandSubcommandBuilder;
    execute: (interaction: ChatInputCommandInteraction) => Promise<void>;
};

const sub: Sub = {
    name: 'link',
    description: 'Link your FFXIV-Profile to your Discord Account.',
    build: (sc) => sc.addUserOption(o => o.setName('user').setDescription('User').setRequired(true)),
    execute: async (interaction) => {
        await interaction.reply({ 
            content: 'Not implemented.', 
            flags: MessageFlags.Ephemeral 
        });
    }
};

export default sub;