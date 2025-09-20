import { AttachmentBuilder } from "discord.js";
import { createHash } from "node:crypto";
import sharp, { type OverlayOptions } from 'sharp';

import { logger } from "../../lib/logger";

const USER_AGENT = 'Mozilla/5.0 (compatible; AetherShiba/1.0)';

const bufferCache = new Map<string, Buffer>();
const inFlight = new Map<string, Promise<Buffer | null>>();

const sanitizeLayers = (layers: readonly string[]): string[] => layers
    .map(layer => (typeof layer === 'string' ? layer.trim() : ''))
    .filter((layer): layer is string => layer.length > 0);

const getCacheKey = (layers: readonly string[]) => createHash('sha1').update(layers.join('|')).digest('hex');

async function fetchLayer(url: string): Promise<Buffer | null> {
    try {
        const res = await fetch(url, { headers: { 'user-agent': USER_AGENT }});
        if (!res.ok) {
            logger.debug(`Failed to fetch crest layer ${url}: ${res.status} ${res.statusText}`);
            return null;
        }

        const arrayBuffer = await res.arrayBuffer();
        return Buffer.from(arrayBuffer);
    } catch (error) {
        logger.debug(`Error fetching crest layer ${url}`, error);
        return null;
    }
}

async function readMetadata(buffer: Buffer): Promise<{ width?: number; height?: number }> {
    try {
        const metadata = await sharp(buffer).metadata();
        return { width: metadata.width ?? undefined, height: metadata.height ?? undefined };
    } catch (error) {
        logger.debug('Failed to read crest layer metadata', error);
        return {};
    }
}

const normalizeOffset = (baseSize?: number, overlaySize?: number): number => {
    if (!Number.isFinite(baseSize) || !baseSize || baseSize <= 0) return 0;
    if (!Number.isFinite(overlaySize) || !overlaySize || overlaySize <= 0) return 0;
    const offset = Math.floor((baseSize - overlaySize) / 2);
    if (!Number.isFinite(offset)) return 0;
    return offset > 0 ? offset : 0;
};

async function composeCrest(layers: string[]): Promise<Buffer | null> {
    const buffers = await Promise.all(layers.map(fetchLayer));

    const pairs = buffers
        .map((buffer, index) => ({ buffer, index }))
        .filter((pair): pair is { buffer: Buffer; index: number } => Buffer.isBuffer(pair.buffer) && pair.buffer.length > 0);

    if (!pairs.length) return null;

    const basePair = pairs.find(pair => pair.index === 0) ?? pairs[0];
    if (!basePair) return null;

    const baseBuffer = basePair.buffer;

    const overlayPairs = pairs
        .filter(pair => pair.index !== basePair.index)
        .sort((a, b) => a.index - b.index);

    const baseMeta = await readMetadata(baseBuffer);
    const baseWidth = baseMeta.width;
    const baseHeight = baseMeta.height;

    const composites: OverlayOptions[] = [];

    for (const pair of overlayPairs) {
        const overlayMeta = await readMetadata(pair.buffer);
        const overlayWidth = overlayMeta.width ?? baseWidth;
        const overlayHeight = overlayMeta.height ?? baseHeight;
        const left = normalizeOffset(baseWidth, overlayWidth);
        const top = normalizeOffset(baseHeight, overlayHeight);

        composites.push({ input: pair.buffer, left, top });
    }

    let pipeline = sharp(baseBuffer).ensureAlpha();
    if (composites.length) {
        pipeline = pipeline.composite(composites);
    }

    try {
        return await pipeline.png().toBuffer();
    } catch (error) {
        logger.debug('Failed to compose crest image', error);
        return null;
    }
}

async function getCrestBuffer(layers: string[], cacheKey: string): Promise<Buffer | null> {
    const cached = bufferCache.get(cacheKey);
    if (cached) return cached;

    let inflight = inFlight.get(cacheKey);
    if (!inflight) {
        inflight = composeCrest(layers);
        inFlight.set(cacheKey, inflight);
    }

    try {
        const buffer = await inflight;
        if (buffer) {
            bufferCache.set(cacheKey, buffer);
        }
        return buffer ?? null;
    } catch (error) {
        logger.debug('Failed to compose crest buffer', error);
        return null;
    } finally {
        inFlight.delete(cacheKey);
    }
}

export async function buildFreeCompanyCrestAttachment(layers: readonly string[]): Promise<AttachmentBuilder | null> {
    const validLayers = sanitizeLayers(layers);
    if (!validLayers.length) return null;

    const cacheKey = getCacheKey(validLayers);
    const buffer = await getCrestBuffer(validLayers, cacheKey);
    if (!buffer) return null;

    const name = `free-company-crest-${cacheKey}.png`;
    return new AttachmentBuilder(Buffer.from(buffer), { name });
}