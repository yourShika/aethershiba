// commands/config/config.ts

// Slash command that serves as an entry point for configuration.
// Provides subcommands (like "housing") that allows admins to
// view or modify guild-specific configuration stored via configManager.

import { SlashCommandBuilder, MessageFlags, type ChatInputCommandInteraction } from "discord.js";
import { UNKOWN_COMMAND } from "../../const/messages";

// Shape every subcommand must follow.
export interface ConfigSubcommand {
    name: string;
    description: string;
    execute(interaction: ChatInputCommandInteraction): Promise<void>;
}

// Import individual config subcommands
import housing from "./housingConfig";

// Collection of supported config commands.
// Add more here (e.g. "music", "moderation") as features grow.
const SUBCOMMANDS: ConfigSubcommand[] = [
    housing,
];

// Build the /config command with all registrered subcommands.
export const data = (() => {
    const cmd = new SlashCommandBuilder()
        .setName('config')
        .setDescription('View or modify the current guild configuration');

    for (const sub of SUBCOMMANDS) {
        cmd.addSubcommand((sc) => sc.setName(sub.name).setDescription(sub.description));
    }
    return cmd;
})();

/**
 * Executes the appropriate subcommand handler based on user input.
 * Falls back to an ephemeral error message if the subcommand is not found.
 * 
 * @param interaction - Discord Chat Input Command Interaction 
 */
export async function execute(interaction: ChatInputCommandInteraction) {
    const sub = interaction.options.getSubcommand(true);
    const entry = SUBCOMMANDS.find(s => s.name === sub);

    if (!entry) {
        await interaction.reply({ content: `${UNKOWN_COMMAND}: ${sub}`, flags: MessageFlags.Ephemeral });
        return;
    }
    await entry.execute(interaction);
}

// Export the command object for registration
export default { data, execute, emoji: '⚙️' };
