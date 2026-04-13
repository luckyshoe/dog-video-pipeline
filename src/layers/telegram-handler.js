const db = require('../lib/db');
const log = require('../lib/logger');
const config = require('../lib/config');
const telegram = require('../lib/telegram');
const { uploadToYouTube } = require('../lib/youtube');
const { callClaude } = require('../lib/claude');

// Track which chat is waiting to type edit instructions
const pendingEdits = {};

/**
 * Handle Telegram callback button presses.
 */
async function handleTelegramCallback(ctx) {
  const data = ctx.callbackQuery?.data;
  if (!data) return;

  // Extract action and video ID from callback data
  // Format: action_videoId or reject_reason_videoId
  const parts = data.split('_');
  const action = parts[0];
  const videoId = parts[parts.length - 1]; // UUID is always last

  const video = await db.getVideoById(videoId).catch(() => null);
  if (!video) {
    await ctx.answerCbQuery('Video not found');
    return;
  }

  const messageId = ctx.callbackQuery.message?.message_id;

  try {
    if (action === 'approve') {
      await ctx.answerCbQuery('Uploading to YouTube...');
      await telegram.editMessageText(messageId, 'Uploading to YouTube...');

      await db.updateVideo(videoId, {
        status: 'approved',
        approval_status: 'approved',
        approved_at: new Date().toISOString(),
      });

      // Log to prompt_performance
      await db.logPromptPerformance({
        video_id: videoId,
        starting_image_prompt: video.starting_image_prompt,
        video_prompt: video.video_prompt,
        model_used: video.model_used,
        duration: video.video_duration,
        comedy_style: video.analysis_comedy_style,
        breed_used: video.new_breed,
        was_approved: true,
      });

      // Upload to YouTube
      try {
        const { videoId: ytId, url: ytUrl } = await uploadToYouTube(video);
        await db.updateVideo(videoId, {
          status: 'posted',
          youtube_video_id: ytId,
          youtube_url: ytUrl,
          posted_at: new Date().toISOString(),
        });
        await telegram.editMessageText(messageId, `Uploaded to YouTube (Private)\n${ytUrl}\nStatus: Private — publish when ready`);
      } catch (e) {
        log.error(`[callback] YouTube upload failed: ${e.message}`);
        await db.updateVideo(videoId, { status: 'upload_failed', error_log: { stage: 'youtube', error: e.message, at: new Date().toISOString() } });
        await telegram.editMessageText(messageId, `YouTube upload failed: ${e.message}`);
      }

    } else if (action === 'reject') {
      // Extract reason: reject_bad_anatomy_UUID -> "bad_anatomy"
      const reason = parts.slice(1, -1).join('_');
      await ctx.answerCbQuery(`Rejected: ${reason}`);

      await db.updateVideo(videoId, {
        status: 'rejected',
        approval_status: 'rejected',
        rejection_reason: reason,
      });

      await db.logPromptPerformance({
        video_id: videoId,
        starting_image_prompt: video.starting_image_prompt,
        video_prompt: video.video_prompt,
        model_used: video.model_used,
        duration: video.video_duration,
        comedy_style: video.analysis_comedy_style,
        breed_used: video.new_breed,
        was_approved: false,
        rejection_reason: reason,
      });

      await telegram.editMessageText(messageId, `Rejected: ${reason}. Learning from this.`);

    } else if (action === 'edit') {
      await ctx.answerCbQuery('Type your edit instructions');
      await telegram.editMessageText(messageId, `Waiting for your edit instructions for video ${videoId.slice(0, 8)}...\n\nType what you want changed (e.g. "dog jumps on trampoline not grass" or "change to golden retriever, indoor setting")`);

      // Store that we're waiting for edit instructions for this video
      pendingEdits[config.TELEGRAM_CHAT_ID] = videoId;

    } else if (action === 'regenerate') {
      const retryCount = (video.retry_count || 0) + 1;

      if (retryCount >= 3) {
        await ctx.answerCbQuery('Max retries reached');
        await db.updateVideo(videoId, { status: 'max_retries_reached', retry_count: retryCount });
        await telegram.editMessageText(messageId, 'Max retries reached (3). Skipping this source video.');
      } else {
        await ctx.answerCbQuery('Regenerating...');
        await db.updateVideo(videoId, {
          status: 'analyzed',
          starting_image_url: null,
          generated_video_url: null,
          video_prompt: null,
          starting_image_prompt: null,
          captions_youtube: null,
          captions_tiktok: null,
          captions_instagram: null,
          captions_facebook: null,
          retry_count: retryCount,
        });
        await telegram.editMessageText(messageId, `Added back to generation queue (retry ${retryCount}/3)`);
      }

    } else if (action === 'skip') {
      await ctx.answerCbQuery('Skipped');
      await db.updateVideo(videoId, { status: 'skipped' });
      await telegram.editMessageText(messageId, 'Skipped');
    }
  } catch (e) {
    log.error(`[callback] Error handling ${action} for ${videoId}: ${e.message}`);
    await ctx.answerCbQuery('Error processing action').catch(() => {});
  }
}

/**
 * Handle text messages — used for edit instructions after "Edit & Regenerate" button.
 */
async function handleTextMessage(ctx) {
  const chatId = String(ctx.message?.chat?.id);
  const text = ctx.message?.text?.trim();

  if (!pendingEdits[chatId] || !text) return;

  const videoId = pendingEdits[chatId];
  delete pendingEdits[chatId];

  const video = await db.getVideoById(videoId).catch(() => null);
  if (!video) {
    await ctx.reply('Video not found — may have been deleted.');
    return;
  }

  try {
    await ctx.reply(`Got it! Applying edit: "${text.slice(0, 100)}"\nRegenerating...`);
    log.info(`[edit] Video ${videoId}: "${text}"`);

    // Use Claude to modify the original analysis based on edit instructions
    const editedAnalysis = await callClaude({
      system: `You modify video generation parameters based on user instructions. Return ONLY valid JSON with the updated fields. Keep all fields that weren't mentioned unchanged.`,
      userContent: `Current video details:
- Breed: ${video.new_breed || video.analysis_breed}
- Color: ${video.new_color || video.analysis_color}
- Setting: ${video.analysis_setting}
- Setup: ${video.analysis_setup}
- Trigger: ${video.analysis_trigger}
- Punchline: ${video.analysis_punchline}
- Aftermath: ${video.analysis_aftermath}

User wants to change: "${text}"

Return JSON with ONLY the fields that should change:
{
  "new_breed": "only if breed changed",
  "new_color": "only if color changed",
  "analysis_setting": "only if setting changed",
  "analysis_setup": "only if setup changed",
  "analysis_trigger": "only if trigger changed",
  "analysis_punchline": "only if punchline changed",
  "analysis_aftermath": "only if aftermath changed"
}
Remove any fields that stay the same.`,
      maxTokens: 500,
    });

    const changes = JSON.parse(editedAnalysis.slice(editedAnalysis.indexOf('{'), editedAnalysis.lastIndexOf('}') + 1));
    log.info(`[edit] Changes: ${JSON.stringify(changes)}`);

    // Apply changes and reset for regeneration
    const retryCount = (video.retry_count || 0) + 1;
    await db.updateVideo(videoId, {
      ...changes,
      status: 'analyzed',
      starting_image_url: null,
      generated_video_url: null,
      video_prompt: null,
      starting_image_prompt: null,
      captions_youtube: null,
      captions_tiktok: null,
      captions_instagram: null,
      captions_facebook: null,
      retry_count: retryCount,
    });

    await ctx.reply(`Edit applied! Video added back to generation queue (retry ${retryCount}/3).\nChanges: ${Object.keys(changes).join(', ')}`);
  } catch (e) {
    log.error(`[edit] Failed for ${videoId}: ${e.message}`);
    await ctx.reply(`Edit failed: ${e.message}`);
  }
}

module.exports = { handleTelegramCallback, handleTextMessage, pendingEdits };
