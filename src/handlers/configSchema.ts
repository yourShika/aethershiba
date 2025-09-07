// handlers/configSchema.ts

// Shared type definitions for the configuration module.
import { z } from 'zod';

/**
 * Description of a single configuration schema file.
 * 
 * Each config section in the bot (e.g., general, housing, etc.)
 * is represented by one ConfigSchema object. It defines:
 *  - a unique key
 *  - a Zod schema for validation
 *  - default values
 */

export interface ConfigSchema<T> {
    // Unique key under which the config section is stored.
    // (e.g., "general", "housing").
    key: string;

    // Zod schema used to validate and parse the values for this section.
    schema: z.ZodType<T>;

    // Default values for the section, applied when no explicit config is set.
    default: T;
}

/**
 * Generic structure representing guild configuration objects.
 * 
 * - Keys are section names (e.g. "general", "housing").
 * - Values are untyped here (validated separately via Zod).
 * 
 * This makes it possible to store arbitrary config sections in one object.
 */
export type GuildConfig = Record<string, unknown>;
