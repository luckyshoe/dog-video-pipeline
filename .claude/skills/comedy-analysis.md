# Comedy Analysis System — Replacing Google Vision

## Why Claude Vision Instead of Google Vision
Google Vision describes actions literally and mechanically.
It cannot understand comedy timing, emotional reactions,
surprise, or what makes a moment funny or viral.
Claude Vision understands narrative arc and emotional context.

## Frame Extraction
Extract exactly 10 frames evenly distributed across video duration.
Example: 12 second video -> frames at 0s, 1.3s, 2.6s, 4s, 5.3s,
6.6s, 8s, 9.3s, 10.6s, 12s

Also attempt to extract auto-captions/subtitles from:
- YouTube: use YouTube Data API captions endpoint
- TikTok: extract from video metadata if available
- Instagram: extract from metadata if available

## Claude Vision System Prompt for Comedy Analysis

SYSTEM:
"""
You are a viral comedy video analyst specializing in pet content.
Your job is to understand what makes a short video funny,
shareable, and emotionally engaging — the way a comedy writer
would analyze it, not the way a security camera would describe it.

You receive frames from a short video and any available captions.

CRITICAL: Describe actions with emotional and comedic accuracy,
not literal mechanical accuracy.

WRONG: "dog changes position on couch"
RIGHT: "dog launches off couch in pure startled panic"

WRONG: "dog moves upward"
RIGHT: "dog explodes upward with all four paws leaving
        the surface simultaneously in shock"

WRONG: "dog is on floor"
RIGHT: "dog lands on floor and immediately looks directly
        at camera with confused embarrassed expression"

Focus on:
- The comedy timing and arc (setup -> trigger -> reaction -> aftermath)
- The emotional state of the animal (not just physical position)
- What CAUSES the funny moment (sound, sight, surprise, other animal)
- The exact peak moment that makes people laugh or gasp
- What elements MUST be preserved for the recreation to be funny
"""

## Claude Vision User Prompt for Comedy Analysis

USER:
"""
Here are [N] frames from a [DURATION] second video.
Source platform: [PLATFORM]
Original title: [ORIGINAL_TITLE]
Available captions/subtitles: [CAPTIONS OR "none available"]

Analyze this video for comedy recreation. Return ONLY valid JSON:

{
  "animal_details": {
    "species": "dog/cat/etc",
    "breed": "specific breed if identifiable or best guess",
    "size": "small/medium/large",
    "color": "primary fur color",
    "distinctive_features": "any notable markings or features"
  },

  "setting": {
    "location": "couch/kitchen/yard/bed/etc",
    "props": ["list", "of", "visible", "objects"],
    "furniture_colors": "describe main furniture/background colors"
  },

  "comedy_arc": {
    "setup": "what is happening in the first moments —
              describe the calm before the storm",

    "trigger": "what CAUSES the funny reaction — be very specific.
                Is it a sound? What kind of sound?
                A person entering? Another animal?
                Something falling? Something on TV?
                Be precise about the cause.",

    "punchline_moment": "describe the exact peak funny action
                         with full emotional and physical accuracy.
                         Use vivid action words. This is the
                         most important field in this entire JSON.",

    "punchline_timing_seconds": number,

    "aftermath": "what happens after the punchline —
                  embarrassed look? Confused stare at camera?
                  Owner laughing? Dog running away?",

    "audio_trigger": "describe the sound that triggers the reaction
                      if applicable — doorbell, fart, bang,
                      owner voice, music sting, treat bag, etc.
                      Write 'visual trigger' if no audio involved"
  },

  "comedy_classification": {
    "emotion": "startled/scared/confused/excited/guilty/
                proud/jealous/suspicious/embarrassed",

    "style": "slapstick/reaction/fail/unexpected/
              cute/relatable/caught-in-the-act",

    "what_makes_it_funny": "one sentence — the core comedy
                             principle. Why do people laugh
                             or share this?"
  },

  "recreation_requirements": {
    "must_have_elements": [
      "list every element that MUST appear in recreation",
      "without these the video loses its comedy appeal",
      "be specific — timing, expressions, movements"
    ],
    "optional_elements": [
      "elements that add to the video but are not essential"
    ],
    "what_to_change": {
      "breed": "suggest a different breed to use",
      "fur_color": "suggest a different color",
      "setting_color": "suggest a different furniture/prop color",
      "reason": "brief note on why these changes make it different"
    }
  }
}
"""

## After Analysis — Quality Check
If any of these fields are empty or vague, re-run analysis:
- punchline_moment (must be specific and vivid)
- trigger (must identify a cause)
- must_have_elements (must have at least 3 items)

If analysis fails twice, mark video as "analysis_failed"
and move to next in queue.
