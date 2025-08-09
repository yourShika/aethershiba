import { z } from 'zod';

export interface ConfigSchema<T> {
    key: string;
    schema: z.ZodType<T>;
    default: T;
}

export type GuildConfig = Record<string, unknown>;
