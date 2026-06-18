# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added
- **Alexa-style auto-listen loop** — after each response the app automatically starts listening for the next command without requiring a button press (`autoListenRef` flag in `useOrchestratorRuntime.ts`)
- **Inline wake commands** — say "Hey Robo, what's the weather?" in standby; the wake listener captures the command portion, stores it in `pendingCmdRef`, and executes it immediately after boot
- **Template-based farewell** — sleep phrases are now handled entirely in the frontend with a pre-written goodbye message; no LLM call is made, reducing latency and eliminating LLM language drift on exit
- **Per-agent voice modulations** — each agent now speaks with a distinct pitch and rate offset applied on top of the base voice config (`AGENT_VOICE_OFFSETS` table in `useVoice.ts`): System (lower/deliberate), Weather (brighter), Calendar (efficient), GitHub (tech-focused), Stock (authoritative), News (newsreader cadence)
- **Language consistency instruction** — system prompts in `orchestrator.py` and `general_ai.py` now explicitly instruct the LLM to always reply in the same language the user spoke; prevents mid-session language switching
- **Phase ref tracking** — `phaseRef` added to `useOrchestratorRuntime.ts` to make the current phase reliably readable inside async callbacks without stale closure issues
- **TTS engine pre-warming** — `window.speechSynthesis.cancel()` called on mount in `useVoice.ts` to prime Chrome's lazy TTS engine, reducing cold-start latency from ~250ms to ~150ms
- **Parallel agent boot** — `asyncio.gather` runs all agent health checks simultaneously in `ws.py`; greeting TTS and agent initialisation run in parallel via `asyncio.create_task`, cutting boot time proportionally to agent count
- **`_test_agent` coroutine** (`ws.py`) — encapsulates per-agent boot test with clean online / degraded / failed status reporting

### Changed
- **Wake-word pattern tightened** — bare "Robo" alone no longer wakes the app in standby. Only explicit triggers are accepted: "Robo, Wake-Up", "Wake-Up Robo", "Hey Robo", or "Hello Robo"
- **Sleep/farewell flow redesigned** — frontend now speaks the farewell first (`await speak(farewell)`), then sends `stop_session` to the orchestrator; this prevents the orchestrator's `phase_changed:sleep` event from overwriting the farewell text while it is still being spoken
- **`farewell_session` WS command removed** from the active flow — replaced by the template farewell + `stop_session` path; the handler remains in `ws.py` as a no-op fallback
- **Wake-prefix stripping in `ask()`** — if STT text starts with "Robo, " during an active session, the prefix is stripped before the text is sent to the LLM
- **Auto-listen gap reduced** from 700ms to 300ms
- **STT timeout reduced** from 8000ms to 5000ms
- **Wake-word listen window reduced** from 4000ms to 3000ms; standby loop gap reduced from 80ms to 30ms
- **TTS queue pause reduced** from 200ms to 50ms; muted-voice pause removed entirely
- **TTS cold-start delay reduced** from 250ms to 150ms; warm-interrupt delay reduced from 50ms to 30ms
- **Boot sequence delays eliminated** — removed 350ms boot delay, per-agent 300/200ms pauses, and 400ms response delay from local offline fallback
- **`asyncio.sleep(0.05)` calls removed** from all WebSocket send loops in `ws.py` (boot narration, command handler, farewell handler) — ~250ms saved per command
- **`askRef` sync** — changed from `() => ask()` closure to direct `ask` reference, keeping the ref always in sync with the latest `ask` closure
- **App name** updated to "AI Desk Companion" throughout README and docs
- **Repository URL** updated to `ritexlabs/ai-desk-companion`
- **README** fully rewritten with new voice interaction model, agent list, quick-start, and project structure
- **`docs/development.md`** fully rewritten — replaced all TODO placeholders with actual commands and added full environment variable reference

### Fixed
- **Continuous-listen loop** — `autoListenRef.current = false` set on no-speech result and voice-disabled toggle, preventing infinite silent-listen cycles
- **Double-listen race** — guard `if (!input && phaseRef.current === 'listening') return` in `ask()` prevents concurrent listen sessions when auto-listen and the manual button press fire simultaneously
- **Boot-phrase bleed-through** — inline command "Robo, Wake-Up" now correctly discards the residual "Wake-Up" text after stripping the wake pattern, so it is never sent to the LLM
- **Voice toggle desync** — `autoListenRef.current = false` added to the voice-disabled effect, so disabling the mic stops the auto-listen loop immediately
- **Farewell timing race** — farewell is now spoken before `stop_session` is sent, preventing the orchestrator's sleep event from overwriting the farewell text mid-speech

---

## Session 2 (migration session)

### Added
- **Codebase migration** — moved project from `personal-ai-agent` to `ai-desk-companion` monorepo under `ritexlabs` GitHub org
- **GitHub agent** (`app/agents/github.py`) — GitHub REST API, PR/issue/repo queries via Personal Access Token
- **Stock Market agent** (`app/agents/stock.py`) — Yahoo Finance via `yfinance`; Nifty, Sensex, BankNifty, NSE/NYSE tickers; RSI, SMA, 52-week range
- **News agent** (`app/agents/news.py`) — NewsAPI.org; top headlines + topic search; country/state/city config
- **LLM-based intent routing** — primary routing via zero-temperature LLM classifier; keyword fallback always active
- **Session farewell via `farewell_session` WS command** (later superseded by template-based farewell in Session 3)
- **openWakeWord server-side detection** (`app/services/wake_word.py`) — always-on `sounddevice` thread; `wake_word_detected` WS event
- **Real-time metrics service** (`app/services/metrics.py`) — per-agent timing, session/command counters; `metrics_update` broadcast every 5 s
- **Tauri native desktop wrapper** — `apps/desktop/src-tauri/` scaffold with system tray, window toggle, encrypted config store
- **Dual-mode secure storage** (`apps/desktop/src/lib/secureStore.ts`) — Tauri plugin-store in desktop mode; localStorage fallback in browser mode
- **Per-agent voice modulations** (initial) — `AGENT_VOICE_OFFSETS` in `useVoice.ts`

### Fixed
- **GitHub agent auth error** — `Authorization: token` header corrected to `Bearer` for GitHub REST API v3
- **Only System agent enabled by default** — `useOrchestratorRuntime.ts` default enabled-agents list set to `['system']`; all others disabled until user enables them in Settings
