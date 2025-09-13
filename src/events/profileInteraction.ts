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
    Message,
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

import { PROFILE_PREFIX } from "../const/constatns";
import { tokenEmbed, successEmbed } from "../embeds/profileEmbeds";

const linkMessages = new Map<string, Message>();

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
                linkMessages.delete(interaction.user.id);
                await interaction.update({
                    content: 'Verification cancelled.',
                    embeds: [],
                    components: [],
                });
                return;
            }

            // Start
            if (id === `${PROFILE_PREFIX}link:start`) {
                linkMessages.set(interaction.user.id, interaction.message);
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
                        content: 'You already linked a profile. Use /profile unlink first.',
                        flags: MessageFlags.Ephemeral,
                    });
                    return;
                }

                if (await getProfilebyLodestoneId(lodestoneId)) {
                    await interaction.reply({
                        content: 'This Lodestone profile is already linked to another user.',
                        flags: MessageFlags.Ephemeral,
                    });
                    return;
                }

                try {
                    const res = await fetch(url);
                    if (!res.ok) throw new Error('status');
                } catch {
                    await interaction.reply({
                        content: 'Unable to access profile. Ensure the link is correct and public.',
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
                
                const msg = linkMessages.get(interaction.user.id);
                if (msg) {
                    try {
                        await msg.edit({ embeds: [tokenEmbed(token)], components: [row] });
                        linkMessages.delete(interaction.user.id);
                        await interaction.deferReply({ flags: MessageFlags.Ephemeral });
                        await interaction.deleteReply().catch(() => {});
                        return;
                    } catch {
                        // fall through and send a fresh reply below
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