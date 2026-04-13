const https = require('https');
const config = require('./config');
const log = require('./logger');
const { callWithRetry } = require('./retry');

const ELEVENLABS_KEY = process.env.ELEVENLABS_API_KEY;
// Default voice — "Josh" (funny, casual male voice)
const DEFAULT_VOICE_ID = 'TxGEqnHWrfWFTfGW9XjX';

/**
 * Generate voiceover audio with ElevenLabs.
 * Returns a Buffer of MP3 audio.
 */
async function generateVoiceover(script, voiceId = DEFAULT_VOICE_ID) {
  return callWithRetry('elevenlabs', async () => {
    log.info(`[elevenlabs] Generating voiceover (${script.length} chars)...`);

    const body = JSON.stringify({
      text: script,
      model_id: 'eleven_multilingual_v2',
      voice_settings: {
        stability: 0.4,
        similarity_boost: 0.75,
        style: 0.6,
        use_speaker_boost: true,
      },
    });

    const audioBuffer = await new Promise((resolve, reject) => {
      const req = https.request({
        hostname: 'api.elevenlabs.io',
        path: `/v1/text-to-speech/${voiceId}`,
        method: 'POST',
        headers: {
          'xi-api-key': ELEVENLABS_KEY,
          'Content-Type': 'application/json',
          'Accept': 'audio/mpeg',
          'Content-Length': Buffer.byteLength(body),
        },
      }, (res) => {
        if (res.statusCode !== 200) {
          let errData = '';
          res.on('data', c => errData += c);
          res.on('end', () => reject(new Error(`ElevenLabs ${res.statusCode}: ${errData.slice(0, 200)}`)));
          return;
        }
        const chunks = [];
        res.on('data', c => chunks.push(c));
        res.on('end', () => resolve(Buffer.concat(chunks)));
      });
      req.on('error', reject);
      setTimeout(() => { req.destroy(); reject(new Error('ElevenLabs timeout 30s')); }, 30000);
      req.write(body);
      req.end();
    });

    log.info(`[elevenlabs] Voiceover ready: ${(audioBuffer.length / 1024).toFixed(0)}KB`);
    return audioBuffer;
  }, 1, 5000);
}

module.exports = { generateVoiceover };
