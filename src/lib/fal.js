const { fal } = require('@fal-ai/client');
const config = require('./config');
const log = require('./logger');
const { callWithRetry } = require('./retry');

fal.config({ credentials: config.FAL_KEY });

/**
 * Generate starting image with Nano Banana 2.
 * Returns image URL. Cost: $0.08
 */
async function generateStartingImage(prompt) {
  return callWithRetry('nano-banana', async () => {
    log.info(`[fal] Generating starting image...`);
    const result = await fal.subscribe('fal-ai/nano-banana-2', {
      input: { prompt, image_size: 'square_hd', num_images: 1 },
    });
    const url = result.data?.images?.[0]?.url;
    if (!url) throw new Error('No image URL in Nano Banana response');
    log.info(`[fal] Starting image ready: ${url.slice(0, 60)}...`);
    return url;
  }, 1, 10000);
}

/**
 * Generate video with Kling O3 Standard (image-to-video).
 * Returns video URL. Cost: duration * $0.112
 */
async function generateVideoI2V(prompt, imageUrl, duration = 12) {
  return callWithRetry('kling-i2v', async () => {
    log.info(`[fal] Generating ${duration}s video (image-to-video)...`);
    const result = await fal.subscribe('fal-ai/kling-video/o3/standard/image-to-video', {
      input: {
        prompt,
        image_url: imageUrl,
        duration: String(duration),
        generate_audio: true,
      },
      onQueueUpdate: (u) => {
        if (u.status === 'COMPLETED') log.info('[fal] Video generation COMPLETED');
        else if (u.logs?.length) log.info(`[fal] Queue: ${u.status}`);
      },
    });
    const url = result.data?.video?.url;
    if (!url) throw new Error('No video URL in Kling response');
    log.info(`[fal] Video ready: ${url.slice(0, 60)}...`);
    return url;
  }, 1, 120000);
}

/**
 * Generate video with Kling O3 Standard (text-to-video).
 * Fallback when no starting image. Cost: duration * $0.112
 */
async function generateVideoT2V(prompt, duration = 12) {
  return callWithRetry('kling-t2v', async () => {
    log.info(`[fal] Generating ${duration}s video (text-to-video)...`);
    const result = await fal.subscribe('fal-ai/kling-video/o3/standard/text-to-video', {
      input: {
        prompt,
        duration: String(duration),
        generate_audio: true,
        aspect_ratio: '9:16',
      },
      onQueueUpdate: (u) => {
        if (u.status === 'COMPLETED') log.info('[fal] Video generation COMPLETED');
      },
    });
    const url = result.data?.video?.url;
    if (!url) throw new Error('No video URL in Kling T2V response');
    log.info(`[fal] Video ready: ${url.slice(0, 60)}...`);
    return url;
  }, 1, 120000);
}

/**
 * Test generation with LTX Fast (cheap, for prompt testing only).
 * Cost: duration * $0.04
 */
async function generateTestVideo(prompt, duration = 5) {
  log.info(`[fal] TEST: Generating ${duration}s LTX video...`);
  const result = await fal.subscribe('fal-ai/ltx-2.3/text-to-video/fast', {
    input: {
      prompt,
      duration_seconds: duration,
      aspect_ratio: '9:16',
      resolution: '1080p',
      generate_audio: true,
    },
  });
  return result.data?.video?.url;
}

module.exports = { generateStartingImage, generateVideoI2V, generateVideoT2V, generateTestVideo };
