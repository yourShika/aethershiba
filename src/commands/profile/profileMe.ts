import {
    SlashCommandSubcommandBuilder,
    ChatInputCommandInteraction,
    MessageFlags,
    EmbedBuilder,
    Colors,
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle,
    ComponentType,
} from 'discord.js';

import { PROFILE_PREFIX } from '../../const/constants';
import { PROFILE_NOT_LINKED, UNABLE_ACCESS } from '../../const/messages';
import { getProfileByUser } from '../../functions/profile/profileStore';
import { fetchLodestoneCharacter } from '../../functions/profile/profileLodestoneAPI';

type Sub = {
    name: string;
    description: string,
    build?: (sc: SlashCommandSubcommandBuilder) => SlashCommandSubcommandBuilder;
    execute: (interaction: ChatInputCommandInteraction) => Promise<void>;
};

const sub: Sub = {
    name: 'me',
    description: 'Lookup at your Linked FFXIV-Profile.',
    build: (sc) => sc,
    execute: async (interaction) => {
        const profile = await getProfileByUser(interaction.user.id);

        if (!profile) {
            await interaction.reply({
                content: `${PROFILE_NOT_LINKED}`,
                flags: MessageFlags.Ephemeral,
            });
            return;
        }

        await interaction.deferReply({ flags: MessageFlags.Ephemeral });

        try {
            const char = await fetchLodestoneCharacter(profile.lodestoneId);
            if (!char) throw new Error('lodestone');

            const gc = char.grandCompany || '-';
            const fc = char.freeCompanyName
                ? `[${char.freeCompanyName}](https://eu.finalfantasyxiv.com/lodestone/freecompany/${char.freeCompanyId}/)`
                : '-';

            const minions = char.minions;
            const mounts = char.mounts;

            const overview = new EmbedBuilder()
                .setColor(Colors.Blurple)
                .setTitle(char.name)
                .setURL(profile.lodestoneUrl)
                .setThumbnail(char.portrait)
                .addFields(
                    { name: 'Race / Clan / Gender', value: `${char.race}\n${char.tribe} / ${char.gender}` },
                    { name: 'Datacenter / World', value: `${char.dc} / ${char.server}` },
                    { name: 'City-State', value: char.town || '—', inline: true },
                    { name: 'Grand Company', value: gc, inline: true },
                    { name: 'Free Company', value: fc },
                    { name: 'Minions', value: `${minions}`, inline: true },
                    { name: 'Mounts', value: `${mounts}`, inline: true }
                );

            const jobs = char.classJobs;
            const jobLines = jobs
                .map(j => `${j.name}: ${j.level}`)
                .join('\n');

            const classes = new EmbedBuilder()
                .setColor(Colors.Blurple)
                .setTitle(`${char.name} - Classes`)
                .setThumbnail(char.portrait)
                .setDescription(jobLines || 'No class information');

            const pages: [EmbedBuilder, ...EmbedBuilder[]] = [overview, classes];

            let index = 0;
            const prevId = `${PROFILE_PREFIX}me:prev`;
            const nextId = `${PROFILE_PREFIX}me:next`;

            const navigation = new ActionRowBuilder<ButtonBuilder>().addComponents(
                new ButtonBuilder()
                    .setCustomId(prevId)
                    .setStyle(ButtonStyle.Secondary)
                    .setEmoji('⬅️')
                    .setDisabled(true),
                new ButtonBuilder()
                    .setCustomId(nextId)
                    .setStyle(ButtonStyle.Secondary)
                    .setEmoji('➡️')
                    .setDisabled(pages.length === 1)
            );

            const msg = await interaction.editReply({
                embeds: [pages[0]],
                components: pages.length > 1 ? [navigation] : [],
            });

            if (pages.length > 1) {
                const collector = msg.createMessageComponentCollector({
                    componentType: ComponentType.Button,
                    time: 60_000,
                });

                collector.on('collect', async (btn) => {
                    if (btn.user.id !== interaction.user.id) {
                        await btn.reply({
                            content: 'This interaction is not for you.',
                            flags: MessageFlags.Ephemeral,
                        });
                        return;
                    }

                    if (btn.customId === prevId) index = Math.max(0, index - 1);
                    if (btn.customId === nextId) index = Math.min(pages.length - 1, index + 1);

                    const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
                        new ButtonBuilder()
                            .setCustomId(prevId)
                            .setStyle(ButtonStyle.Secondary)
                            .setEmoji('⬅️')
                            .setDisabled(index === 0),
                        new ButtonBuilder()
                            .setCustomId(nextId)
                            .setStyle(ButtonStyle.Secondary)
                            .setEmoji('➡️')
                            .setDisabled(index === pages.length - 1)
                    );

                    await btn.update({ embeds: [pages[index]!], components: [row] });
                });

                collector.on('end', async () => {
                    try {
                        await msg.edit({ components: [] });
                    } catch {
                        // ignore
                    }
                });
            }
        } catch {
            await interaction.editReply({
                content: `${UNABLE_ACCESS}`,
                embeds: [],
                components: [],
            });
        }
    }
};

export default sub;