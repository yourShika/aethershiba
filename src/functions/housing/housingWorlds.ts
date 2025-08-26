import { logError } from "../../handlers/errorHandler.js";

type World = { id: number; name: string; datacenter_name?: string; };
let cache: { ts: number; worlds: World[] } | null = null;

// Fetches all worlds from the PaissaDB API.
// This function retrieves the list of worlds and caches the result for 6 hours.
export async function fetchAllWorlds(): Promise<World[]> {
    const now = Date.now();
    if (cache && now - cache.ts < 6 * 60 * 60 * 1000) return cache.worlds;
    try {
        const res = await fetch('https://paissadb.zhu.codes/worlds', { headers: { 'User-Agent': 'Aerther Shiba' } });
        if (!res.ok) {
            const err = new Error(`Failed to fetch worlds: ${res.status} ${res.statusText}`);
            logError('fetchAllWorlds', err);
            throw err;
        }
        const worlds = await res.json() as World[];
        cache = { ts: now, worlds };
        return worlds;
    } catch (err) {
        logError('fetchAllWorlds', err);
        throw err;
    }
}

export async function getWorldNamesByDC(dc: string): Promise<string[]> {
    const all = await fetchAllWorlds();
    return all.filter(w => (w.datacenter_name ?? '').toLowerCase() === dc.toLowerCase())
        .map(w => w.name).sort((a, b) => a.localeCompare(b));
}

export async function getWorldIdByName(name: string): Promise<number | null> {
    const all = await fetchAllWorlds();
    const world = all.find(w => w.name.toLowerCase() === name.toLowerCase());
    return world?.id ?? null;
}


