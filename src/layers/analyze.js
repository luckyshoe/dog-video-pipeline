const https = require('https');
const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');
const os = require('os');
const db = require('../lib/db');
const log = require('../lib/logger');
const { callClaudeVision, parseJsonResponse } = require('../lib/claude');

/**
 * Extract N frames evenly from a video URL using ffmpeg.
 * Returns array of { base64, timestamp } objects.
 */
async function extractFrames(videoUrl, durationSecs, frameCount = 10) {
  const tmpVideo = path.join(os.tmpdir(), `analyze_${Date.now()}.mp4`);

  // Download video — use yt-dlp for YouTube/TikTok/Instagram, direct HTTPS for others
  const isYouTube = /youtube\.com|youtu\.be/.test(videoUrl);
  const isTikTok = /tiktok\.com/.test(videoUrl);
  const isInstagram = /instagram\.com/.test(videoUrl);

  if (isYouTube || isTikTok || isInstagram) {
    log.info(`[analyze] Downloading with yt-dlp: ${videoUrl.slice(0, 60)}`);
    await new Promise((resolve, reject) => {
      const proc = spawn('yt-dlp', [
        '-f', 'mp4/best', '--no-playlist', '--no-simulate',
        '-o', tmpVideo, '--force-overwrites', videoUrl,
      ]);
      let stderr = '';
      proc.stderr.on('data', c => stderr += c);
      proc.on('close', code => code === 0 ? resolve() : reject(new Error(`yt-dlp exit ${code}: ${stderr.slice(-200)}`)));
      proc.on('error', e => reject(e.code === 'ENOENT' ? new Error('yt-dlp not installed') : e));
    });
  } else {
    await new Promise((resolve, reject) => {
      const file = fs.createWriteStream(tmpVideo);
      https.get(videoUrl, (res) => {
        if (res.statusCode !== 200) { reject(new Error(`Download HTTP ${res.statusCode}`)); return; }
        res.pipe(file);
        file.on('finish', () => { file.close(); resolve(); });
      }).on('error', reject);
    });
  }

  const frames = [];
  const dur = durationSecs || 10;

  for (let i = 0; i < frameCount; i++) {
    const seekTo = (dur / (frameCount - 1)) * i;
    const framePath = path.join(os.tmpdir(), `frame_${Date.now()}_${i}.jpg`);

    try {
      await new Promise((resolve, reject) => {
        const proc = spawn('ffmpeg', [
          '-ss', String(seekTo.toFixed(1)), '-i', tmpVideo,
          '-frames:v', '1', '-q:v', '2', framePath, '-y',
        ]);
        proc.on('close', code => code === 0 ? resolve() : reject(new Error(`ffmpeg exit ${code}`)));
        proc.on('error', reject);
      });

      if (fs.existsSync(framePath)) {
        const data = fs.readFileSync(framePath);
        frames.push({ base64: data.toString('base64'), timestamp: seekTo });
        fs.unlinkSync(framePath);
      }
    } catch (e) {
      log.warn(`[analyze] Frame ${i} extraction failed: ${e.message}`);
    }
  }

  try { fs.unlinkSync(tmpVideo); } catch {}
  log.info(`[analyze] Extracted ${frames.length}/${frameCount} frames`);
  return frames;
}

/**
 * Validate comedy analysis has required fields.
 */
function validateAnalysis(analysis) {
  if (!analysis.comedy_arc?.punchline_moment || analysis.comedy_arc.punchline_moment.length < 20) {
    return 'punchline_moment is empty or too vague';
  }
  if (!analysis.comedy_arc?.trigger || analysis.comedy_arc.trigger.length < 10) {
    return 'trigger is empty or too vague';
  }
  if (!analysis.recreation_requirements?.must_have_elements || analysis.recreation_requirements.must_have_elements.length < 3) {
    return 'must_have_elements needs at least 3 items';
  }
  return null;
}

const SYSTEM_PROMPT = `You are a viral comedy video analyst specializing in pet content.
Your job is to understand what makes a short video funny, shareable, and emotionally engaging — the way a comedy writer would analyze it, not the way a security camera would describe it.

You receive frames from a short video and any available captions.

CRITICAL: Describe actions with emotional and comedic accuracy, not literal mechanical accuracy.

WRONG: "dog changes position on couch"
RIGHT: "dog launches off couch in pure startled panic"

WRONG: "dog moves upward"
RIGHT: "dog explodes upward with all four paws leaving the surface simultaneously in shock"

WRONG: "dog is on floor"
RIGHT: "dog lands on floor and immediately looks directly at camera with confused embarrassed expression"

Focus on:
- The comedy timing and arc (setup -> trigger -> reaction -> aftermath)
- The emotional state of the animal (not just physical position)
- What CAUSES the funny moment (sound, sight, surprise, other animal)
- The exact peak moment that makes people laugh or gasp
- What elements MUST be preserved for the recreation to be funny`;

function buildUserPrompt(video, frameCount) {
  return `Here are ${frameCount} frames from a ${video.duration_seconds} second video.
Source platform: ${video.platform}
Original title: ${video.original_title || 'unknown'}
Available captions/subtitles: none available

Analyze this video for comedy recreation. Return ONLY valid JSON:

{
  "animal_details": {
    "species": "dog/cat/etc",
    "breed": "specific breed if identifiable or best guess",
    "size": "small/medium/large",
    "color": "primary fur color",
    "distinctive_features": "any notable markings or features"
  },
  "setting": {
    "location": "couch/kitchen/yard/bed/etc",
    "props": ["list", "of", "visible", "objects"],
    "furniture_colors": "describe main furniture/background colors"
  },
  "comedy_arc": {
    "setup": "what is happening in the first moments",
    "trigger": "what CAUSES the funny reaction — be very specific",
    "punchline_moment": "describe the exact peak funny action with full emotional and physical accuracy",
    "punchline_timing_seconds": 0,
    "aftermath": "what happens after the punchline",
    "audio_trigger": "describe the sound that triggers the reaction or 'visual trigger'"
  },
  "comedy_classification": {
    "emotion": "startled/scared/confused/excited/guilty/proud/jealous/suspicious/embarrassed",
    "style": "slapstick/reaction/fail/unexpected/cute/relatable/caught-in-the-act",
    "what_makes_it_funny": "one sentence — the core comedy principle"
  },
  "recreation_requirements": {
    "must_have_elements": ["at least 3 specific elements that MUST appear"],
    "optional_elements": ["elements that add but aren't essential"],
    "what_to_change": {
      "breed": "suggest a different breed",
      "fur_color": "suggest a different color",
      "setting_color": "suggest different furniture/prop color",
      "reason": "brief note on why"
    }
  }
}`;
}

/**
 * Analyze the next queued video.
 */
async function analyzeNextVideo() {
  const video = await db.getOldestByStatus('queued');
  if (!video) {
    log.info('[analyze] Queue empty — nothing to analyze');
    return;
  }

  log.info(`[analyze] Starting analysis for ${video.id}: "${(video.original_title || '').slice(0, 60)}"`);
  await db.updateVideo(video.id, { status: 'analyzing' });

  try {
    // Use video_file_url if available, otherwise source_url won't work for frames
    const videoUrl = video.video_file_url || video.source_url;
    const frames = await extractFrames(videoUrl, video.duration_seconds, 10);

    if (frames.length < 3) {
      throw new Error(`Only ${frames.length} frames extracted — need at least 3`);
    }

    // Try analysis up to 2 times
    let analysis = null;
    for (let attempt = 0; attempt < 2; attempt++) {
      const images = frames.map(f => ({ base64: f.base64, mimeType: 'image/jpeg' }));
      const rawText = await callClaudeVision({
        system: SYSTEM_PROMPT,
        textPrompt: buildUserPrompt(video, frames.length),
        images,
        maxTokens: 4000,
      });

      analysis = parseJsonResponse(rawText);
      const validationError = validateAnalysis(analysis);

      if (!validationError) break;
      log.warn(`[analyze] Validation failed (attempt ${attempt + 1}): ${validationError}`);
      if (attempt === 1) throw new Error(`Analysis validation failed twice: ${validationError}`);
    }

    const arc = analysis.comedy_arc || {};
    const animal = analysis.animal_details || {};
    const classification = analysis.comedy_classification || {};
    const recreation = analysis.recreation_requirements || {};

    await db.updateVideo(video.id, {
      status: 'analyzed',
      analysis_animal_species: animal.species,
      analysis_breed: animal.breed,
      analysis_size: animal.size,
      analysis_color: animal.color,
      analysis_setting: analysis.setting?.location,
      analysis_props: analysis.setting?.props,
      analysis_setup: arc.setup,
      analysis_trigger: arc.trigger,
      analysis_punchline: arc.punchline_moment,
      analysis_punchline_timing: arc.punchline_timing_seconds,
      analysis_aftermath: arc.aftermath,
      analysis_audio_trigger: arc.audio_trigger,
      analysis_emotion: classification.emotion,
      analysis_comedy_style: classification.style,
      analysis_what_makes_funny: classification.what_makes_it_funny,
      analysis_must_haves: recreation.must_have_elements,
      analysis_what_to_change: recreation.what_to_change,
      frames_extracted: frames.map(f => f.timestamp),
      analyzed_at: new Date().toISOString(),
    });

    log.info(`[analyze] Complete: ${classification.style} — "${(arc.punchline_moment || '').slice(0, 80)}"`);
  } catch (e) {
    log.error(`[analyze] Failed for ${video.id}: ${e.message}`);
    await db.updateVideo(video.id, {
      status: 'analysis_failed',
      error_log: { stage: 'analysis', error: e.message, at: new Date().toISOString() },
    });
  }
}

module.exports = { analyzeNextVideo };
