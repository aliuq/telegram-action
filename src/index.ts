import * as core from "@actions/core";
import { Bot } from "grammy";
import telegramifyMarkdown from "telegramify-markdown";

async function run() {
  try {
    const botToken = core.getInput("bot_token", { required: true });
    const chatId = core.getInput("chat_id", { required: true });
    const message = core.getInput("message", { required: true });
    const replyToMessageId = core.getInput("reply_to_message_id", {
      required: false,
    });
    const buttons = core.getInput("buttons", { required: false });

    const bot = new Bot(botToken);
    const params: Parameters<typeof bot.api.sendMessage>[2] = {
      parse_mode: "MarkdownV2",
    };

    if (replyToMessageId) {
      params.reply_parameters = {
        message_id: Number.parseInt(replyToMessageId),
      };
    }

    // 解析按钮配置
    if (buttons) {
      try {
        // [
        //   [
        //     { "text": "查看", "url": "https://google.com" },
        //     { "text": "测试", "url": "https://x.com" }
        //   ],
        //   [
        //     { "text": "访问仓库", "url": "https://github.com/${{ github.repository }}" }
        //   ]
        // ]
        const buttonData = JSON.parse(buttons);

        params.reply_markup = {
          inline_keyboard: buttonData,
          resize_keyboard: true,
        };
      } catch (e) {
        core.warning("Invalid buttons format, skipping buttons");
      }
    }

    const result = await bot.api.sendMessage(
      chatId,
      telegramifyMarkdown(message, "keep"),
      params,
    );

    core.setOutput("message_id", result.message_id.toString());
    core.setOutput("status", "success");
  } catch (error) {
    if (error instanceof Error) {
      core.setFailed(error.message);
    } else {
      core.setFailed("An unexpected error occurred");
    }
  }
}

run();
