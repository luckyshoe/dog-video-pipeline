# Self-Improvement Agent Rules

## What Gets Logged for Every Video
{
  video_id: string,
  source_platform: string,
  source_views: number,
  starting_image_prompt: string,
  video_generation_prompt: string,
  model_used: string,
  duration: number,
  punchline_description: string,
  comedy_style: string,
  was_approved: boolean,
  rejection_reason: string (if rejected),
  generated_at: timestamp,
  approved_at: timestamp (if approved)
}

## Weekly Review (runs every Sunday 9am)
Claude reviews last 7 days of generations and:

1. Finds patterns in approved videos:
   - Which prompt structures led to approvals?
   - Which breeds worked best?
   - Which comedy styles had highest approval rate?
   - Which duration was approved most?

2. Finds patterns in rejected videos:
   - What was the rejection reason?
   - Which prompt elements appeared in rejections?
   - Which breeds or settings caused issues?

3. Updates prompt-engineering.md with new learnings:
   - Adds to "PROVEN WORKING" section
   - Adds to "AVOID" section
   - Adjusts duration recommendations

4. Sends Telegram summary:
   "Weekly Report:
   Videos generated: [N]
   Approved: [N] ([%])
   Rejected: [N] ([%])

   Top performing style: [STYLE]
   Top performing breed: [BREED]
   Average cost per approved video: $[AMOUNT]

   Prompt improvements applied: [N]"
