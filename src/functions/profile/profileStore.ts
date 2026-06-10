// functions/profile/profileStore.ts

import { dataFile, legacyDataFile, readJsonWithLegacy, writeJson } from "../../lib/dataStore.js";

const FILE = dataFile('profiles.json');
const LEGACY_FILE = legacyDataFile('profiles.json');

export interface Profile {
    userId: string;
    lodestoneId: string;
    lodestoneUrl: string;
    ffxivCollectUrl: string;
    verified: boolean;
    verifiedAt: number;
}

export async function loadProfiles(): Promise<Profile[]> {
    const profiles = await readJsonWithLegacy<Profile[]>(FILE, LEGACY_FILE, []);
    return Array.isArray(profiles) ? profiles : [];
}

export async function saveProfiles(profiles: Profile[]): Promise<void> {
    await writeJson(FILE, profiles);
}

export async function getProfileByUser(userId:string): Promise<Profile | undefined> {
    const profiles = await loadProfiles();
    return profiles.find(p => p.userId === userId);
}

export async function getProfilebyLodestoneId(id:string): Promise<Profile | undefined> {
    const profiles = await loadProfiles();
    return profiles.find(p => p.lodestoneId === id);
}

export async function addProfile(profile:Profile): Promise<void> {
    const profiles = await loadProfiles();
    const existing = profiles.findIndex(p => p.userId === profile.userId || p.lodestoneId === profile.lodestoneId);
    if (existing >= 0) {
        profiles[existing] = profile;
    } else {
        profiles.push(profile);
    }
    await saveProfiles(profiles);
}

export async function removeProfileByUser(userId: string): Promise<Profile | null> {
    const profiles = await loadProfiles();
    const next = profiles.filter(p => p.userId !== userId);
    if (next.length === profiles.length) return null;
    await saveProfiles(next);
    return profiles.find(p => p.userId === userId) ?? null;
}
