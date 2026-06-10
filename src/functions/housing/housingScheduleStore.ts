// functions/housing/housingScheduleStore.ts

import { dataFile, legacyDataFile, readJsonWithLegacy, writeJson } from '../../lib/dataStore.js';

export type SlotConfig = {
  timezone?: string;
  x1?: string;
  x2?: string;
  x3?: string;
};

const scheduleFile = dataFile('housing_schedule.json');
const legacyScheduleFile = legacyDataFile('housing_schedule.json');

export async function loadSchedules(): Promise<Record<string, SlotConfig>> {
  return readJsonWithLegacy(scheduleFile, legacyScheduleFile, {});
}

export async function saveSchedules(data: Record<string, SlotConfig>) {
  await writeJson(scheduleFile, data);
}

export async function clearGuildSchedule(guildId: string) {
  const schedules = await loadSchedules();
  if (schedules[guildId]) {
    delete schedules[guildId];
    await saveSchedules(schedules);
  }
}
