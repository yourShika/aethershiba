// functions/housing/housingWorlds.ts

import { logError } from "../../handlers/errorHandler.js";

// ---------------------------------------------------
// Types & Cache
// ---------------------------------------------------

/**
 * A single FFXIV world (server).
 *  - id: unique world identifier
 *  - name: world name (string)
 *  - datacenter_name: name of the datacenter the world belongs to
 */
type World = { id: number; name: string; datacenter_name?: string; };

/**
 * Cache of fetched worlds:
 *  - ts: timestamp of when the data was cached
 *  - worlds: array of World objects
 * 
 * The cache prevents unnecessary API calls by storing
 * results for up to 6 hours.
 */
let cache: { ts: number; worlds: World[] } | null = null;

// ---------------------------------------------------
// Functions
// ---------------------------------------------------

/**
 * Fetches all worlds from the PaissaDB API.
 * 
 *  - Results are cached for 6 hours to avoid excessive requests.
 *  - If the request fails or the response is invalid,
 *    the error is logged and rethrown.
 * 
 * @returns Promise resolving to an array of World objects
 */
export async function fetchAllWorlds(): Promise<World[]> {
    const now = Date.now();

    // If cache exists and is still valid -> return cached data
    if (cache && now - cache.ts < 6 * 60 * 60 * 1000) return cache.worlds;

    try {
        // Fetch worlds from PaissaDB API
        const res = await fetch('https://paissadb.zhu.codes/worlds', { 
            headers: { 'User-Agent': 'Aether Shiba' } 
        });

        // Validate HTTP status
        if (!res.ok) {
            const err = new Error(`Failed to fetch worlds: ${res.status} ${res.statusText}`);
            logError('fetchAllWorlds', err);
            throw err;
        }

        // Parse response
        const worlds = await res.json() as World[];

        // Save to cache with timestamp
        cache = { ts: now, worlds };

        return worlds;
    } catch (err) {
        logError('fetchAllWorlds', err);
        throw err;
    }
}

/**
 * Get world names belonging to a given datacenter.
 * 
 * @param dc - datacenter name
 * @returns alphabetically sorted list of world names
 */
export async function getWorldNamesByDC(dc: string): Promise<string[]> {
    const all = await fetchAllWorlds();
    return all.filter(w => (w.datacenter_name ?? '').toLowerCase() === dc.toLowerCase())
        .map(w => w.name).sort((a, b) => a.localeCompare(b));
}

/**
 * Look up the ID of a world by its name.
 * 
 * @param name - world name (case-insensitive)
 * @returns world ID or null if not found
 */
export async function getWorldIdByName(name: string): Promise<number | null> {
    const all = await fetchAllWorlds();
    const world = all.find(w => w.name.toLowerCase() === name.toLowerCase());
    return world?.id ?? null;
}


