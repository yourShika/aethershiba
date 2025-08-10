type Key = string;

// Represents a unique key for storing housing draft data.
// This key is a combination of guild ID and user ID, ensuring that each draft is unique
export type HousingDraft = {
    enabled: boolean;
    dataCenter?: string;
    world?: string;
    districts?: string[];
    channelId?: string;
    timesPerDay?: number;
    intervalMinutes?: number;
    pingUserId?: string;
    pingRoleId?: string;
    /** ID of the summary message so it can be edited later. */
    messageId?: string;
};

// In-memory storage for housing drafts.
// This is a simple key-value store where the key is a combination of guild ID and user
const mem = new Map<Key, { ts: number; value: HousingDraft }>();

// Generates a unique key for storing housing draft data based on guild and user IDs.
// This key is used to retrieve and store drafts in the in-memory map.
export const uiKey = (g: string, u: string) => `${g}:${u}`;

// Retrieves the housing draft for a specific guild and user.
// If no draft exists, it returns undefined.
export const getDraft = (k:Key) => mem.get(k)?.value;

// Sets or updates the housing draft for a specific guild and user.
// This function merges the provided patch with the existing draft, allowing for partial updates.
export function setDraft(k: Key, patch: Partial<HousingDraft>) {
    const current = mem.get(k)?.value ?? { enabled: false };
    const next = { ...current, ...patch };
    mem.set(k, { ts: Date.now(), value: next });
    return next;
}

// Clears the housing draft for a specific guild and user.
// This function removes the draft from the in-memory map, effectively resetting it.
export const clearDraft = (k: Key) => void mem.delete(k);

// Periodically cleans up drafts that are older than 30 minutes.
// This helps to manage memory usage by removing stale drafts that are no longer needed.
setInterval(() => {
    const now = Date.now();
    for (const [k,v] of mem) if (now - v.ts > 30 * 60 * 1000) mem.delete(k);
}, 10 * 60 * 1000); // Clean up drafts older than 30 minutes