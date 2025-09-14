// functions/profile/profileStore.ts

// -------------------------------------------------
// Dependecies
// -------------------------------------------------
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { join } from "node:path";

const DIR = join(process.cwd(), 'src', 'json');
const FILE = join(DIR, 'profiles.json');

export interface Profile {
    userId: string;
    lodestoneId: string;
    lodestoneUrl: string;
    ffxivCollectUrl: string;
    verified: boolean;
    verifiedAt: number;
}

async function ensureFile() {
    await mkdir(DIR, { recursive: true });

    try {
        await readFile(FILE, 'utf8');
    } catch {
        await writeFile(FILE, '[]', 'utf8');
    }
}

export async function loadProfiles(): Promise<Profile[]> {
    await ensureFile();
    const txt = await readFile(FILE, 'utf8');

    try {
        return JSON.parse(txt) as Profile[];
    } catch {
        return [];
    }
}

export async function saveProfiles(profiles: Profile[]): Promise<void> {
    await ensureFile();
    await writeFile(FILE, JSON.stringify(profiles, null, 2), 'utf8');
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
    profiles.push(profile);
    await saveProfiles(profiles);
}