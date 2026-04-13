require('dotenv').config();
const http = require('http');
const cron = require('node-cron');
const config = require('./lib/config');
const log = require('./lib/logger');
const db = require('./lib/db');
const { getBot } = require('./lib/telegram');
const { handleTelegramCallback, handleTextMessage } = require('./layers/telegram-handler');
const { scrapeAndQueue } = require('./layers/scrape');
const { analyzeNextVideo } = require('./layers/analyze');
const { generateVideo } = require('./layers/generate');
const { selfImprovementReview } = require('./layers/self-improve');

// --- Stuck Video Recovery ---
async function recoverStuckVideos() {
  const stuck = await db.getStuckVideos(30);
  for (const video of stuck) {
    const prevStatus = {
      analyzing: 'queued',
      generating: 'analyzed',
      uploading: 'approved',
    };
    const resetTo = prevStatus[video.status] || 'queued';
    const retryCount = (video.retry_count || 0) + 1;

    if (retryCount >= 5) {
      await db.updateVideo(video.id, { status: 'permanently_failed', retry_count: retryCount });
      log.error(`[recovery] ${video.id} permanently failed after 5 retries`);
      try {
        const telegram = require('./lib/telegram');
        await telegram.sendMessage(`Pipeline stuck: ${video.id}\nStatus: ${video.status} for 30+ min\nPermanently failed after 5 retries`);
      } catch {}
    } else {
      await db.updateVideo(video.id, { status: resetTo, retry_count: retryCount });
      log.warn(`[recovery] Reset ${video.id}: ${video.status} -> ${resetTo} (retry ${retryCount})`);
      try {
        const telegram = require('./lib/telegram');
        await telegram.sendMessage(`Pipeline stuck: ${video.id}\nStatus: ${video.status} for 30+ min\nAuto-reset to ${resetTo} (retry ${retryCount})`);
      } catch {}
    }
  }
}

// --- Wrap layer calls with error catching ---
async function safeRun(name, fn) {
  try {
    await fn();
  } catch (e) {
    log.error(`[${name}] Unhandled error: ${e.message}`);
  }
}

// --- HTTP Server (health check + Telegram webhook) ---
const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);

  res.setHeader('Content-Type', 'application/json');

  // Health check
  if (req.method === 'GET' && url.pathname === '/health') {
    try {
      const queued = await db.countByStatus('queued');
      const stats = await db.getStatsToday();
      res.writeHead(200);
      res.end(JSON.stringify({
        status: 'running',
        queued,
        generated_today: stats.generated_today,
        approved_today: stats.approved_today,
        uptime: process.uptime(),
      }));
    } catch (e) {
      res.writeHead(200);
      res.end(JSON.stringify({ status: 'running', error: e.message }));
    }
    return;
  }

  // Telegram webhook endpoint
  if (req.method === 'POST' && url.pathname === '/telegram-webhook') {
    let body = '';
    req.on('data', c => body += c);
    req.on('end', async () => {
      try {
        const update = JSON.parse(body);
        await getBot().handleUpdate(update);
      } catch (e) {
        log.error(`[webhook] ${e.message}`);
      }
      res.writeHead(200);
      res.end('ok');
    });
    return;
  }

  res.writeHead(404);
  res.end(JSON.stringify({ error: 'Not found' }));
});

// --- Start ---
async function start() {
  log.info('=== Dog Video Pipeline Starting ===');

  // Setup Telegram bot callback handler
  const bot = getBot();
  bot.on('callback_query', handleTelegramCallback);
  bot.on('text', handleTextMessage);

  // Set webhook if APP_URL is configured
  if (config.APP_URL && config.APP_URL !== 'http://localhost:3000') {
    const webhookUrl = `${config.APP_URL}/telegram-webhook`;
    try {
      await bot.telegram.setWebhook(webhookUrl);
      log.info(`[telegram] Webhook set: ${webhookUrl}`);
    } catch (e) {
      log.warn(`[telegram] Webhook setup failed: ${e.message} — falling back to polling`);
      bot.launch({ dropPendingUpdates: true }).catch(e => log.error(`[telegram] Launch failed: ${e.message}`));
    }
  } else {
    // Local dev: use polling
    log.info('[telegram] Using polling mode (no APP_URL set)');
    bot.launch({ dropPendingUpdates: true }).catch(e => log.error(`[telegram] Launch failed: ${e.message}`));
  }

  // Schedule cron jobs
  // Scraping: daily at 6am
  cron.schedule('0 6 * * *', () => safeRun('scrape', scrapeAndQueue));
  log.info('[cron] Scraping scheduled: daily at 6:00 AM');

  // Analysis: every hour on the hour
  cron.schedule('0 * * * *', () => safeRun('analyze', analyzeNextVideo));
  log.info('[cron] Analysis scheduled: every hour at :00');

  // Generation: every hour at :30
  cron.schedule('30 * * * *', () => safeRun('generate', generateVideo));
  log.info('[cron] Generation scheduled: every hour at :30');

  // Self-improvement: Sunday 9am
  cron.schedule('0 9 * * 0', () => safeRun('self-improve', selfImprovementReview));
  log.info('[cron] Self-improvement scheduled: Sunday 9:00 AM');

  // Stuck video recovery: every 15 minutes
  cron.schedule('*/15 * * * *', () => safeRun('recovery', recoverStuckVideos));
  log.info('[cron] Stuck recovery scheduled: every 15 minutes');

  // Start HTTP server
  server.listen(config.PORT, () => {
    log.info(`Server running on port ${config.PORT}`);
    log.info(`Health check: http://localhost:${config.PORT}/health`);
    log.info('=== Pipeline Ready ===');
  });
}

// Graceful shutdown
process.on('SIGINT', () => { log.info('Shutting down...'); process.exit(0); });
process.on('SIGTERM', () => { log.info('Shutting down...'); process.exit(0); });

start().catch(e => {
  log.error(`Fatal: ${e.message}`);
  process.exit(1);
});
