const { createClient } = require('@supabase/supabase-js');
const https = require('https');
const config = require('./config');
const log = require('./logger');

const supabase = createClient(config.SUPABASE_URL, config.SUPABASE_ANON_KEY);
const BUCKET = config.STORAGE_BUCKET_NAME || 'dog-videos';

/**
 * Download a video from URL and upload to Supabase Storage.
 * Returns the public URL.
 */
async function uploadVideoFromUrl(sourceUrl, filename) {
  // Download video to buffer
  const buffer = await new Promise((resolve, reject) => {
    const chunks = [];
    const follow = (url) => {
      https.get(url, (res) => {
        if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
          follow(res.headers.location);
          return;
        }
        if (res.statusCode !== 200) { reject(new Error(`Download HTTP ${res.statusCode}`)); return; }
        res.on('data', c => chunks.push(c));
        res.on('end', () => resolve(Buffer.concat(chunks)));
        res.on('error', reject);
      }).on('error', reject);
    };
    follow(sourceUrl);
  });

  log.info(`[storage] Downloaded ${(buffer.length / 1024 / 1024).toFixed(1)}MB, uploading to Supabase...`);

  const filePath = `videos/${filename}`;
  const { data, error } = await supabase.storage
    .from(BUCKET)
    .upload(filePath, buffer, {
      contentType: 'video/mp4',
      upsert: true,
    });

  if (error) throw new Error(`Storage upload failed: ${error.message}`);

  // Get public URL
  const { data: urlData } = supabase.storage.from(BUCKET).getPublicUrl(filePath);
  const publicUrl = urlData?.publicUrl;

  log.info(`[storage] Uploaded: ${publicUrl?.slice(0, 80)}`);
  return publicUrl;
}

/**
 * Upload a buffer (e.g. frame image) to Supabase Storage.
 */
async function uploadBuffer(buffer, filePath, contentType = 'image/jpeg') {
  const { error } = await supabase.storage
    .from(BUCKET)
    .upload(filePath, buffer, { contentType, upsert: true });

  if (error) throw new Error(`Storage upload failed: ${error.message}`);

  const { data } = supabase.storage.from(BUCKET).getPublicUrl(filePath);
  return data?.publicUrl;
}

module.exports = { uploadVideoFromUrl, uploadBuffer };
