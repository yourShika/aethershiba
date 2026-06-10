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

import { PROFILE_PREFIX } from '../../const/constants.js';
import { PROFILE_USER_NOT_LINKED, UNABLE_ACCESS } from '../../const/messages.js';
import { getProfileByUser } from '../../functions/profile/profileStore.js';
import { fetchLodestoneCharacter } from '../../functions/profile/profileLodestoneAPI.js';
import { getJobEmoji, getCityEmoji, JOB_CATEGORIES, normalizeKey } from '../../const/emojis.js';

type Sub = {
    name: string;
    description: string,
    build?: (sc: SlashCommandSubcommandBuilder) => SlashCommandSubcommandBuilder;
    execute: (interaction: ChatInputCommandInteraction) => Promise<void>;
};

const sub: Sub = {
    name: 'inspect',
    description: 'Show a Linked FFXIV to a Discord Account.',
    build: (sc) => sc.addUserOption(o => o.setName('user').setDescription('User').setRequired(true)),
    execute: async (interaction) => {
        const user = interaction.options.getUser('user', true);
        const profile = await getProfileByUser(user.id);

        if (!profile) {
            await interaction.reply({
                content: PROFILE_USER_NOT_LINKED(user.toString()),
                flags: MessageFlags.Ephemeral,
            });
            return;
        }

        await interaction.deferReply({ flags: MessageFlags.Ephemeral });

        try {
            const char = await fetchLodestoneCharacter(profile.lodestoneId);
            if (!char) throw new Error('lodestone');

            const lodestoneUrl = profile.lodestoneUrl
            const gc = char.grandCompany || '-';
            const fc = char.freeCompanyName
                ? `[${char.freeCompanyName}](https://eu.finalfantasyxiv.com/lodestone/freecompany/${char.freeCompanyId}/)`
                : '-';

            const minions = char.minions;
            const mounts = char.mounts;

            const townDisplay = char.town
                ? `${getCityEmoji(char.town) ?? ''} ${char.town}`.trim()
                : '-';

            const formatCount = (n?: number) => (typeof n === 'number' ? n.toLocaleString() : '-');

            const overview = new EmbedBuilder()
                .setColor(Colors.Blurple)
                .setTitle(char.name)
                .setURL(lodestoneUrl)
                .setImage(char.portrait)
                .setDescription([
                    `**${char.race}** • ${char.tribe} • ${char.gender}`,
                    `> 🌐 **${char.dc}** • ${char.server}`,
                ].join('\n'))
                .addFields(
                    { name: '🏰 City-State', value: townDisplay || '-', inline: true },
                    { name: '🏯 Grand Company', value: gc, inline: true },
                    { name: '\u200B', value: '\u200B', inline: true },
                    { name: '⛺ Free Company', value: fc || '-', inline: false },
                    { name: '🧸 Minions', value: `**${formatCount(minions)}**`, inline: true },
                    { name: '🐎 Mounts', value: `**${formatCount(mounts)}**`, inline: true },
                    { name: '🔗 Linked Discord Account', value: user.toString(), inline: false },
                )
                .setFooter({ text: 'Lodestone • Tap the title to open the profile • Page 1/2' })
                .setTimestamp();

            const jobs = char.classJobs;
            const jobMap = new Map(jobs.map(j => [normalizeKey(j.name), j.level]));

            const classes = new EmbedBuilder()
                .setColor(Colors.Blurple)
                .setTitle(`${char.name} - Classes`)
                .setURL(lodestoneUrl)
                .setThumbnail(char.portrait)
                .setFooter({ text: 'Lodestone • Tap the title to open the profile • Page 2/2' })
                .setTimestamp();
            
            for (const [cat, jobNames] of Object.entries(JOB_CATEGORIES)) {
                const value = jobNames
                    .map(name => {
                        const lvl = jobMap.get(name) ?? 0;
                        const emoji = getJobEmoji(name);
                        return emoji ? `${emoji} ${lvl}` : `${name} : ${lvl}`;
                    })
                    .join(' ');
                classes.addFields({ name: cat, value: value || '-' });
            }

            const pages: [EmbedBuilder, ...EmbedBuilder[]] = [overview, classes];

            let index = 0;
            const prevId = `${PROFILE_PREFIX}inspect:prev`;
            const nextId = `${PROFILE_PREFIX}inspect:next`;

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
                    .setDisabled(pages.length === 1),
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
                            .setDisabled(index === pages.length - 1),
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
