// const/housing/housing.ts

// ---------------------------------------------------
// Datacenters
// ---------------------------------------------------
// Complete list of supported FFXIV datacenters.
// `as const` keeps literal types (e.g., 'Light' instead of string),
// which os useful for type-safe select menus and schema validation.

export const DATACENTERS= [
    'Light',        // EU
    'Chaos',        // EU
    'Shadow', 
    'Aether',       // NA
    'Primal',       // NA
    'Crystal',      // NA
    'Dynamis', 
    'Materia', 
    'Elemental',    // JP
    'Gaia',         // JP
    'Mana',         // JP
    'Meteor'
] as const;

// ---------------------------------------------------
// District select options
// ---------------------------------------------------
// Options for the Discord select menu when configuring housing.
// `label` is shown to users, `value` is stored/compared in config & logic.
export const DISTRICT_OPTIONS = [
    { label: 'Mist', value: 'Mist' },
    { label: 'The Lavender Beds', value: 'The Lavender Beds' },
    { label: 'The Goblet', value: 'The Goblet' },
    { label: 'Shirogane', value: 'Shirogane' },
    { label: 'Empyreum', value: 'Empyreum' },
];

// ---------------------------------------------------
// District -> image filename mapping
// ---------------------------------------------------
// Used by the embed builder to attach a representative image per district.
// The actual file path resolution and attachment creation happen in the
// embed helper; here we only map names to filenames.
export const DISTRICT_IMAGES: Record<string, string> = {
    Mist: 'mist_district_discord.png',
    'The Lavender Beds': 'lavender_beds_discord.png',
    'The Goblet': 'the_goblet_discord.png',
    Shirogane: 'shirogane_discord.png',
    Empyreum: 'empyreum_discord.png',
};