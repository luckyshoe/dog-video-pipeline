-- ============================================
-- Dog Video Pipeline — Supabase Schema
-- Run this in Supabase SQL Editor
-- ============================================

-- Table: videos (main pipeline table)
CREATE TABLE videos (
  id                        UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  source_url                TEXT UNIQUE NOT NULL,
  platform                  TEXT NOT NULL,
  views                     INTEGER,
  likes                     INTEGER,
  duration_seconds          INTEGER,
  original_title            TEXT,
  original_description      TEXT,
  original_hashtags         JSONB,
  original_emojis           TEXT,
  original_keywords         JSONB,
  thumbnail_url             TEXT,
  author_username           TEXT,
  video_file_url            TEXT,
  scraped_at                TIMESTAMPTZ DEFAULT NOW(),
  status                    TEXT DEFAULT 'queued',

  -- Analysis fields
  analysis_animal_species   TEXT,
  analysis_breed            TEXT,
  analysis_size             TEXT,
  analysis_color            TEXT,
  analysis_setting          TEXT,
  analysis_props            JSONB,
  analysis_setup            TEXT,
  analysis_trigger          TEXT,
  analysis_punchline        TEXT,
  analysis_punchline_timing INTEGER,
  analysis_aftermath        TEXT,
  analysis_audio_trigger    TEXT,
  analysis_emotion          TEXT,
  analysis_comedy_style     TEXT,
  analysis_what_makes_funny TEXT,
  analysis_must_haves       JSONB,
  analysis_what_to_change   JSONB,
  frames_extracted          JSONB,
  analyzed_at               TIMESTAMPTZ,

  -- Generation fields
  new_breed                 TEXT,
  new_color                 TEXT,
  starting_image_prompt     TEXT,
  starting_image_url        TEXT,
  video_prompt              TEXT,
  generated_video_url       TEXT,
  model_used                TEXT,
  video_duration            INTEGER,
  generation_cost           DECIMAL(10,4),
  generated_at              TIMESTAMPTZ,

  -- Captions
  captions_youtube          JSONB,
  captions_tiktok           JSONB,
  captions_instagram        JSONB,
  captions_facebook         JSONB,

  -- Approval
  telegram_message_id       TEXT,
  approval_status           TEXT,
  rejection_reason          TEXT,
  approved_at               TIMESTAMPTZ,

  -- YouTube
  youtube_video_id          TEXT,
  youtube_url               TEXT,
  posted_at                 TIMESTAMPTZ,

  -- Tracking
  error_log                 JSONB,
  retry_count               INTEGER DEFAULT 0,
  created_at                TIMESTAMPTZ DEFAULT NOW(),
  updated_at                TIMESTAMPTZ DEFAULT NOW()
);

-- Table: prompt_performance (tracks what works)
CREATE TABLE prompt_performance (
  id                        UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  video_id                  UUID REFERENCES videos(id) ON DELETE CASCADE,
  starting_image_prompt     TEXT,
  video_prompt              TEXT,
  model_used                TEXT,
  duration                  INTEGER,
  comedy_style              TEXT,
  breed_used                TEXT,
  was_approved              BOOLEAN,
  rejection_reason          TEXT,
  created_at                TIMESTAMPTZ DEFAULT NOW()
);

-- Table: learned_patterns (self-improvement memory)
CREATE TABLE learned_patterns (
  id                        UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  pattern_type              TEXT NOT NULL,
  pattern_description       TEXT NOT NULL,
  example_prompt_fragment   TEXT,
  approval_rate             DECIMAL(5,2),
  sample_size               INTEGER,
  added_at                  TIMESTAMPTZ DEFAULT NOW(),
  still_active              BOOLEAN DEFAULT TRUE
);

-- Indexes for performance
CREATE INDEX idx_videos_status ON videos(status);
CREATE INDEX idx_videos_scraped_at ON videos(scraped_at);
CREATE INDEX idx_videos_source_url ON videos(source_url);
CREATE INDEX idx_prompt_perf_video ON prompt_performance(video_id);
CREATE INDEX idx_prompt_perf_approved ON prompt_performance(was_approved);
CREATE INDEX idx_learned_patterns_type ON learned_patterns(pattern_type);
CREATE INDEX idx_learned_patterns_active ON learned_patterns(still_active);

-- Auto-update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER videos_updated_at
  BEFORE UPDATE ON videos
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at();

-- Enable Row Level Security (required by Supabase)
ALTER TABLE videos ENABLE ROW LEVEL SECURITY;
ALTER TABLE prompt_performance ENABLE ROW LEVEL SECURITY;
ALTER TABLE learned_patterns ENABLE ROW LEVEL SECURITY;

-- Allow service role full access (our server uses service key)
CREATE POLICY "Service role full access on videos"
  ON videos FOR ALL
  USING (true) WITH CHECK (true);

CREATE POLICY "Service role full access on prompt_performance"
  ON prompt_performance FOR ALL
  USING (true) WITH CHECK (true);

CREATE POLICY "Service role full access on learned_patterns"
  ON learned_patterns FOR ALL
  USING (true) WITH CHECK (true);
