// schema/general.ts

// ---------------------------------------------------
// Schema describing basic guild-wide options such as command prefix.
// Tihs schmea is validated using Zod and plugged into the config handler.
// ---------------------------------------------------

import { z } from 'zod';
import type { ConfigSchema } from '../handlers/configSchema.js';

// Define the schema for "general" config section
const schema: ConfigSchema<{ prefix: string }> = {
    // Unique identifier for this configuration section.
    // Used by the config system to distinguisch different schemas.
    key: 'general',
    
    // Zod schema validating the supported properties.
    // Currently only "prefix" is supported, which must be a string.
    schema: z.object({
        // Prefix used for potential text based commands. (e.g., "!help").
        prefix: z.string(),
    }),

    // Default values applied when a guild has no explicit configuration.
    // Ensures that commands work even if nothing is configured yet.
    default: {
        prefix: '!', // Default command prefix
    },
};

// Export schema so it can be registered by the config system
export default schema;
