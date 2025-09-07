// handlers/configHandler.ts

import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import type { ConfigSchema, GuildConfig } from './configSchema.js';
import { logger } from '../lib/logger.js';

// ---------------------------------------------------
// Configuration Manager
// ---------------------------------------------------
// This module manages guild configuration schemas and provides methods
// to load, get, set, and update guild-specific configuration files.
//
// Features:
//  - Dynamic schema loading from a schema directory.
//  - Configurations cached in memory for performance.
//  - Validations against Zod schemas.
//  - JSON file storage per guild.
// ---------------------------------------------------

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/**
 * Helper function to check if a value is a plain object.
 * Ensures we only merge objects (not arrays or primitives). 
 */
function isObject(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * ConfigManager handles:
 *  - Loading schema definitions dynamically.
 *  - Retrieving configs for guilds.
 *  - Validating configs against schemas.
 *  - Saving configs to disk as JSON.
 *  - Providing helpers for enabling/disabling features.
 */
export class ConfigManager {
    private schemas = new Map<string, ConfigSchema<any>>(); // Registered schemas by key
    private cache = new Map<string, GuildConfig>();         // In-memory cache of configs
    private configDir: string;                              // Where guild config files are stored
    private schemaDir: string;                              // Where schema files are stored


    /**
     * @param options optional custom directories
     *  - configDir: where to store guild configs
     *  - schemaDir: where to load schema modules from 
     */
    constructor(options?: { configDir?: string; schemaDir?: string }) {
        this.configDir = options?.configDir || path.join(process.cwd(), 'src', 'guildconfig');
        this.schemaDir = options?.schemaDir || path.join(__dirname, 'schemas');
    }

    /**
     * Loads all schemas from schemaDir.
     * Each schema file must export a 'ConfigSchema' as default or named 'schema'.
     */
    async loadSchemas() {
        const files = await fs.readdir(this.schemaDir).catch(() => []);
        for (const file of files) {
            if (!file.endsWith('.js') && !file.endsWith('.ts')) continue;

            // Dynamic import of schema file
            const mod = await import(pathToFileURL(path.join(this.schemaDir, file)).href);
            const schema: ConfigSchema<any> = mod.default || mod.schema;

            // when schema and schemaKey are correct -> Load
            if (schema && schema.key) {
                this.schemas.set(schema.key, schema);
                logger.info(`Loaded config schema: ${schema.key}`);
            }
        }
    }

    // Get the filesystem path to the config file for a given guild.
    private fileFor(gid: string) {
        return path.join(this.configDir, `${gid}_config.json`);
    }

    // Ensure that the config directory exists (creates it if missing).
    private async ensureDir() {
        await fs.mkdir(this.configDir, { recursive: true });
    }

    /**
     * Retrieve the full configuration object for a guild.
     *  - Loads from cache if present.
     *  - Falls back to reading the JSON file from disk.
     *  - If file is missing/corrupt, returns emtpy object.
     */
    async get(gid: string): Promise<GuildConfig> {
        if (this.cache.has(gid)) return this.cache.get(gid)!; 

        // get Data in the variable
        await this.ensureDir();
        let data: GuildConfig = {};
        
        try {
            const raw = await fs.readFile(this.fileFor(gid), 'utf-8');
            data = JSON.parse(raw);
            if (!isObject(data)) data = {};
        } catch (err) {
            logger.warn(`Failed to read config for guild ${gid}: ${err}`);
        }

        this.cache.set(gid, data);
        return data;
    }

    /**
     * Save the configuration for a guild to disk.
     * Also updates the in-memory cache.
     * 
     * @param gid - Discord guildID 
     * @param data - Config Data
     */
    private async save(gid: string, data: GuildConfig) {
        // Get Data and save to the file
        await this.ensureDir();
        await fs.writeFile(this.fileFor(gid), JSON.stringify(data, null, 2), 'utf-8');
        this.cache.set(gid, data);
        logger.info(`Saved config for guild ${gid}`);
    }
    
    /**
     * Set or replace a specific config section for a guild.
     *  - If a schema exists, validates the value with Zod.
     *  - Otherwise stores raw value.
     * @param gid - Discord guildID
     * @param key - Schema Key
     * @param value - Value to update
     */
    async set(gid: string, key: string, value: unknown) {
        const config = await this.get(gid);
        const schema = this.schemas.get(key);
        config[key] = schema ? schema.schema.parse(value) : value;
        await this.save(gid, config);
    }

    /**
     * Retrieves a specific configuration section for the guild.
     * Returns typed value or undefined if not set.
     */
    async getKey<T>(gid: string, key: string): Promise<T | undefined> {
        const cfg = await this.get(gid);
        return cfg[key] as T | undefined;
    }

    /**
     * Update (merge) part of a configuration section.
     *  - Performs shallow merge only.
     *  - Validated again on save.
     */
    async update(gid: string, key: string, patch: Record<string, unknown>) {
        const current = (await this.getKey<Record<string, unknown>>(gid, key)) ?? {};
        const next = { ...current, ...patch };
        await this.set(gid, key, next);
    }

    /**
     * Enable a feature by setting 'enabled = true' in its config section.
     * @param gid - Discord guildID
     * @param key - Schema key
     */
    async enable(gid: string, key: string) {
        const config = await this.get(gid);
        const current = (config[key] as Record<string, unknown>) ?? {};
        current['enabled'] = true;
        await this.set(gid, key, current);
    }

    /**
     * Disable a feature by setting 'enabled = false' in its config section.
     * Keeps the config intact but disables functionality.
     * @param gid - Discord guildID
     * @param key - Schema Key
     */
    async disable(gid: string, key: string) {
        const config = await this.get(gid);
        const current = (config[key] as Record<string, unknown>) ?? {};
        current['enabled'] = false;
        await this.set(gid, key, current);
    }

}

// ---------------------------------------------------
// Singleton Export
// ---------------------------------------------------
// A single instance is exported so that configuration
// is managed consistently across the whole application.
// ---------------------------------------------------

export const configManager = new ConfigManager();
