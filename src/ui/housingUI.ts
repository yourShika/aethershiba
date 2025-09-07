// ui/housingUI.ts

// Define a type alias for keys used in our in-memory map.
// The key is alwasy a string (guildId:userId)
type Key = string;

/**
 * Represents a draft configuration for housing.
 * Each user can have exactly one draft per guild.
 */
export type HousingDraft = {
    enabled: boolean;       // Enable-State
    dataCenter?: string;    // Server Data-Center
    worlds?: string[];      // List of Worlds
    districts?: string[];   // Housing Districts
    channelId?: string;     // Channel where updates go
    timesPerDay?: number;   // how many times per day it should update the through API
    pingUserId?: string;    // user ID to ping
    pingRoleId?: string;    // role ID to ping
    messageId?: string;     // ID of the summary message so it can be edited later.
};

// ---------------------------------------------------
// In-memory storage
// ---------------------------------------------------

/**
 * The store is a map where:
 * @param Key - unique string (guildId:userId)
 * @param value - object with timestamp ('ts') and the draft itself ('value') 
 */
const mem = new Map<Key, { ts: number; value: HousingDraft }>();

/**
 * Generate a unique key for storing housing drafts.
 * 
 * @param g - guildID
 * @param u - userId
 * @returns string key in the form "guildId:userId"
 */
export const uiKey = (g: string, u: string) => `${g}:${u}`;

/**
 * Retrieve the current draft for a specific key.
 * 
 * @param k - unique key (guildId:userId) 
 * @returns the HousingDraft if present, otherwise undefined
 */
export const getDraft = (k:Key) => mem.get(k)?.value;

/**
 * Set or update a housing draft for a specific key.
 * 
 * If a draft exists, this merges it with the new patch.
 * If no draft exists, a new one is created with defaults.
 * 
 * @param k - unique key (guildId:userId)
 * @param patch - partial draft to apply (allows incremental updates)
 * @returns the updated HousingDraft
 */
export function setDraft(k: Key, patch: Partial<HousingDraft>) {

    //default draft
    const current = mem.get(k)?.value ?? { enabled: false };

    // merge old + patch
    const next = { ...current, ...patch };

    // save with current timestamp
    mem.set(k, { ts: Date.now(), value: next });

    return next;
}

/**
 * Clear (remove) the housing draft for a given key.
 * 
 * @param k - unique key (guildId:userId) 
 */
export const clearDraft = (k: Key) => void mem.delete(k);

// ---------------------------------------------------
// Cleanup
// ---------------------------------------------------

/**
 * Periodic cleanup job.
 * 
 * Every 10 minutes, remove drafts that haven't been touched in 30 minutes.
 * This prevents the in-memory store from growing indefinitely.
 */
setInterval(() => {
    const now = Date.now();
    for (const [k,v] of mem) {
        // 30 minutes in ms
        if (now - v.ts > 30 * 60 * 1000) {
            mem.delete(k);
        } 
    }
}, 10 * 60 * 1000); // Run cleanup every 10 minutes
