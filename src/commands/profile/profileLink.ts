// commands/profile/profileLink.ts

// -------------------------------------------------
// Dependecies
// -------------------------------------------------

import {
    SlashCommandSubcommandBuilder,
    ChatInputCommandInteraction,
    MessageFlags,
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle
} from 'discord.js';
import { linkStartEmbed } from '../../embeds/profileEmbeds';
import { getProfileByUser } from '../../functions/profile/profileStore';
import { PROFILE_PREFIX } from '../../const/constants';
import { ALREADY_LINKED } from '../../const/messages';

type Sub = {
    name: string;
    description: string,
    build?: (sc: SlashCommandSubcommandBuilder) => SlashCommandSubcommandBuilder;
    execute: (interaction: ChatInputCommandInteraction) => Promise<void>;
};

const sub: Sub = {
    name: 'link',
    description: 'Link your FFXIV-Profile to your Discord Account.',
    build: (sc) => sc,
    execute: async (interaction) => {
        const existing = await getProfileByUser(interaction.user.id);

        if (existing) {
            await interaction.reply({
                content: `${ALREADY_LINKED}`,
                flags: MessageFlags.Ephemeral,
            });
            return;
        }

        const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
            new ButtonBuilder()
                .setCustomId(`${PROFILE_PREFIX}link:start`)
                .setLabel('Start Verify')
                .setStyle(ButtonStyle.Primary),
            new ButtonBuilder()
                .setCustomId(`${PROFILE_PREFIX}link:cancel`)
                .setLabel('Cancel')
                .setStyle(ButtonStyle.Secondary)
        );

        await interaction.reply({
            embeds: [linkStartEmbed()],
            components: [row],
            flags: MessageFlags.Ephemeral,
        });
    },
};

export default sub;