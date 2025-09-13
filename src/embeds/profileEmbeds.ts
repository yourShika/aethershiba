import { EmbedBuilder } from "discord.js";

export const linkStartEmbed = () => 
    new EmbedBuilder()
        .setTitle('Link FFXIV Profile')
        .setDescription('Press **Start Verify** and provide your Lodestone URL to begin the verification process.');

export const tokenEmbed = (token: string, status?: string) => {
    const embed = new EmbedBuilder()
        .setTitle('Lodestone Verification')
        .setDescription('Add the following token to your Lodestone profile comment and press **Verify**')
        .addFields({ name: 'Token', value: `\`${token}\``}, { name: 'Expires', value: '60 minutes' });

    if (status) embed.addFields({ name: 'Status', value: status });
    return embed;
}

export const successEmbed = (url: string) =>
    new EmbedBuilder()
        .setTitle('Verification successful!')
        .setDescription(`[View Lodestone Profile](${url})`);