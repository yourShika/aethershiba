// commands/profile/profileCompany.ts

// -------------------------------------------------
// Dependecies
// -------------------------------------------------


import { fetch } from "undici";
import dayjs from "dayjs";
import utc from "dayjs/plugin/utc";

dayjs.extend(utc);

import {
    AttachmentBuilder,
    AutocompleteInteraction,
    ChatInputCommandInteraction,
    Colors,
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

async function composeCrest(id: string, layers: string[]): Promise<Buffer | null> {
    if (!layers.length) return null;
    const cacheKey = layers.join('|');
    const cached = crestCache.get(id);
    if (cached && cached.key === cacheKey && cached.expires > Date.now()) {
        return cached.value;
    }

    const images = await Promise.all(layers.map(layer => fetchImageBuffer(layer)));
    if (!images[0]) return null;

    try {
        const base = sharp(images[0]);
        const overlays = images
            .slice(1)
            .filter((buf): buf is Buffer => Boolean(buf))
            .map(buf => ({ input: buf}));
        const composed = await base.composite(overlays).png().toBuffer();
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
        const rank = member.rank ? ` — ${member.rank}` : '';
        return `• [${member.name}](${profileUrl})${rank}`;
    }).join('\n');
    return truncate(formatted, 1024);
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
        company.world,
        company.datacenter ? `[${company.datacenter}]` : '',
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
    embed.addFields({ name: 'Slogan', value: sloganValue, inline: false });

    embed.addFields(
        { name: 'Recruitment', value: company.recruitment || 'Closed', inline: true },
        { name: 'Rank', value: company.rank || '—', inline: true },
        {
            name: 'Active Members',
            value: typeof company.activeMembers === 'number'
                ? company.activeMembers.toLocaleString()
                : '—',
            inline: true,
        },
        { name: 'Formed', value: formatFormed(company.formed, company.formedAt), inline: true },
    );

    const ranking = formatRanking(company.ranking);
    if (ranking) {
        embed.addFields({ name: 'Ranking', value: ranking, inline: false });
    }

    const reputation = formatReputation(company.reputation);
    if (reputation) {
        embed.addFields({ name: 'Reputation', value: reputation, inline: false });
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
        name: 'Estate Profile',
        value: truncate(estateLines.join('\n')) || '—',
        inline: false,
    });

    const focus = formatFocusList(company.focus, {
        activeOnly: true,
        includeEmoji: true,
        includeStatus: false,
    });
    if (focus) {
        embed.addFields({ name: 'Focus', value: truncate(focus), inline: false });
    }

    const memberList = formatMembers(members);
    if (memberList) {
        embed.addFields({ name: 'Featured Members', value: memberList, inline: false });
    }

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
            const location = entry.world ? ` @ ${entry.world}` : '';
            return {
                name: `${entry.name}${tag}${location}`.slice(0, 100),
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

        const members = await fetchLodestoneFreeCompanyMembers(company.id, 10) ?? [];
        const embed = buildFreeCompanyEmbed(company, members, crestName);

        if (attachment) {
            await interaction.editReply({ embeds: [embed], files: [attachment] });
        } else {
            await interaction.editReply({ embeds: [embed] });
        }
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