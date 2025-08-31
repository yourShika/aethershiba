import { z } from 'zod';
import type { ConfigSchema } from '../handlers/configSchema.js';

// Schema describing housing-related configuration options.
// This includes data center, world, districts, and notification settings.
export const housingPartial = z.object({
    enabled: z.boolean(),
    dataCenter: z.string().min(1).optional(),
    worlds: z.array(z.string().min(1)).optional(),
    districts: z.array(z.string()).optional(),
    channelId: z.string().min(1).optional(),
    timesPerDay: z.number().int().min(1).max(8).optional(),
    intervalMinutes: z.number().int().min(180).max(1440).optional(),
    pingUserId: z.string().min(1).optional(),
    pingRoleId: z.string().min(1).optional(),
});

// Minimal schema required for posting housing listings manually.
// Scheduler-specific fields like timesPerDay/intervalMinutes are omitted.
export const HousingStart = z.object({
    enabled: z.literal(true),
    dataCenter: z.string().min(1),
    worlds: z.array(z.string().min(1)).nonempty(),
    districts: z.array(z.string()).nonempty(),
    channelId: z.string().min(1),
});

// Schema for required housing configuration options.
// This is used when the housing feature is enabled.
export const HousingRequired = z.object({
    enabled: z.literal(true),
    dataCenter: z.string().min(1),
    worlds: z.array(z.string().min(1)).nonempty(),
    districts: z.array(z.string()).nonempty(),
    channelId: z.string().min(1),
    timesPerDay: z.number().int().min(1).max(8),
    intervalMinutes: z.number().int().min(180).max(1440),
    pingUserId: z.string().min(1).optional(),
    pingRoleId: z.string().min(1).optional(),
});

// Type definition for the housing configuration schema.
// This is used to infer the type of the housing configuration.
type HosuingT = z.infer<typeof housingPartial>;

// Complete configuration schema for housing settings.
// This includes both optional and required properties.
const schema: ConfigSchema<HosuingT> = {
    key: 'housing',
    schema: housingPartial,
    default: {} as HosuingT,
};

// Export the complete housing configuration schema.
export default schema;
