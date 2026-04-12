const log = require('./logger');

/**
 * Call an async function with retry logic.
 * @param {string} name - Name for logging
 * @param {Function} fn - Async function to call
 * @param {number} maxRetries - Max retry attempts (default 2)
 * @param {number} delayMs - Delay between retries in ms (default 30000)
 */
async function callWithRetry(name, fn, maxRetries = 2, delayMs = 30000) {
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (error) {
      if (attempt < maxRetries) {
        log.warn(`[${name}] Attempt ${attempt + 1} failed: ${error.message} — retrying in ${delayMs / 1000}s`);
        await new Promise(r => setTimeout(r, delayMs));
      } else {
        log.error(`[${name}] All ${maxRetries + 1} attempts failed: ${error.message}`);
        throw error;
      }
    }
  }
}

module.exports = { callWithRetry };
