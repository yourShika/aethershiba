// functions/profile/profileLodestoneAPI.ts

// -------------------------------------------------
// Dependencies
// -------------------------------------------------
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

async function fetchText(url: string): Promise<string | null> {
    try {
        const res = await fetch(url, { headers: { "user-agent": UA  }});

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
    .replace(/&quot;/g, '"');
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
    const freeCompanyName = get(
        /<div class="character__freecompany__name">[\s\S]*?<h4><a href="\/lodestone\/freecompany\/\d+\/"[^>]*>([^<]+)<\/a>/
    );
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