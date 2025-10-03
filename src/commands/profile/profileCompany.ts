// commands/profile/profileCompany.ts

// -------------------------------------------------
// Dependecies
// -------------------------------------------------


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
import { int } from "zod/v4";

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

function formatFocusList(items: LodestoneFreeCompanyFocus[]): string {
    if (!items.length) return '';
    return items
        .map(({ name, status}) => `• ${name}${status ? ` — ${status}` : ''}`)
        .join('\n');
}

function fomratMembers(members: LodestoneFreeCompanyMember[]): string {
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
        return `• ${name}: ${value}`;
    }).join('\n'));
}

function formatFormed(formed: string, formedAt: Date | null): string {
    if (formedAt) {
        const ts = Math.floor(formedAt.getTime() / 1000);
        return `<t:${ts}:D>`;
    }
    return formed || '-';
}

function buildFreeCompanyEmbed(
    company: LodestoneFreeCompany,
    members: LodestoneFreeCompanyMember[],
    crestName?: string,
) {
    const embed = new EmbedBuilder()
        .setColor(Colors.Blurple)
        .setTitle(company.name)
        .setURL(`https://eu.finalfantasyxiv.com/lodestone/freecompany/${company.id}/`)
        .setTimestamp();

    if (crestName) {
        embed.setThumbnail(`attachment://${crestName}`);
    } else if (company.crestLayers[0]) {
        embed.setThumbnail(company.crestLayers[0]);
    }

    const descriptionParts: string[] = [];
    if (company.slogan) descriptionParts.push(company.slogan);
    if (descriptionParts.length) {
        embed.setDescription(descriptionParts.join('\n'));
    }

    embed.addFields(
        { name: 'Tag', value: company.tag ? `\`${company.tag}\`` : '—', inline: true },
        { name: 'Data Center', value: company.datacenter || '—', inline: true },
        { name: 'World', value: company.world || '—', inline: true },
        { name: 'Recruitment', value: company.recruitment || '—', inline: true },
        { name: 'Rank', value: company.rank || '—', inline: true },
        { name: 'Active Members', value: typeof company.activeMembers === 'number'
            ? company.activeMembers.toLocaleString()
            : '—', inline: true },
        { name: 'Formed', value: formatFormed(company.formed, company.formedAt), inline: true },
    );

    if (company.ranking) {
        embed.addFields({ name: 'Ranking', value: company.ranking, inline: true});
    }

    const reputation = formatReputation(company.reputation);
    if (reputation) embed.addFields({ name: 'Reputation', value: reputation, inline: false });

    if (company.estate) {
        const estateParts = [company.estate.name, company.estate.info].filter(Boolean).join('\n');
        embed.addFields({ name: 'Estate Profile', value: truncate(estateParts || '-'), inline: false });
    }

    const focus = formatFocusList(company.focus);
    if (focus) embed.addFields({ name: 'Focus', value: truncate(focus), inline: false});

    const seeking = formatFocusList(company.seeking);
    if (seeking) embed.addFields({ name: 'Seeking', value: truncate(seeking), inline: false });

    const memberList = fomratMembers(members);
    if (memberList) embed.addFields({ name: `Featured Members`, value: memberList, inline: false });

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
            const tag = entry.tag ? ` «${entry.tag}»` : '';
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
            const exact = matches.find(entry => normalize(entry.name) === normalize(worldMatch)) || matches[0];
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