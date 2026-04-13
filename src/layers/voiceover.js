const fs = require('fs');
const path = require('path');
const os = require('os');
const https = require('https');
const { spawn } = require('child_process');
const db = require('../lib/db');
const log = require('../lib/logger');
const { callClaude } = require('../lib/claude');
const { generateVoiceover } = require('../lib/elevenlabs');
const { uploadBuffer } = require('../lib/storage');

/**
 * Generate a funny voiceover script based on the comedy analysis.
 */
async function generateScript(video) {
  const script = await callClaude({
    system: `You write short, funny voiceover scripts for pet comedy videos. The voice is a casual, amused male narrator talking TO or ABOUT the animal — like a pet owner commentating on what their dog is doing. Keep it natural, conversational, and funny. Match the timing to the video duration.

Rules:
- Max 3-4 short sentences
- Must fit within ${video.video_duration || 12} seconds when spoken
- Use pauses (marked with "...") for comedy timing
- React to the punchline moment with genuine surprise or laughter
- Never use profanity
- Sound like a real person, not a script`,
    userContent: `Video details:
- Animal: ${video.new_breed || video.analysis_breed || 'dog'}
- Setup: ${video.analysis_setup || 'dog sitting calmly'}
- Trigger: ${video.analysis_trigger || 'something surprises the dog'}
- Punchline: ${video.analysis_punchline || 'dog reacts dramatically'}
- Aftermath: ${video.analysis_aftermath || 'dog looks confused'}
- Comedy style: ${video.analysis_comedy_style || 'reaction'}
- Duration: ${video.video_duration || 12} seconds

Write ONLY the voiceover script — no quotes, no stage directions, no explanation. Just the words the narrator says.`,
    maxTokens: 200,
  });

  log.info(`[voiceover] Script: "${script.slice(0, 100)}..."`);
  return script;
}

/**
 * Overlay audio on video using ffmpeg.
 * Mixes voiceover with existing video audio.
 */
async function overlayAudio(videoPath, audioPath, outputPath) {
  await new Promise((resolve, reject) => {
    const proc = spawn('ffmpeg', [
      '-i', videoPath,
      '-i', audioPath,
      '-filter_complex', '[0:a]volume=0.3[orig];[1:a]volume=1.0[voice];[orig][voice]amix=inputs=2:duration=first[out]',
      '-map', '0:v',
      '-map', '[out]',
      '-c:v', 'copy',
      '-c:a', 'aac',
      '-shortest',
      outputPath,
      '-y',
    ]);
    let stderr = '';
    proc.stderr.on('data', c => stderr += c);
    proc.on('close', code => code === 0 ? resolve() : reject(new Error(`ffmpeg overlay exit ${code}: ${stderr.slice(-200)}`)));
    proc.on('error', reject);
  });
}

/**
 * Add voiceover to a generated video.
 * Updates generated_video_url with the new version.
 */
async function addVoiceover(videoId) {
  const video = await db.getVideoById(videoId);
  if (!video || !video.generated_video_url) {
    log.warn(`[voiceover] No video URL for ${videoId}`);
    return video?.generated_video_url;
  }

  const tmpDir = os.tmpdir();
  const tmpVideo = path.join(tmpDir, `vo_video_${Date.now()}.mp4`);
  const tmpAudio = path.join(tmpDir, `vo_audio_${Date.now()}.mp3`);
  const tmpOutput = path.join(tmpDir, `vo_output_${Date.now()}.mp4`);

  try {
    // Step 1: Generate script
    const script = await generateScript(video);

    // Step 2: Generate voiceover audio
    const audioBuffer = await generateVoiceover(script);
    fs.writeFileSync(tmpAudio, audioBuffer);

    // Step 3: Download generated video
    log.info('[voiceover] Downloading video for overlay...');
    await new Promise((resolve, reject) => {
      const file = fs.createWriteStream(tmpVideo);
      https.get(video.generated_video_url, (res) => {
        if (res.statusCode !== 200) { reject(new Error(`Download ${res.statusCode}`)); return; }
        res.pipe(file);
        file.on('finish', () => { file.close(); resolve(); });
      }).on('error', reject);
    });

    // Step 4: Overlay voiceover on video
    log.info('[voiceover] Overlaying audio...');
    await overlayAudio(tmpVideo, tmpAudio, tmpOutput);

    // Step 5: Upload final video to storage
    const outputBuffer = fs.readFileSync(tmpOutput);
    const filename = `videos/vo_${videoId}_${Date.now()}.mp4`;
    const finalUrl = await uploadBuffer(outputBuffer, filename, 'video/mp4');

    // Step 6: Update database with new URL
    await db.updateVideo(videoId, { generated_video_url: finalUrl });
    log.info(`[voiceover] Complete! New URL: ${finalUrl.slice(0, 60)}...`);

    return finalUrl;
  } catch (e) {
    log.error(`[voiceover] Failed: ${e.message} — keeping original video`);
    return video.generated_video_url;
  } finally {
    try { fs.unlinkSync(tmpVideo); } catch {}
    try { fs.unlinkSync(tmpAudio); } catch {}
    try { fs.unlinkSync(tmpOutput); } catch {}
  }
}

module.exports = { addVoiceover };
