// functions/housing/housingScheduleStore.ts

import { readFile, writeFile, mkdir } from 'node:fs/promises';
import path from 'node:path';

export type SlotConfig = {
  timezone?: string;
  x1?: string;
  x2?: string;
  x3?: string;
};

const scheduleFile = path.join(process.cwd(), 'src', 'json', 'housing_schedule.json');

async function ensureDir() {
  await mkdir(path.dirname(scheduleFile), { recursive: true });
}

export async function loadSchedules(): Promise<Record<string, SlotConfig>> {
  try {
    const raw = await readFile(scheduleFile, 'utf8');
    const data = JSON.parse(raw) as Record<string, SlotConfig>;
    return data ?? {};
  } catch {
    return {};
  }
}

export async function saveSchedules(data: Record<string, SlotConfig>) {
  await ensureDir();
  await writeFile(scheduleFile, JSON.stringify(data, null, 2), 'utf8');
}

export async function clearGuildSchedule(guildId: string) {
  const schedules = await loadSchedules();
  if (schedules[guildId]) {
    delete schedules[guildId];
    await saveSchedules(schedules);
  }
}
