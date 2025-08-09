import 'dotenv/config';
import { Telegraf, Markup } from 'telegraf';

const bot = new Telegraf(process.env.BOT_TOKEN);

bot.start((ctx) => {
  return ctx.reply(
    'Добро пожаловать в Premium Business!',
    Markup.inlineKeyboard([
      [Markup.button.webApp('Открыть рабочее пространство', process.env.WEBAPP_URL)],
    ])
  );
});

bot.command('app', (ctx) =>
  ctx.reply('Открыть:', Markup.inlineKeyboard([[Markup.button.webApp('Open', process.env.WEBAPP_URL)]]))
);

bot.launch().then(() => console.log('Bot started'));
process.once('SIGINT', () => bot.stop('SIGINT'));
process.once('SIGTERM', () => bot.stop('SIGTERM'));
