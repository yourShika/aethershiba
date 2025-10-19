// commands/profile/profileCompany.ts

// -------------------------------------------------
// Dependecies
// -------------------------------------------------


import { fetch } from "undici";
import dayjs from "dayjs";
import utc from "dayjs/plugin/utc";

dayjs.extend(utc);

import {
    ActionRowBuilder,
    AttachmentBuilder,
    AutocompleteInteraction,
    ButtonBuilder,
    ButtonStyle,
    ChatInputCommandInteraction,
    Colors,
    ComponentType,
    EmbedBuilder,
    MessageFlags,
    SlashCommandSubcommandBuilder,
} from "discord.js";
import sharp from "sharp";

import { DATACENTERS } from "../../const/housing";
import { getWorldNamesByDC } from "../../functions/housing/housingWorlds";
import {
    fetchLodestoneFreeCompany,
    fetchLodestoneFreeCompanyMembers,
    searchLodestoneFreeCompanies,
    type LodestoneFreeCompany,
    type LodestoneFreeCompanyMember,
    type LodestoneFreeCompanyFocus,
} from '../../functions/profile/profileLodestoneAPI';
import { logger } from "../../lib/logger";
import { getCompanyEmoji, getCityEmoji } from "../../const/emojis";
import { PROFILE_PREFIX } from "../../const/constants";

// Constants and Types
const USER_AGENT = 'Mozilla/5.0 (compatible; AetherShiba/1.0)';
const CREST_CACHE_TTL = 10 * 60 * 1000; // 10 minutes

// Command Definition
interface CrestCacheEntry {
    key: string;
    value: Buffer;
    expires: number;
}

// Simple in-memory cache for crest images
const crestCache = new Map<string, CrestCacheEntry>();

const normalize = (value: string) => value.trim().toLowerCase();

type SharpOverlayOptions = {
    input: Buffer;
    left?: number;
    top?: number;
};

async function fetchImageBuffer(url: string): Promise<Buffer | null> {
    try {
        const res = await fetch(url, { headers: { 'User-Agent': USER_AGENT } });
        if (!res.ok) return null;
        const arrayBuffer = await res.arrayBuffer();
        return Buffer.from(arrayBuffer);
    } catch (error) {
        logger.debug('Failed to download Free Company crest layer', error);
        return null;
    }
}

type CrestOverlay = { input: Buffer; left?: number; top?: number };

async function composeCrest(id: string, layers: string[]): Promise<Buffer | null> {
    if (!layers.length) return null;
    const cacheKey = layers.join('|');
    const cached = crestCache.get(id);
    if (cached && cached.key === cacheKey && cached.expires > Date.now()) {
        return cached.value;
    }

    const images = await Promise.all(layers.map(layer => fetchImageBuffer(layer)));
    const baseBuffer = images[0];
    if (!baseBuffer) return null;

    try {
        let baseWidth: number | undefined;
        let baseHeight: number | undefined;

        try {
            const metadata = await sharp(baseBuffer).metadata();
            baseWidth = metadata.width ?? undefined;
            baseHeight = metadata.height ?? undefined;
        } catch (error) {
            logger.debug('Failed to read Free Company crest base metadata', error);
        }

        const overlays = (await Promise.all(images
            .slice(1)
            .map(async (buf) => {
                if (!buf) return null;

                const overlay: SharpOverlayOptions = { input: buf };

                if (baseWidth !== undefined && baseHeight !== undefined) {
                    try {
                        const meta = await sharp(buf).metadata();
                        if (meta.width !== undefined && meta.height !== undefined) {
                            const left = Math.floor((baseWidth - meta.width) / 2);
                            const top = Math.floor((baseHeight - meta.height) / 2);
                            if (Number.isFinite(left)) overlay.left = left;
                            if (Number.isFinite(top)) overlay.top = top;
                        }
                    } catch (error) {
                        logger.debug('Failed to read Free Company crest layer metadata', error);
                    }
                }

                return overlay;
            })
        ))
        .filter((overlay): overlay is SharpOverlayOptions => overlay !== null);

        const composed = await sharp(baseBuffer).composite(overlays).png().toBuffer();
        crestCache.set(id, { key: cacheKey, value: composed, expires: Date.now() + CREST_CACHE_TTL });
        return composed;
    } catch (error) {
        logger.debug('Failed to compose Free Company crest', error);
        return null;
    }
}

function truncate(value: string, max = 1024): string {
    if (value.length <= max) return value;
    return `${value.slice(0, max - 1)}…`;
}

type FocusListOptions = {
    activeOnly?: boolean;
    includeEmoji?: boolean;
    includeStatus?: boolean;
};

function formatFocusList(
    items: LodestoneFreeCompanyFocus[],
    { activeOnly = false, includeEmoji = false, includeStatus = true }: FocusListOptions = {}
): string {
    if (!items.length) return '';

    const filtered = activeOnly
        ? items.filter(item => {
            if (!item.status) return true;
            const status = item.status.trim().toLowerCase();
            if (/inactive/.test(status)) return false;
            return /active/.test(status);
        })
        : items;

    if (!filtered.length) return '';

    const lines = filtered
        .map(({ name, status }) => {
            const trimmedName = name?.trim() ?? '';
            const emoji = includeEmoji ? (getCompanyEmoji(trimmedName) ?? '') : '';
            const parts = [emoji, trimmedName].filter(Boolean);
            if (!parts.length) return '';
            if (includeStatus && status) parts.push(`— ${status}`);
            return `• ${parts.join(' ')}`;
        })
        .filter(Boolean);

    return lines.join('\n');
}

function formatMembers(members: LodestoneFreeCompanyMember[]): string {
    if (!members.length) return '';
    const formatted = members.map(member => {
        const profileUrl = `https://eu.finalfantasyxiv.com/lodestone/character/${member.id}/`;
        const details: string[] = [];
        if (member.rank) details.push(`Rank: ${member.rank}`);
        if (member.classJob) details.push(`Class: ${member.classJob}`);
        const location = [member.world, member.datacenter ? `[${member.datacenter}]` : '']
            .filter(Boolean)
            .join(' ');
        if (location) details.push(`World: ${location}`);
        const detailsLine = details.length ? ` - ${details.join(' • ')}` : '';
        return `• [${member.name}](${profileUrl})${detailsLine}`;
    }).join('\n');
    return truncate(formatted, 1024);
}

function formatMemberEntry(member: LodestoneFreeCompanyMember): string {
    const profileUrl = `https://eu.finalfantasyxiv.com/lodestone/character/${member.id}/`;
    const header = `**[${member.name}](${profileUrl})**`;
    const detailParts: string[] = [];
    if (member.rank) detailParts.push(`Rank: ${member.rank}`);
    if (member.classJob) detailParts.push(`Class: ${member.classJob}`);
    const location = [member.world, member.datacenter ? `[${member.datacenter}]` : '']
        .filter(Boolean)
        .join(' ');
    if (location) detailParts.push(`World: ${location}`);
    const details = detailParts.length ? detailParts.join(' • ') : '—';
    return `${header}\n${details}`;
}

function buildMembersEmbeds(
    company: LodestoneFreeCompany,
    members: LodestoneFreeCompanyMember[],
    crestName?: string,
): EmbedBuilder[] {
    const crestUrl = crestName
        ? `attachment://${crestName}`
        : company.crestLayers[0] ?? undefined;

    if (!members.length) {
        const embed = new EmbedBuilder()
            .setColor(Colors.Blurple)
            .setTitle(`${company.name} - Members (0)`)
            .setURL(`https://eu.finalfantasyxiv.com/lodestone/freecompany/${company.id}/member/`)
            .setDescription('No members were listed on the Lodestone.')
            .setTimestamp();
        if (crestUrl) embed.setThumbnail(crestUrl);
        embed.setFooter({ text: `Lodestone • ${dayjs().utc().format('DD/MM/YYYY HH:mm [UTC]')}` });
        return [embed];
    }

    const entries = members.map(formatMemberEntry).filter(Boolean);
    const chunks: string[][] = [];
    let current: string[] = [];
    let currentLength = 0;
    const MAX_PAGE_LENGTH = 3500;
    const MAX_PER_PAGE = 10;

    for (const entry of entries) {
        const additionLength = entry.length + (current.length ? 2 : 0);
        if (
            current.length >= MAX_PER_PAGE ||
            (currentLength + additionLength) > MAX_PAGE_LENGTH
        ) {
            if (current.length) {
                chunks.push(current);
                current = [];
                currentLength = 0;
            }
        }
        current.push(entry);
        currentLength += additionLength;
    }

    if (current.length) {
        chunks.push(current);
    }

    if (!chunks.length) {
        chunks.push([]);
    }

    const totalPages = chunks.length;
    return chunks.map((chunk, index) => {
        const description = chunk.length ? chunk.join('\n\n') : 'No members were listed on the Lodestone.';
        const embed = new EmbedBuilder()
            .setColor(Colors.Blurple)
            .setTitle(`${company.name} — Members (${members.length})`)
            .setURL(`https://eu.finalfantasyxiv.com/lodestone/freecompany/${company.id}/member/`)
            .setDescription(description)
            .setTimestamp()
            .setFooter({
                text: `Lodestone • ${dayjs().utc().format('DD/MM/YYYY HH:mm [UTC]')} • Page ${index + 1}/${totalPages}`,
            });
        if (crestUrl) embed.setThumbnail(crestUrl);
        return embed;
    });
}

function formatReputation(reputation: LodestoneFreeCompany['reputation']): string {
    if (!reputation.length) return '';
    return truncate(reputation.map(entry => {
        const name = entry.name || 'Reputation';
        const value = entry.value || '-';
        const emoji = getCityEmoji(name) ?? '';
        const displayName = [emoji, name].filter(Boolean).join(' ').trim();
        return `• ${displayName || name}: ${value}`;
    }).join('\n'));
}

function formatFormed(formed: string, formedAt: Date | null): string {
    if (formedAt) {
        return dayjs(formedAt).utc().format('DD/MM/YYYY');
    }
    if (formed && formed.includes('document.')) {
        return '-';
    }

    const parsed = dayjs(formed);
    if (parsed.isValid()) {
        return parsed.utc().format('DD/MM/YYYY');
    }

    return formed || '-';
}

function formatRanking(value: string | undefined): string {
    if (!value) return '';
    const parts = value
        .split(/;+/)
        .map(part => part.trim())
        .filter(Boolean)
        .map(part => part.replace(/\s+/g, ' '));

    if (!parts.length) return '';

    const lowerParts = parts.map(part => ({ raw: part, lower: part.toLowerCase() }));
    const pick = (pattern: RegExp) => lowerParts.find(entry => pattern.test(entry.lower))?.raw;
    const weekly = pick(/weekly/);
    const weeklyPrev = pick(/previous week/);
    const monthly = pick(/monthly/);
    const monthlyPrev = pick(/previous month/);

    const lines: string[] = [];
    if (weekly) {
        const suffix = weeklyPrev && weeklyPrev !== weekly ? ` (${weeklyPrev})` : '';
        lines.push(weekly + suffix);
    }
    if (monthly) {
        const suffix = monthlyPrev && monthlyPrev !== monthly ? ` (${monthlyPrev})` : '';
        lines.push(monthly + suffix);
    }

    const remaining = parts.filter(part => ![weekly, weeklyPrev, monthly, monthlyPrev].includes(part));
    lines.push(...remaining);

    return lines.join('\n');
}

function buildFreeCompanyEmbed(
    company: LodestoneFreeCompany,
    members: LodestoneFreeCompanyMember[],
    crestName?: string,
) {
    const title = company.tag
        ? `${company.name} <${company.tag}>`
        : company.name;

    const embed = new EmbedBuilder()
        .setColor(Colors.Blurple)
        .setTitle(title)
        .setURL(`https://eu.finalfantasyxiv.com/lodestone/freecompany/${company.id}/`)
        .setTimestamp();

    if (crestName) {
        embed.setThumbnail(`attachment://${crestName}`);
    } else if (company.crestLayers[0]) {
        embed.setThumbnail(company.crestLayers[0]);
    }

    const locationLine = [
        company.world ? `🌐 ${company.world}` : '',
        company.datacenter ? ` <${company.datacenter}>` : '',
    ].filter(Boolean).join(' ');
    if (locationLine) {
        embed.setDescription(`${locationLine}`);
    }

    const sloganLines: string[] = [];
    if (company.slogan) {
        const links = Array.from(new Set(company.slogan.match(/https?:\/\/\S+/g) ?? []));
        let sloganText = company.slogan;
        for (const link of links) {
            sloganText = sloganText.replace(link, '').trim();
        }
        if (sloganText) sloganLines.push(truncate(sloganText));
        sloganLines.push(...links.map(link => `>${link}`));
    }

    const sloganValue = sloganLines.length
        ? truncate(sloganLines.join('\n'))
        : '—';
    embed.addFields({ name: '📝 Slogan', value: sloganValue, inline: false });

    embed.addFields(
        { name: '📣 Recruitment', value: company.recruitment || 'Closed', inline: true },
        { name: '🏅 Rank', value: company.rank || '—', inline: true },
        {
            name: '👥 Active Members',
            value: typeof company.activeMembers === 'number'
                ? company.activeMembers.toLocaleString()
                : '—',
            inline: true,
        },
        { name: '📅 Formed', value: formatFormed(company.formed, company.formedAt), inline: true },
    );

    const ranking = formatRanking(company.ranking);
    if (ranking) {
        embed.addFields({ name: '📈 Ranking', value: ranking, inline: false });
    }

    const reputation = formatReputation(company.reputation);
    if (reputation) {
        embed.addFields({ name: '🏛️ Reputation', value: reputation, inline: false });
    }

    const estateLines: string[] = [];
    if (company.estate?.name) {
        estateLines.push(company.estate.name);
    }
    const estateInfo = company.estate?.info
        ?.split('\n')
        .map(line => line.trim())
        .filter(Boolean) ?? [];
    if (estateInfo.length) {
        if (estateLines.length) estateLines.push('');
        estateLines.push(...estateInfo);
    }
    embed.addFields({
        name: '🏠 Estate Profile',
        value: truncate(estateLines.join('\n')) || '—',
        inline: false,
    });

    const focus = formatFocusList(company.focus, {
        activeOnly: true,
        includeEmoji: true,
        includeStatus: false,
    });
    if (focus) {
        embed.addFields({ name: '🎯 Focus', value: truncate(focus), inline: false });
    }

    //const memberList = formatMembers(members);
    //if (memberList) {
    //    embed.addFields({ name: '⭐ Featured Members', value: memberList, inline: false });
    //}

    embed.setFooter({ text: `Lodestone • ${dayjs().utc().format('DD/MM/YYYY HH:mm [UTC]')}` });

    return embed;
}

async function buildCrestAttachment(company: LodestoneFreeCompany): Promise<AttachmentBuilder | null> {
    const crest = await composeCrest(company.id, company.crestLayers);
    if (!crest) return null;
    const name = `fc-${company.id}.png`;
    return new AttachmentBuilder(crest, { name });
}

type Sub = {
    name: string;
    description: string;
    build?: (sc: SlashCommandSubcommandBuilder) => SlashCommandSubcommandBuilder;
    execute: (interaction: ChatInputCommandInteraction) => Promise<void>;
    autocomplete?: (interaction: AutocompleteInteraction) => Promise<void>;
};

async function respondWorldAutocomplete(interaction: AutocompleteInteraction) {
    const dc = interaction.options.getString('datacenter');
    if (!dc) {
        await interaction.respond([]);
        return;
    }

    const focused = interaction.options.getFocused(true);
    const query = normalize(String(focused.value ?? ''));

    try {
        const worlds = await getWorldNamesByDC(dc);
        const filtered = worlds
            .filter(world => normalize(world).startsWith(query))
            .slice(0, 25)
            .map(world => ({ name: world, value: world }));
        await interaction.respond(filtered);
    } catch {
        await interaction.respond([]);
    }
}

async function respondCompanyAutocomplete(interaction: AutocompleteInteraction) {
    const world = interaction.options.getString('world') ?? '';
    const dc = interaction.options.getString('datacenter') ?? '';
    const focused = interaction.options.getFocused(true);
    const query = String(focused.value ?? '').trim();

    if (!query) {
        await interaction.respond([]);
        return;
    }

    const results = await searchLodestoneFreeCompanies(query, world || undefined, dc || undefined);
    const seen = new Set<string>();
    const choices = results
        .filter(entry => {
            const key = `${entry.id}-${entry.name}`;
            if (seen.has(key)) return false;
            seen.add(key);
            return true;
        })
        .slice(0, 25)
        .map(entry => {
            const tag = entry.tag ? ` <${entry.tag}>` : '';
            return {
                name: `${entry.name}${tag}`.slice(0, 100),
                value: entry.id,
            };
        });
    await interaction.respond(choices);
}

const sub: Sub = {
    name: 'company',
    description: 'Inspect a Free Company from the Lodestone.',
    build: (sc) => sc
        .addStringOption(opt =>
            opt.setName('datacenter')
                .setDescription('Data Center of the Free Company')
                .setRequired(true)
                .addChoices(...DATACENTERS.map(dc => ({ name: dc, value: dc }))))
        .addStringOption(opt =>
            opt.setName('world')
                .setDescription('World of the Free Company')
                .setRequired(true)
                .setAutocomplete(true))
        .addStringOption(opt =>
            opt.setName('company')
                .setDescription('Name of the Free Company')
                .setRequired(true)
                .setAutocomplete(true)),
    execute: async (interaction) => {
        const datacenter = interaction.options.getString('datacenter', true);
        const world = interaction.options.getString('world', true);
        const companyInput = interaction.options.getString('company', true);

        if (!DATACENTERS.includes(datacenter as typeof DATACENTERS[number])) {
            await interaction.reply({
                content: `❌ \`${datacenter}\` is not a supported datacenter.`,
                flags: MessageFlags.Ephemeral
            });
            return;
        }

        await interaction.deferReply({ flags: MessageFlags.Ephemeral });

        let validWorlds: string[] = [];
        try {
            validWorlds = await getWorldNamesByDC(datacenter);
        } catch (error) {
            logger.debug('Failed to fetch world list for datacenter', { datacenter, error });
            await interaction.editReply({
                content: `🚧 Unable to validate the selected world right now. Please try again later.`,
            });
            return;
        }

        const worldMatch = validWorlds.find(w => normalize(w) === normalize(world));
        if (!worldMatch) {
            await interaction.editReply({
                content: `❌ \`${world}\` is not a valid world in the ${datacenter} datacenter.`,
            });
            return;
        }

        let companyId = companyInput.trim();
        if (!/^[0-9]+$/.test(companyId)) {
            const matches = await searchLodestoneFreeCompanies(companyInput, worldMatch, datacenter);
            const normalizedInput = normalize(companyInput);
            const normalizedWorld = normalize(worldMatch);
            const exact = matches.find(entry => normalize(entry.name) === normalizedInput && normalize(entry.world) === normalizedWorld)
                ?? matches.find(entry => normalize(entry.name) === normalizedInput)
                ?? matches.find(entry => normalize(entry.world) === normalizedWorld)
                ?? matches[0];
            if (!exact) {
                await interaction.editReply({
                    content: '🔍 No Free Company found with that name on the selected world.',
                });
                return;
            }
            companyId = exact.id;
        }

        const company = await fetchLodestoneFreeCompany(companyId);
        if (!company) {
            await interaction.editReply({
                content: '❌ Unable to fetch Free Company details. It may not exist.',
            });
            return;
        }

        const attachment = await buildCrestAttachment(company);
        const crestName = attachment?.name ?? undefined;

        const members = await fetchLodestoneFreeCompanyMembers(company.id, 512) ?? [];
        const infoEmbed = buildFreeCompanyEmbed(company, members.slice(0, 10), crestName);
        const memberEmbeds = buildMembersEmbeds(company, members, crestName);

        const getMemberEmbed = (index: number): EmbedBuilder => {
            const safeIndex = Math.max(0, Math.min(index, memberEmbeds.length - 1));
            return memberEmbeds[safeIndex]!;
        };

        const baseId = `${PROFILE_PREFIX}company:${interaction.id}`;
        const infoId = `${baseId}:info`;
        const membersId = `${baseId}:members`;
        const prevId = `${baseId}:prev`;
        const nextId = `${baseId}:next`;
        
        let currentView: 'info' | 'members' = 'info';
        let memberPage = 0;

        const buildComponents = (view: 'info' | 'members', page: number) => {
            const rows: ActionRowBuilder<ButtonBuilder>[] = [];
            const viewRow = new ActionRowBuilder<ButtonBuilder>().addComponents(
                new ButtonBuilder()
                    .setCustomId(infoId)
                    .setLabel('Guild Info')
                    .setStyle(view === 'info' ? ButtonStyle.Primary : ButtonStyle.Secondary)
                    .setDisabled(view === 'info'),
                new ButtonBuilder()
                    .setCustomId(membersId)
                    .setLabel('Members')
                    .setStyle(view === 'members' ? ButtonStyle.Primary : ButtonStyle.Secondary)
                    .setDisabled(view === 'members'),
            );
            rows.push(viewRow);

        if (view === 'members' && memberEmbeds.length > 1) {
            rows.push(new ActionRowBuilder<ButtonBuilder>().addComponents(
                new ButtonBuilder()
                    .setCustomId(prevId)
                    .setEmoji('⬅️')
                    .setStyle(ButtonStyle.Secondary)
                    .setDisabled(page <= 0),
                new ButtonBuilder()
                    .setCustomId(nextId)
                    .setEmoji('➡️')
                    .setStyle(ButtonStyle.Secondary)
                    .setDisabled(page >= memberEmbeds.length - 1),
            ));
        }

        return rows;
};

const initialComponents = buildComponents(currentView, memberPage);
const relyOptions = {
    embeds: [infoEmbed],
    components: initialComponents,
    files: attachment ? [attachment] : [],
} as const;

const message = await interaction.editReply(relyOptions);

const collector = message.createMessageComponentCollector({
    componentType: ComponentType.Button,
    time: 120_000, 
});

collector.on('collect', async (btn) => {
    if (btn.user.id !== interaction.user.id) {
        await btn.reply({
            content: 'This interaction is not for you.',
            flags: MessageFlags.Ephemeral,
        });
        return;
    }

    if (btn.customId === infoId) {
        currentView = 'info';
        const components = buildComponents(currentView, memberPage);
        await btn.update({ embeds: [infoEmbed], components });
        return;
    }

    if (btn.customId === membersId) {
        currentView = 'members';
        memberPage = 0;
        const components = buildComponents(currentView, memberPage);
        await btn.update({ embeds: [getMemberEmbed(memberPage)], components });
        return;
    }

    if (currentView !== 'members') {
        await btn.deferUpdate();
        return;
    }

    if (btn.customId === prevId) {
        memberPage = Math.max(0, memberPage - 1);
    }

    if (btn.customId === nextId) {
        memberPage = Math.min(memberEmbeds.length - 1, memberPage + 1);
    }

    const components = buildComponents(currentView, memberPage);
    await btn.update({ embeds: [getMemberEmbed(memberPage)], components });
});

collector.on('end', async () => {
    try {
        await message.edit({ components: [] });
    } catch {

    }
});


    },
    autocomplete: async (interaction) => {
        const focused = interaction.options.getFocused(true);
        if (focused.name === 'world') {
            await respondWorldAutocomplete(interaction);
            return;
        }
        if (focused.name === 'company') {
            await respondCompanyAutocomplete(interaction);
            return;
        }
        await interaction.respond([]);
    },
};

export default sub;