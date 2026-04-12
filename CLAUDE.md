# Automated Dog Video Pipeline — Claude Code Instructions

## Project Purpose
Fully automated pipeline that:
1. Scrapes viral dog/pet videos from YouTube, TikTok, Instagram
2. Analyzes them using Claude Vision for comedy understanding
3. Generates a modified version using fal.ai models
4. Sends to Telegram for human approval
5. Uploads to YouTube as private after approval
6. Learns from approvals and rejections to improve over time

## Critical Rules — Always Follow
- This is a cloud-hosted automated system — no localhost
- Never copy original video frames into generated content
- Always generate a fresh starting image via Nano Banana 2
  before video generation for any animal content
- Always use platform-safe language (see animal-anatomy.md)
- Never post automatically — always wait for Telegram approval
- Store everything in database before processing
- All API calls must have retry logic and error handling
- Log every action with timestamp and cost
- Read all skill files before working on their areas

## Environment Variables Required
FAL_KEY=
ANTHROPIC_API_KEY=
APIFY_API_TOKEN=
TELEGRAM_BOT_TOKEN=
TELEGRAM_CHAT_ID=
YOUTUBE_CLIENT_ID=
YOUTUBE_CLIENT_SECRET=
YOUTUBE_REFRESH_TOKEN=
SUPABASE_URL=
SUPABASE_ANON_KEY=
STORAGE_BUCKET_NAME=

## Skill Files Location
All skill files are in .claude/skills/
