import {
    SlashCommandSubcommandBuilder,
    ChatInputCommandInteraction,
    MessageFlags,
    PermissionFlagsBits,
} from 'discord.js';
import { removeProfileByUser } from '../../functions/profile/profileStore.js';

type Sub = {
    name: string;
    description: string,
    build?: (sc: SlashCommandSubcommandBuilder) => SlashCommandSubcommandBuilder;
    execute: (interaction: ChatInputCommandInteraction) => Promise<void>;
};

const sub: Sub = {
    name: 'unlink',
    description: 'Unlink your Linked FFXIV-Profile with your Discord Account.',
    build: (sc) => sc.addUserOption(o => o.setName('user').setDescription('User, optional for admins').setRequired(false)),
    execute: async (interaction) => {
        const target = interaction.options.getUser('user') ?? interaction.user;
        const isSelf = target.id === interaction.user.id;
        const canModerate = interaction.memberPermissions?.has(PermissionFlagsBits.ManageGuild)
            || interaction.memberPermissions?.has(PermissionFlagsBits.Administrator);

        if (!isSelf && !canModerate) {
            await interaction.reply({
                content: 'You can only unlink another user with Manage Server or Administrator permission.',
                flags: MessageFlags.Ephemeral,
            });
            return;
        }

        const removed = await removeProfileByUser(target.id);
        await interaction.reply({
            content: removed
                ? `Unlinked Lodestone profile \`${removed.lodestoneId}\` from ${target.toString()}.`
                : `${target.toString()} has no linked Lodestone profile.`,
            flags: MessageFlags.Ephemeral,
        });
    }
};

export default sub;
