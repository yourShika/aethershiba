// Configuration management system. It dynamically loads schema
// definitions and persists guild specific configuration on disk.
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import type { ConfigSchema, GuildConfig } from './types.js';
import { logger } from '../logger.js';

// Directory of this module, used to locate default schemas.
const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Utility to check for plain objects. Used by the merge helper below.
function isObject(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
}

// Recursively merge two objects. Values from `updates` overwrite those in `base`.
function mergeDeep(base: any, updates: any): any {
    const result: any = { ...base };
    for (const key of Object.keys(updates)) {
        const baseVal = result[key];
        const updateVal = updates[key];
        if (isObject(baseVal) && isObject(updateVal)) {
            result[key] = mergeDeep(baseVal, updateVal);
        } else {
            result[key] = updateVal;
        }
    }
    return result;
}

export class ConfigManager {
    // Registered configuration schemas, keyed by their unique name.
    private schemas = new Map<string, ConfigSchema<any>>();
    // Cached guild configuration to avoid hitting the filesystem repeatedly.
    private cache = new Map<string, GuildConfig>();
    private configDir: string;
    private schemaDir: string;

    constructor(options?: { configDir?: string; schemaDir?: string }) {
        // Directory where guild configs will be stored.
        this.configDir = options?.configDir || path.join(process.cwd(), 'config');
        // Directory containing schema definition files.
        this.schemaDir = options?.schemaDir || path.join(__dirname, 'schemas');
    }

    // Dynamically load every schema module found in the schema directory.
    async loadSchemas() {
        const files = await fs.readdir(this.schemaDir);
        for (const file of files) {
            if (!file.endsWith('.js') && !file.endsWith('.ts')) continue;
            const fileUrl = pathToFileURL(path.join(this.schemaDir, file)).href;
            const mod = await import(fileUrl);
            const schema: ConfigSchema<any> = mod.default || mod.schema;
            if (schema && schema.key) {
                this.schemas.set(schema.key, schema);
                logger.info(`Loaded config schema: ${schema.key}`);
            }
        }
    }

    // Ensure the configuration directory exists.
    private async ensureDir() {
        await fs.mkdir(this.configDir, { recursive: true });
    }

    // Retrieve or create a guild's configuration object.
    async get(guildId: string): Promise<GuildConfig> {
        if (this.cache.has(guildId)) {
            return this.cache.get(guildId)!;
        }
        await this.ensureDir();
        const filePath = path.join(this.configDir, `${guildId}.json`);
        let data: GuildConfig = {};
        try {
            const raw = await fs.readFile(filePath, 'utf8');
            data = JSON.parse(raw);
        } catch {
            // file does not exist yet
        }
        for (const [key, schema] of this.schemas) {
            const current = data[key] as any;
            const merged = mergeDeep(schema.default, isObject(current) ? current : {});
            try {
                // Validate and fill defaults via the schema
                data[key] = schema.schema.parse(merged);
            } catch {
                // Fallback to the default if validation fails
                data[key] = schema.default;
            }
        }
        await fs.writeFile(filePath, JSON.stringify(data, null, 2), 'utf8');
        this.cache.set(guildId, data);
        return data;
    }

    // Update and persist a single config key for a guild.
    async set(guildId: string, key: string, value: unknown) {
        const config = await this.get(guildId);
        config[key] = value;
        await fs.writeFile(path.join(this.configDir, `${guildId}.json`), JSON.stringify(config, null, 2), 'utf8');
        this.cache.set(guildId, config);
    }
}

// Default instance used by the rest of the application.
export const configManager = new ConfigManager();
