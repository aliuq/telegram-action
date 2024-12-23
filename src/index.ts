import * as core from '@actions/core';
import { Bot } from 'grammy';

async function run() {
  try {
    const botToken = core.getInput('bot_token', { required: true });
    const chatId = core.getInput('chat_id', { required: true });
    const message = core.getInput('message', { required: true });
    const replyToMessageId = core.getInput('reply_to_message_id', { required: false });

    const bot = new Bot(botToken);

    if (replyToMessageId) {
      await bot.api.sendMessage(chatId, message, { reply_to_message_id: parseInt(replyToMessageId) });
    } else {
      await bot.api.sendMessage(chatId, message);
    }

    core.setOutput('status', 'success');
  } catch (error) {
    if (error instanceof Error) {
      core.setFailed(error.message);
    } else {
      core.setFailed('An unexpected error occurred');
    }
  }
}

run();
