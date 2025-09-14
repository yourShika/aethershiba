// functions/profile/profileLodestoneVerification.ts

// -------------------------------------------------
// Dependecies
// -------------------------------------------------

import { randomBytes } from "node:crypto";
import { logger } from "../../lib/logger";

export const TOKEN_LIFETIME = 60 * 60 * 1000; // 60 Minutes

interface TokenEntry {
    token: string;
    lodestoneUrl: string;
    lodestoneId: string;
    created: number;
    timeout: NodeJS.Timeout;
}

const tokens = new Map<string, TokenEntry>();

export function generateToken(userId: string, lodestoneUrl: string, lodestoneId: string) {
    const token = randomBytes(4).toString('hex');
    const created = Date.now();
    const timeout = setTimeout(() => {
        tokens.delete(userId);
        logger.debug(`Generated token for ${userId} targeting ${lodestoneId}`);
    }, TOKEN_LIFETIME);
    tokens.set(userId, { token, lodestoneUrl, lodestoneId, created, timeout });
    return token;
}

export function clearToken(userId: string) {
    const entry = tokens.get(userId);
    if (entry) clearTimeout(entry.timeout);
    tokens.delete(userId);
}

export function getToken(userId: string): string | null {
    const entry = tokens.get(userId);
    return entry ? entry.token : null;
}

async function fetchComment(url: string): Promise<string | null> {
    logger.debug(`Fetching Lodestone profile: ${url}`);
    try {
        const res = await fetch(url, { headers: { 'user-agent': 'AetherShiba' } });
        if (!res.ok) {
            logger.debug(`Failed to fetch profile ${url}: ${res.status} ${res.statusText}`);
            return null;
        };
        const html = await res.text();
        const m = html.match(/<div class="character__selfintroduction"[^>]*>([\s\S]*?)<\/div>/);
        if (!m) {
            logger.debug(`Self introduction block not found for ${url}`);
            return null;
        };
        const text = m[1]!
            .replace(/<br\s*\/?>/g, '\n')
            .replace(/&lt;/g, '<')
            .replace(/&gt;/g, '>')
            .replace(/&amp;/g, '&')
            .trim();
        logger.debug(`Fetches comment text: ${text}`);
        return text;
    } catch (error) {
        logger.debug(`Error fetching profile ${url}:`, error);
        return null;
    }
}

export async function verifyToken(userId: string) {
    const entry = tokens.get(userId);

    if (!entry) {
        logger.debug(`No Token entry for ${userId}`);
        return null;
    }

    if (entry.created + TOKEN_LIFETIME < Date.now()) {
        logger.debug(`Token for ${userId} expired`);
        clearTimeout(entry.timeout);
        tokens.delete(userId);
        return null;
    }

    const comment = await fetchComment(entry.lodestoneUrl);
    if (!comment) {
        logger.debug(`Could not retrieve comment for ${entry.lodestoneUrl}`);    
        return null;
    }

    if (!comment.includes(entry.token)) {
        logger.debug(`Token ${entry.token} not found in comment: ${comment}`);
        return null;  
    }

    clearTimeout(entry.timeout);
    tokens.delete(userId);
    logger.debug(`Verified Lodestone profile ${entry.lodestoneUrl} for user ${userId}`);
    return { lodestoneUrl: entry.lodestoneUrl, lodestoneId: entry.lodestoneId };
}

export function extractLodestoneId(url: string): string | null {
    const m = url.match(/lodestone\/character\/(\d+)\/?/);
    return m ? m[1]! : null;
}