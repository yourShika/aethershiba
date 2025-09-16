// commands/profile/profileInspect.ts

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
    AutocompleteInteraction,
} from 'discord.js';

import { DATACENTERS } from '../../const/housing';
import { getWorldNamesByDC } from '../../functions/housing/housingWorlds';
import { PROFILE_PREFIX } from '../../const/constants';
import { UNABLE_ACCESS } from '../../const/messages';
import { getJobEmoji, getCityEmoji, JOB_CATEGORIES, normalizeKey } from '../../const/emojis';
import { fetchLodestoneCharacter, searchLodestoneCharacters } from '../../functions/profile/profileLodestoneAPI';
import { getProfilebyLodestoneId } from '../../functions/profile/profileStore';

type Sub = {
    name: string;
    description: string;
    build?: (sc: SlashCommandSubcommandBuilder) => SlashCommandSubcommandBuilder;
    execute: (interaction: ChatInputCommandInteraction) => Promise<void>;
    autocomplete?: (interaction: AutocompleteInteraction) => Promise<void>;
};

const sub: Sub = {
    name: 'inspect',
    description: 'Inspect a FFXIV character by name.',
    build: (sc) => sc
        .addStringOption(opt =>
            opt.setName('datacenter')
                .setDescription('Datacenter')
                .setRequired(true)
                .addChoices(...DATACENTERS.map(dc => ({ name: dc, value: dc }))))
        .addStringOption(opt =>
            opt.setName('world')
                .setDescription('World')
                .setRequired(true)
                .setAutocomplete(true))
        .addStringOption(opt =>
            opt.setName('character')
                .setDescription('Character name')
                .setRequired(true)
                .setAutocomplete(true)),
    execute: async (interaction) => {
        const id = interaction.options.getString('character', true);
        await interaction.deferReply({ flags: MessageFlags.Ephemeral });

        try {
            const char = await fetchLodestoneCharacter(id);
            if (!char) throw new Error('lodestone');

            const lodestoneUrl = `https://eu.finalfantasyxiv.com/lodestone/character/${id}`;
            const linkedProfile = await getProfilebyLodestoneId(id);
            const linkedMember = linkedProfile && interaction.guild
                ? await interaction.guild.members.fetch(linkedProfile.userId).catch(() => null)
                : null;

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
                )
                .setFooter({ text: 'Lodestone • Tap the title to open the profile • Page 1/2' })
                .setTimestamp();

            if (linkedMember) {
                overview.addFields({ name: `🔗 Linked Discord Account`, value: linkedMember.toString(), inline: false });
            }
            
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
                        return emoji ? `${emoji} ${lvl}` : `${name} ${lvl}`;
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
            })
        }
    },
    autocomplete: async (interaction) => {
        const focused = interaction.options.getFocused(true);

        if (focused.name === 'world') {
            const dc = interaction.options.getString('datacenter');
            const worlds = dc ? await getWorldNamesByDC(dc) : [];
            const val = String(focused.value).toLowerCase();

            const choices = worlds
                .filter(w => w.toLowerCase().startsWith(val))
                .slice(0, 25)
                .map(w => ({ name: w, value: w }));

            await interaction.respond(choices);
            return;
        }

        if (focused.name === 'character') {
            const world = interaction.options.getString('world');
            const query = String(focused.value);

            if (!world || !query) {
                await interaction.respond([]);
                return;
            }

            const results = await searchLodestoneCharacters(query, world);
            const choices = results
                .slice(0, 25)
                .map(r => ({ name: `${r.name} @ ${r.world}`, value: r.id }));
            await interaction.respond(choices);
            return;
        }
    }
}; 

export default sub;