# Video Generation Prompt Builder

## Input
Takes the comedy analysis JSON and builds two prompts:
1. Starting image prompt (for Nano Banana 2)
2. Video generation prompt (for Kling O3 Standard)

## Starting Image Prompt Template (Nano Banana 2)

Build this from analysis.what_to_change and animal_details:

"A photorealistic [NEW_BREED] dog with [NEW_FUR_COLOR] fur,
[SETUP_POSITION — e.g. relaxed and sitting on NEW_FURNITURE_COLOR couch],
natural canine anatomy, four paws clearly visible on surface,
fur-covered legs with natural paw pads, no human features anywhere,
[EMOTIONAL_STATE — e.g. calm and relaxed, eyes soft],
[SETTING — e.g. warm living room lighting],
centered composition, photorealistic quality"

## Video Generation Prompt Template (Kling O3 Standard)

Structure EXACTLY in this order:

[SHOT_TYPE], [NEW_BREED] dog with [NEW_FUR_COLOR] fur
[SETUP — describe the calm before the punchline],
[TRIGGER — describe what causes the reaction],
[PUNCHLINE_MOMENT — use vivid action words from analysis],
[AFTERMATH — embarrassed/confused look at camera etc],
[SETTING — environment with changed colors],
[CAMERA_MOVEMENT],
[AUDIO_DIRECTION],
[DURATION] seconds.

CRITICAL ANATOMY RULES:
- [NEW_BREED] dog maintains fully natural canine anatomy
  throughout entire video
- All four limbs are dog paws — NOT human hands or fingers
  at any point in the video
- Fur-covered legs terminating in natural paw pads only
- No anthropomorphization of any body part
- If dog interacts with objects it uses mouth or paws
  naturally — never human-style grip

## Shot Type Selection (pick based on comedy style)
- Slapstick/fail: "Wide shot"
- Reaction/expression: "Medium close-up shot"
- Caught-in-the-act: "Static camera, eye level"
- Startled/jump: "Slightly wide to capture full body movement"

## Camera Movement Selection
- Startled reaction: "static camera holds steady as dog reacts"
- Guilty/caught: "slow push-in to dog's face"
- Fail/tumble: "static camera captures full movement"
- Confusion: "static camera, dog looks directly into lens"

## Audio Direction Rules

For startled/scare videos:
"sudden [AUDIO_TRIGGER] sound effect,
comedic timing with reaction,
crowd laughter in background,
no dialogue"

For fail/tumble videos:
"ambient [SETTING] sounds,
comedic sound effect on impact,
owner laughter in background"

For caught-in-the-act:
"quiet ambient sounds,
comedic pause,
owner voice of surprise in background"

## Platform-Safe Language Reference

ALWAYS USE:               NEVER USE:
startled                  attacked
scared reaction           aggressive
jumps in surprise         violent
startled and bolts        hit/struck
comic stumble             injured/hurt
tumbles off               pain
launches in panic         fighting
freezes in shock          blood
scrambles away            abuse
comedic fall              dangerous
embarrassed expression    threatening
confused look at camera   harm
slapstick reaction        weapon
dramatic startle          force

## Duration Selection
- Under 8 second punchline timing: 10-12 second video
- 8+ second punchline timing: 13-15 second video
- Always target 12-15 seconds for maximum engagement

## LEARNED PATTERNS — DO USE:
(auto-populated by self-improvement agent)

## LEARNED PATTERNS — AVOID:
(auto-populated by self-improvement agent)
