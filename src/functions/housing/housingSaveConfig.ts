import { readFile, writeFile, mkdir } from "node:fs/promises";
import { join } from "node:path";

type Entry = { key: string; ts: number };
const dir = () => join(process.cwd(), 'src', 'guildconfig');
const file = (guildID: string) => join(dir(), `${guildID}_housing_seen.json`);

async function load(g: string): Promise<Entry[]> {
    try { return JSON.parse(await readFile(file(g), 'utf8')) as Entry[]; }
    catch {
        return [];
    }
}

async function save(g: string, arr: Entry[]) {
    await mkdir(dir(), { recursive: true });
    await writeFile(file(g), JSON.stringify(arr, null, 2));
}

export async function cleanup(g: string, ttlDays = 7) {
    const now = Date.now();
    const arr = (await load(g)).filter(e => now - e.ts < ttlDays * 24 * 60 * 60 * 1000);
    await save(g, arr);
}

export async function has(g: string, key: string) {
    return (await load(g)).some(e => e.key === key);
}

export async function add(g: string, key: string) {
    const arr = await load(g);
    if (!arr.some(e => e.key === key)) {
        arr.push({ key, ts: Date.now() });
        await save(g, arr);
    }
}

export function makeKey(p: { dataCenter: string; world: string; district: string; ward: number; plot: number; lottery: { state: string; endsAt?: string}}) {
    return [p.dataCenter, p.world, p.district, p.ward, p.plot, p.lottery.state, p.lottery.endsAt ?? ''].join(':');
}