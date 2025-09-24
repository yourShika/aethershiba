// functions/housing/housingProvider.paissa.ts

import { z } from "zod";
import { getWorldIdByName } from "./housingWorlds";

// Possible lottery state returned/derived from PaissaDB
export type LotteryState = 'none'|'preparation'|'running'|'results';

/**
 * Normalized plot model used by the bot.
 * Converted from PaissaDB's world detail payload to a consistent shape.
 */
export type Plot = {
    dataCenter: string;     // Datacenter name (from API or fallback to request DC)
    world: string;          // World name
    district: string;       // District name (e.g., "The Lavender Beds")
    ward: number;           // Ward number
    plot: number;           // Plot number
    price?: number;         // Optional price
    size?: 'S'|'M'|'L';     // Optional normalized house size
    fcOnly?: boolean;       // Whether plot is FC-only
    /** Timestamp (ms) of the API's last update for this plot */
    lastUpdated?: number;
    lottery: {
        state: LotteryState;    // Normalized lottery state
        endsAt?: string;        // Raw end field (stringified)
        winner?: boolean;       // If a winner was reported
        /** Number of lottery entries for the plot */
        entries?: number;
        /** Epoch timestamp (ms) when the current lottery phase ends */
        phaseUntil?: number;
    };
};

// ---------------------------------------------------
// Zod schemas for API payloads
// ---------------------------------------------------

// Schema for a single open plot entry in PaissaDB's response
// We accept strings or numbers and normalize downstream.
const PlotZ = z.object({
    ward_number: z.number().or(z.string()),
    plot_number: z.number().or(z.string()),
    price: z.number().or(z.string()).optional(),
    size: z.union([z.string(), z.number()]).optional(),
    free_company_only: z.boolean().optional(),
    lottery_state: z.union([z.string(), z.number()]).optional(),
    lottery_end: z.union([z.string(), z.number()]).optional(),
    lottery_winner: z.boolean().optional(),
    last_updated_time: z.union([z.number(), z.string()]).optional(),
    lotto_entries: z.union([z.number(), z.string()]).nullish(),
    lotto_phase_until: z.union([z.number(), z.string()]).nullish(),
}).passthrough();

// District wrapper: list of open plots.
const DistrictZ = z.object({
    name: z.string(),
    open_plots: z.array(PlotZ).default([]),
});

// World details wrapper (top-level object from /worlds/:id).
const WorldDetailZ = z.object({
    name: z.string(),
    datacenter_name: z.string().optional(),
    districts: z.array(DistrictZ).default([]),
});

// Type alias for parsed world detail used inside the cache
type WorldDetail = z.infer<typeof WorldDetailZ>;

// ---------------------------------------------------
// Error & cache helpers
// ---------------------------------------------------

/**
 * Error thrown when the PaissaDB API cannot be reached or responds with an
 * unexpected status code. Allows callers to distinguish between "no data"
 * and "service unavailable".
 */
export class PaissaUnavailableError extends Error {
    public readonly status?: number;

    constructor(status?: number, cause?: unknown) {
        super('PaissaDB API is unavailable.');
        this.name = 'PaissaUnavailableError';
        if (typeof status === 'number') {
            this.status = status;
        }
        if (cause) {
            try { (this as any).cause = cause; }
            catch { /* noop */ }
        }
    }
}

const CACHE_TTL_MS = 30_000;
type CacheEntry = { expiresAt: number; detail: WorldDetail };
const worldCache = new Map<string, CacheEntry>();

function cacheKey(worldId: number) {
    return `world:${worldId}`;
}

function getCachedWorld(worldId: number): WorldDetail | null {
    const entry = worldCache.get(cacheKey(worldId));
    if (!entry) return null;
    if (Date.now() >= entry.expiresAt) {
        worldCache.delete(cacheKey(worldId));
        return null;
    }
    return entry.detail;
}

function setCachedWorld(worldId: number, detail: WorldDetail, ttlMs: number) {
    worldCache.set(cacheKey(worldId), { detail, expiresAt: Date.now() + ttlMs });
}

// ---------------------------------------------------
// Normalization helpers
// ---------------------------------------------------

/**
 * Normalize house size from PaissaDB to 'S' | 'M' | 'L'.
 * Accepts numeric codes, strings, or already-normalized values.
 */
function normSize(s?: string): 'S'|'M'|'L'|undefined {
    const v = s?.toUpperCase();
    if (!v) return undefined;
    const map: Record<string, 'S'|'M'|'L'> = {
        '0': 'S',
        '1': 'M',
        '2': 'L',
        '3': 'L',   // sometimes 3 is also L
        'S': 'S',
        'M': 'M',
        'L': 'L',
    };
    return map[v];
}

/**
 * Normalize text/number lottery state to our union.
 * Handles strings like "preparation", "running", "results"
 * as well as numeric/stringly numeric variants.
 */
function normState(s?: string): LotteryState {
    const v = (s ?? '').toLowerCase();
    if (v.includes('pre')) return 'preparation';
    if (v.includes('result')) return 'results';
    if (v.includes('run') || v.includes('open')) return 'running';
    return 'none';
}

// Case-insensitive, "The "-insensitive district equality.
function eqDistrict(a: string, b:string) {
    const clean = (x: string) => x.replace(/^the\s+/i,'').trim().toLowerCase();
    return clean(a) === clean(b);
}

// ---------------------------------------------------
// Provider
// ---------------------------------------------------

/**
 * Fetch and normalize free plots for a single world from PaissaDB.
 *
 * Steps:
 *  - Resolve world ID by name.
 *  - GET /worlds/:id from PaissaDB (with short-lived cache).
 *  - Validate with Zod and filter by requested districts
 *  - Normalize each open plot into our 'Plot' model.
 *
 * @param dc - Datacenter name (used as fallback if API lacks it)
 * @param world - World name (case-insensitive lookup)
 * @param districts - List of districts names to include (compared via eqDistrict)
 * @returns Array of normalized Plot objects
 */
export class PaissaProvider {
    constructor(private readonly cacheTtlMs: number = CACHE_TTL_MS) {}

    async fetchFreePlots(dc: string, world: string, districts: string[]): Promise<Plot[]> {
        const id = await getWorldIdByName(world);
        if (!id) return [];

        let detail = getCachedWorld(id);
        if (!detail) {
            let res: Response;
            try {
                res = await fetch(`https://paissadb.zhu.codes/worlds/${id}`, {
                    headers: { 'user-agent': 'AetherShiba/1.0' },
                });
            } catch (err) {
                throw new PaissaUnavailableError(undefined, err);
            }

            if (!res.ok) {
                throw new PaissaUnavailableError(res.status);
            }

            let payload: unknown;
            try {
                payload = await res.json();
            } catch (err) {
                throw new PaissaUnavailableError(res.status, err);
            }

            detail = WorldDetailZ.parse(payload);
            setCachedWorld(id, detail, this.cacheTtlMs);
        }

        const wanted = new Set(districts);
        const out: Plot[] = [];
        const now = Date.now();

        for (const d of detail.districts) {
            if (wanted.size && !Array.from(wanted).some((w) => eqDistrict(w, d.name))) continue;

            for (const p of d.open_plots) {
                const state = normState(typeof p.lottery_state === 'number' ? String(p.lottery_state) : p.lottery_state);
                const lottery: Plot['lottery'] = { state };
                if (p.lottery_end !== undefined) lottery.endsAt = String(p.lottery_end);
                if (typeof p.lottery_winner === 'boolean') lottery.winner = p.lottery_winner;
                if (p.lotto_entries != null) lottery.entries = Number(p.lotto_entries);
                if (p.lotto_phase_until != null) lottery.phaseUntil = Number(p.lotto_phase_until) * 1000; // sec -> ms

                const ward = Number(p.ward_number);
                const plot = Number(p.plot_number);

                const item: Plot = {
                    dataCenter: detail.datacenter_name ?? dc,
                    world: detail.name,
                    district: d.name,
                    ward,
                    plot,
                    lottery,
                };

                if (p.price !== undefined) item.price = Number(p.price);

                const sizeVal = normSize(typeof p.size === 'number' ? String(p.size) : p.size);
                if (sizeVal) item.size = sizeVal;

                if (typeof p.free_company_only === 'boolean') item.fcOnly = p.free_company_only;

                if (p.last_updated_time !== undefined) item.lastUpdated = Number(p.last_updated_time) * 1000;

                if (!Number.isFinite(item.ward) || item.ward <= 0) continue;
                if (!Number.isFinite(item.plot) || item.plot <= 0) continue;
                if (item.lottery?.phaseUntil && item.lottery.phaseUntil <= now) continue;

                out.push(item);
            }
        }

        return out;
    }

    /** Clear the in-memory cache (primarily used for tests). */
    clearCache() {
        worldCache.clear();
    }
}
