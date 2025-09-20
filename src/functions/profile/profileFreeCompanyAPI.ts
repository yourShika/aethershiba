// functions/profile/profileFreeCompanyAPI.ts

import { logger } from "../../lib/logger";

const UA = 'Mozilla/5.0 (compatible; AetherShiba/1.0)';

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

export type FreeCompanySearchOptions = {
    datacenter?: string | null;
    world?: string | null;
    recruiting?: 'yes' | 'no' | null;
};

export type FreeCompanySearchResults = {
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

export type FreeCompanyProfile = FreeCompanySearchResults & {
    slogan?: string;
    rank?: string;
    reputation?: string;
    ranking?: string;
    estate?: string;
    recruitmentDetail?: string;
    activeList: string[];
    focusList: string[];
    seekingList: string[];
};

export const normalizeFocusValue = (value: string) => value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();

const parseIconList = (raw: string): string[] => {
    const icons = Array.from(
        raw.matchAll(/<(?:img|span)[^>]*(?:data-tooltip|title|alt)="([^"]+)"[^>]*>/gi)
    )
    .map(match => decodeHTML(match[1] ?? ''))
    .filter(Boolean);

    const textContent = decodeHTML(raw)
        .split(/[•,\n]/)
        .map(item => item.trim())
        .filter(Boolean);

    const unique = new Map<string, string>();
    for (const val of [...icons, ...textContent]) {
        const key = normalizeFocusValue(val);
        if (!key) continue;
        if (!unique.has(key)) unique.set(key, val);
    }
    return Array.from(unique.values());
};

const extractDetail = (html: string, label: string): { raw: string; text: string } | null => {
    const re = new RegExp(
        `<dt[^>]*>\\s*(?:<[^>]+>\\s*)*${escapeRegex(label)}(?:\\s*<[^>]+>)*\\s*<\\/dt>\\s*<dd[^>]*>([\\s\\S]*?)<\\/dd>`,
        'i',
    );    
    const match = re.exec(html);
    if (!match) return null;
    const raw = match[1] ?? '';
    return { raw, text: decodeHTML(raw) };
}; 

const parseHeaderInfo = (html: string, profile: FreeCompanyProfile) => {
    const nameMatch = /<p[^>]*class="freecompany__text__name"[^>]*>([\s\S]*?)<\/p>/i.exec(html)
        ?? /<h1[^>]*class="freecompany__header__name"[^>]*>([\s\S]*?)<\/h1>/i.exec(html);
    if (nameMatch) {
        const name = decodeHTML(nameMatch[1] ?? '');
        if (name) profile.name = name;
    }

    const gcMatch = /<p[^>]*class="freecompany__text__tag"[^>]*>([\s\S]*?)<\/p>/i.exec(html)
        ?? /<p[^>]*class="freecompany__text__affiliation"[^>]*>([\s\S]*?)<\/p>/i.exec(html);
    if (gcMatch) {
        const gc = decodeHTML(gcMatch[1] ?? '');
        if (gc) profile.grandCompany = gc;
    }

    const worldMatch = /<p[^>]*class="freecompany__text__world"[^>]*>([\s\S]*?)<\/p>/i.exec(html);
    if (worldMatch) {
        const worldLine = decodeHTML(worldMatch[1] ?? '');
        const m = /(.*?)(?:\s*\[([^\]]+)\])?$/.exec(worldLine);
        const worldName = m?.[1]?.trim();
        const dcName = m?.[2]?.trim();
        if (worldName) profile.world = worldName;
        if (dcName) profile.datacenter = dcName;
    }

    if (!profile.world) {
        const worldFallback = /<i[^>]*data-tooltip="Home World"[^>]*><\/i>\s*([^<]+?)(?:\s*\[([^\]]+)\])?<\/p>/i.exec(html);
        if (worldFallback) {
            const worldName = decodeHTML(worldFallback[1] ?? '').trim();
            const dcName = decodeHTML(worldFallback[2] ?? '').trim();
            if (worldName) profile.world = worldName;
            if (dcName) profile.datacenter = dcName;
        }
    }

    const crestBlock = /<div[^>]*class="freecompany__crest__image"[^>]*>([\s\S]*?)<\/div>/i.exec(html);
    if (crestBlock) {
        const images = Array.from(crestBlock[1]?.matchAll(/<img[^>]+src="([^"]+)"[^>]*>/gi) ?? []);
        const crest = images.at(-1)?.[1] ?? images[0]?.[1];
        if (crest) profile.crest = crest;
    }

    if (!profile.crest) {
        const crestFallback = /<div[^>]*class="freecompany__crest"[^>]*>([\s\S]*?)<\/div>/i.exec(html);
        const crest = crestFallback ? /<img[^>]+src="([^"]+)"[^>]*>/i.exec(crestFallback[1] ?? '') : null;
        if (crest?.[1]) profile.crest = crest[1];
    }
};

export async function searchFreeCompanies(
    query: string,
    options: FreeCompanySearchOptions = {},
): Promise<FreeCompanySearchResults[]> {
    const params = new URLSearchParams();
    params.set('q', query);
    if (options.datacenter) params.set('dcname', options.datacenter);
    if (options.world) params.set('worldname', options.world);
    if (options.recruiting === 'yes') params.set('recruitment', '1');
    if (options.recruiting === 'no') params.set('recruitment', '0');

    const url = `https://eu.finalfantasyxiv.com/lodestone/freecompany/?${params.toString()}`;
    const html = await fetchText(url);
    if (!html) return [];

    const results: FreeCompanySearchResults[] = [];
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
        const worldLine = worldMatches[1] ?? '';

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

        const entry: FreeCompanySearchResults = { id, name };
        if (world) entry.world = world;
        if (datacenter) entry.datacenter = datacenter;
        if (grandCompany) entry.grandCompany = grandCompany;
        if (crest) entry.crest = crest;
        if (members) entry.members = members;
        if (housing) entry.housing = housing;
        if (formed) entry.formed = formed;
        if (active) entry.active = active;
        if (recruitment) entry.recruitment = recruitment;

        results.push(entry);
    }

    return results;
}

export async function fetchFreeCompanyProfile(
    id: string,
    base: Partial<FreeCompanySearchResults> = {},
): Promise<FreeCompanyProfile | null> {
    const url = `https://eu.finalfantasyxiv.com/lodestone/freecompany/${id}/`;
    const html = await fetchText(url);
    if (!html) return null;

    const profile: FreeCompanyProfile = {
        id,
        name: base.name ?? '',
        activeList: [],
        focusList: [],
        seekingList: [],
    };

    if (base.world) profile.world = base.world;
    if (base.datacenter) profile.datacenter = base.datacenter;
    if (base.grandCompany) profile.grandCompany = base.grandCompany;
    if (base.crest) profile.crest = base.crest;
    if (base.members) profile.members = base.members;
    if (base.housing) profile.housing = base.housing;
    if (base.formed) profile.formed = base.formed;
    if (base.active) profile.active = base.active;
    if (base.recruitment) profile.recruitment = base.recruitment;

    parseHeaderInfo(html, profile);

    const sloganDetail = extractDetail(html, 'Company Slogan');
    if (sloganDetail?.text) profile.slogan = sloganDetail.text;

    const sloganMatch = /<div[^>]*class="freecompany__text__message"[^>]*>([\s\S]*?)<\/div>/i.exec(html)
        ?? /<p[^>]*class="freecompany__text__message"[^>]*>([\s\S]*?)<\/p>/i.exec(html);
    if (!profile.slogan && sloganMatch) profile.slogan = decodeHTML(sloganMatch[1] ?? '');

    const formedDetail = extractDetail(html, 'Formed');
    if (formedDetail?.text) profile.formed = formedDetail.text;

    const membersDetail = extractDetail(html, 'Active Members');
    if (membersDetail?.text) profile.members = membersDetail.text;

    const rankDetail = extractDetail(html, 'Rank');
    if (rankDetail?.text) profile.rank = rankDetail.text;

    const reputationDetail = extractDetail(html, 'Reputation');
    if (reputationDetail) {
        const list = parseIconList(reputationDetail.raw);
        profile.reputation = list.length ? list.join(', ') : reputationDetail.text;
    }

    const rankingDetail = extractDetail(html, 'Ranking');
    if (rankingDetail?.text) profile.ranking = rankingDetail.text;

    const estateDetail = extractDetail(html, 'Estate Profile');
    if (estateDetail?.text) profile.estate = estateDetail.text;

    const recruitmentDetail = extractDetail(html, 'Recruitment');
    if (recruitmentDetail?.text) profile.recruitmentDetail = recruitmentDetail.text;

    const activeDetail = extractDetail(html, 'Active');
    if (activeDetail) profile.activeList = parseIconList(activeDetail.raw);

    const focusDetail = extractDetail(html, 'Focus');
    if (focusDetail) profile.focusList = parseIconList(focusDetail.raw);

    const seekingDetail = extractDetail(html, 'Seeking');
    if (seekingDetail) profile.seekingList = parseIconList(seekingDetail.raw);

    if (!profile.estate && profile.housing) profile.estate = profile.housing;

    if (!profile.activeList.length && profile.active) {
        const cleaned = decodeHTML(profile.active).replace(/^Active:\s*/i, '').trim();
        if (cleaned) profile.activeList = [cleaned];
    }

    if (!profile.recruitmentDetail && profile.recruitment) {
        profile.recruitmentDetail = decodeHTML(profile.recruitment).replace(/^Recruitment:\s*/i, '').trim();
    }

    return profile;
}