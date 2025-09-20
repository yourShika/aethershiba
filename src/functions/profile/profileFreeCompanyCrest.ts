import { AttachmentBuilder } from "discord.js";
import { createHash } from "node:crypto";
import sharp from 'sharp';

import { logger } from "../../lib/logger";

const USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/127.0.0.0 Safari/537.36';
const LODESTONE_ORIGIN = 'https://eu.finalfantasyxiv.com';
const LODESTONE_REFERER = `${LODESTONE_ORIGIN}/lodestone/`;
const CREST_FETCH_HEADERS: Record<string, string> = {
    'user-agent': USER_AGENT,
    accept: 'image/avif,image/webp,image/apng,image/*,*/*;q=0.8',
    'accept-language': 'en-US,en;q=0.9',
    'accept-encoding': 'identity',
    origin: LODESTONE_ORIGIN,
    referer: LODESTONE_REFERER,
    pragma: 'no-cache',
    'cache-control': 'no-cache',
    'sec-fetch-mode': 'no-cors',
    'sec-fetch-site': 'same-site',
    'sec-fetch-dest': 'image',
};

const bufferCache = new Map<string, Buffer>();
const inFlight = new Map<string, Promise<Buffer | null>>();

type SharpOverlayOptions = {
    input: Buffer;
    left?: number;
    top?: number;
};

const sanitizeLayers = (layers: readonly string[]): string[] => layers
    .map(layer => (typeof layer === 'string' ? layer.trim() : ''))
    .filter((layer): layer is string => layer.length > 0);

const getCacheKey = (layers: readonly string[]) => createHash('sha1').update(layers.join('|')).digest('hex');

const isLikelyImageContentType = (contentType?: string | null): boolean => {
    if (!contentType) return true;
    const normalized = contentType.toLowerCase();
    if (normalized.startsWith('image/')) return true;
    if (normalized.includes('octet-stream')) return true;
    return false;
};

const normalizeProtocolRelativeUrl = (value: string): string => {
    if (value.startsWith('//')) return `https:${value}`;
    return value;
};

const ensureHttpsUrl = (value: string): string => {
    if (value.startsWith('http://')) return `https://${value.slice('http://'.length)}`;
    return value;
};

const appendLdsPrefixVariant = (url: URL): string | null => {
    if (!url.pathname.startsWith('/lds/')) {
        const prefixed = new URL(url.toString());
        prefixed.pathname = `/lds${prefixed.pathname.startsWith('/') ? prefixed.pathname : `/${prefixed.pathname}`}`;
        return prefixed.toString();
    }
    return null;
};

const createCrestUrlVariants = (rawUrl: string): string[] => {
    const variants = new Set<string>();
    const trimmed = rawUrl.trim();
    if (!trimmed) return [];

    const normalized = ensureHttpsUrl(normalizeProtocolRelativeUrl(trimmed));
    try {
        const url = (() => {
            try {
                return new URL(normalized);
            } catch {
                return new URL(normalized, LODESTONE_ORIGIN);
            }
        })();
        variants.add(url.toString());

        const alternativeHosts: string[] = [];
        if (url.hostname === 'img2.finalfantasyxiv.com') {
            alternativeHosts.push('img.finalfantasyxiv.com', 'lds-img.finalfantasyxiv.com');
        } else if (url.hostname === 'img.finalfantasyxiv.com') {
            alternativeHosts.push('img2.finalfantasyxiv.com', 'lds-img.finalfantasyxiv.com');
        } else if (url.hostname === 'lds-img.finalfantasyxiv.com') {
            alternativeHosts.push('img.finalfantasyxiv.com', 'img2.finalfantasyxiv.com');
        }

        for (const host of alternativeHosts) {
            try {
                const altUrl = new URL(url.toString());
                altUrl.hostname = host;
                variants.add(altUrl.toString());
                const prefixed = appendLdsPrefixVariant(altUrl);
                if (prefixed) variants.add(prefixed);
            } catch {
                // ignore individual alternate host failures
            }
        }

        const prefixed = appendLdsPrefixVariant(url);
        if (prefixed) variants.add(prefixed);
    } catch {
        // ignore invalid URLs
    }

    return Array.from(variants);
};

async function fetchLayer(url: string): Promise<Buffer | null> {
    const candidates = createCrestUrlVariants(url);
    for (const candidate of candidates) {
        try {
            const res = await fetch(candidate, { headers: CREST_FETCH_HEADERS });
            if (!res.ok) {
                logger.debug(`Failed to fetch crest layer ${candidate}: ${res.status} ${res.statusText}`);
                continue;
            }

            const contentType = res.headers.get('content-type');
            if (!isLikelyImageContentType(contentType)) {
                logger.debug(`Skipping crest layer ${candidate} due to unsupported content-type: ${contentType}`);
                continue;
            }

            const arrayBuffer = await res.arrayBuffer();
            if (!arrayBuffer.byteLength) {
                logger.debug(`Received empty crest layer ${candidate}`);
                continue;
            }
            return Buffer.from(arrayBuffer);
        } catch (error) {
            logger.debug(`Error fetching crest layer ${candidate}`, error);
        }
    }

    return null;
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

    const composites: SharpOverlayOptions[] = [];

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