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
import { fetchFreeCompanyProfile, normalizeFocusValue, searchFreeCompanies, type FreeCompanyProfile, type FreeCompanySearchResults } from '../../functions/profile/profileFreeCompanyAPI';

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

const FOCUS_EMOJI_MAP: Record<string, string> = {
    trials: '<:Trials:1418907959592882186>',
    guildhests: '<:Guildhests:1418907951791476816>',
    guildhest: '<:Guildhests:1418907951791476816>',
    casual: '<:Casual:1418907934024400956>',
    raids: '<:Raids:1418907921663922198>',
    raid: '<:Raids:1418907921663922198>',
    dungeons: '<:Dungeons:1418907897944866911>',
    dungeon: '<:Dungeons:1418907897944866911>',
    pvp: '<:PvP:1418907884669898752>',
    leveling: '<:Leveling:1418907839434461244>',
    'role playing': '<:RolePlaying:1418907831611949066>',
    roleplaying: '<:RolePlaying:1418907831611949066>',
    roleplay: '<:RolePlaying:1418907831611949066>',
    hardcore: '<:Hardcore:1418907822044876892>',
};

const FOCUS_DISPLAY_ALIASES = new Map<string, string>();

const addFocusAlias = (display: string, alias: string) => {
    const normalized = normalizeFocusValue(alias);
    if (!normalized) return;
    if (!FOCUS_DISPLAY_ALIASES.has(normalized)) {
        FOCUS_DISPLAY_ALIASES.set(normalized, display);
    }

    const compact = normalized.replace(/\s+/g, '');
    if (compact !== normalized && !FOCUS_DISPLAY_ALIASES.has(compact)) {
        FOCUS_DISPLAY_ALIASES.set(compact, display);
    }
};

const registerFocusDisplay = (display: string, aliases: string[]) => {
    const trimmedDisplay = display.trim();
    if (!trimmedDisplay) return;

    addFocusAlias(trimmedDisplay, trimmedDisplay);
    for (const alias of aliases) {
        addFocusAlias(trimmedDisplay, alias);
    }
};

registerFocusDisplay('Role-playing', ['role-playing', 'roleplaying', 'roleplay']);
registerFocusDisplay('Leveling', ['leveling']);
registerFocusDisplay('Casual', ['casual']);
registerFocusDisplay('Hardcore', ['hardcore']);
registerFocusDisplay('Dungeons', ['dungeons', 'dungeon']);
registerFocusDisplay('Guildhests', ['guildhests', 'guildhest', 'gildhests']);
registerFocusDisplay('Trials', ['trials', 'trial']);
registerFocusDisplay('Raids', ['raids', 'raid']);
registerFocusDisplay('PvP', ['pvp']);

const getFocusEmoji = (value: string): string | null => {
    const normalized = normalizeFocusValue(value);
    if (!normalized) return null;
    const compact = normalized.replace(/\s+/g, '');
    return FOCUS_EMOJI_MAP[normalized] ?? FOCUS_EMOJI_MAP[compact] ?? null;
};

const expandFocusValue = (value: string): string[] => {
    const trimmed = value.trim();
    if (!trimmed) return [];

    const normalized = normalizeFocusValue(trimmed);
    if (!normalized) return [];

    const padded = ` ${normalized} `;
    const matches: Array<{ display: string; alias: string; index: number }> = [];

    for (const [alias, display] of FOCUS_DISPLAY_ALIASES) {
        const search = ` ${alias} `;
        const index = padded.indexOf(search);
        if (index === -1) continue;
        matches.push({ display, alias, index });
    }

    if (!matches.length) {
        const canonical = FOCUS_DISPLAY_ALIASES.get(normalized);
        if (canonical) return [canonical];
        return [trimmed];
    }

    matches.sort((a, b) => a.index - b.index);

    const canonicalMatches: Array<{ display: string; alias: string }> = [];
    const seenCanonical = new Set<string>();

    for (const match of matches) {
        const canonicalKey = normalizeFocusValue(match.display);
        if (!canonicalKey || seenCanonical.has(canonicalKey)) continue;
        seenCanonical.add(canonicalKey);
        canonicalMatches.push({ display: match.display, alias: match.alias });
    }

    if (canonicalMatches.length === 1) {
        const single = canonicalMatches[0];
        if (!single) return [trimmed];

        const alias = single.alias;
        const compactAlias = alias.replace(/\s+/g, '');
        if (normalized === alias || normalized === compactAlias) {
            return [single.display];
        }
        return [trimmed];
    }

    if (canonicalMatches.length > 1) {
        return canonicalMatches.map(match => match.display);
    }

    return [trimmed];
};

const formatFocusList = (values: string[]): string | null => {
    if (!values.length) return null;
    const formatted: string[] = [];
    const seen = new Set<string>();

    for (const value of values) {
        if (typeof value !== 'string') continue;
        const expanded = expandFocusValue(value);

        for (const entry of expanded) {
            const normalized = normalizeFocusValue(entry);
            if (!normalized || seen.has(normalized)) continue;
            seen.add(normalized);

            const emoji = getFocusEmoji(entry);
            formatted.push(emoji ? `${emoji} ${entry}` : entry);
        }
    }

    return formatted.length ? formatted.join(', ') : null;
};

const formatSeekingList = (values: string[], fallback = 'Not specified'): string => {
    if (!values.length) return fallback;

    const unique: string[] = [];
    const seen = new Set<string>();

    for (const value of values) {
        if (typeof value !== 'string') continue;
        const trimmed = value.trim();
        if (!trimmed) continue;

        const normalized = normalizeFocusValue(trimmed);
        if (!normalized) continue;
        if (seen.has(normalized)) continue;
        seen.add(normalized);
        unique.push(trimmed);
    }

    if (!unique.length) return fallback;
    return unique.join(', ');
};

const EMBED_FIELD_MAX_LENGTH = 1024;
const EMBED_FIELD_SEPARATOR = '\n';
const ELLIPSIS = '…';

const formatEmbedFieldValue = (
    parts: Array<string | null | undefined>,
    fallback = '-',
    maxLength = EMBED_FIELD_MAX_LENGTH,
): string => {
    const filtered = parts
        .map(part => (typeof part === 'string' ? part.trim() : ''))
        .filter((part): part is string => part.length > 0);

    if (!filtered.length) return fallback;

    const result: string[] = [];
    let currentLength = 0;

    for (const part of filtered) {
        const prefixLength = result.length ? EMBED_FIELD_SEPARATOR.length : 0;
        if (currentLength + prefixLength >= maxLength) break;

        const available = maxLength - currentLength - prefixLength;

        if (part.length > available) {
            if (available <= 1) {
                if (!result.length) return fallback;
                result.push(ELLIPSIS);
            } else {
                result.push(`${part.slice(0, available - 1)}${ELLIPSIS}`);
            }
            break;
        }

        result.push(part);
        currentLength += prefixLength + part.length;
    }

    return result.join(EMBED_FIELD_SEPARATOR) || fallback;
};

const sanitizeFieldValue = (
    value?: string | null,
    fallback = '-',
    maxLength = EMBED_FIELD_MAX_LENGTH,
): string => {
    if (typeof value !== 'string') return fallback;
    const trimmed = value.trim();
    if (!trimmed.length) return fallback;
    if (trimmed.length <= maxLength) return trimmed;
    return `${trimmed.slice(0, maxLength - 1)}${ELLIPSIS}`;
};

const cleanTagValue = (value?: string | null): string => {
    if (typeof value !== 'string') return '';
    return value.replace(/[«»<>]/g, '').replace(/\s+/g, ' ').trim();
};

const extractNameAndTag = (value?: string | null): { name: string; tag?: string } => {
    if (typeof value !== 'string') return { name: '' };
    const trimmed = value.trim();
    if (!trimmed) return { name: '' };

    const fancyMatch = /«([^»]+)»/.exec(trimmed);
    const angleMatch = !fancyMatch ? /<([^>]+)>/.exec(trimmed) : null;
    const match = fancyMatch ?? angleMatch;

    if (!match) return { name: trimmed };

    const tag = cleanTagValue(match[1]);
    const name = trimmed.replace(match[0], '').replace(/\s+/g, ' ').trim();
    const result: { name: string; tag?: string } = { name: name || trimmed };
    if (tag) result.tag = tag;
    return result;
};

const formatCompanyTitle = (
    primaryName?: string | null,
    fallbackName?: string | null,
    tagCandidates: Array<string | null | undefined> = [],
): string => {
    const nameCandidates = [primaryName, fallbackName].filter(
        (candidate): candidate is string => typeof candidate === 'string' && candidate.trim().length > 0,
    );

    let resolvedName = '';
    let resolvedTag = '';

    for (const candidate of nameCandidates) {
        const { name, tag } = extractNameAndTag(candidate);
        if (!resolvedName && name) resolvedName = name;
        if (!resolvedTag && tag) resolvedTag = tag;
        if (resolvedName && resolvedTag) break;
    }

    if (!resolvedName && nameCandidates.length) {
        const [firstCandidate] = nameCandidates;
        if (firstCandidate) resolvedName = firstCandidate.trim();
    }

    for (const tagCandidate of tagCandidates) {
        const cleaned = cleanTagValue(tagCandidate);
        if (cleaned) {
            resolvedTag = cleaned;
            break;
        }
    }

    if (resolvedTag) {
        if (resolvedName) return `${resolvedName} <${resolvedTag}>`;
        return `<${resolvedTag}>`;
    }

    return resolvedName || 'Free Company';
};

const formatFormedValue = (value?: string | null): string | null => {
    if (typeof value !== 'string') return null;
    const trimmed = value.trim();
    if (!trimmed) return null;

    const digitIndex = trimmed.search(/\d/);
    let core = digitIndex >= 0 ? trimmed.slice(digitIndex) : trimmed;
    core = core.replace(/^[\s:：\-–—]+/, '').trim();
    if (!core) return trimmed;

    const isoMatch = /^(\d{4})[\.\/-](\d{1,2})[\.\/-](\d{1,2})/.exec(core);
    if (isoMatch) {
        const year = isoMatch[1] ?? '';
        const month = isoMatch[2] ?? '';
        const day = isoMatch[3] ?? '';
        if (year && month && day) {
            const paddedDay = day.padStart(2, '0');
            const paddedMonth = month.padStart(2, '0');
            const paddedYear = year.padStart(4, '0');
            return `${paddedDay}/${paddedMonth}/${paddedYear}`;
        }
    }

    const dayFirstMatch = /^(\d{1,2})[\.\/](\d{1,2})[\.\/](\d{2,4})/.exec(core);
    if (dayFirstMatch) {
        const day = dayFirstMatch[1] ?? '';
        const month = dayFirstMatch[2] ?? '';
        const year = dayFirstMatch[3] ?? '';
        if (day && month && year) {
            const paddedDay = day.padStart(2, '0');
            const paddedMonth = month.padStart(2, '0');
            const normalizedYear = year.length === 2
                ? `${Number(year) >= 70 ? '19' : '20'}${year}`
                : year.padStart(4, '0');
            return `${paddedDay}/${paddedMonth}/${normalizedYear}`;
        }
    }

    return core;
};

type CompanyAutocompletePayload = {
    id: string;
    name?: string;
    world?: string;
    datacenter?: string;
};

const parseCompanySelection = (value: string): CompanyAutocompletePayload | null => {
    try {
        const parsed = JSON.parse(value);
        if (!parsed || typeof parsed !== 'object') return null;
        if (typeof parsed.id !== 'string') return null;
        const payload: CompanyAutocompletePayload = { id: parsed.id };

        if (typeof parsed.name === 'string') payload.name = parsed.name;
        if (typeof parsed.world === 'string') payload.world = parsed.world;
        if (typeof parsed.datacenter === 'string') payload.datacenter = parsed.datacenter;

        return payload;
    } catch {
        return null;
    }
};

const buildAutocompleteValue = (entry: FreeCompanySearchResults): string => {
    const candidates: CompanyAutocompletePayload[] = [];

    const full: CompanyAutocompletePayload = { id: entry.id };
    if (entry.name) full.name = entry.name;
    if (entry.world) full.world = entry.world;
    if (entry.datacenter) full.datacenter = entry.datacenter;
    candidates.push(full);

    const withoutDc: CompanyAutocompletePayload = { id: entry.id };
    if (entry.name) withoutDc.name = entry.name;
    if (entry.world) withoutDc.world = entry.world;
    candidates.push(withoutDc);

    const nameOnly: CompanyAutocompletePayload = { id: entry.id };
    if (entry.name) nameOnly.name = entry.name;
    candidates.push(nameOnly);

    candidates.push({ id: entry.id });

    for (const payload of candidates) {
        const value = JSON.stringify(payload);
        if (value.length <= 100) return value;
    }

    return JSON.stringify({ id: entry.id });
};

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
                .setRequired(true)
                .setAutocomplete(true))
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
        const datacenterInput = interaction.options.getString('datacenter', true);
        const worldInput = interaction.options.getString('world', true);
        const companyInput = interaction.options.getString('company', true);
        const recruiting = interaction.options.getString('recruiting_only') as 'yes' | 'no' | null;
        const focusFilter = interaction.options.getString('focus');

        await interaction.deferReply({ flags: MessageFlags.Ephemeral });

        const datacenter = isSearchAllValue(datacenterInput) ? null : datacenterInput;
        const world = isSearchAllValue(worldInput) ? null : worldInput;
        const focusKey = focusFilter ? normalizeFocusValue(focusFilter) : null;

        try {
            const parsedSelection = parseCompanySelection(companyInput);
            const query = parsedSelection?.name ?? companyInput;

            const searchResults = await searchFreeCompanies(query, { datacenter, world, recruiting });

            let candidates: FreeCompanySearchResults[] = [];
            if (parsedSelection) {
                const match = searchResults.find(entry => entry.id === parsedSelection.id);

                if (match) {
                    candidates.push(match);
                } else {
                    candidates = searchResults;
                    const fallback: FreeCompanySearchResults = {
                        id: parsedSelection.id,
                        name: parsedSelection.name ?? companyInput,
                    };
                    if (parsedSelection.world) fallback.world = parsedSelection.world;
                    if (parsedSelection.datacenter) fallback.datacenter = parsedSelection.datacenter;
                    candidates.unshift(fallback);
                }
            } else {
                candidates = searchResults;
            }

            if (!candidates.length) {
                await interaction.editReply({
                    content: 'No Free Companies found for the specified search.',
                });
                return;
            }

            let selectedEntry: FreeCompanySearchResults | null = null;
            let selectedProfile: FreeCompanyProfile | null = null;

            for (const entry of candidates.slice(0, 5)) {
                const detail = await fetchFreeCompanyProfile(entry.id, entry);
                if (!detail) continue;

                const recruitmentSource = detail.recruitmentDetail || detail.recruitment || entry.recruitment || '';
                const recruitmentValue = recruitmentSource.toLowerCase();
                if (recruiting === 'yes' && !recruitmentValue.includes('open')) continue;
                if (recruiting === 'no' && recruitmentValue.includes('open')) continue;

                if (focusKey) {
                    const focusSet = new Set(detail.focusList.map(normalizeFocusValue));
                    if (!focusSet.has(focusKey)) continue;
                }

                selectedEntry = entry;
                selectedProfile = detail;
                break;
            }

            if (!selectedEntry || !selectedProfile) {
                await interaction.editReply({
                    content: 'No Free Companies matched the provided filters.',
                });
                return;
            }

            const recruitmentDisplay = (value?: string | null) => value?.replace(/^recruitment:\s*/i, '').trim() || undefined;
            const activeDisplay = (value?: string | null) => value?.replace(/^active:\s*/i, '').trim() || undefined;

            const fallbackActive = activeDisplay(selectedProfile.active ?? selectedEntry.active);
            const activeList = selectedProfile.activeList.length
                ? selectedProfile.activeList
                : fallbackActive
                    ? [fallbackActive]
                    : [];

            const recruitmentText = recruitmentDisplay(
                selectedProfile.recruitmentDetail ?? selectedProfile.recruitment ?? selectedEntry.recruitment,
            );

            const focusDisplay = formatFocusList(selectedProfile.focusList);
            const seekingDisplay = formatSeekingList(selectedProfile.seekingList);
            const focusField = formatEmbedFieldValue([
                activeList.length ? `**Active:** ${activeList.join(', ')}` : null,
                recruitmentText ? `**Recruitment:** ${recruitmentText}` : null,
                focusDisplay ? `**Focus:** ${focusDisplay}` : null,
                `**Seeking:** ${seekingDisplay}`,
            ]);

            const embedTitle = formatCompanyTitle(
                selectedProfile.name ?? selectedEntry.name,
                selectedEntry.name,
                [selectedProfile.tag, selectedEntry.tag],
            );

            const formedDisplay = formatFormedValue(selectedProfile.formed ?? selectedEntry.formed);

            const embed = new EmbedBuilder()
                .setColor(Colors.Blurple)
                .setTitle(embedTitle)
                .setURL(`https://eu.finalfantasyxiv.com/lodestone/freecompany/${selectedProfile.id}/`)
                .addFields(
                    { name: 'Company Slogan', value: sanitizeFieldValue(selectedProfile.slogan), inline: false },
                    {
                        name: 'Formed',
                        value: sanitizeFieldValue(formedDisplay),
                        inline: true,
                    },
                    {
                        name: 'Active Members',
                        value: sanitizeFieldValue(selectedProfile.members || selectedEntry.members),
                        inline: true,
                    },
                    { name: 'Rank', value: sanitizeFieldValue(selectedProfile.rank), inline: true },
                    { name: 'Reputation', value: sanitizeFieldValue(selectedProfile.reputation), inline: false },
                    { name: 'Ranking', value: sanitizeFieldValue(selectedProfile.ranking), inline: false },
                    {
                        name: 'Estate Profile',
                        value: sanitizeFieldValue(selectedProfile.estate || selectedEntry.housing),
                        inline: false,
                    },
                    { name: 'Focus', value: sanitizeFieldValue(focusField), inline: false },
                )
                .setTimestamp();

            const descriptionParts = [
                selectedProfile.grandCompany || selectedEntry.grandCompany
                    ? `**${selectedProfile.grandCompany ?? selectedEntry.grandCompany}**`
                    : null,
                (selectedProfile.world ?? selectedEntry.world) || (selectedProfile.datacenter ?? selectedEntry.datacenter)
                    ? `> 🌐 ${(selectedProfile.world ?? selectedEntry.world) ?? '-'}${selectedProfile.datacenter ?? selectedEntry.datacenter ? ` [${selectedProfile.datacenter ?? selectedEntry.datacenter}]` : ''}`
                    : null,
            ].filter(Boolean).join('\n');

            if (descriptionParts) {
                embed.setDescription(descriptionParts);
            }

            const crestUrl = selectedProfile.crest ?? selectedEntry.crest;
            if (crestUrl) {
                embed.setThumbnail(crestUrl);
            }

            await interaction.editReply({ embeds: [embed] });
        } catch(error) {
            logger.error('Failed to search Free Companies', error);
            await interaction.editReply({
                content: `${UNABLE_ACCESS}`,
            });
        }
    },
    autocomplete: async (interaction) => {
        const focused = interaction.options.getFocused(true);

        if (focused.name === 'world') {
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
                for (const worldName of worlds) {
                    const key = normalize(worldName);
                    if (seen.has(key)) continue;
                    seen.add(key);
                    uniqueWorlds.push(worldName);
                }
                worlds = uniqueWorlds.sort((a, b) => a.localeCompare(b));
            }

            const limit = 25 - (includeSearchAll ? 1 : 0);
            const worldChoices = worlds
                .filter(worldName => normalize(worldName).startsWith(normalizedQuery))
                .slice(0, Math.max(limit, 0))
                .map(worldName => ({ name: worldName, value: worldName }));

            if (includeSearchAll) {
                await interaction.respond([SEARCH_ALL_CHOICE, ...worldChoices].slice(0, 25));
            } else {
                await interaction.respond(worldChoices);
            }
            return;
        }

        if (focused.name === 'company') {
            const dc = interaction.options.getString('datacenter');
            const world = interaction.options.getString('world');
            const query = String(focused.value ?? '').trim();

            if (!query) {
                await interaction.respond([]);
                return;
            }

            try {
                const results = await searchFreeCompanies(query, {
                    datacenter: dc && !isSearchAllValue(dc) ? dc : null,
                    world: world && !isSearchAllValue(world) ? world : null,
                    recruiting: null,
                });

                const seen = new Set<string>();
                const choices = [];

                for (const entry of results) {
                    if (seen.has(entry.id)) continue;
                    seen.add(entry.id);

                    const parts = [
                        entry.name,
                        entry.world ? `@ ${entry.world}` : null,
                        entry.datacenter ? `[${entry.datacenter}]` : null,
                    ].filter(Boolean);

                    const name = parts.join(' ') || entry.name;
                    const value = buildAutocompleteValue(entry);
                    choices.push({ name, value });
                    if (choices.length >= 25) break;
                }

                await interaction.respond(choices);
            } catch {
                await interaction.respond([]);
            }
            return;
        }
        await interaction.respond([]);
    }
};

export default sub;