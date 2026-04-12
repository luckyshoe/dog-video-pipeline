# Apify Scraping Configuration

## Apify Actors to Use
- YouTube Shorts: apify/youtube-scraper
- TikTok: clockworks/tiktok-scraper
- Instagram Reels: apify/instagram-scraper

## Search Queries (run all of these)
"funny dog scared"
"dog jump scare reaction"
"dog fails funny"
"dog startled funny"
"dog reaction hilarious"
"funny dog moments"
"dog comedy"
"hilarious dog video"
"dog scare prank funny"
"dog reaction video"

## Filters — Only Save Videos That Pass ALL of These
- Duration: 5 seconds to 59 seconds (Shorts/Reels/TikTok only)
- Views: 3000 or more
- Posted within: last 45 days
- Must contain animal (dog, cat, pet) in title OR description
- Must NOT already exist in database (deduplicate by source_url)

## What to Save Per Video
{
  source_url: string,
  platform: "youtube" | "tiktok" | "instagram",
  views: number,
  likes: number (if available),
  duration_seconds: number,
  original_title: string,
  original_description: string,
  original_hashtags: string[],
  original_emojis: string (extracted from title/description),
  original_keywords: string[],
  thumbnail_url: string,
  author_username: string,
  scraped_at: timestamp,
  status: "queued"
}

## Schedule
- Run daily at 6:00 AM
- Only run if queue has fewer than 15 "queued" items
- Download and store video file to cloud storage after saving metadata
- Max 20 new videos per scraping run
- Log how many were found, how many passed filters,
  how many were duplicates
