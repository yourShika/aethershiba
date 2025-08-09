// Shared type definitions for the configuration module.
import { z } from 'zod';

// Description of a single configuration schema file.
export interface ConfigSchema<T> {
    // Unique key under which the config section is stored.
    key: string;
    // Zod schema used to validate and parse values.
    schema: z.ZodType<T>;
    // Default values for the section.
    default: T;
}

// Generic structure representing guild configuration objects.
export type GuildConfig = Record<string, unknown>;
