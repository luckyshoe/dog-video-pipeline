const { Telegraf, Markup } = require('telegraf');
const config = require('./config');
const log = require('./logger');
const https = require('https');

let bot = null;

function getBot() {
  if (!bot) {
    bot = new Telegraf(config.TELEGRAM_BOT_TOKEN);
  }
  return bot;
}

/**
 * Send video + approval buttons to Telegram.
 * Returns the message ID for tracking callbacks.
 */
async function sendForApproval(video) {
  const b = getBot();
  const chatId = config.TELEGRAM_CHAT_ID;

  const caption = [
    `New video ready for review`,
    `──────────────────────────`,
    `Source: ${video.platform} | ${video.views || '?'} views`,
    `Duration: ${video.video_duration || '?'}s | Cost: $${video.generation_cost || '?'}`,
    ``,
    `Comedy style: ${video.analysis_comedy_style || '?'}`,
    `Punchline: ${(video.analysis_punchline || '').slice(0, 120)}`,
    `Trigger: ${video.analysis_audio_trigger || '?'}`,
    ``,
    `Changed: ${video.analysis_breed || '?'} -> ${video.new_breed || '?'}`,
    `Color: ${video.analysis_color || '?'} -> ${video.new_color || '?'}`,
    ``,
    `YT title: ${video.captions_youtube?.title || '?'}`,
    `Hashtags: ${(video.captions_tiktok?.hashtags || []).slice(0, 5).map(h => '#' + h).join(' ')}`,
  ].join('\n');

  // Download video to buffer for sending
  const videoBuffer = await new Promise((resolve, reject) => {
    https.get(video.generated_video_url, (res) => {
      const chunks = [];
      res.on('data', c => chunks.push(c));
      res.on('end', () => resolve(Buffer.concat(chunks)));
      res.on('error', reject);
    }).on('error', reject);
  });

  // Send video
  const videoMsg = await b.telegram.sendVideo(chatId, { source: videoBuffer, filename: 'video.mp4' }, {
    caption: caption.slice(0, 1024), // Telegram caption limit
    parse_mode: undefined,
  });

  // Send approval buttons as separate message
  const buttonsMsg = await b.telegram.sendMessage(chatId, 'Choose an action:', {
    reply_to_message_id: videoMsg.message_id,
    ...Markup.inlineKeyboard([
      [Markup.button.callback('Approve & Upload to YouTube', `approve_${video.id}`)],
      [Markup.button.callback('Reject — Bad anatomy', `reject_bad_anatomy_${video.id}`)],
      [Markup.button.callback('Reject — Not funny', `reject_not_funny_${video.id}`)],
      [Markup.button.callback('Reject — Wrong punchline', `reject_wrong_punchline_${video.id}`)],
      [Markup.button.callback('Edit & Regenerate', `edit_${video.id}`)],
      [Markup.button.callback('Regenerate same source', `regenerate_${video.id}`)],
      [Markup.button.callback('Skip this video', `skip_${video.id}`)],
    ]),
  });

  log.info(`[telegram] Sent video ${video.id} for approval, msg_id=${buttonsMsg.message_id}`);
  return String(buttonsMsg.message_id);
}

/**
 * Send a simple text message to Telegram.
 */
async function sendMessage(text) {
  const b = getBot();
  await b.telegram.sendMessage(config.TELEGRAM_CHAT_ID, text);
}

/**
 * Reply to a callback query.
 */
async function answerCallback(callbackQueryId, text) {
  const b = getBot();
  await b.telegram.answerCbQuery(callbackQueryId, text);
}

/**
 * Edit the buttons message after action.
 */
async function editMessageText(messageId, text) {
  const b = getBot();
  try {
    await b.telegram.editMessageText(config.TELEGRAM_CHAT_ID, messageId, null, text);
  } catch (e) {
    log.warn(`[telegram] Could not edit message ${messageId}: ${e.message}`);
  }
}

module.exports = { getBot, sendForApproval, sendMessage, answerCallback, editMessageText };
