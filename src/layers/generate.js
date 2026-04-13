const db = require('../lib/db');
const log = require('../lib/logger');
const { generateStartingImage, generateVideoI2V } = require('../lib/fal');
const { callClaude, parseJsonResponse } = require('../lib/claude');
const { sendToTelegram } = require('./telegram-send');
const { addVoiceover } = require('./voiceover');

function buildImagePrompt(video) {
  const change = video.analysis_what_to_change || {};
  const newBreed = change.breed || video.analysis_breed || 'golden retriever';
  const newColor = change.fur_color || video.analysis_color || 'golden';
  const setting = video.analysis_setting || 'living room';
  const setup = video.analysis_setup || 'sitting relaxed';

  return `A photorealistic ${newBreed} dog with ${newColor} fur, ${setup}, natural canine anatomy, four paws clearly visible on surface, fur-covered legs with natural paw pads, no human features anywhere, calm and relaxed expression, warm ${setting} lighting, centered composition, photorealistic quality`;
}

function buildVideoPrompt(video) {
  const change = video.analysis_what_to_change || {};
  const newBreed = change.breed || video.analysis_breed || 'golden retriever';
  const newColor = change.fur_color || video.analysis_color || 'golden';
  const setting = video.analysis_setting || 'living room';
  const trigger = video.analysis_trigger || 'a sudden loud sound';
  const punchline = video.analysis_punchline || 'reacts with surprise';
  const aftermath = video.analysis_aftermath || 'looks at camera confused';
  const audioTrigger = video.analysis_audio_trigger || 'sudden sound effect';
  const emotion = video.analysis_emotion || 'startled';
  const style = video.analysis_comedy_style || 'reaction';

  // Select shot type based on comedy style
  const shotTypes = {
    slapstick: 'Wide shot', fail: 'Wide shot',
    reaction: 'Medium close-up shot', expression: 'Medium close-up shot',
    'caught-in-the-act': 'Static camera, eye level',
    startled: 'Slightly wide to capture full body movement',
    unexpected: 'Static camera, eye level',
  };
  const shotType = shotTypes[style] || 'Medium shot';

  // Select camera movement
  const cameraMovements = {
    startled: 'static camera holds steady as dog reacts',
    scared: 'static camera holds steady as dog reacts',
    guilty: 'slow push-in to dog face',
    confused: 'static camera, dog looks directly into lens',
    embarrassed: 'slow push-in to dog face',
  };
  const cameraMove = cameraMovements[emotion] || 'static camera captures full movement';

  const prompt = `Photorealistic ${shotType}, ${newBreed} dog with ${newColor} fur ${video.analysis_setup || 'sitting calmly'}, ${trigger}, ${punchline}, ${aftermath}, warm ${setting} setting with ${change.setting_color || 'neutral'} furniture, ${cameraMove}, sudden ${audioTrigger} sound effect with comedic timing, no text no watermarks, ${video.video_duration || 12} seconds.

ANATOMY: ${newBreed} maintains fully natural canine anatomy throughout entire video. All four limbs are dog paws, fur-covered legs with natural paw pads, no human hands or fingers, no anthropomorphization.`;

  // Truncate to 2000 chars for safety
  return prompt.length > 2000 ? prompt.slice(0, 2000) : prompt;
}

function selectDuration(punchlineTiming) {
  if (!punchlineTiming || punchlineTiming < 8) return 12;
  return 15;
}

/**
 * Generate video for the next analyzed source.
 */
async function generateVideo() {
  const video = await db.getOldestByStatus('analyzed');
  if (!video) {
    log.info('[generate] Nothing ready to generate');
    return;
  }

  log.info(`[generate] Starting generation for ${video.id}`);
  await db.updateVideo(video.id, { status: 'generating' });

  const change = video.analysis_what_to_change || {};
  const newBreed = change.breed || video.analysis_breed || 'golden retriever';
  const newColor = change.fur_color || video.analysis_color || 'golden';
  const duration = selectDuration(video.analysis_punchline_timing);

  try {
    // Step 1: Generate starting image
    const imagePrompt = buildImagePrompt(video);
    log.info(`[generate] Image prompt: ${imagePrompt.slice(0, 100)}...`);
    const imageUrl = await generateStartingImage(imagePrompt);
    const imageCost = 0.08;

    await db.updateVideo(video.id, {
      new_breed: newBreed,
      new_color: newColor,
      starting_image_prompt: imagePrompt,
      starting_image_url: imageUrl,
    });

    // Step 2: Generate video
    const videoPrompt = buildVideoPrompt({ ...video, video_duration: duration });
    log.info(`[generate] Video prompt (${videoPrompt.length} chars): ${videoPrompt.slice(0, 100)}...`);
    const videoUrl = await generateVideoI2V(videoPrompt, imageUrl, duration);
    const videoCost = duration * 0.112;
    const totalCost = imageCost + videoCost + 0.03; // + Claude API estimate

    await db.updateVideo(video.id, {
      video_prompt: videoPrompt,
      generated_video_url: videoUrl,
      model_used: 'kling-o3-standard-i2v',
      video_duration: duration,
      generation_cost: totalCost,
      generated_at: new Date().toISOString(),
    });

    // Step 3: Generate captions
    log.info('[generate] Generating captions...');
    try {
      const captionText = await callClaude({
        system: `You are a viral social media content strategist for pet/animal comedy videos. Reuse exact hashtags and emojis from original. Rewrite title and description completely. Return valid JSON only.`,
        userContent: `Comedy analysis:
Punchline: ${video.analysis_punchline}
Comedy style: ${video.analysis_comedy_style}
Animal: ${newBreed} (changed from ${video.analysis_breed})
Emotion: ${video.analysis_emotion}

Original metadata:
Title: ${video.original_title}
Hashtags: ${JSON.stringify(video.original_hashtags || [])}
Emojis: ${video.original_emojis || ''}
Keywords: ${JSON.stringify(video.original_keywords || [])}

Generate captions. Return ONLY JSON:
{
  "youtube": { "title": "max 60 chars", "description": "2-3 sentences", "tags": ["10-15 tags"] },
  "tiktok": { "title": "max 150 chars", "description": "150-300 chars", "hashtags": ["from original"], "keywords": ["5-8"], "emojis": "from original" },
  "instagram": { "caption": "125 char hook + expansion", "hashtags": ["from original"], "emojis": "from original", "alt_text": "one sentence" },
  "facebook": { "post_text": "1-3 sentences with question", "hashtags": ["3-5 most relevant"] }
}`,
        maxTokens: 2000,
      });
      const captions = parseJsonResponse(captionText);
      await db.updateVideo(video.id, {
        captions_youtube: captions.youtube || null,
        captions_tiktok: captions.tiktok || null,
        captions_instagram: captions.instagram || null,
        captions_facebook: captions.facebook || null,
      });
    } catch (e) {
      log.warn(`[generate] Caption generation failed: ${e.message} — continuing without captions`);
    }

    // Step 4: Add voiceover narration
    log.info('[generate] Adding voiceover...');
    try {
      await addVoiceover(video.id);
      totalCost += 0.03; // ElevenLabs cost estimate
    } catch (e) {
      log.warn(`[generate] Voiceover failed: ${e.message} — sending without voiceover`);
    }

    // Step 5: Mark as generated and send to Telegram
    await db.updateVideo(video.id, { status: 'generated', generation_cost: totalCost });
    log.info(`[generate] Complete! Cost: $${totalCost.toFixed(2)}`);

    // Trigger Telegram approval
    await sendToTelegram(video.id);

  } catch (e) {
    log.error(`[generate] Failed for ${video.id}: ${e.message}`);
    await db.updateVideo(video.id, {
      status: 'generation_failed',
      error_log: { stage: 'generation', error: e.message, at: new Date().toISOString() },
    });
  }
}

module.exports = { generateVideo };
