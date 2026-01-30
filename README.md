# Call Guard AI — Real‑time Scam Call Detection

Call Guard AI is an Android app that analyzes call audio in short chunks, transcribes it (STT), then scores scam risk using an LLM-style endpoint, and shows the result in floating overlay widgets during/after analysis. [file:1]

## Why this project
Phone scams are increasing, and most users don’t know they’re being manipulated until it’s too late. This app experiments with real-time (or near real-time) AI assistance to flag suspicious patterns early.

## Key features
- Real-time-ish call monitoring (detects call state changes). [file:1]
- Live audio chunk capture (PCM 16-bit, 16kHz mono) for analysis. [file:1]
- STT → Risk scoring pipeline (STT API + Llama/LLM API). [file:1]
- Floating overlay UI: transcript window + score/status window. [file:1]
- Upload an audio file to analyze (for testing without a live call). [file:1]
- Basic dashboards: last result, average risk, high-risk count, history logs. [file:1]
- Settings for API endpoints + toggles stored via SharedPreferences. [file:1]
- Optional Telegram logging hooks (intended for debugging). [file:1]

## How it works (pipeline)
1. Record audio chunks (~7 seconds) using `AudioRecord` (16kHz mono PCM). [file:1]
2. Convert PCM to WAV (so the STT endpoint can consume it). [file:1]
3. Send WAV to the STT API endpoint → receive transcript. [file:1]
4. Send transcript/context to the LLM scoring endpoint → receive JSON score. [file:1]
5. Update floating overlays + store logs/history locally. [file:1]

## Screens
- Splash + onboarding flow. [file:1]
- Dashboard with tabs: Home, Analysis, Logs, About, Settings. [file:1]
- Floating overlay widgets during analysis. [file:1]

## Permissions
This app requests the following permissions (required for its core behavior): [file:1]
- Phone state: to detect incoming/outgoing call state changes. [file:1]
- Record audio: to capture audio chunks for analysis. [file:1]
- Call log (read): to show recent call history. [file:1]
- Overlay (“draw over other apps”): to display floating indicators. [file:1]

> Note: Overlay permission is handled via the system overlay settings screen on Android M+ (`Settings.canDrawOverlays`). [file:1]

## Configuration
You can configure endpoints and debugging options from the in-app Settings screen (saved with SharedPreferences). [file:1]

### API endpoints
- STT endpoint: `sttApiUrl` (persisted). [file:1]
- LLM scoring endpoint: `llamaApiUrl` (persisted). [file:1]

Recommended approach:
- Use local-only configuration (Settings screen) during development.
- Keep tokens server-side for production, or remove Telegram logging entirely.
