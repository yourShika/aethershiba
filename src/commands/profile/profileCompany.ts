// commands/profile/profileCompany.ts

import {
    SlashCommandSubcommandBuilder,
    ChatInputCommandInteraction,
    MessageFlags,
    Colors,
    EmbedBuilder,
    AutocompleteInteraction,
} from 'discord.js';

import { DATACENTERS } from '../../const/housing';
import { fetchAllWorlds, getWorldNamesByDC } from '../../functions/housing/housingWorlds';
import { UNABLE_ACCESS } from '../../const/messages';
import { logger } from '../../lib/logger';
import { boolean } from 'zod/v4';

const UA = 'Mozilla/5.0 (compatible; AetherShiba/1.0)';

const SEARCH_ALL_CHOICE = { name: 'Search all', value: '__all__' } as const;
const SEARCH_ALL_KEYWORDS = ['search all', 'all'];

const FOCUS_CHOICES = [
    { name: 'Role-playing', value: 'role-playing' },
    { name: 'Leveling', value: 'leveling' },
    { name: 'Casual', value: 'casual' },
    { name: 'Hardcore', value: 'hardcore' },
    { name: 'Dungeons', value: 'dungeons' },
    { name: 'gildhests', value: 'guildhests' },
    { name: 'Trials', value: 'trials' },
    { name: 'Raids', value: 'raids' },
    { name: 'PvP', value: 'pvp'},
];

const normalize = (value: string) => value.trim().toLowerCase();

const shouldIncludeSerachAll = (value: string) => {
    const needle = normalize(value);
    if (!needle) return true;
    return SEARCH_ALL_KEYWORDS.some(keyword => keyword.startsWith(needle));
};

const isSearchAllValue = (value: string | null) => value === SEARCH_ALL_CHOICE.value;

const escapeRegex = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const decodeHTML = (input: string) => input
    .replace(/<br\s*\/?/gi, '\n')
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<[^>]*>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&#39;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/\s+/g, ' ')
    .trim();

async function fetchText(url: string): Promise<string | null> {
    try {
        const res = await fetch(url, { headers: { 'user-agent': UA }});
        if (!res.ok) {
            logger.debug(`FreeCompany fetch failed: ${res.status} ${res.statusText} for ${url}`);
            return null;
        }
        return await res.text();
    } catch (error) {
        logger.debug(`FreeCompany fetch error for ${url}`, error);
        return null;
    }
}

type SearchEntry = {
    id: string;
    name: string;
    world?: string;
    datacenter?: string;
    grandCompany?: string;
    crest?: string;
    members?: string;
    housing?: string;
    formed?: string;
    active?: string;
    recruitment?: string;
};

type FocusDetails = {
    slogan?: string;
    formed?: string;
    members?: string;
    rank?: string;
    reputation?:string;
    ranking?: string;
    estate?: string;
    recruitment?: string;
    activeList: string[];
    focusList: string[];
    seekingList: string[];
};

const normalizeFocusValue = (value: string) => value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();

const parseIconList = (raw: string): string[] => {
    const icons = Array.from(
        raw.matchAll(/<(?:img|span)[^>]*(?:data-tooltip|title|alt)="([^"]+)"[^>]*>/gi)
    )
    .map(match => decodeHTML(match[1] ?? ''))
    .filter(boolean);

    const textContent = decodeHTML(raw)
        .split(/[•,\n]/)
        .map(item => item.trim())
        .filter(boolean);

    const unique = new Map<string, string>();
    for (const val of [...icons, ...textContent]) {
        const key = normalizeFocusValue(val);
        if (!key) continue;
        if (!unique.has(key)) unique.set(key, val);
    }
    return Array.from(unique.values());
};

const extractDetail = (html: string, label: string): { raw: string; text: string } | null => {
    const re = new RegExp(`<dt[^>]*>${escapeRegex(label)}</dt>\s*<dd[^>]*>([\s\S]*?)</dd>`, 'i');
    const match = re.exec(html);
    if (!match) return null;
    const raw = match[1] ?? '';
    return { raw, text: decodeHTML(raw) };
}; 

async function searchFreeCompanies(query: string, options: {
    datacenter?: string | null;
    world?: string | null;
    recruiting?: 'yes' | 'no' | null;
}): Promise<SearchEntry[]> {
    const params = new URLSearchParams();
    params.set('q', query);

    if (options.datacenter && !isSearchAllValue(options.datacenter)) {
        params.set('dcname', options.datacenter);
    }
    if (options.world && !isSearchAllValue(options.world)) {
        params.set('worldname', options.world);
    }
    if (options.recruiting === 'yes') {
        params.set('recruitment', '1');
    }
    if (options.recruiting === 'no') {
        params.set('recruitment', '0');
    }

    const url = `https://eu.finalfantasyxiv.com/lodestone/freecompany/?${params.toString()}`;
    const html = await fetchText(url);
    if (!html) return [];

    const results: SearchEntry[] = [];
    const entryRe = /<a href="\/lodestone\/freecompany\/(\d+)\/"[^>]*>([\s\S]*?)<\/a>/gi;
    let match: RegExpExecArray | null;

    while ((match = entryRe.exec(html)) !== null) {
        const id = match[1];
        const block = match[2] ?? '';

        const nameMatch = /<p class="entry__name">([\s\S]*?)<\/p>/i.exec(block);
        const name = nameMatch ? decodeHTML(nameMatch[1] ?? '') : '';

        if (!id || !name) continue;

        const worldMatches = Array.from(block.matchAll(/<p class="entry__world">([\s\S]*?)<\/p>/gi)).map(m => decodeHTML(m[1] ?? ''));
        const grandCompany = worldMatches[0];
        const worldLine = worldMatches[1];

        let world: string | undefined;
        let datacenter: string | undefined;
        if (worldLine) {
            const m = /(.*?)(?:\s*\[([^\]]+)\])?$/.exec(worldLine);
            world = m?.[1]?.trim();
            datacenter = m?.[2]?.trim();
        }

        const crestMatch = /<div class="entry__freecompany__crest[\s\S]*?<img[^>]+src="([^"]+)"[^>]*class="entry__freecompany__crest__base"[\s\S]*?<div class="entry__freecompany__crest__image">([\s\S]*?)<\/div>[\s\S]*?<\/div>/i.exec(block);
    
        let crest: string | undefined;
        if (crestMatch) {
            const overlayBlock = crestMatch[2] ?? '';
            const overlayMatch = /<img[^>]+src="([^"]+)"[^>]*>/i.exec(overlayBlock);
            crest = overlayMatch ? overlayMatch[1] : crestMatch[1];
        } else {
            const simpleCrestMatch = /<div class="entry__freecompany__crest[\s\S]*?<img[^>]+src="([^"]+)"[^>]*>/i.exec(block);
            crest = simpleCrestMatch ? simpleCrestMatch[1] : undefined;
        }

        const membersMatch = /<li class="entry__freecompany__fc-member">([\s\S]*?)<\/li>/i.exec(block);
        const members = membersMatch ? decodeHTML(membersMatch[1] ?? '') : '';

        const housingMatch = /<li class="entry__freecompany__fc-housing">([\s\S]*?)<\/li>/i.exec(block);
        const housing = housingMatch ? decodeHTML(housingMatch[1] ?? '') : '';

        const formedMatch = /<li class="entry__freecompany__fc-day">([\s\S]*?)<\/li>/i.exec(block);
        const formed = formedMatch ? decodeHTML(formedMatch[1] ?? '') : '';

        const activeMatches = Array.from(block.matchAll(/<li class="entry__freecompany__fc-active">([\s\S]*?)<\/li>/gi)).map(m => decodeHTML(m[1] ?? ''));
        const active = activeMatches.find(val => val.toLowerCase().startsWith('active'));

        const recruitment = activeMatches.find(val => val.toLowerCase().startsWith('recruitment'));

        const entry: SearchEntry = { id, name };
        if (world)          entry.world = world;
        if (datacenter)     entry.datacenter = datacenter;
        if (grandCompany)   entry.grandCompany = grandCompany;
        if (crest)          entry.crest = crest;
        if (members)        entry.members = members;
        if (housing)        entry.housing = housing;
        if (formed)         entry.formed = formed;
        if (active)         entry.active = active;
        if (recruitment)    entry.recruitment = recruitment;

        results.push(entry);
    }

    return results;
}

async function fetchFreeCompanyDetails(id: string): Promise<FocusDetails | null> {
    const url = `https://eu.finalfantasyxiv.com/lodestone/freecompany/${id}/`;
    const html = await fetchText(url);
    if (!html) return null;

    const sloganMatch = /<div class="freecompany__text">([\s\S]*?)<\/div>/i.exec(html);
    const slogan = sloganMatch ? decodeHTML(sloganMatch[1] ?? '') : '';

    const formedDetail =        extractDetail(html, 'Formed');
    const membersDetail =       extractDetail(html, 'Active Members');
    const rankDetail =          extractDetail(html, 'Rank');
    const reputationDetail =    extractDetail(html, 'Reputation');
    const rankingDetail =       extractDetail(html, 'Ranking');
    const estateDetail =        extractDetail(html, 'Estate Profile');
    const recruitmentDetail =   extractDetail(html, 'Recruitment');
    const activeDetail =        extractDetail(html, 'Active');
    const focusDetail =         extractDetail(html, 'Focus');
    const seekingDetail =       extractDetail(html, 'Seeking');

    const details: FocusDetails = {
        activeList: activeDetail ? parseIconList(activeDetail.raw) : [],
        focusList: focusDetail ? parseIconList(focusDetail.raw) : [],
        seekingList: seekingDetail ? parseIconList(seekingDetail.raw): [],
    };

    if (slogan)                     details.slogan = slogan;
    if (formedDetail?.text)         details.formed = formedDetail.text;
    if (membersDetail?.text)        details.members = membersDetail.text;
    if (rankDetail?.text)           details.rank = rankDetail.text;
    if (reputationDetail?.text)     details.reputation = reputationDetail.text;
    if (rankingDetail?.text)        details.ranking = rankingDetail.text;
    if (estateDetail?.text)         details.estate = estateDetail.text;
    if (recruitmentDetail?.text)    details.recruitment = recruitmentDetail.text;
    
    return details;
}

type Sub = {
    name: string;
    description: string,
    build?: (sc: SlashCommandSubcommandBuilder) => SlashCommandSubcommandBuilder;
    execute: (interaction: ChatInputCommandInteraction) => Promise<void>;
    autocomplete?: (interaction: AutocompleteInteraction) => Promise<void>;
};

const sub: Sub = {
    name: 'comapny',
    description: 'Search for a Final Fantasy XIV Free Company',
    build: (sc) => sc
        .addStringOption(opt =>
            opt.setName('datacenter')
                .setDescription('Datacenter')
                .setRequired(true)
                .addChoices(SEARCH_ALL_CHOICE, ...DATACENTERS.map(dc => ({ name: dc, value: dc }))))
        .addStringOption(opt =>
            opt.setName('world')
                .setDescription('World')
                .setRequired(true)
                .setAutocomplete(true))
        .addStringOption(opt =>
            opt.setName('company')
                .setDescription('Free Company name')
                .setRequired(true))
        .addStringOption(opt =>
            opt.setName('recruiting_only')
                .setDescription('Filter by recruitment status')
                .addChoices(
                    { name: 'Ja', value: 'yes' },
                    { name: 'Nein', value: 'no' },
                ))
        .addStringOption(opt =>
            opt.setName('focus')
                .setDescription('Filter by Free Company focus')
                .addChoices(...FOCUS_CHOICES)),
    execute: async (interaction) => {
        const datacenter = interaction.options.getString('datacenter', true);
        const world = interaction.options.getString('world', true);
        const name = interaction.options.getString('company', true);
        const recruiting = interaction.options.getString('recruiting_only') as 'yes' | 'no' | null;
        const focusFilter = interaction.options.getString('focus');

        await interaction.deferReply({ flags: MessageFlags.Ephemeral });

        try {
            const results = await searchFreeCompanies(name, { datacenter, world, recruiting });
            if (!results.length) {
                await interaction.editReply({
                    content: 'No Free Companies found for the specified search.',
                });
                return;
            }

            let selectedEntry: SearchEntry | null = null;
            let detail: FocusDetails | null = null;

            for (const entry of results.slice(0, 5)) {
                const data = await fetchFreeCompanyDetails(entry.id);
                if (!data) continue;

                const recruitmentStatus = data.recruitment || entry.recruitment || '';
                const recuritmentValue = recruitmentStatus.toLowerCase();
                if (recruiting === 'yes' && !recuritmentValue.includes('open')) continue;
                if (recruiting === 'no' && recuritmentValue.includes('open')) continue;

                if (focusFilter) {
                    const focusKey = normalizeFocusValue(focusFilter);
                    const focusSet = new Set(data.focusList.map(normalizeFocusValue));
                    if (!focusSet.has(focusKey)) continue;
                }

                selectedEntry = entry;
                detail = data;
                break;
            }

            if (!selectedEntry || !detail) {
                await interaction.editReply({
                    content: 'No free Companies matched the provided filters.',
                });
                return;
            }

            const recruitmentDisplay = (value?: string | null) => value?.replace(/^recruitment:\s*/i, '').trim() || undefined;
            const activeDisplay = (value?: string | null) => value?.replace(/^active:\s*/i, '').trim() || undefined;

            const activeList = detail.activeList.length
                ? detail.activeList
                : activeDisplay(selectedEntry.active)
                    ? [activeDisplay(selectedEntry.active)!]
                    : [];

            const recrutimentText =
                recruitmentDisplay(detail.recruitment) ??
                recruitmentDisplay(selectedEntry.recruitment) ??
                undefined;

            const focusField = [
                activeList.length ? `**Active:** ${activeList.join(', ')}` : null,
                recrutimentText ? `**Recruitment:** ${recrutimentText}` : null,
                detail.focusList.length ? `**Focus**: ${detail.focusList.join(', ')}` : null,
                detail.seekingList.length ? `**Seeking**: ${detail.seekingList.join(', ')}` : null,
            ].filter(Boolean).join('\n') || '-';

            const embed = new EmbedBuilder()
                .setColor(Colors.Blurple)
                .setTitle(selectedEntry.name)
                .setURL(`https://eu.finalfantasyxiv.com/lodestone/freecompany/${selectedEntry.id}/`)
                .addFields(
                    { name: 'Company Slogan', value: detail.slogan || '-', inline: false },
                    { name: 'Formed', value: detail.formed || selectedEntry.formed || '-', inline: true },
                    { name: 'Active Members', value: detail.members || selectedEntry.members || '-', inline: true },
                    { name: 'Rank', value: detail.rank || '-', inline: true },
                    { name: 'Reputation', value: detail.reputation || '-', inline: false },
                    { name: 'Ranking', value: detail.ranking || '-', inline: false },
                    { name: 'Estate Profile', value: detail.estate || selectedEntry.housing || '-', inline: false },
                    { name: 'Focus', value: focusField, inline: false },
                )   
                .setTimestamp();

            const descriptionParts = [
                selectedEntry.grandCompany ? `**${selectedEntry.grandCompany}**` : null,
                (selectedEntry.world || selectedEntry.datacenter)
                    ? `> 🌐 ${selectedEntry.world ?? '-'}${selectedEntry.datacenter ? ` [${selectedEntry.datacenter}]` : ''}`
                    : null,
            ].filter(Boolean).join('\n');

            if (descriptionParts) {
                embed.setDescription(descriptionParts);
            }

            if (selectedEntry.crest) {
                embed.setThumbnail(selectedEntry.crest);
            }

            await interaction.editReply({
                embeds: [embed],
            });
        } catch (error) {
            logger.error('Failed to search Free Companies', error);
            await interaction.editReply({
                content: `${UNABLE_ACCESS}`,
            });
        }
    },
    autocomplete: async (interaction) => {
        const focused = interaction.options.getFocused(true);

        if (focused.name !== 'world') {
            await interaction.respond([]);
            return;
        }

        const dc = interaction.options.getString('datacenter');
        const rawVal = String(focused.value ?? '');
        const includeSearchAll = shouldIncludeSerachAll(rawVal);
        const normalizedQuery = normalize(rawVal);

        let worlds: string[] = [];
        try {
            if (dc && !isSearchAllValue(dc)) {
                worlds = await getWorldNamesByDC(dc);
            } else {
                const allWorlds = await fetchAllWorlds();
                worlds = allWorlds.map(world => world.name);
            }
        } catch {
            worlds = [];
        }

        if (worlds.length > 0) {
            const seen = new Set<string>();
            const uniqueWorlds: string[] = [];
            for (const world of worlds) {
                const key = normalize(world);
                if (seen.has(key)) continue;
                seen.add(key);
                uniqueWorlds.push(world);
            }
            worlds = uniqueWorlds.sort((a, b) => a.localeCompare(b));
        }

        const limit = 25 - (includeSearchAll ? 1 : 0);
        const worldChoices = worlds
            .filter(world => normalize(world).startsWith(normalizedQuery))
            .slice(0, Math.max(limit, 0))
            .map(world => ({ name: world, value: world }));

        if (includeSearchAll) {
            await interaction.respond([SEARCH_ALL_CHOICE, ...worldChoices].slice(0, 25));
        } else {
            await interaction.respond(worldChoices);
        }
    }
};

export default sub;