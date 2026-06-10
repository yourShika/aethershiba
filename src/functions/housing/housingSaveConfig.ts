// functions/housing/housingSaveConfig.ts

import { dataFile, legacyDataFile, readJsonWithLegacy, writeJson } from "../../lib/dataStore.js";

// ---------------------------------------------------
// Types & Path
// ---------------------------------------------------

/**
 * Represents one "seen" housing entry.
 *  - key: unique string key (nomalized from data center, world, plot, etc.)
 *  - ts: timestamp when this entry was first recorded
 */
type Entry = { key: string; ts: number };

// File path for storing "seen" housing entries of a guild.
const file = (guildID: string) => dataFile('guildconfig', `${guildID}_housing_seen.json`);
const legacyFile = (guildID: string) => legacyDataFile('..', 'guildconfig', `${guildID}_housing_seen.json`);

// ---------------------------------------------------
// Load / Save Helpers
// ---------------------------------------------------

/**
 * Load all seen entries for a guild from disk.
 * 
 * @param g - guildID
 * @returns empty array if file does not exist or is invalid
 */
async function load(g: string): Promise<Entry[]> {
    const entries = await readJsonWithLegacy<Entry[]>(file(g), legacyFile(g), []);
    return Array.isArray(entries) ? entries : [];
}

/**
 * Save entries for a guild back to disk.
 * Ensures directory exists first.
 * 
 * @param g - guildID
 * @param arr - Entries
 */
async function save(g: string, arr: Entry[]) {
    await writeJson(file(g), arr);
}

// ---------------------------------------------------
// Public API
// ---------------------------------------------------

/**
 * Cleanup old entries beyond a given TTL.
 * Default TTL = 7 days.
 * 
 * @param g - guildID
 * @param ttlDays - number of days to retain entries
 */
export async function cleanup(g: string, ttlDays = 7) {
    const now = Date.now();
    const arr = (await load(g)).filter(e => now - e.ts < ttlDays * 24 * 60 * 60 * 1000);
    await save(g, arr);
}

/**
 * Check if a specific key has already been seen for a guild.
 * 
 * @param g - guildID
 * @param key - Unique entry key
 */
export async function has(g: string, key: string) {
    return (await load(g)).some(e => e.key === key);
}

/**
 * Add a new entry if it doesn't already exist.
 * Stores with current timestamp.
 * 
 * @param g - guildID
 * @param key - Unique entry key
 */
export async function add(g: string, key: string) {
    const arr = await load(g);
    if (!arr.some(e => e.key === key)) {
        arr.push({ key, ts: Date.now() });
        await save(g, arr);
    }
}

/**
 * Remove all seen entries for a guild.
 */
export async function clear(g: string) {
    await save(g, []);
}

// ---------------------------------------------------
// Key Normalization
// ---------------------------------------------------

/**
 * Normalize a string value by:
 *  - Removing leading "the"
 *  - Trimming whitespace
 *  - Lowercasing
 * 
 * used to unify naming differences in worlds/districts.
 */
function norm(v: string) {
    return v.replace(/^the\s+/i, '').trim().toLowerCase();
}

/**
 * Construct a unique key for a housing entry.
 * 
 * Combines normalized datacenter, world, districts, ward, plot,
 * lottery state, and optional lottery end timestamp.
 * 
 */
export function makeKey(p: { dataCenter: string; world: string; district: string; ward: number; plot: number; lottery: { state: string; endsAt?: string}}) {
    return [
        norm(p.dataCenter),
        norm(p.world),
        norm(p.district),
        p.ward,
        p.plot,
        p.lottery.state,
        p.lottery.endsAt ?? ''
    ].join(':');
}
