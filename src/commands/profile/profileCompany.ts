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
import { getCompanyEmoji } from '../../const/emojis';

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

const formatFocusList = (values: string[]): string | null => {
    if (!values.length) return null;
    const formatted = values.map(value => {
        const emoji = getCompanyEmoji(value);
        return emoji ? `${emoji} ${value}` : value;
    });
    return formatted.length ? formatted.join(', ') : null;
};

const normalize = (value: string) => value.trim().toLowerCase();

const shouldIncludeSerachAll = (value: string) => {
    const needle = normalize(value);
    if (!needle) return true;
    return SEARCH_ALL_KEYWORDS.some(keyword => keyword.startsWith(needle));
};

const isSearchAllValue = (value: string | null) => value === SEARCH_ALL_CHOICE.value;

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

            const focusField = [
                activeList.length ? `**Active:** ${activeList.join(', ')}` : null,
                recruitmentText ? `**Recruitment:** ${recruitmentText}` : null,
                focusDisplay ? `**Focus:** ${focusDisplay}` : null,
                selectedProfile.seekingList.length ? `**Seeking:** ${selectedProfile.seekingList.join(', ')}` : null,
            ].filter(Boolean).join('\n') || '-';

            const embed = new EmbedBuilder()
                .setColor(Colors.Blurple)
                .setTitle(selectedProfile.name || selectedEntry.name)
                .setURL(`https://eu.finalfantasyxiv.com/lodestone/freecompany/${selectedProfile.id}/`)
                .addFields(
                    { name: 'Company Slogan', value: selectedProfile.slogan || '-', inline: false },
                    { name: 'Formed', value: selectedProfile.formed || selectedEntry.formed || '-', inline: true },
                    { name: 'Active Members', value: selectedProfile.members || selectedEntry.members || '-', inline: true },
                    { name: 'Rank', value: selectedProfile.rank || '-', inline: true },
                    { name: 'Reputation', value: selectedProfile.reputation || '-', inline: false },
                    { name: 'Ranking', value: selectedProfile.ranking || '-', inline: false },
                    { name: 'Estate Profile', value: selectedProfile.estate || selectedEntry.housing || '-', inline: false },
                    { name: 'Focus', value: focusField, inline: false },
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