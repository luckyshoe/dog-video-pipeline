const https = require('https');
const config = require('./config');
const { callWithRetry } = require('./retry');

/**
 * Call Claude API with retry on overload.
 */
async function callClaude({ system, userContent, maxTokens = 2000, model = 'claude-sonnet-4-6' }) {
  return callWithRetry('claude', async () => {
    const body = JSON.stringify({
      model,
      max_tokens: maxTokens,
      system,
      messages: [{ role: 'user', content: userContent }],
    });

    const result = await new Promise((resolve, reject) => {
      const req = https.request({
        hostname: 'api.anthropic.com',
        path: '/v1/messages',
        method: 'POST',
        headers: {
          'x-api-key': config.ANTHROPIC_API_KEY,
          'anthropic-version': '2023-06-01',
          'content-type': 'application/json',
          'content-length': Buffer.byteLength(body),
        },
      }, (res) => {
        let data = '';
        res.on('data', c => data += c);
        res.on('end', () => {
          try { resolve(JSON.parse(data)); }
          catch { reject(new Error('Claude response parse error')); }
        });
      });
      req.on('error', reject);
      setTimeout(() => { req.destroy(); reject(new Error('Claude timeout 60s')); }, 60000);
      req.write(body);
      req.end();
    });

    if (result.error?.type === 'overloaded_error') {
      throw new Error('Claude overloaded');
    }
    const text = result.content?.[0]?.text?.trim();
    if (!text) throw new Error('Empty Claude response');
    return text;
  }, 2, 5000);
}

/**
 * Call Claude Vision with images (base64).
 */
async function callClaudeVision({ system, textPrompt, images, maxTokens = 4000 }) {
  const content = [];
  for (const img of images) {
    content.push({
      type: 'image',
      source: { type: 'base64', media_type: img.mimeType || 'image/jpeg', data: img.base64 },
    });
  }
  content.push({ type: 'text', text: textPrompt });

  return callWithRetry('claude-vision', async () => {
    const body = JSON.stringify({
      model: 'claude-sonnet-4-6',
      max_tokens: maxTokens,
      system,
      messages: [{ role: 'user', content }],
    });

    const result = await new Promise((resolve, reject) => {
      const req = https.request({
        hostname: 'api.anthropic.com',
        path: '/v1/messages',
        method: 'POST',
        headers: {
          'x-api-key': config.ANTHROPIC_API_KEY,
          'anthropic-version': '2023-06-01',
          'content-type': 'application/json',
          'content-length': Buffer.byteLength(body),
        },
      }, (res) => {
        let data = '';
        res.on('data', c => data += c);
        res.on('end', () => {
          try { resolve(JSON.parse(data)); }
          catch { reject(new Error('Claude Vision parse error')); }
        });
      });
      req.on('error', reject);
      setTimeout(() => { req.destroy(); reject(new Error('Claude Vision timeout 120s')); }, 120000);
      req.write(body);
      req.end();
    });

    if (result.error?.type === 'overloaded_error') throw new Error('Claude overloaded');
    const text = result.content?.[0]?.text?.trim();
    if (!text) throw new Error('Empty Claude Vision response');
    return text;
  }, 2, 5000);
}

/**
 * Parse JSON from Claude response (handles markdown fences).
 */
function parseJsonResponse(text) {
  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  if (start === -1 || end === -1) throw new Error('No JSON found in response');
  return JSON.parse(text.slice(start, end + 1));
}

module.exports = { callClaude, callClaudeVision, parseJsonResponse };
