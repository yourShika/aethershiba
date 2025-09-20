// commands/admin/admin.ts

import { MessageFlags, PermissionFlagsBits, SlashCommandBuilder ,type ChatInputCommandInteraction } from "discord.js";
import { UNKNOWN_COMMAND } from "../../const/messages";
import type { Command } from '../../handlers/commandHandler';
import reloadCommands from './adminReloadCommand';

// ---------------------------------------------------
// Subcommand declarations
// ---------------------------------------------------
export interface AdminSubcommand {
    name: string;
    description: string;
    execute(interaction: ChatInputCommandInteraction): Promise<void>;
}

const SUBCOMMANDS: AdminSubcommand[] = [reloadCommands];

// ---------------------------------------------------
// Slash command definition
// ---------------------------------------------------
export const data = (() => {
    const builder = new SlashCommandBuilder()
        .setName('admin')
        .setDescription('Administrative utilities')
        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator);

    for (const sub of SUBCOMMANDS) {
        builder.addSubcommand(sc => sc.setName(sub.name).setDescription(sub.description));
    }

    return builder;
})();

// ---------------------------------------------------
// Command executor
// ---------------------------------------------------
export async function execute(interaction: ChatInputCommandInteraction) {
    const sub = interaction.options.getSubcommand(true);
    const entry = SUBCOMMANDS.find(s => s.name === sub);

    if (!entry) {
        await interaction.reply({
            content: `${UNKNOWN_COMMAND}: ${sub}`,
            flags: MessageFlags.Ephemeral,
        });
        return;
    }
    
    await entry.execute(interaction);
}

export default { data, execute, emoji: '🛠️' } satisfies Command;