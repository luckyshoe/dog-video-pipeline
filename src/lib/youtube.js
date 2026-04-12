const { google } = require('googleapis');
const https = require('https');
const fs = require('fs');
const path = require('path');
const os = require('os');
const config = require('./config');
const log = require('./logger');
const { callWithRetry } = require('./retry');

function getAuthClient() {
  const oauth2 = new google.auth.OAuth2(
    config.YOUTUBE_CLIENT_ID,
    config.YOUTUBE_CLIENT_SECRET
  );
  oauth2.setCredentials({ refresh_token: config.YOUTUBE_REFRESH_TOKEN });
  return oauth2;
}

/**
 * Upload video to YouTube as private.
 * Returns { videoId, url }.
 */
async function uploadToYouTube(video) {
  return callWithRetry('youtube-upload', async () => {
    const auth = getAuthClient();
    const youtube = google.youtube({ version: 'v3', auth });

    // Download video to temp file
    const tmpPath = path.join(os.tmpdir(), `yt_upload_${Date.now()}.mp4`);
    log.info(`[youtube] Downloading video for upload...`);

    await new Promise((resolve, reject) => {
      const file = fs.createWriteStream(tmpPath);
      https.get(video.generated_video_url, (res) => {
        if (res.statusCode !== 200) { reject(new Error(`Download HTTP ${res.statusCode}`)); return; }
        res.pipe(file);
        file.on('finish', () => { file.close(); resolve(); });
      }).on('error', reject);
    });

    log.info(`[youtube] Uploading to YouTube as private...`);
    const ytCaptions = video.captions_youtube || {};

    const response = await youtube.videos.insert({
      part: ['snippet', 'status'],
      requestBody: {
        snippet: {
          title: ytCaptions.title || 'Funny Dog Video',
          description: ytCaptions.description || '',
          tags: ytCaptions.tags || [],
          categoryId: '15', // Pets & Animals
        },
        status: {
          privacyStatus: 'private',
          selfDeclaredMadeForKids: false,
        },
      },
      media: {
        body: fs.createReadStream(tmpPath),
      },
    });

    // Cleanup temp file
    try { fs.unlinkSync(tmpPath); } catch {}

    const videoId = response.data.id;
    const url = `https://www.youtube.com/watch?v=${videoId}`;
    log.info(`[youtube] Upload complete: ${url}`);

    return { videoId, url };
  }, 1, 30000);
}

module.exports = { uploadToYouTube };
