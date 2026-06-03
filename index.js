require('dotenv').config();
const { Client, GatewayIntentBits } = require('discord.js');

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent
  ]
});

client.once('ready', () => {
  console.log('Fish Bot is online!');
});

client.on('messageCreate', message => {
  if (message.author.bot) return;
  if (message.channel.name !== 'fish') return;

  if (message.content.toLowerCase() === '+fish') {
    message.reply(`A good fishy day to you, ${message.author} sir!`);
  }
});

client.login(process.env.DISCORD_TOKEN);