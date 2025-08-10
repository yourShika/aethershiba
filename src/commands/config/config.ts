// Slash command that displays the current guild configuration to the user.
import { SlashCommandBuilder, MessageFlags, type ChatInputCommandInteraction } from "discord.js";

export interface ConfigSubcommand {
    name: string;
    description: string;
    execute(interaction: ChatInputCommandInteraction): Promise<void>;
}

import housing from "./housingConfig";

const SUBCOMMANDS: ConfigSubcommand[] = [
    housing,
];

export const data = (() => {
    const cmd = new SlashCommandBuilder()
        .setName('config')
        .setDescription('View or modify the current guild configuration');
    for (const sub of SUBCOMMANDS) {
        cmd.addSubcommand((sc) => sc.setName(sub.name).setDescription(sub.description));
    }
    return cmd;
})();

export async function execute(interaction: ChatInputCommandInteraction) {
    const sub = interaction.options.getSubcommand(true);
    const entry = SUBCOMMANDS.find(s => s.name === sub);
    if (!entry) {
        await interaction.reply({ content: `Unknown subcommand: ${sub}`, flags: MessageFlags.Ephemeral });
        return;
    }
    await entry.execute(interaction);
}

export default { data, execute };
