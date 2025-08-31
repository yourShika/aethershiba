export const DATACENTERS = ['Light', 'Chaos', 'Shadow', 'Aether', 'Primal', 'Crystal', 'Dynamis', 'Materia', 'Elemental', 'Gaia', 'Mana', 'Meteor'] as const;

export const DISTRICT_OPTIONS = [
    { label: 'Mist', value: 'Mist' },
    { label: 'The Lavender Beds', value: 'The Lavender Beds' },
    { label: 'The Goblet', value: 'The Goblet' },
    { label: 'Shirogane', value: 'Shirogane' },
    { label: 'Empyreum', value: 'Empyreum' },
];

// Mapping of housing districts to their corresponding image filenames.
// The actual path resolution and attachment handling is performed when
// building the embed for a specific plot.
export const DISTRICT_IMAGES: Record<string, string> = {
    Mist: 'mist_district_discord.png',
    'The Lavender Beds': 'lavender_beds_discord.png',
    'The Goblet': 'the_goblet_discord.png',
    Shirogane: 'shirogane_discord.png',
    Empyreum: 'empyreum_discord.png',
};