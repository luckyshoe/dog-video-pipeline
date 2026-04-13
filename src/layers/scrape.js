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

const MAX_PER_PLATFORM = 5;
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

/**
 * Extract common fields from any platform's item.
 */
function normalizeItem(item, platform) {
  if (platform === 'youtube') {
    return {
      url: item.url || item.videoUrl || '',
      title: item.title || '',
      description: item.description || '',
      views: item.viewCount || item.views || 0,
      likes: item.likes || null,
      duration: item.duration || item.durationSeconds || 0,
      date: item.date ? new Date(item.date) : new Date(),
      thumbnail: item.thumbnailUrl || null,
      author: item.channelName || item.author || null,
    };
  } else if (platform === 'tiktok') {
    return {
      url: item.webVideoUrl || item.url || '',
      title: item.text || item.desc || '',
      description: item.text || item.desc || '',
      views: item.playCount || item.views || 0,
      likes: item.diggCount || item.likes || null,
      duration: item.videoMeta?.duration || item.duration || 0,
      date: item.createTime ? new Date(item.createTime * 1000) : new Date(),
      thumbnail: item.covers?.default || item.thumbnailUrl || null,
      author: item.authorMeta?.name || item.author || null,
    };
  } else if (platform === 'instagram') {
    return {
      url: item.url || item.shortCode ? `https://www.instagram.com/reel/${item.shortCode}/` : '',
      title: item.caption || '',
      description: item.caption || '',
      views: item.videoViewCount || item.viewCount || item.likesCount || 0,
      likes: item.likesCount || null,
      duration: item.videoDuration || item.duration || 0,
      date: item.timestamp ? new Date(item.timestamp) : new Date(),
      thumbnail: item.displayUrl || item.thumbnailUrl || null,
      author: item.ownerUsername || item.author || null,
    };
  }
  return null;
}

/**
 * Scrape a single platform. Returns number of videos added.
 */
async function scrapePlatform(client, platform, cutoffDate) {
  let added = 0, found = 0, passed = 0, duplicates = 0;
  const queries = [...SEARCH_QUERIES]; // shuffle could help variety

  for (const query of queries) {
    if (added >= MAX_PER_PLATFORM) break;

    try {
      log.info(`[scrape] Searching ${platform}: "${query}"`);

      let runInput = {};
      if (platform === 'youtube') {
        runInput = { searchKeywords: [query], maxResults: 10, type: 'shorts' };
      } else if (platform === 'tiktok') {
        runInput = { searchQueries: [query], resultsPerPage: 10 };
      } else if (platform === 'instagram') {
        runInput = { search: query, resultsLimit: 10, searchType: 'hashtag' };
      }

      const run = await client.actor(ACTORS[platform]).call(runInput);
      const { items } = await client.dataset(run.defaultDatasetId).listItems();
      found += items.length;

      for (const item of items) {
        if (added >= MAX_PER_PLATFORM) break;

        const norm = normalizeItem(item, platform);
        if (!norm || !norm.url) continue;

        // Apply filters
        if (norm.duration < MIN_DURATION || norm.duration > MAX_DURATION) continue;
        if (norm.views < MIN_VIEWS) continue;
        if (norm.date < cutoffDate) continue;
        if (!hasAnimalKeyword(norm.title, norm.description)) continue;
        passed++;

        // Dedup check
        if (await db.videoExistsByUrl(norm.url)) {
          duplicates++;
          continue;
        }

        const combined = `${norm.title} ${norm.description}`;
        await db.insertVideo({
          source_url: norm.url,
          platform,
          views: norm.views,
          likes: norm.likes,
          duration_seconds: norm.duration,
          original_title: norm.title,
          original_description: norm.description,
          original_hashtags: extractHashtags(combined),
          original_emojis: extractEmojis(combined),
          original_keywords: norm.title.toLowerCase().split(/\s+/).filter(w => w.length > 3),
          thumbnail_url: norm.thumbnail,
          author_username: norm.author,
          status: 'queued',
        });

        added++;
        log.info(`[scrape] [${platform}] Added: "${norm.title.slice(0, 50)}" (${norm.views} views, ${norm.duration}s)`);

        // Try to download video file
        try {
          const filename = `${Date.now()}_${platform}_${norm.url.replace(/[^a-zA-Z0-9]/g, '_').slice(0, 40)}.mp4`;
          const storageUrl = await uploadVideoFromUrl(norm.url, filename);
          if (storageUrl) {
            const { data: rows } = await db.supabase.from('videos').select('id').eq('source_url', norm.url).limit(1);
            if (rows?.[0]) await db.updateVideo(rows[0].id, { video_file_url: storageUrl });
          }
        } catch (dlErr) {
          log.warn(`[scrape] Video download failed: ${dlErr.message}`);
        }
      }
    } catch (e) {
      log.error(`[scrape] [${platform}] Query "${query}" failed: ${e.message}`);
    }
  }

  log.info(`[scrape] [${platform}] Done: ${found} found, ${passed} passed, ${duplicates} dupes, ${added} added`);
  return added;
}

async function scrapeAndQueue() {
  log.info('[scrape] Starting scrape run...');

  // Check queue size
  const queueCount = await db.countByStatus('queued');
  if (queueCount >= 30) {
    log.info(`[scrape] Queue has ${queueCount} items (>= 30). Skipping scrape.`);
    return;
  }

  const client = new ApifyClient({ token: config.APIFY_API_TOKEN });
  const cutoffDate = new Date(Date.now() - MAX_AGE_DAYS * 86400000);

  const ytAdded = await scrapePlatform(client, 'youtube', cutoffDate);
  const ttAdded = await scrapePlatform(client, 'tiktok', cutoffDate);
  const igAdded = await scrapePlatform(client, 'instagram', cutoffDate);

  const total = ytAdded + ttAdded + igAdded;
  log.info(`[scrape] Complete: YouTube=${ytAdded}, TikTok=${ttAdded}, Instagram=${igAdded}, Total=${total}`);
}

module.exports = { scrapeAndQueue };
