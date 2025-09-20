// functions/profile/profileFreeCompanyAPI.ts

import { logger } from "../../lib/logger";

const UA = 'Mozilla/5.0 (compatible; AetherShiba/1.0)';

const escapeRegex = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const decodeHTML = (input: string) => {
    const withNumericEntities = input
        .replace(/&#x([0-9a-f]+);/gi, (_, hex) => {
            try {
                return String.fromCodePoint(parseInt(hex, 16));
            } catch {
                return '';
            }
        })
        .replace(/&#(\d+);/g, (_, dec) => {
            try {
                return String.fromCodePoint(Number(dec));
            } catch {
                return '';
            }
        });

    return withNumericEntities
        .replace(/&nbsp;/gi, ' ')
        .replace(/&amp;/gi, '&')
        .replace(/&lt;/gi, '<')
        .replace(/&gt;/gi, '>')
        .replace(/&quot;/gi, '"')
        .replace(/&#39;/g, "'")
        .replace(/&laquo;/gi, '«')
        .replace(/&raquo;/gi, '»')
        .replace(/&ldquo;/gi, '“')
        .replace(/&rdquo;/gi, '”')
        .replace(/&lsquo;/gi, '‘')
        .replace(/&rsquo;/gi, '’')
        .replace(/<br\s*\/?/gi, '\n')
        .replace(/<script[\s\S]*?<\/script>/gi, '')
        .replace(/<[^>]*>/g, '')
        .replace(/\s+/g, ' ')
        .trim();
};

const NOT_SPECIFIED_KEYWORDS = [
    'notspecified',
    'notapplicable',
    'keineangabe',
    'keineauswahl',
    'keinefestlegung',
    'nichtfestgelegt',
    'nonspecificato',
    'nessunapreferenza',
    'nondefini',
    'nondefinie',
    'nonindique',
    'nonprecise',
    'nonprecisee',
    'nonspecifie',
    'nonspecifiee',
    'noespecificado',
    'noespecificada',
    'sinespecificar',
    'sinespecificacion',
    'naoespecificado',
    'naoespecificada',
    'naoindicado',
    'naoindicada',
    'noneindicated',
    'notindicated',
];

const NOT_SPECIFIED_REGEX = [/(?:未指定|未設定|指定なし)/u];

const MAX_ICON_ENTRY_LENGTH = 60;
const MAX_ICON_LIST_SIZE = 20;

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
    tag?: string;
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
    if (!raw) return [];

    const normalizedRaw = normalizeFocusValue(raw);
    if (normalizedRaw) {
        for (const keyword of NOT_SPECIFIED_KEYWORDS) {
            if (normalizedRaw.includes(keyword)) {
                return ['Not specified'];
            }
        }
    }

    for (const pattern of NOT_SPECIFIED_REGEX) {
        if (pattern.test(raw)) {
            return ['Not specified'];
        }
    }

    const cleanedRaw = raw.replace(/<li\b[^>]*--off[^>]*>[\s\S]*?<\/li>/gi, '');

    const icons = Array.from(
        cleanedRaw.matchAll(/<(?:img|span)[^>]*(?:data-tooltip|title|alt)="([^"]+)"[^>]*>/gi)
    )
        .map(match => decodeHTML(match[1] ?? ''))
        .filter(Boolean);

    const listItems = Array.from(cleanedRaw.matchAll(/<li[^>]*>([\s\S]*?)<\/li>/gi))
        .map(match => decodeHTML(match[1] ?? ''))
        .filter(Boolean);

    const paragraphItems = Array.from(cleanedRaw.matchAll(/<p[^>]*>([\s\S]*?)<\/p>/gi))
        .map(match => decodeHTML(match[1] ?? ''))
        .filter(Boolean);

    const textContent = decodeHTML(cleanedRaw)
        .split(/[•,\n]/)
        .map(item => item.trim())
        .filter(Boolean);

    const unique = new Map<string, string>();
    for (const val of [...icons, ...listItems, ...paragraphItems, ...textContent]) {
        if (val.length > MAX_ICON_ENTRY_LENGTH) continue;
        const key = normalizeFocusValue(val);
        if (!key) continue;
        if (!unique.has(key)) unique.set(key, val);
    }
    if (unique.size > MAX_ICON_LIST_SIZE) return [];
    return Array.from(unique.values());
};

const timestampToIsoDate = (timestamp: number): string | null => {
    if (!Number.isFinite(timestamp)) return null;

    const date = new Date(timestamp * 1000);
    if (Number.isNaN(date.getTime())) return null;

    const year = String(date.getUTCFullYear()).padStart(4, '0');
    const month = String(date.getUTCMonth() + 1).padStart(2, '0');
    const day = String(date.getUTCDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
};

const parseFormedDetail = (detail: { raw: string; text: string }): string | null => {
    const textValue = detail.text?.trim();
    if (textValue) return textValue;

    const timestampMatch = /ldst_strftime\(\s*(\d+)\s*,/i.exec(detail.raw)
        ?? /data-js-datetime-value="(\d+)"/i.exec(detail.raw);
    const timestamp = timestampMatch?.[1] ? Number(timestampMatch[1]) : null;

    if (timestamp !== null) {
        const iso = timestampToIsoDate(timestamp);
        if (iso) return iso;
    }

    const fallback = decodeHTML(detail.raw);
    return fallback || null;
};

const extractFormedDateFromHtml = (html: string): string | null => {
    const formedSectionMatch = /<h3[^>]*class="[^"]*heading--lead[^"]*"[^>]*>[\s\S]*?Formed[\s\S]*?<\/h3>([\s\S]*?)(?=<h3[^>]*class="[^"]*heading--lead[^"]*"[^>]*>|<\/section>)/i.exec(html);
    const sections = [formedSectionMatch?.[1], html];

    for (const section of sections) {
        if (!section) continue;

        const timestampMatches = Array.from(section.matchAll(/ldst_strftime\(\s*(\d+)\s*,/gi));
        for (const match of timestampMatches) {
            const iso = match?.[1] ? timestampToIsoDate(Number(match[1])) : null;
            if (iso) return iso;
        }

        const dataValueMatches = Array.from(section.matchAll(/data-js-datetime-value="(\d+)"/gi));
        for (const match of dataValueMatches) {
            const iso = match?.[1] ? timestampToIsoDate(Number(match[1])) : null;
            if (iso) return iso;
        }

        const spanMatch = /<span[^>]+id="datetime-[^"]+"[^>]*>([\s\S]*?)<\/span>/i.exec(section);
        if (spanMatch) {
            const spanText = decodeHTML(spanMatch[1] ?? '').trim();
            if (spanText && /\d/.test(spanText)) return spanText;
        }

        const decoded = decodeHTML(section);
        if (decoded) {
            const dateMatch = /(\d{4}[.\/-]\d{1,2}[.\/-]\d{1,2}|\d{1,2}[.\/]\d{1,2}[.\/]\d{2,4})/.exec(decoded);
            if (dateMatch?.[1]) return dateMatch[1];
        }
    }

    return null;
};

const parseNameAndTag = (value: string): { name: string; tag?: string } => {
    const trimmed = value.trim();
    if (!trimmed) return { name: '' };

    const fancyMatch = /[«»]/.test(trimmed)
        ? /«([^»]+)»/.exec(trimmed)
        : null;
    const angleMatch = !fancyMatch && /<([^>]+)>/.exec(trimmed);
    const match = fancyMatch ?? angleMatch;

    if (!match) return { name: trimmed };

    const tag = match[1]?.trim();
    const name = trimmed.replace(match[0], '').replace(/\s+/g, ' ').trim();

    const result: { name: string; tag?: string } = { name: name || trimmed };
    if (tag && tag.trim()) result.tag = tag.trim();
    return result;
};

const normalizeLabelValue = (value: string) => decodeHTML(value)
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '');

const DETAIL_LABEL_ALIASES: Record<string, string[]> = {
    'Company Slogan': ['gesellschaftsmotto', 'firmenmotto', 'slogan'],
    Formed: ['gegrundet', 'gegruendet'],
    'Active Members': ['aktivemitglieder'],
    Rank: ['rang'],
    Reputation: ['ansehen'],
    Ranking: ['rangliste'],
    'Estate Profile': ['grundstucksprofil', 'wohnsitzprofil'],
    Recruitment: ['rekrutierung'],
    Active: ['aktiv'],
    Focus: ['fokus', 'ausrichtung', 'schwerpunkte'],
    Seeking: ['gesucht'],
};

const extractHeadingDetail = (html: string, label: string): { raw: string; text: string } | null => {
    const normalizedLabel = normalizeLabelValue(label);
    const aliasLabels = DETAIL_LABEL_ALIASES[label]?.map(normalizeLabelValue) ?? [];
    const candidates = [normalizedLabel, ...aliasLabels].filter(Boolean);
    if (!candidates.length && normalizedLabel) candidates.push(normalizedLabel);

    const headingRe = /<h3[^>]*class="[^"]*heading--lead[^"]*"[^>]*>([\s\S]*?)<\/h3>/gi;
    let match: RegExpExecArray | null;

    while ((match = headingRe.exec(html)) !== null) {
        const headingText = decodeHTML(match[1] ?? '');
        const normalizedHeading = normalizeLabelValue(headingText);
        if (!normalizedHeading) continue;

        const matched = candidates.some(candidate => {
            if (!candidate) return false;
            if (normalizedHeading === candidate) return true;
            if (normalizedHeading.startsWith(candidate) || candidate.startsWith(normalizedHeading)) return true;
            if (normalizedHeading.length === candidate.length) {
                let diff = 0;
                for (let i = 0; i < candidate.length; i += 1) {
                    if (normalizedHeading[i] !== candidate[i]) diff += 1;
                    if (diff > 1) return false;
                }
                return diff <= 1;
            }
            return false;
        });

        if (!matched) continue;

        const contentStart = match.index + match[0].length;
        const remainder = html.slice(contentStart);
        const nextHeadingMatch = /<h3[^>]*class="[^"]*heading--lead[^"]*"[^>]*>/i.exec(remainder);
        let endIndex = nextHeadingMatch ? nextHeadingMatch.index : remainder.length;

        const sectionCloseIndex = remainder.search(/<\/section>/i);
        if (sectionCloseIndex !== -1) {
            endIndex = Math.min(endIndex, sectionCloseIndex);
        }

        const raw = remainder.slice(0, endIndex).trim();
        if (!raw) return null;
        return { raw, text: decodeHTML(raw) };
    }

    return null;
};

const extractDetail = (html: string, label: string): { raw: string; text: string } | null => {
    const re = new RegExp(
        `<dt[^>]*>\\s*(?:<[^>]+>\\s*)*${escapeRegex(label)}(?:\\s*<[^>]+>)*\\s*<\\/dt>\\s*<dd[^>]*>([\\s\\S]*?)<\\/dd>`,
        'i',
    );
    const match = re.exec(html);
    if (match) {
        const raw = match[1] ?? '';
        return { raw, text: decodeHTML(raw) };
    }

    return extractHeadingDetail(html, label);
};

const parseReputationDetail = (raw: string): string[] => {
    const entries: string[] = [];
    const blockRe = /<div[^>]*class="freecompany__reputation(?:\s+last)?[^"]*"[^>]*>([\s\S]*?)<\/div>/gi;
    let match: RegExpExecArray | null;

    while ((match = blockRe.exec(raw)) !== null) {
        const block = match[1] ?? '';
        const nameMatch = /<p[^>]*class="freecompany__reputation__gcname"[^>]*>([\s\S]*?)<\/p>/i.exec(block);
        const rankMatch = /<p[^>]*class="freecompany__reputation__rank"[^>]*>([\s\S]*?)<\/p>/i.exec(block);
        const name = nameMatch ? decodeHTML(nameMatch[1] ?? '') : '';
        const rank = rankMatch ? decodeHTML(rankMatch[1] ?? '') : '';
        if (name || rank) entries.push([name, rank].filter(Boolean).join(' — '));
    }

    if (entries.length) return entries;

    const fallback = decodeHTML(raw);
    return fallback ? [fallback] : [];
};

const parseRankingDetail = (raw: string): string => {
    const rows = Array.from(raw.matchAll(/<tr[^>]*>([\s\S]*?)<\/tr>/gi))
        .map(match => decodeHTML(match[1] ?? '').trim())
        .filter(Boolean);

    if (rows.length) return rows.join('\n');

    const paragraphs = Array.from(raw.matchAll(/<p[^>]*>([\s\S]*?)<\/p>/gi))
        .map(match => decodeHTML(match[1] ?? '').trim())
        .filter(Boolean);

    if (paragraphs.length) return paragraphs.join('\n');

    return decodeHTML(raw);
};

const parseEstateDetail = (raw: string): string => {
    const nameMatch = /<p[^>]*class="freecompany__estate__name"[^>]*>([\s\S]*?)<\/p>/i.exec(raw);
    const textMatch = /<p[^>]*class="freecompany__estate__text"[^>]*>([\s\S]*?)<\/p>/i.exec(raw);
    const titleMatch = /<p[^>]*class="freecompany__estate__title"[^>]*>([\s\S]*?)<\/p>/i.exec(raw);

    const name = nameMatch ? decodeHTML(nameMatch[1] ?? '') : '';
    const text = textMatch ? decodeHTML(textMatch[1] ?? '') : '';
    const title = titleMatch ? decodeHTML(titleMatch[1] ?? '') : '';

    const parts = [] as string[];
    if (name) parts.push(name);
    if (text) {
        parts.push(text);
    } else if (title) {
        parts.push(title);
    }

    if (parts.length) return parts.join('\n');

    return decodeHTML(raw);
};

const parseHeaderInfo = (html: string, profile: FreeCompanyProfile) => {
    const nameMatch = /<p[^>]*class="freecompany__text__name"[^>]*>([\s\S]*?)<\/p>/i.exec(html)
        ?? /<h1[^>]*class="freecompany__header__name"[^>]*>([\s\S]*?)<\/h1>/i.exec(html);
    if (nameMatch) {
        const rawName = decodeHTML(nameMatch[1] ?? '');
        if (rawName) {
            const { name, tag } = parseNameAndTag(rawName);
            if (name) {
                profile.name = name;
            } else {
                profile.name = rawName;
            }
            if (tag && !profile.tag) profile.tag = tag;
        }
    }

    const affiliationMatch = /<p[^>]*class="freecompany__text__affiliation"[^>]*>([\s\S]*?)<\/p>/i.exec(html)
        ?? /<p[^>]*class="freecompany__text__grandcompany"[^>]*>([\s\S]*?)<\/p>/i.exec(html);
    if (affiliationMatch) {
        const gc = decodeHTML(affiliationMatch[1] ?? '');
        if (gc) profile.grandCompany = gc;
    }

    const tagMatch = /<p[^>]*class="freecompany__text__tag"[^>]*>([\s\S]*?)<\/p>/i.exec(html)
        ?? /<span[^>]*class="freecompany__header__tag"[^>]*>([\s\S]*?)<\/span>/i.exec(html);
    if (tagMatch) {
        const rawTag = decodeHTML(tagMatch[1] ?? '');
        if (rawTag) {
            const { tag } = parseNameAndTag(rawTag);
            const normalizedTag = (tag ?? rawTag).replace(/[«»<>]/g, '').trim();
            if (normalizedTag && !profile.tag) {
                profile.tag = normalizedTag;
            } else if (!profile.grandCompany) {
                profile.grandCompany = rawTag;
            }
        }
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
    const crestOverlays = crestBlock
        ? Array.from(
            crestBlock[1]?.matchAll(/<img[^>]+(?:data-src|src)="([^"]+)"[^>]*>/gi) ?? [],
        )
            .map(match => match[1])
            .filter((src): src is string => Boolean(src))
        : [];

    const crestBaseMatch = /<img[^>]+(?:data-src|src)="([^"]+)"[^>]*class="[^"]*freecompany__crest__base[^"]*"[^>]*>/i.exec(html);
    const crestFallback = /<div[^>]*class="freecompany__crest"[^>]*>([\s\S]*?)<\/div>/i.exec(html);
    const crestFallbackImage = crestFallback
        ? /<img[^>]+(?:data-src|src)="([^"]+)"[^>]*>/i.exec(crestFallback[1] ?? '')
        : null;

    const crestBase = crestBaseMatch?.[1];
    const crestCandidates = Array.from(new Set([
        crestBase,
        ...crestOverlays,
        crestFallbackImage?.[1],
    ].filter((value): value is string => typeof value === 'string' && value.trim().length > 0)));

    const crestCandidate = crestCandidates[0];
    if (crestCandidate) {
        profile.crest = crestCandidate;
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
        const rawName = nameMatch ? decodeHTML(nameMatch[1] ?? '') : '';
        if (!id || !rawName) continue;

        const { name, tag } = parseNameAndTag(rawName);
        if (!name) continue;

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
            crest = crestMatch[1] || overlayMatch?.[1];
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
        if (tag) entry.tag = tag;
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
    if (base.tag) profile.tag = base.tag;
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
    if (formedDetail) {
        const formedValue = parseFormedDetail(formedDetail);
        if (formedValue) profile.formed = formedValue;
    }

    if (!profile.formed || !/\d/.test(profile.formed)) {
        const fallbackFormed = extractFormedDateFromHtml(html);
        if (fallbackFormed) profile.formed = fallbackFormed;
    }

    const membersDetail = extractDetail(html, 'Active Members');
    if (membersDetail?.text) profile.members = membersDetail.text;

    const rankDetail = extractDetail(html, 'Rank');
    if (rankDetail?.text) profile.rank = rankDetail.text;

    const reputationDetail = extractDetail(html, 'Reputation');
    if (reputationDetail) {
        const list = parseReputationDetail(reputationDetail.raw);
        profile.reputation = list.length ? list.join('\n') : reputationDetail.text;
    }

    const rankingDetail = extractDetail(html, 'Ranking');
    if (rankingDetail) {
        const formatted = parseRankingDetail(rankingDetail.raw);
        profile.ranking = formatted || rankingDetail.text;
    }

    const estateDetail = extractDetail(html, 'Estate Profile');
    if (estateDetail) {
        const formatted = parseEstateDetail(estateDetail.raw);
        profile.estate = formatted || estateDetail.text;
    }

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