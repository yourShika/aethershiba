import { z } from 'zod';
import type { ConfigSchema } from '../types.js';

const schema: ConfigSchema<{ prefix: string }> = {
    key: 'general',
    schema: z.object({
        prefix: z.string(),
    }),
    default: {
        prefix: '!',
    },
};

export default schema;
