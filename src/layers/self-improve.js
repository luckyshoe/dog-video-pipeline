const db = require('../lib/db');
const log = require('../lib/logger');
const { callClaude, parseJsonResponse } = require('../lib/claude');
const telegram = require('../lib/telegram');

/**
 * Weekly self-improvement review.
 * Analyzes last 7 days of prompt performance and learns patterns.
 */
async function selfImprovementReview() {
  log.info('[self-improve] Starting weekly review...');

  const records = await db.getRecentPerformance(7);
  if (records.length === 0) {
    log.info('[self-improve] No data from last 7 days');
    await telegram.sendMessage('Weekly Report: No videos generated this week.');
    return;
  }

  const approved = records.filter(r => r.was_approved);
  const rejected = records.filter(r => !r.was_approved);
  const approvalRate = ((approved.length / records.length) * 100).toFixed(0);

  // Count by style
  const styleStats = {};
  for (const r of records) {
    const style = r.comedy_style || 'unknown';
    if (!styleStats[style]) styleStats[style] = { total: 0, approved: 0 };
    styleStats[style].total++;
    if (r.was_approved) styleStats[style].approved++;
  }

  // Count by breed
  const breedStats = {};
  for (const r of records) {
    const breed = r.breed_used || 'unknown';
    if (!breedStats[breed]) breedStats[breed] = { total: 0, approved: 0 };
    breedStats[breed].total++;
    if (r.was_approved) breedStats[breed].approved++;
  }

  // Count rejection reasons
  const rejectionReasons = {};
  for (const r of rejected) {
    const reason = r.rejection_reason || 'unknown';
    rejectionReasons[reason] = (rejectionReasons[reason] || 0) + 1;
  }

  // Find best style
  let bestStyle = 'none';
  let bestStyleRate = 0;
  for (const [style, stats] of Object.entries(styleStats)) {
    const rate = stats.total > 0 ? stats.approved / stats.total : 0;
    if (rate > bestStyleRate) { bestStyleRate = rate; bestStyle = style; }
  }

  // Find best breed
  let bestBreed = 'none';
  let bestBreedRate = 0;
  for (const [breed, stats] of Object.entries(breedStats)) {
    const rate = stats.total > 0 ? stats.approved / stats.total : 0;
    if (rate > bestBreedRate) { bestBreedRate = rate; bestBreed = breed; }
  }

  // Top rejection reason
  const topRejection = Object.entries(rejectionReasons).sort((a, b) => b[1] - a[1])[0];

  // Ask Claude to extract prompt patterns
  try {
    const approvedPrompts = approved.map(r => r.video_prompt).filter(Boolean).join('\n---\n');
    const rejectedPrompts = rejected.map(r => `${r.video_prompt}\nRejection: ${r.rejection_reason}`).filter(Boolean).join('\n---\n');

    if (approvedPrompts || rejectedPrompts) {
      const analysisText = await callClaude({
        system: 'You are a video prompt analyst. Identify patterns in approved vs rejected prompts. Return JSON only.',
        userContent: `Approved prompts (${approved.length}):\n${approvedPrompts || 'none'}\n\nRejected prompts (${rejected.length}):\n${rejectedPrompts || 'none'}\n\nReturn JSON:\n{"working_patterns": ["pattern1", "pattern2"], "avoid_patterns": ["pattern1", "pattern2"]}`,
        maxTokens: 1000,
      });

      const patterns = parseJsonResponse(analysisText);

      // Save working patterns
      for (const p of (patterns.working_patterns || [])) {
        await db.insertPattern({
          pattern_type: 'working',
          pattern_description: p,
          approval_rate: parseFloat(approvalRate),
          sample_size: records.length,
        });
      }

      // Save avoid patterns
      for (const p of (patterns.avoid_patterns || [])) {
        await db.insertPattern({
          pattern_type: 'avoid',
          pattern_description: p,
          approval_rate: parseFloat(approvalRate),
          sample_size: records.length,
        });
      }

      log.info(`[self-improve] Saved ${(patterns.working_patterns || []).length} working + ${(patterns.avoid_patterns || []).length} avoid patterns`);
    }
  } catch (e) {
    log.warn(`[self-improve] Pattern extraction failed: ${e.message}`);
  }

  // Calculate total spend
  // Rough estimate: $1.79 per generated video
  const totalSpend = records.length * 1.79;
  const costPerApproved = approved.length > 0 ? (totalSpend / approved.length).toFixed(2) : 'N/A';

  // Send Telegram report
  const report = [
    'Weekly Performance Report',
    '──────────────────────────',
    `Videos generated: ${records.length}`,
    `Approved: ${approved.length} (${approvalRate}%)`,
    `Rejected: ${rejected.length} (${100 - parseFloat(approvalRate)}%)`,
    '',
    `Best style: ${bestStyle} (${(bestStyleRate * 100).toFixed(0)}% approval)`,
    `Best breed: ${bestBreed} (${(bestBreedRate * 100).toFixed(0)}% approval)`,
    '',
    topRejection ? `Top rejection reason: ${topRejection[0]} (${topRejection[1]}x)` : '',
    '',
    `Total spend: ~$${totalSpend.toFixed(2)}`,
    `Cost per approved video: $${costPerApproved}`,
  ].filter(Boolean).join('\n');

  await telegram.sendMessage(report);
  log.info('[self-improve] Weekly review complete');
}

module.exports = { selfImprovementReview };
