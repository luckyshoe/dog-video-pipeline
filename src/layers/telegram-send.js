const db = require('../lib/db');
const log = require('../lib/logger');
const telegram = require('../lib/telegram');

/**
 * Send a generated video to Telegram for approval.
 */
async function sendToTelegram(videoId) {
  const video = await db.getVideoById(videoId);
  if (!video || !video.generated_video_url) {
    log.error(`[telegram-send] No video URL for ${videoId}`);
    return;
  }

  try {
    const messageId = await telegram.sendForApproval(video);
    await db.updateVideo(videoId, {
      telegram_message_id: messageId,
      status: 'pending_approval',
    });
    log.info(`[telegram-send] Sent ${videoId} for approval`);
  } catch (e) {
    log.error(`[telegram-send] Failed to send ${videoId}: ${e.message}`);
    // Don't change status — video is still generated, can retry sending
  }
}

module.exports = { sendToTelegram };
