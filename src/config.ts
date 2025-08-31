// src/config.ts

export const botConfig = {
    presence: {
        status: 'online' as const, // 'online' | 'idle' | 'dnd' | 'invisible'
        activities: [
            {
                name: 'FINAL FANTASY XIV Online',
                type: 0, // 0 = Playing, 2 = Listening, 3 = Watching, 5 = Competing
            },
        ],
    },
};
