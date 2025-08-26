
import { SlashCommandBuilder, MessageFlags, type ChatInputCommandInteraction, type Interaction, Message } from "discord.js";
import type { Command } from "../../handlers/commandHandler";

import start from './housingStart';
import refresh from './housingRefresh';
import research from './housingResearch';

type Sub = {
    name: string;
    description: string;
    execute: (interaction: ChatInputCommandInteraction) => Promise<void>;
};

const SUBS: Sub[] = [start, refresh, research];

export const data = (() => {
    const command = new SlashCommandBuilder()
        .setName('housing')
        .setDescription('Housing utilities');
    for (const s of SUBS) {
        command.addSubcommand(sc => sc.setName(s.name).setDescription(s.description));
    }
    return command;
})();

export async function execute(interaction: ChatInputCommandInteraction) {
    const sub = interaction.options.getSubcommand(true);
    const entry = SUBS.find(s => s.name === sub);
    if (!entry) {
        await interaction.reply({ content: `Unkown subcommand: ${sub}`, flags: MessageFlags.Ephemeral });
        return;
    }
    await entry.execute(interaction);
}

export default { data, execute } satisfies Command;