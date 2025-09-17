// commands/profile/profile.ts

// -------------------------------------------------
// Dependecies
// -------------------------------------------------

import {
    SlashCommandBuilder,
    MessageFlags,
    type ChatInputCommandInteraction,
    type SlashCommandSubcommandBuilder,
    type AutocompleteInteraction
} from 'discord.js';
import type { Command } from '../../handlers/commandHandler';

// Command Import
import link from './profileLink';
import me from './profileMe';
import inspect from './profileSearch';
import search from './profileInspect';
import stats from './profileStats';
import unlink from './profileUnlink';
import { UNKNOWN_COMMAND } from '../../const/messages';

// Define Subcommand Build
type Sub = {
    name: string;
    description: string;
    build?: (sc: SlashCommandSubcommandBuilder) => SlashCommandSubcommandBuilder;
    execute: (interaction: ChatInputCommandInteraction) => Promise<void>;
    autocomplete?: (interaction: AutocompleteInteraction) => Promise<void>;
};

// Add Commands as Subcommand
const SUBS: Sub[] = [link, me, inspect, search, stats, unlink];

// Profile Command and define Subcommands
export const data = (() => {
    const command = new SlashCommandBuilder()
        .setName('profile')
        .setDescription('FFXIV Profile-Link')
        .setDMPermission(true);
    for (const s of SUBS) {
        command.addSubcommand(sc => {
            sc.setName(s.name).setDescription(s.description);

            if (s.build) s.build(sc);
            return sc;
        });
    }
    return command;
})();

export async function execute(interaction: ChatInputCommandInteraction) {
    const sub = interaction.options.getSubcommand(true);
    const entry = SUBS.find(s => s.name === sub);
    if (!entry) {
        await interaction.reply({
            content: `${UNKNOWN_COMMAND}: ${sub}`,
            flags: MessageFlags.Ephemeral
        });
        return;
    }
    await entry.execute(interaction);
}

export async function autocomplete(interaction: AutocompleteInteraction) {
    const sub = interaction.options.getSubcommand();
    const entry = SUBS.find(s => s.name === sub);
    if (!entry || !entry.autocomplete) return;
    await entry.autocomplete(interaction);
}

export default { data, execute, autocomplete, emoji: '📜' } satisfies Command;