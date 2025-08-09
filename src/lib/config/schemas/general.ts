// Schema describing basic guild-wide options such as command prefix.
import { z } from 'zod';
import type { ConfigSchema } from '../types.js';

const schema: ConfigSchema<{ prefix: string }> = {
    // Unique identifier for this configuration section.
    key: 'general',
    // Zod schema validating the supported properties.
    schema: z.object({
        // Prefix used for potential text based commands.
        prefix: z.string(),
    }),
    // Default values applied when a guild has no explicit configuration.
    default: {
        prefix: '!',
    },
};

export default schema;
