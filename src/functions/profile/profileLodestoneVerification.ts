// functions/profile/profileLodestoneVerification.ts

// -------------------------------------------------
// Dependecies
// -------------------------------------------------

import { randomBytes } from "node:crypto";

const TOKEN_LIFETIME = 60 * 60 * 1000; // 60 Minutes

interface TokenEntry {
    token: string;
    lodestoneUrl: string;
    lodestoneId: string;
    expires: number;
}

const tokens = new Map<string, TokenEntry>();

export function generateToken(userId: string, lodestoneUrl: string, lodestoneId: string) {
    const token = randomBytes(4).toString('hex');
    tokens.set(userId, { token, lodestoneUrl, lodestoneId, expires: Date.now() + TOKEN_LIFETIME });
    return token;
}

export function clearToken(userId: string) {
    tokens.delete(userId);
}

export function getToken(userId: string): string | null {
    const entry = tokens.get(userId);
    return entry ? entry.token : null;
}

async function fetchComment(url: string): Promise<string | null> {
    try {
        const res = await fetch(url, { headers: { 'user-agent': 'AetherShiba' } });
        if (!res.ok) return null;
        const html = await res.text();
        const m = html.match(/character_selfintroduction\">\s*<p>(.*?)<\/p>/s);
        if (!m) return null;
        const text = m[1]!
            .replace(/<br\s*\/?>/g, '\n')
            .replace(/&lt;/g, '<')
            .replace(/&gt;/g, '>')
            .replace(/&amp;/g, '&')
            .trim();
        return text;
    } catch {
        return null;
    }
}

export async function verifyToken(userId:string) {
    const entry = tokens.get(userId);

    if (!entry) return null;

    if (entry.expires < Date.now()) {
        tokens.delete(userId);
        return null;
    }

    const comment = await fetchComment(entry.lodestoneUrl);
    if (!comment) return null;

    if (!comment.includes(entry.token)) return null;

    tokens.delete(userId);
    return { lodestoneUrl: entry.lodestoneUrl, lodestoneId: entry.lodestoneId };
}

export function extractLodestoneId(url: string): string | null {
    const m = url.match(/lodestone\/character\/(\d+)\/?/);
    return m ? m[1]! : null;
}