import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import type { ConfigSchema, GuildConfig } from './configSchema.js';
import { logger } from '../logger.js';

// This module manages configuration schemas and provides methods to load, get, and set guild configurations.
// It supports dynamic schema loading from a specified directory and merges default values with existing configurations.
const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Helper function to check if a value is an object (not null or array).
// This is used to ensure we only merge objects and not primitive values or arrays.
function isObject(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
}

// ConfigManager class handles loading, retrieving, and setting guild configurations.
// It uses a map to cache configurations and a directory to store them as JSON files.
export class ConfigManager {
    private schemas = new Map<string, ConfigSchema<any>>();
    private cache = new Map<string, GuildConfig>();
    private configDir: string;
    private schemaDir: string;

    // Constructor initializes the configuration manager with optional directories for config and schema files.
    // If not provided, it defaults to 'src/guildconfig' for configurations and 'src/lib/config/schemas' for schemas.
    // This allows for flexibility in where configurations are stored and how schemas are organized.
    constructor(options?: { configDir?: string; schemaDir?: string }) {
        this.configDir = options?.configDir || path.join(process.cwd(), 'src', 'guildconfig');
        this.schemaDir = options?.schemaDir || path.join(__dirname, 'schemas');
    }

    // Initializes the ConfigManager by loading all configuration schemas from the specified directory.
    // This method reads all files in the schema directory, imports them, and registers them in
    async loadSchemas() {
        const files = await fs.readdir(this.schemaDir).catch(() => []);
        for (const file of files) {
            if (!file.endsWith('.js') && !file.endsWith('.ts')) continue;
            const mod = await import(pathToFileURL(path.join(this.schemaDir, file)).href);
            const schema: ConfigSchema<any> = mod.default || mod.schema;
            if (schema && schema.key) {
                this.schemas.set(schema.key, schema);
                logger.info(`Loaded config schema: ${schema.key}`);
            }
        }
    }

    // Returns the file path for a specific guild's configuration.
    // This is used to read and write configuration files for each guild.
    private fileFor(gid: string) {
        return path.join(this.configDir, `${gid}_config.json`);
    }

    // Ensures the configuration directory exists.
    // This is called before reading or writing configuration files to prevent errors.
    private async ensureDir() {
        await fs.mkdir(this.configDir, { recursive: true });
    }

    // Sets the configuration for a specific guild.
    // Merges the provided config with the default values from the schema.
    async get(gid: string): Promise<GuildConfig> {
        if (this.cache.has(gid)) return this.cache.get(gid)!; 
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

    // Saves the configuration for a specific guild.
    // Validates the data against the schema and writes it to a file.
    private async save(gid: string, data: GuildConfig) {
        await this.ensureDir();
        await fs.writeFile(this.fileFor(gid), JSON.stringify(data, null, 2), 'utf-8');
        this.cache.set(gid, data);
        logger.info(`Saved config for guild ${gid}`);
    }
    
    // Retrieves the value for a specific key in the guild's configuration.
    // If the key is not found, it returns the default value from the schema.
    async set(gid: string, key: string, value: unknown) {
        const config = await this.get(gid);
        const schema = this.schemas.get(key);
        config[key] = schema ? schema.schema.parse(value) : value;
        await this.save(gid, config); 
    }

    // Gets the value for a specific key in the guild's configuration.
    // If the key is not found, it returns the default value from the schema.
    async enable(gid: string, key: string) {
        const config = await this.get(gid);
        const current = (config[key] as Record<string, unknown>) ?? {};
        current['enabled'] = true;
        await this.set(gid, key, current);
    }

    // Disables a specific feature in the guild's configuration by setting 'enabled' to false.
    // This is useful for toggling features without removing their configuration.
    async disable(gid: string, key: string) {
        const config = await this.get(gid);
        const current = (config[key] as Record<string, unknown>) ?? {};
        current['enabled'] = false;
        await this.set(gid, key, current);
    }

}

// Export an instance of ConfigManager for use in other parts of the application.
// This allows for a singleton pattern where the same instance is used throughout the application.
export const configManager = new ConfigManager();
