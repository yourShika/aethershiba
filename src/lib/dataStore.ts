import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

import { logger } from './logger.js';

const DEFAULT_DATA_DIR = path.join(process.cwd(), 'data');
const LEGACY_DATA_DIR = path.join(process.cwd(), 'src', 'json');

export function dataFile(...segments: string[]) {
  const root = process.env.AETHERSHIBA_DATA_DIR?.trim() || DEFAULT_DATA_DIR;
  return path.join(root, ...segments);
}

export function legacyDataFile(...segments: string[]) {
  return path.join(LEGACY_DATA_DIR, ...segments);
}

async function ensureParent(filePath: string) {
  await mkdir(path.dirname(filePath), { recursive: true });
}

export async function readJson<T>(filePath: string, fallback: T): Promise<T> {
  try {
    const raw = await readFile(filePath, 'utf8');
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

export async function readJsonWithLegacy<T>(
  filePath: string,
  legacyPath: string,
  fallback: T,
): Promise<T> {
  const fromPrimary = await readJson<T | null>(filePath, null);
  if (fromPrimary !== null) return fromPrimary;

  const fromLegacy = await readJson<T | null>(legacyPath, null);
  return fromLegacy ?? fallback;
}

export async function writeJson<T>(filePath: string, data: T): Promise<void> {
  await ensureParent(filePath);
  await writeFile(filePath, JSON.stringify(data, null, 2), 'utf8');
}

export async function writeJsonSafe<T>(filePath: string, data: T, context: string): Promise<boolean> {
  try {
    await writeJson(filePath, data);
    return true;
  } catch (error) {
    logger.error(`${context}: failed to write ${filePath}`, error);
    return false;
  }
}
