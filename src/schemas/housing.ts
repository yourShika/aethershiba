// schema/housing.ts
// ---------------------------------------------------
// Dependencies
// ---------------------------------------------------
import { z } from 'zod';
import type { ConfigSchema } from '../handlers/configSchema.js';


/**
 * Partial hosuing schema.
 * 
 * This schema allows optional fields and is used when
 * storing or patching housing-related configuration
 */
export const housingPartial = z.object({
    enabled: z.boolean(),
    dataCenter: z.string().min(1).optional(),                   // Datacenter Name
    worlds: z.array(z.string().min(1)).optional(),              // List of Worlds
    districts: z.array(z.string()).optional(),                  // List of Districts
    channelId: z.string().min(1).optional(),                    // Channel where listings go
    timesPerDay: z.number().int().min(1).max(3).optional(),     // Number of Resets
    pingUserId: z.string().min(1).optional(),                   // UserID to ping
    pingRoleId: z.string().min(1).optional(),                   // RoleID to ping
});

/**
 * Schema used for manually starting housing listings.
 * 
 * This ensures the bare minimum is present (enabled, datacenter,
 * at least one world/district, and a channel).
 * Fields like 'timesPerDay' are intentionally omitted here.
 */
export const HousingStart = z.object({
    enabled: z.literal(true),                       // Must be explicitly enable
    dataCenter: z.string().min(1),                  // Required datacenter
    worlds: z.array(z.string().min(1)).nonempty(),  // At least one world required
    districts: z.array(z.string()).nonempty(),      // At least one district required
    channelId: z.string().min(1),                   // Channel required
    pingUserId: z.string().min(1).optional(),
    pingRoleId: z.string().min(1).optional(),
});

/**
 * Schema for required housing configuration.
 * 
 * Used when the scheduler is active, requiring additional
 * settings such as 'timesPerDay'.
 */
export const HousingRequired = z.object({
    enabled: z.literal(true),                       // Must be enabled
    dataCenter: z.string().min(1),                  // Required datacenter
    worlds: z.array(z.string().min(1)).nonempty(),  // At least one world required
    districts: z.array(z.string()).nonempty(),      // At least one district required
    channelId: z.string().min(1),                   // Channel required
    timesPerDay: z.number().int().min(1).max(3),    // Required when scheduling
    pingUserId: z.string().min(1).optional(),
    pingRoleId: z.string().min(1).optional(),
});

// ---------------------------------------------------
// Type Inference
// ---------------------------------------------------

/**
 * Type definition for housing configuration.
 * Derived automatically from the 'housingPartial' schema.
 */
type HosuingT = z.infer<typeof housingPartial>;

// ---------------------------------------------------
// Config Schema Wrapper
// ---------------------------------------------------

/**
 * Complete configuration schema for housing settings.
 * 
 * This version is registered with the config handler and
 * defines defaults plus validation rules.
 */
const schema: ConfigSchema<HosuingT> = {
    key: 'housing',             // Unique section key
    schema: housingPartial,     // Validation schema
    default: {} as HosuingT,    // Empty defaults (all optional until set)
};

// Export the complete housing configuration schema.
export default schema;
