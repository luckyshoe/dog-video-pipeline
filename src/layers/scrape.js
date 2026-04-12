const { ApifyClient } = require('apify-client');
const config = require('../lib/config');
const db = require('../lib/db');
const log = require('../lib/logger');
const { uploadVideoFromUrl } = require('../lib/storage');

const SEARCH_QUERIES = [
  'funny dog scared', 'dog jump scare reaction', 'dog fails funny',
  'dog startled funny', 'dog reaction hilarious', 'funny dog moments',
  'dog comedy', 'hilarious dog video', 'dog scare prank funny', 'dog reaction video',
];

const ACTORS = {
  youtube: 'apify/youtube-scraper',
  tiktok: 'clockworks/tiktok-scraper',
  instagram: 'apify/instagram-scraper',
};

const MAX_NEW_PER_RUN = 20;
const MIN_VIEWS = 3000;
const MAX_DURATION = 59;
const MIN_DURATION = 5;
const MAX_AGE_DAYS = 45;

function extractEmojis(text) {
  if (!text) return '';
  return (text.match(/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/gu) || []).join('');
}

function extractHashtags(text) {
  if (!text) return [];
  return (text.match(/#[\w\u00C0-\u024F]+/g) || []).map(h => h.replace('#', ''));
}

function hasAnimalKeyword(title, description) {
  const combined = `${title || ''} ${description || ''}`.toLowerCase();
  return /\b(dog|puppy|pup|canine|cat|kitten|pet|animal|doggo|pupper)\b/.test(combined);
}

async function scrapeAndQueue() {
  log.info('[scrape] Starting scrape run...');

  // Check queue size
  const queueCount = await db.countByStatus('queued');
  if (queueCount >= 15) {
    log.info(`[scrape] Queue has ${queueCount} items (>= 15). Skipping scrape.`);
    return;
  }

  const client = new ApifyClient({ token: config.APIFY_API_TOKEN });
  let found = 0, passed = 0, duplicates = 0, added = 0;
  const cutoffDate = new Date(Date.now() - MAX_AGE_DAYS * 86400000);

  for (const query of SEARCH_QUERIES) {
    if (added >= MAX_NEW_PER_RUN) break;

    // Run YouTube scraper for each query
    try {
      log.info(`[scrape] Searching YouTube: "${query}"`);
      const run = await client.actor(ACTORS.youtube).call({
        searchKeywords: [query],
        maxResults: 20,
        type: 'shorts',
      });

      const { items } = await client.dataset(run.defaultDatasetId).listItems();
      found += items.length;

      for (const item of items) {
        if (added >= MAX_NEW_PER_RUN) break;

        const duration = item.duration || item.durationSeconds || 0;
        const views = item.viewCount || item.views || 0;
        const title = item.title || '';
        const description = item.description || '';
        const url = item.url || item.videoUrl || '';
        const uploadDate = item.date ? new Date(item.date) : new Date();

        // Apply filters
        if (duration < MIN_DURATION || duration > MAX_DURATION) continue;
        if (views < MIN_VIEWS) continue;
        if (uploadDate < cutoffDate) continue;
        if (!hasAnimalKeyword(title, description)) continue;
        passed++;

        // Dedup check
        if (!url || await db.videoExistsByUrl(url)) {
          duplicates++;
          continue;
        }

        // Insert to database
        await db.insertVideo({
          source_url: url,
          platform: 'youtube',
          views,
          likes: item.likes || null,
          duration_seconds: duration,
          original_title: title,
          original_description: description,
          original_hashtags: extractHashtags(`${title} ${description}`),
          original_emojis: extractEmojis(`${title} ${description}`),
          original_keywords: title.toLowerCase().split(/\s+/).filter(w => w.length > 3),
          thumbnail_url: item.thumbnailUrl || null,
          author_username: item.channelName || item.author || null,
          status: 'queued',
        });

        added++;
        log.info(`[scrape] Added: "${title.slice(0, 60)}" (${views} views, ${duration}s)`);

        // Try to download and store video file
        try {
          const filename = `${Date.now()}_${url.replace(/[^a-zA-Z0-9]/g, '_').slice(0, 50)}.mp4`;
          const storageUrl = await uploadVideoFromUrl(url, filename);
          if (storageUrl) {
            // Find the inserted row and update video_file_url
            const { data: rows } = await db.supabase.from('videos').select('id').eq('source_url', url).limit(1);
            if (rows?.[0]) await db.updateVideo(rows[0].id, { video_file_url: storageUrl });
          }
        } catch (dlErr) {
          log.warn(`[scrape] Video download failed: ${dlErr.message} — metadata saved, will retry later`);
        }
      }
    } catch (e) {
      log.error(`[scrape] Query "${query}" failed: ${e.message}`);
    }
  }

  log.info(`[scrape] Complete: ${found} found, ${passed} passed filters, ${duplicates} duplicates, ${added} added to queue`);
}

module.exports = { scrapeAndQueue };
