// commands/housing/housing.ts
import {
  SlashCommandBuilder,
  MessageFlags,
  type ChatInputCommandInteraction,
  type SlashCommandSubcommandBuilder,
  type AutocompleteInteraction,
} from "discord.js";
import type { Command } from "../../handlers/commandHandler";

// Import all housing-related subcommands
import setup from './housingSetup';
import refresh from './housingRefresh';
import research from './housingResearch';
import info from './housingInfo';
import reset from './housingReset';
import { UNKNOWN_COMMAND } from "../../const/messages";

// ---------------------------------------------------
// Subcommand type
// ---------------------------------------------------
// Each housing subcommand must provide:
//  - name & description
//  - execute handler
//  - optional builder (for extra options) and autocomplete
type Sub = {
    name: string;
    description: string;
    build?: (sc: SlashCommandSubcommandBuilder) => SlashCommandSubcommandBuilder;
    execute: (interaction: ChatInputCommandInteraction) => Promise<void>;
    autocomplete?: (interaction: AutocompleteInteraction) => Promise<void>;
};

// Collect all subcommands into one list for easy registration
const SUBS: Sub[] = [setup, refresh, reset, research, info];

// ---------------------------------------------------
// Slash command definition
// ---------------------------------------------------
// This builds the /housing command with its subcommands
export const data = (() => {
    const command = new SlashCommandBuilder()
        .setName('housing')
        .setDescription('Housing utilities')
        .setDMPermission(true); // Allow use in DMs (where applicable)

    for (const s of SUBS) {
        command.addSubcommand(sc => {
            sc.setName(s.name).setDescription(s.description);
            if (s.build) s.build(sc); // add options if defined
            return sc;
        });
    }
    return command;
})();

// ---------------------------------------------------
// Command executor
// ---------------------------------------------------
// Dispatches the incoming subcommand to the right handler.
export async function execute(interaction: ChatInputCommandInteraction) {
    const sub = interaction.options.getSubcommand(true);
    const entry = SUBS.find(s => s.name === sub);

    if (!entry) {
        await interaction.reply({ content: `${UNKNOWN_COMMAND}: ${sub}`, flags: MessageFlags.Ephemeral });
        return;
    }

    await entry.execute(interaction);
}

// ---------------------------------------------------
// Autocomplete handler
// ---------------------------------------------------
// Delegates autocomplete requests to the correct subcommand.
export async function autocomplete(interaction: AutocompleteInteraction) {
    const sub = interaction.options.getSubcommand();
    const entry = SUBS.find(s => s.name === sub);

    if (!entry || !entry.autocomplete) return;
    await entry.autocomplete(interaction);
}

// ---------------------------------------------------
// Export command object (satisfies Command interface)
// ---------------------------------------------------
// Includes emoji so it looks nice in help listings.
export default { data, execute, autocomplete, emoji: '🏠' } satisfies Command;