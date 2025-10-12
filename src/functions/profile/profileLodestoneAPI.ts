// functions/profile/profileLodestoneAPI.ts

// -------------------------------------------------
// Dependencies
// -------------------------------------------------
import { fetch } from "undici";
import { z } from "zod";

import { logger } from "../../lib/logger";

export interface ClassJob {
    name: string;
    level: number;
}

export interface LodestoneCharacter {
    name: string;
    portrait: string;           // hi-res portrait (from character__detail__image <a href=...>)
    race: string;               // e.g., "Miqo'te"
    tribe: string;              // e.g., "Seeker of the Sun"
    gender: string;             // "♀" | "♂" (as shown on Lodestone)
    dc: string;                 // e.g., "Light"
    server: string;             // e.g., "Alpha"
    town: string;               // City-state (e.g., "Gridania")
    grandCompany: string;       // e.g., "Maelstrom / Storm Captain"
    freeCompanyId?: string;     // numeric ID as string
    freeCompanyName: string;    // e.g., "Shibaraiders"
    classJobs: ClassJob[];
    minions: number;            // total from /minion page
    mounts: number;             // total from /mounts page
}

const UA = "Mozilla/5.0 (compatible; AetherShiba/1.0)";
const HTTP_OPTIONS = { headers: { "user-agent": UA } } as const;

async function fetchText(url: string): Promise<string | null> {
    try {
        const res = await fetch(url, HTTP_OPTIONS);

        if (!res.ok) return null;
        return await res.text();
    } catch (e) {
        logger.debug(`Fetch failed for ${url}`, e);
        return null;
    }
}

/**
 * Basic HTML entity decoding for common entities we encounter in names.
 */
function decodeEntities(s: string): string {
  return s
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&#39;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&laquo;/g, "«")
    .replace(/&raquo;/g, "»");
}

export interface LodestoneSearchResult {
    id: string;
    name: string;
    world: string;
    dc?: string;
}

function stripTags(input: string): string {
    return decodeEntities(input
        .replace(/<br\s*\/?/gi, " ")
        .replace(/<[^>]*>/g, " ")
        .replace(/\s+/g, " ").trim());
}

const normalizeWhitespace = (value: string) => value.replace(/\s+/g, " ").trim();

function isMeaningfulFreeCompanyTag(value: string | undefined): value is string {
    if (!value) return false;
    const normalized = normalizeWhitespace(value);
    if (!normalized) return false;
    if (/^(?:company|tag|company\s*tag)$/i.test(normalized)) return false;
    if (!/[0-9a-z]/i.test(normalized)) return false;
    return true;
}

function normalizeFreeCompanyTag(raw: string | undefined): string {
    if (!raw) return "";
    const decoded = normalizeWhitespace(decodeEntities(raw));

    const bracketMatch = /[«<\[]\s*([^«»<>\[\]]{1,12})\s*[»>\]]/.exec(decoded);
    if (bracketMatch?.[1]) {
        const candidate = bracketMatch[1].trim();
        if (isMeaningfulFreeCompanyTag(candidate)) return candidate;
    }

    const withoutLabel = decoded.replace(/(?:free\s*)?company\s*tag:?/gi, "").trim();
    const words = withoutLabel
        .split(/\s+/)
        .map(part => part.replace(/^[«<\[]|[»>\]]$/g, "").trim())
        .filter(Boolean);
    for (let i = words.length - 1; i >= 0; i -= 1) {
        const candidate = words[i];
        if (candidate && candidate.length <= 12 && isMeaningfulFreeCompanyTag(candidate)) return candidate;
    }

    const fallback = withoutLabel.replace(/[«»\[\]]/g, "").trim();
    return isMeaningfulFreeCompanyTag(fallback) ? fallback : "";
}

function extractFreeCompanyTagFromHtml(html: string): string {
    if (!html) return "";

    const elementMatch = /<(?<tag>p|span|div)[^>]*class="[^"]*freecompany__text__tag[^"]*"[^>]*>([\s\S]*?)<\/\k<tag>>/i.exec(html);
    if (elementMatch?.[2]) {
        const candidate = normalizeFreeCompanyTag(stripTags(elementMatch[2] ?? ""));
        if (candidate && isMeaningfulFreeCompanyTag(candidate)) return candidate;
    }

    const dataAttrMatch = /class="[^"]*freecompany__text__tag[^"]*"[^>]*data-(?:fc-)?tag=['"]([^'"<>]{1,16})['"]/i.exec(html);
    if (dataAttrMatch?.[1]) {
        const candidate = normalizeWhitespace(decodeEntities(dataAttrMatch[1] ?? ""));
        if (isMeaningfulFreeCompanyTag(candidate)) return candidate;
    }

    const labelMatch = /Company\s*Tag[^«<\[]*([«<\[][\s\S]*?[»>\]])/i.exec(html);
    if (labelMatch?.[1]) {
        const candidate = normalizeFreeCompanyTag(stripTags(labelMatch[1] ?? ""));
        if (candidate && isMeaningfulFreeCompanyTag(candidate)) return candidate;
    }

    const fallback = normalizeFreeCompanyTag(stripTags(html));
    if (fallback && isMeaningfulFreeCompanyTag(fallback)) return fallback;

    return "";
}

type CacheEntry<T> = { value: T; expires: number };

const FC_SEARCH_CACHE = new Map<string, CacheEntry<LodestoneFreeCompanySearchResult[]>>();
const FC_DETAIL_CACHE = new Map<string, CacheEntry<LodestoneFreeCompany>>();
const FC_MEMBER_CACHE = new Map<string, CacheEntry<LodestoneFreeCompanyMember[]>>();

const FC_SEARCH_TTL = 5 * 60 * 1000; // 5 minutes
const FC_DETAIL_TTL = 15 * 60 * 1000; // 15 minutes
const FC_MEMBER_TTL = 5 * 60 * 1000; // 5 minutes

const now = () => Date.now();

function getCacheEntry<T>(map: Map<string, CacheEntry<T>>, key: string): T | null {
    const entry = map.get(key);
    if (!entry) return null;
    if (entry.expires < now()) {
        map.delete(key);
        return null;
    }
    return entry.value;
}

function setCacheEntry<T>(map: Map<string, CacheEntry<T>>, key: string, value: T, ttl: number) {
    map.set(key, { value, expires: now() + ttl });
}

function parseWorldAndDc(raw: string): { world: string; dc: string } {
    const match = /(.*?)(?:\s*\[([^\]]+)\])?$/.exec(raw.trim());
    const world = match?.[1]?.trim() ?? raw.trim();
    const dc = match?.[2]?.trim() ?? "";
    return { world, dc };
}

function toAbsoluteUrl(url: string): string {
    if (!url) return url;
    if (url.startsWith('http://') || url.startsWith('https://')) return url;
    if (url.startsWith('//')) return `https:${url}`;
    if (url.startsWith('/')) return `https://eu.finalfantasyxiv.com${url}`;
    return url;
}

const extractWithPatterns = (source: string, patterns: RegExp[]): string => {
    for (const pattern of patterns) {
        pattern.lastIndex = 0;
        const match = pattern.exec(source);
        if (match?.[1]) return normalizeWhitespace(stripTags(match[1]));
    }
    return "";
};

function extractTemporalValue(html: string): string {
    const timeAttrMatch = /(?:data-)?(?:time|datetime|ldst(?:_time)?|ldsttime)=['"]([^'"<>]+)['"]/i.exec(html);
    if (timeAttrMatch?.[1]) return timeAttrMatch[1];

    const epochMatch = /data-(?:epoch|unix|timestamp)=['"](\d+)['"]/i.exec(html);
    if (epochMatch?.[1]) {
        const raw = Number(epochMatch[1]);
        if (!Number.isNaN(raw) && raw > 0) {
            const ms = raw > 1e12 ? raw : raw * 1000;
            const date = new Date(ms);
            if (!Number.isNaN(date.getTime())) return date.toISOString();
        }
    }

    const scriptMatch = /ldst_strftime\(\s*['"]([^'"()]+)['"]/i.exec(html);
    if (scriptMatch?.[1]) return scriptMatch[1];

    return '';
}

function collectDefinitions(html: string): Map<string, string[]> {
    const map = new Map<string, string[]>();
    const re = /<dt[^>]*>([\s\S]*?)<\/dt>\s*<dd[^>]*>([\s\S]*?)<\/dd>/gi;
    let match: RegExpExecArray | null;
    while ((match = re.exec(html)) !== null) {
        const key = normalizeWhitespace(stripTags(match[1] ?? ""));
        const rawValue = match[2] ?? "";
        const valueText = normalizeWhitespace(stripTags(rawValue));
        const temporalValue = extractTemporalValue(rawValue);
        const cleanedValue = valueText && !/^[-—–]+$/.test(valueText) ? valueText : '';
        const value = cleanedValue || temporalValue;
        if (!key) continue;
        const lcKey = key.toLowerCase();
        const existing = map.get(lcKey) ?? [];
        if (value) existing.push(value);
        map.set(lcKey, existing);
    }
    return map;
}

function collectLeadSections(html: string): Map<string, string[]> {
    const sections = new Map<string, string[]>();
    const headingRe = /<h3[^>]*class="[^"]*heading--lead[^"]*"[^>]*>([\s\S]*?)<\/h3>/gi;
    let headingMatch: RegExpExecArray | null;

    while ((headingMatch = headingRe.exec(html)) !== null) {
        const heading = normalizeWhitespace(stripTags(headingMatch[1] ?? ""));
        if (!heading) continue;

        const start = headingMatch.index + headingMatch[0].length;
        const rest = html.slice(start);
        const nextIndex = rest.search(/<h3[^>]*class="[^"]*heading--lead[^"]*"|<h2[^>]*class="[^"]*heading--lg[^"]*"/i);
        const content = nextIndex === -1 ? rest : rest.slice(0, nextIndex);

        const key = heading.toLowerCase();
        const existing = sections.get(key) ?? [];
        existing.push(content);
        sections.set(key, existing);
    }

    return sections;
}

function extractLeadText(sections: Map<string, string[]>, key: string): string {
    const entries = sections.get(key.toLowerCase());
    if (!entries) return "";
    for (const block of entries) {
        const value = normalizeWhitespace(stripTags(block));
        if (value) return value;
    }
    return "";
}

function parseFocusIconSections(html: string): LodestoneFreeCompanyFocus[] {
    const resluts: LodestoneFreeCompanyFocus[] = [];
    const listRe = /<ul[^>]*class="[^"]*freecompany__focus_icon[^"]*"[^>]*>([\s\S]*?)<\/ul>/gi;
    let listMatch: RegExpExecArray | null;

    while ((listMatch = listRe.exec(html)) !== null) {
        const listBlock = listMatch[1] ?? "";
        const itemRe = /<li([^>]*)>([\s\S]*?)<\/li>/gi;
        let itemMatch: RegExpExecArray | null;

        while ((itemMatch = itemRe.exec(listBlock)) !== null) {
            const attrs = itemMatch[1] ?? "";
            const chunk = itemMatch[0] ?? "";
            const body = itemMatch[2] ?? chunk;

            const name = extractWithPatterns(body, [
                /class="[^"]*(?:focus_icon__name|focus_icon__text)[^"]*"[^>]*>([\s\S]*?)<\/(?:p|div)>/i,
                /<p[^>]*>([\s\S]*?)<\/p>/i,
            ]);

            if (!name) continue;

            const inactive = /freecompany__focus_icon--off/i.test(attrs) || /freecompany__focus_icon--off/i.test(chunk) || /is[-_]?inactive/i.test(chunk);
            const active = !inactive;

            resluts.push({ name, status: active ? 'Active' : 'Inactive' });
        }
    }
    return resluts;
}

function parseDate(value: string): Date | null {
    const trimmed = value.trim();
    if (!trimmed) return null;
    const ts = Date.parse(trimmed);
    if (!Number.isNaN(ts)) return new Date(ts);
    const match = /(\d{4})[\/.](\d{1,2})[\/.](\d{1,2})/.exec(trimmed);
    if (match) {
        const [, year, month, day] = match;
        const y = Number(year);
        const m = Number(month);
        const d = Number(day);
        if (!Number.isNaN(y) && !Number.isNaN(m) && !Number.isNaN(d)) {
            return new Date(Date.UTC(y, m - 1, d));
        }
    }
    return null;
}

export interface LodestoneFreeCompanySearchResult {
    id: string;
    name: string;
    tag?: string | undefined;
    world: string;
    dc?: string | undefined;
}

export interface LodestoneFreeCompanyReputation {
    name: string;
    value: string;
}

export interface LodestoneFreeCompanyFocus {
    name: string;
    status: string;
}

export interface LodestoneFreeCompanyEstate {
    name: string;
    info: string;
}

export interface LodestoneFreeCompany {
    id: string;
    name: string;
    tag: string;
    datacenter: string;
    world: string;
    slogan: string;
    formed: string;
    formedAt: Date | null;
    activeMembers: number | null;
    recruitment: string;
    rank: string;
    ranking: string;
    reputation: LodestoneFreeCompanyReputation[];
    estate: LodestoneFreeCompanyEstate | null;
    focus: LodestoneFreeCompanyFocus[];
    seeking: LodestoneFreeCompanyFocus[];
    crestLayers: string[];
}

export interface LodestoneFreeCompanyMember {
    id: string;
    name: string;
    rank: string;
}

const FreeCompanyReputationSchema = z.object({
    name: z.string().optional().default(""),
    value: z.string().optional().default(""),
});

const FreeCompanyFocusSchema = z.object({
    name: z.string().optional().default(""),
    status: z.string().optional().default(""),
});

const FreeCompanyEstateSchema = z.object({
    name: z.string().optional().default(""),
    info: z.string().optional().default(""),
});

const FreeCompanySchema = z.object({
    id: z.string(),
    name: z.string(),
    tag: z.string().optional().default(""),
    datacenter: z.string().optional().default(""),
    world: z.string(),
    slogan: z.string().optional().default(""),
    formed: z.string().optional().default(""),
    formedAt: z.date().nullable(),
    activeMembers: z.number().int().nonnegative().nullable(),
    recruitment: z.string().optional().default(""),
    rank: z.string().optional().default(""),
    ranking: z.string().optional().default(""),
    reputation: z.array(FreeCompanyReputationSchema),
    estate: FreeCompanyEstateSchema.nullable(),
    focus: z.array(FreeCompanyFocusSchema),
    seeking: z.array(FreeCompanyFocusSchema),
    crestLayers: z.array(z.string()),
});

const FreeCompanySearchResultSchema = z.object({
    id: z.string(),
    name: z.string(),
    tag: z.string().optional(),
    world: z.string(),
    dc: z.string().optional(),
});

const FreeCompanyMemberSchema = z.object({
    id: z.string(),
    name: z.string(),
    rank: z.string().optional().default(""),
});

function parseToggleList(html: string, itemClass: string): LodestoneFreeCompanyFocus[] {
    const regex = new RegExp(`<li[^>]*class="[^"]*${itemClass}[^"]*"[^>]*>[\\s\\S]*?<\\/li>`, 'gi');
    const results: LodestoneFreeCompanyFocus[] = [];
    let match: RegExpExecArray | null;
    while ((match = regex.exec(html)) !== null) {
        const chunk = match[0] ?? '';
        const name = extractWithPatterns(chunk, [
            /data-tooltip=['"]([^'"\n]+)['"]/i,
            /title=['"]([^'"\n]+)['"]/i,
            /<p[^>]*>([\s\S]*?)<\/p>/i,
        ]);
        if (!name) continue;
        const inactive = /is[-_]?inactive/i.test(chunk);
        const active = /is[-_]?active/i.test(chunk) && !inactive;
        results.push({ name, status: active ? 'Active' : 'Inactive'});
    };
    return results;
}

export async function searchLodestoneCharacters(name: string, world: string): Promise<LodestoneSearchResult[]> {
    const params = new URLSearchParams();
    params.set("q", name);
    params.set("worldname", world);
    params.set("classjob", "");
    params.set("race_tribe", "");
    params.set("blob_lang", "ja");
    params.set("blob_lang", "en");
    params.set("blob_lang", "de");
    params.set("blob_lang", "fr");
    params.set("order", "");
    
    const url = `https://eu.finalfantasyxiv.com/lodestone/character/?${params.toString()}`;
    logger.info(`Searching Lodestone characters: ${url}`);

    const html = await fetchText(url);
    if (!html) return [];

    const results: LodestoneSearchResult[] = [];
    const patterns = [
        /<a[^>]*href=['"]\/lodestone\/character\/(\d+)(?:\/)?['"][^>]*>[\s\S]*?<p[^>]*class=(?:"|')(?:entry__name|ldst__result__name)(?:"|')[^>]*>([\s\S]*?)<\/p>[\s\S]*?<p[^>]*class=(?:"|')(?:entry__world|ldst__result__world)(?:"|')[^>]*>([\s\S]*?)<\/p>/g,
    ];    

patternLoop:
    for (const itemRe of patterns) {
        itemRe.lastIndex = 0;
        let m:RegExpExecArray | null;
        while ((m = itemRe.exec(html)) !== null) {
            const id = m[1];
            const rawName = stripTags(m[2] ?? "");
            const rawWorld = stripTags(m[3] ?? "");
            if (!id || !rawName || !rawWorld) continue;
            
            const worldMatch = /(.*?)(?:\s*\[([^\]]+)\])?$/.exec(rawWorld);
            const worldName = worldMatch?.[1]?.trim() ?? rawWorld;
            const dcName = worldMatch?.[2]?.trim();
            
            if (worldName && world && worldName.toLowerCase() !== world.toLowerCase()) continue;
            
            const entry: LodestoneSearchResult = {
                id,
                name: rawName,
                world: worldName,
            };
    
            if (dcName) entry.dc = dcName;
            
            results.push(entry);
            
            if (results.length >= 25) {
                break patternLoop;
            } 
        }
        if (results.length > 0) {
            break;
        }
    }
    return results;
}

export async function fetchLodestoneCharacter(id: string): Promise<LodestoneCharacter | null> {
    const url = `https://eu.finalfantasyxiv.com/lodestone/character/${id}/`;
    logger.debug(`Fetching Lodestone character: ${url}`);

    const html = await fetchText(url);
    if (!html) {
        logger.debug(`Lodestone returned not-ok or empty for ${id}`);
        return null;
    }

    const get = (re: RegExp) => {
        const m = re.exec(html);
        return m?.[1] ? decodeEntities(m[1].trim()) : "";
    };

    // Name
    const name = get(/<p class="frame__chara__name">([^<]+)<\/p>/);

    // Portrait
    const portrait = 
        get(/<div class="character__detail__image">[\s\S]*?<a href="([^"]+)"/) ||
        // fallback to the smaller face image if needed
        get(/<div class="frame__chara__face">\s*<img src="([^"]+)"/);

    // Race / Clan / Gender (z.B. "Miqo'te<br>Seeker of the Sun / ♀")
    const raceRaw = get(
      /<p class="character-block__title">Race\/Clan\/Gender<\/p>\s*<p class="character-block__name">([\s\S]*?)<\/p>/i
    );

    // Kleine Hilfsfunktion: <br> → \n und alle Tags raus
    const stripHtml = (s: string) =>
      decodeEntities(s.replace(/<br\s*\/?>/gi, "\n").replace(/<[^>]+>/g, "").trim());

    let race = "", tribe = "", gender = "";
    if (raceRaw) {
      const [line1, line2 = ""] = stripHtml(raceRaw).split("\n"); // "Miqo'te", "Seeker of the Sun / ♀"
      race = line1?.trim() || "";
      const t = line2.split(" / ");
      tribe  = t[0]?.trim() || "";
      gender = t[1]?.trim() || "";
    }

    // DC + Server 
    let server = "", dc = "";
    {
      const m = /<p class="frame__chara__world">[\s\S]*?(?:<\/i>\s*)?([^<\[]+?)\s*\[([^\]]+)\][\s\S]*?<\/p>/i.exec(html);
      if (m) {
        server = decodeEntities(m[1]!.trim());  // "Alpha"
        dc     = decodeEntities(m[2]!.trim());  // "Light"
      }
    }

    // City-state block
    const town = get(
        /<p class="character-block__title">City-state<\/p>\s*<p class="character-block__name">([^<]+)<\/p>/
    );

    // Grand Company block (e.g., "Maelstrom / Storm Captain")
    const grandCompany = get(
        /<p class="character-block__title">Grand Company<\/p>\s*<p class="character-block__name">([^<]+)<\/p>/
    );

    // Free Company block
    let freeCompanyName = "";
    {
        const freeCompanyBlockMatch = /<div class="character__freecompany__name">([\s\S]*?)<\/div>/i.exec(html);
        if (freeCompanyBlockMatch) {
            const block = freeCompanyBlockMatch[1] ?? "";
            const fcName = extractWithPatterns(block, [
                /class="[^"]*freecompany__text__name[^"]*"[^>]*>([\s\S]*?)<\/p>/i,
                /<h4[^>]*>([\s\S]*?)<\/h4>/i,
                /<a[^>]*>([\s\S]*?)<\/a>/i,
            ]);
            const fcTag = extractFreeCompanyTagFromHtml(block) || extractFreeCompanyTagFromHtml(html);
            if (fcName) {
                freeCompanyName = fcTag ? `${fcName} <${fcTag}>` : fcName;
            }
        }
    }

    if (!freeCompanyName) {
        freeCompanyName = get(
            /<div class="character__freecompany__name">[\s\S]*?<h4><a href="\/lodestone\/freecompany\/\d+\/"[^>]*>([^<]+)<\/a>/
        );
    }

    const freeCompanyId = get(/\/lodestone\/freecompany\/(\d+)\//);

    // Parse job (kept your row login; selector name sometimes differs, so allow flexible matching)
    const jobs: ClassJob[] = [];
    const decode = (s: string) => s
        .replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">")
        .replace(/&#39;/g, "'").replace(/&quot;/g, '"');

    const LiRe = /<li>\s*<img[^>]+data-tooltip="([^"]+)"[^>]*>\s*([0-9]+|—|–)\s*<\/li>/g;
    let JmNew: RegExpExecArray | null;
    while ((JmNew = LiRe.exec(html)) !== null) {
        const tipRaw = decode(JmNew[1] ?? '').trim();
        const lvlTxt = (JmNew[2] || "").toString();
        const level = parseInt(lvlTxt.replace(/[^\d]/g, ""), 10) || 0;

        let name = (tipRaw.split(" / ")[0] ?? '').trim().replace(/\s*\(Limited Job\)\s*$/i, "");

        name = name.replace(/<[^>]+>/g, "").trim();

        if (name) jobs.push({ name, level });
    }

    if (jobs.length === 0) {
        const jobTableRe = /<tr class="character__job__row">[\s\S]*?<td class="character__job__name">([\s\S]*?)<\/td>[\s\S]*?<td class="character__job__level">(\d+)<\/td>/g;
        let jmOld: RegExpExecArray | null;
        while ((jmOld = jobTableRe.exec(html)) !== null) {
            const jobName = decode((jmOld[1] ?? '').replace(/<[^>]+>/g, "")).trim();
            const lvl = parseInt((jmOld[2] ?? '0'), 10);
            if (jobName) jobs.push({ name: jobName, level: lvl });
        }
    }

    const [minionHtml, mountHtml] = await Promise.all([
        fetchText(`${url}minion/`),
        fetchText(`${url}mount/`),
    ]);

    const parseTotal = (h?: string | null) =>
        h ? Number(
            (/<p class="minion__sort__total">Total:\s*<span>(\d+)<\/span>/.exec(h) ||
            /<p class="mount__sort__total">Total:\s*<span>(\d+)<\/span>/.exec(h) ||
            /Total:\s*<span>(\d+)<\/span>/.exec(h) ||
            [,""])[1]
        ) 
        || 0 
        : 0;
        
    const minions = parseTotal(minionHtml);
    const mounts = parseTotal(mountHtml);

    return {
        name,
        portrait,
        race,
        tribe,
        gender,
        dc,
        server,
        town,
        grandCompany,
        freeCompanyId,
        freeCompanyName,
        classJobs: jobs,
        minions,
        mounts,
    };  
}

export async function searchLodestoneFreeCompanies(name: string, world?: string, datacenter?: string): Promise<LodestoneFreeCompanySearchResult[]> {
    const trimmed = name.trim();
    if (!trimmed) return [];

    const key = JSON.stringify({
        name: trimmed.toLowerCase(),
        world: (world ?? '').toLowerCase(),
        datacenter: (datacenter ?? '').toLowerCase(),
    });

    const cached = getCacheEntry(FC_SEARCH_CACHE, key);
    if (cached) return cached;

    const params = new URLSearchParams();
    params.set("q", trimmed);
    if (world) params.set("worldname", world);
    if (datacenter) params.set("dcname", datacenter);
    params.set("order", '');
    params.set("page", '1');

    const url = `https://eu.finalfantasyxiv.com/lodestone/freecompany/?${params.toString()}`;
    logger.info(`Searching Lodestone free companies: ${url}`);

    const html = await fetchText(url);
    if (!html) return [];

    const results: LodestoneFreeCompanySearchResult[] = [];
    const seen = new Set<string>();
    const entryRe = /<a[^>]*href=['"]\/lodestone\/freecompany\/(\d+)(?:\/)?['"][^>]*>([\s\S]*?)<\/a>/gi;
    let match: RegExpExecArray | null;

    while ((match = entryRe.exec(html)) !== null) {
        const id = match[1];
        const block = match[2] ?? '';
        if (!id || !block) continue;
        if (seen.has(id)) continue;
        if (!/freecompany/i.test(block)) continue;

        const nameText = extractWithPatterns(block, [
            /class="[^"]*(?:entry__name|freecompany__name)[^"]*"[^>]*>([\s\S]*?)<\/(?:p|div)>/i,
            /<strong[^>]*>([\s\S]*?)<\/strong>/i,
        ]) || normalizeWhitespace(stripTags(block));
        if (!nameText) continue;

        const worldText = extractWithPatterns(block, [
            /class="[^"]*(?:entry__world|freecompany__world)[^"]*"[^>]*>([\s\S]*?)<\/(?:p|div)>/i,
        ]);

        const tagText = extractWithPatterns(block, [
            /class="[^"]*(?:entry__tag|freecompany__tag)[^"]*"[^>]*>([\s\S]*?)<\/(?:p|div)>/i,
            /\[([^\]]{1,12})\]/,
        ]);

        const parsed = parseWorldAndDc(worldText || world || '');

        const entry: LodestoneFreeCompanySearchResult = {
            id,
            name: nameText,
            world: parsed.world || world || '',
        };

        if (parsed.dc) entry.dc = parsed.dc;

        const normalizedTag = extractFreeCompanyTagFromHtml(tagText);
        if (normalizedTag) entry.tag = normalizedTag;

        results.push(entry);
        seen.add(id);

        if (results.length >= 25) break;
    }

    const validatedResults = FreeCompanySearchResultSchema.array().parse(results);

    setCacheEntry(FC_SEARCH_CACHE, key, validatedResults, FC_SEARCH_TTL);
    return validatedResults;
}

export async function fetchLodestoneFreeCompany(id: string): Promise<LodestoneFreeCompany | null> {
    const key = id.trim();
    if (!key) return null;

    const cached = getCacheEntry(FC_DETAIL_CACHE, key);
    if (cached) return cached;

    const url = `https://eu.finalfantasyxiv.com/lodestone/freecompany/${key}/`;
    logger.debug(`Fetching Lodestone free company: ${url}`);

    const html = await fetchText(url);
    if (!html) {
        logger.debug(`Lodestone returned not-ok or empty for FC ${key}`);
        return null;
    }

    const nameRaw = extractWithPatterns(html, [
        /class="[^"]*freecompany__text__name[^"]*"[^>]*>([\s\S]*?)<\/p>/i,
        /<h2[^>]*class="[^"]*freecompany__name[^"]*"[^>]*>([\s\S]*?)<\/h2>/i,
        /class="[^"]*freecompany__text__name[^"]*"[^>]*>([\s\S]*?)<\/p>/i,
    ]);

    let name = nameRaw.replace(/\s*[«<\[][^«»<>\[\]]{1,12}[»>\]]$/u, '').trim();

    if (!name) {
        const ogTitleMatch = /<meta[^>]+property=['"]og:title['"][^>]+content=['"]([^'"<>]+)['"][^>]*>/i.exec(html);
        if (ogTitleMatch?.[1]) {
            const decoded = decodeEntities(ogTitleMatch[1]);
            const titleMatch = /Free Company\s+"([^"]+)"/i.exec(decoded);
            name = titleMatch?.[1] ?? decoded.trim();
        }
    }

    if (!name) {
        logger.debug(`Failed to extract FC name for ${key}`);
        return null;
    }

    const tag = extractFreeCompanyTagFromHtml(html);

    const slogan = extractWithPatterns(html, [
        /class="[^"]*(?:freecompany__message|freecompany__slogan|freecompany__text__message)[^"]*"[^>]*>([\s\S]*?)<\/(?:div|p)>/i,
    ]);

    const definitions = collectDefinitions(html);
    const leadSections = collectLeadSections(html);
    const worldRaw = definitions.get('world')?.[0] ?? '';
    const dcRaw = definitions.get('data center')?.[0] ?? '';
    const parsed = parseWorldAndDc(worldRaw);
    let datacenter = dcRaw || parsed.dc;
    let worldName = parsed.world || worldRaw;

    if (!worldName) {
        const gcText = extractWithPatterns(html, [
            /class="[^"]*entry__freecompany__gc[^"]*"[^>]*>([\s\S]*?)<\/(?:p|div)>/i,
        ]);
        if (gcText) {
            const fallback = parseWorldAndDc(gcText);
            worldName = fallback.world || worldName;
            datacenter = datacenter || fallback.dc;
        }
    }

    const recruitment = definitions.get('recruitment')?.[0] || extractLeadText(leadSections, 'Recruitment') || '';
    const formed = definitions.get('formed')?.[0]
        ?? definitions.get('founded')?.[0]
        ?? extractLeadText(leadSections, 'Formed')
        ?? '';
    const formedAt = parseDate(formed);

    const activeMembersRaw = definitions.get('active members')?.[0]
        ?? extractLeadText(leadSections, 'Active Members')
        ?? '';
    let activeMembers: number | null = null;
    if (activeMembersRaw) {
        const digits = activeMembersRaw.replace(/[^0-9]/g, '');
        if (digits) activeMembers = Number(digits);
        else if (/0/.test(activeMembersRaw)) activeMembers = 0;
    }

    const rank = definitions.get('rank')?.[0]
        ?? extractLeadText(leadSections, 'Rank')
        ?? '';

    let ranking = definitions.get('ranking')?.[0] 
        ?? definitions.get('estate standing')?.[0]
        ?? definitions.get('estate ranking')?.[0]
        ?? '';

    if (!ranking) {
        const rankingSections = leadSections.get('ranking');
        if (rankingSections?.length) {
            const rows: string[] = [];
            for (const section of rankingSections) {
                const rowRe = /<th[^>]*>([\s\S]*?)<\/th>/gi;
                let rowMatch: RegExpExecArray | null;
                while ((rowMatch = rowRe.exec(section)) !== null) {
                    const text = normalizeWhitespace(stripTags(rowMatch[1] ?? ''));
                    if (text) rows.push(text);
                }
                if (!rows.length) {
                    const text = normalizeWhitespace(stripTags(section));
                    if (text) rows.push(text);
                }
            }
            if (rows.length) ranking = rows.join('; ');
        }
    }

    const crestLayers: string[] = [];
    const crestRe = /freecompany__crest__image[^>]*>[\s\S]*?<img[^>]+(?:src|data-src|data-lazy-src|data-original)=['"]([^'"\s]+)['"]/gi;
    let crestMatch: RegExpExecArray | null;
    while ((crestMatch = crestRe.exec(html)) !== null) {
        const src = crestMatch[1];
        if (!src) continue;
        const absolute = toAbsoluteUrl(src);
        if (!absolute) continue;
        if (!crestLayers.includes(absolute)) crestLayers.push(absolute);
    }

    const reputation: LodestoneFreeCompanyReputation[] = [];
    const reputationRe = /<(?:li|div)[^>]*class="[^"]*freecompany__reputation(?:__item)?[^"]*"[^>]*>([\s\S]*?)<\/(?:li|div)>/gi;

    let repMatch: RegExpExecArray | null;
    while((repMatch = reputationRe.exec(html)) !== null) {
        const block = repMatch[1] ?? '';
        const repName = extractWithPatterns(block, [
            /class="[^"]*(?:reputation__name|freecompany__reputation__name)[^"]*"[^>]*>([\s\S]*?)<\/(?:p|div)>/i,
            /class="[^"]*freecompany__reputation__gcname[^"]*"[^>]*>([\s\S]*?)<\/(?:p|div)>/i,
            /data-tooltip=['"]([^'"\n]+)['"]/i,
        ]);
        const repValue = extractWithPatterns(block, [
            /class="[^"]*(?:reputation__value|freecompany__reputation__value)[^"]*"[^>]*>([\s\S]*?)<\/(?:p|div)>/i,
            /class="[^"]*freecompany__reputation__rank[^"]*"[^>]*>([\s\S]*?)<\/(?:p|div)>/i,
            /title=['"]([^'"\n]+)['"]/i,
        ]);
        if (repName || repValue) reputation.push({ name: repName ?? '', value: repValue ?? '' });
    }

    const estateMatch = /<(?:section|div)[^>]*class="[^"]*freecompany__estate[^"]*"[^>]*>([\s\S]*?)<\/(?:section|div)>/i.exec(html);
    let estate: LodestoneFreeCompanyEstate | null = null;
    if (estateMatch) {
        const block = estateMatch[1] ?? '';
        const estateName = extractWithPatterns(block, [
            /class="[^"]*(?:estate__name|freecompany__estate__name)[^"]*"[^>]*>([\s\S]*?)<\/(?:p|div|h[1-6])>/i,
            /<h3[^>]*>([\s\S]*?)<\/h3>/i,
        ]);
        const estateTitle = extractWithPatterns(block, [
            /class="[^"]*estate__title[^"]*"[^>]*>([\s\S]*?)<\/(?:p|div|h[1-6])>/i,
        ]);
        const estateInfo = extractWithPatterns(block, [
            /class="[^"]*(?:estate__text|freecompany__estate__txt)[^"]*"[^>]*>([\s\S]*?)<\/(?:p|div)>/i,
            /<p[^>]*>([\s\S]*?)<\/p>/i,
        ]);
        if (estateName || estateInfo) {
            estate = {
                name: estateName ?? '',
                info: [estateTitle, estateInfo].filter(Boolean).join('\n'),
            };
        }
    }

    let focus = parseToggleList(html, 'freecompany__focus__item');
    if (!focus.length) {
        focus = parseFocusIconSections(html);
    }

    let seeking = parseToggleList(html, 'freecompany__recruitment__item');
    if (!seeking.length) {
        const seekingText = extractLeadText(leadSections, 'Seeking');
        if (seekingText) {
            seeking = [{ name: seekingText, status: '' }];
        }
    }

    const freeCompany: LodestoneFreeCompany = {
        id: key,
        name,
        tag,
        datacenter,
        world: worldName,
        slogan,
        formed,
        formedAt,
        activeMembers,
        recruitment,
        rank,
        ranking,
        reputation,
        estate,
        focus,
        seeking,
        crestLayers,
    };

    const validatedCompany = FreeCompanySchema.parse(freeCompany);

    setCacheEntry(FC_DETAIL_CACHE, key, validatedCompany, FC_DETAIL_TTL);
    return validatedCompany;
}

export async function fetchLodestoneFreeCompanyMembers(id: string, limit = 20): Promise<LodestoneFreeCompanyMember[] | null> {
    const normalizedLimit = Math.max(1, Math.min(limit, 50));
    const key = `${id.trim()}:${normalizedLimit}`;
    const cached = getCacheEntry(FC_MEMBER_CACHE, key);
    if (cached) return cached;

    const url = `https://eu.finalfantasyxiv.com/lodestone/freecompany/${id}/member/`;
    logger.debug(`Fetching Lodestone free company members: ${url}`);

    const html = await fetchText(url);
    if (!html) return [];

    const members: LodestoneFreeCompanyMember[] = [];
    const seen = new Set<string>();
    const entryRe = /<li[^>]*class="[^"]*(?:entry__freecompany__member|entry__member)[^"]*"[^>]*>([\s\S]*?)<\/li>/gi;
    let match: RegExpExecArray | null;

    while ((match = entryRe.exec(html)) !== null) {
        const block = match[1] ?? '';
        const anchor = /<a[^>]*href=['"]\/lodestone\/character\/(\d+)(?:\/)?['"][^>]*>([\s\S]*?)<\/a>/i.exec(block);
        if (!anchor) continue;
        const memberId = anchor[1];
        if (!memberId || seen.has(memberId)) continue;
        seen.add(memberId);

        const inner = anchor[2] ?? '';
        const name = extractWithPatterns(inner, [
            /class="[^"]*(?:entry__name|freecompany__member__name|entry__character__name)[^"]*"[^>]*>([\s\S]*?)<\/p>/i,
            /<p[^>]*>([\s\S]*?)<\/p>/i,
        ]) || normalizeWhitespace(stripTags(inner));

        const rank = extractWithPatterns(block, [
            /class="[^"]*(?:entry__freecompany__rank|freecompany__member__rank)[^"]*"[^>]*>([\s\S]*?)<\/p>/i,
            /<span[^>]*class="[^"]*rank[^"]*"[^>]*>([\s\S]*?)<\/span>/i,
        ]);

        members.push({ id: memberId, name: name ?? '', rank: rank ?? '' });
        if (members.length >= normalizedLimit) break;
    }

    const validatedMembers = FreeCompanyMemberSchema.array().parse(members);

    setCacheEntry(FC_MEMBER_CACHE, key, validatedMembers, FC_MEMBER_TTL);
    return validatedMembers;
}
    

