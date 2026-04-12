# fal.ai Models and Endpoints

## Image Generation

### Nano Banana 2 — Starting Frame Only
Endpoint: fal-ai/nano-banana-2
Price: $0.08 per image (1K resolution)
Use: Generate the starting reference image for ALL animal videos
This is the ONLY image generation step — one image per video
Parameters: { prompt, image_size: "square_hd", num_images: 1 }

## Video Generation

### Kling O3 Standard — PRIMARY VIDEO MODEL
Text-to-video: fal-ai/kling-video/o3/standard/text-to-video
Image-to-video: fal-ai/kling-video/o3/standard/image-to-video
Price with audio: $0.112 per second
Max duration: 15 seconds
Audio: enabled by default
Use image-to-video endpoint when Nano Banana 2 image was generated
Parameters for i2v: { prompt, image_url, duration, generate_audio: true }
Parameters for t2v: { prompt, duration, generate_audio: true, aspect_ratio: "9:16" }
Note: aspect_ratio only on t2v, NOT on i2v
Note: duration is a String, not integer

### Kling 2.6 Standard — BUDGET FALLBACK
Text-to-video: fal-ai/kling-video/v2/master/text-to-video
Image-to-video: fal-ai/kling-video/v2/master/image-to-video
Price with audio: $0.14 per second
Max duration: 10 seconds
Use when cost needs to be lower and 10 seconds is acceptable

### LTX-2.3 Fast — TESTING ONLY
Text-to-video: fal-ai/ltx-2.3/text-to-video/fast
Price: $0.04 per second
Max duration: 20 seconds
Use ONLY for testing prompts before production run
Never send LTX output to Telegram for approval
Note: duration_seconds is integer, not string

## Post-Processing

### Kling LipSync — TALKING VIDEOS ONLY
Endpoint: fal-ai/kling-video/lipsync/audio-to-video
Price: $0.014 per input video second (5s minimum)
Use only if video involves a character speaking/lip sync
Parameters: { video_url, audio_url }

## Cost Per Video (Standard Production)
Nano Banana 2 image:     $0.08
Kling O3 15s with audio: $1.68
Claude API calls:        ~$0.03
Total per video:         ~$1.79

## SDK Usage
Use @fal-ai/client SDK for all fal.ai calls:
  const { fal } = require('@fal-ai/client');
  fal.config({ credentials: FAL_KEY });
  const result = await fal.subscribe(endpointId, { input: payload });
SDK handles submit + poll + result automatically.
