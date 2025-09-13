// events/profileInteraction.ts

// -------------------------------------------------
// Dependecies
// -------------------------------------------------

import { 
    Client, 
    Events, 
    MessageFlags,
    ModalBuilder,
    TextInputBuilder,
    ActionRowBuilder,
    TextInputStyle,
    ButtonBuilder,
    ButtonStyle,
    ButtonInteraction,
} from "discord.js";
import {
    generateToken,
    verifyToken,
    clearToken,
    extractLodestoneId,
    getToken,
} from '../functions/profile/profileLodestoneVerification';
import {
    addProfile,
    getProfilebyLodestoneId,
    getProfileByUser,
} from '../functions/profile/profileStore';

import { PROFILE_PREFIX } from "../const/constants";
import { tokenEmbed, successEmbed } from "../embeds/profileEmbeds";
import { ACCOUNT_USED, ALREADY_LINKED, UNABLE_ACCESS, VERIFICATION_CANCELED } from "../const/messages";

const linkInteractions = new Map<string, ButtonInteraction>();

export function register(client: Client) {
    client.on(Events.InteractionCreate, async (interaction) => {
        // We only handle button or model interaction
        if (!interaction.isButton() && !interaction.isModalSubmit()) return;
        if (!interaction.customId.startsWith(PROFILE_PREFIX)) return;

        // -------------------------------------------------
        // Button Interaction
        // -------------------------------------------------
        if (interaction.isButton()) {
            const id = interaction.customId;

            // Cancel
            if (id === `${PROFILE_PREFIX}link:cancel`) {
                clearToken(interaction.user.id);
                linkInteractions.delete(interaction.user.id);
                await interaction.update({
                    content: `${VERIFICATION_CANCELED}`,
                    embeds: [],
                    components: [],
                });
                return;
            }

            // Start
            if (id === `${PROFILE_PREFIX}link:start`) {
                linkInteractions.set(interaction.user.id, interaction);
                const modal = new ModalBuilder()
                    .setCustomId(`${PROFILE_PREFIX}link:submit`)
                    .setTitle('Enter Lodestone URL');

                const input = new TextInputBuilder()
                    .setCustomId('url')
                    .setLabel('Lodestone Link')
                    .setStyle(TextInputStyle.Short)
                    .setPlaceholder('https://eu.finalfantasyxiv.com/lodestone/character/XXXXXXX/')
                    .setRequired(true);

                modal.addComponents(new ActionRowBuilder<TextInputBuilder>().addComponents(input));

                await interaction.showModal(modal);
                return;
            }

            // Verify - check comment for token and save profile
            if (id === `${PROFILE_PREFIX}link:verify`) {
                const data = await verifyToken(interaction.user.id);

                if (!data) {
                    const token = getToken(interaction.user.id);
                    await interaction.update({
                        embeds: token ? [tokenEmbed(token, 'Verification failed')] : [],
                    });
                    return;
                }

                await addProfile({
                    userId: interaction.user.id,
                    lodestoneId: data.lodestoneId,
                    lodestoneUrl: data.lodestoneUrl,
                    verified: true,
                    verifiedAt: Date.now(),
                });

                await interaction.update({
                    embeds: [successEmbed(data.lodestoneUrl)],
                    components: [],
                });
                return;
            }
            return;
        }

        // -------------------------------------------------
        // Modal Submissions
        // -------------------------------------------------

        if (interaction.isModalSubmit()) {
            const id = interaction.customId;
            
            if (id === `${PROFILE_PREFIX}link:submit`) {
                const url = interaction.fields.getTextInputValue('url').trim();

                const lodestoneId = extractLodestoneId(url);

                if (!lodestoneId) {
                    await interaction.reply({
                        content: 'Invalid Lodestone URL.',
                        flags: MessageFlags.Ephemeral,
                    });
                    return;
                }

                if (await getProfileByUser(interaction.user.id)) {
                    await interaction.reply({
                        content: `${ALREADY_LINKED}`,
                        flags: MessageFlags.Ephemeral,
                    });
                    return;
                }

                if (await getProfilebyLodestoneId(lodestoneId)) {
                    await interaction.reply({
                        content: `${ACCOUNT_USED}`,
                        flags: MessageFlags.Ephemeral,
                    });
                    return;
                }

                try {
                    const res = await fetch(url);
                    if (!res.ok) throw new Error('status');
                } catch {
                    await interaction.reply({
                        content: `${UNABLE_ACCESS}`,
                        flags: MessageFlags.Ephemeral,
                    });
                    return;
                }

                const token = generateToken(interaction.user.id, url, lodestoneId);

                const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
                    new ButtonBuilder()
                        .setCustomId(`${PROFILE_PREFIX}link:verify`)
                        .setLabel('Verify')
                        .setStyle(ButtonStyle.Success),
                    new ButtonBuilder()
                        .setCustomId(`${PROFILE_PREFIX}link:cancel`)
                        .setLabel('Cancel')
                        .setStyle(ButtonStyle.Secondary)
                );

                const starter = linkInteractions.get(interaction.user.id);
                if (starter) {
                    try {
                        await starter.editReply({
                            embeds: [tokenEmbed(token)],
                            components: [row],
                        });
                        linkInteractions.delete(interaction.user.id);
                        await interaction.deferReply({ flags: MessageFlags.Ephemeral });
                        await interaction.deleteReply().catch(() => {});
                        return;
                    } catch {
                        linkInteractions.delete(interaction.user.id);
                    }
                }

                await interaction.reply({
                    embeds: [tokenEmbed(token)],
                    components: [row],
                    flags: MessageFlags.Ephemeral,
                });
            }
        }
    });
}

export default { register };