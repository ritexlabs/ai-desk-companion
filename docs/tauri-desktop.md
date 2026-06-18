# Tauri Native Desktop App

Robo Wake-Up can run as a native desktop application using Tauri v2. The native app wraps the React frontend in a system window and adds:

- **System tray icon** — click to show/hide the window
- **Encrypted credential store** — API keys stored in an encrypted file (`@tauri-apps/plugin-store`), not just browser localStorage
- **Platform-native window** — proper taskbar integration on macOS, Windows, and Linux

---

## Prerequisites

### 1. Install Rust

Tauri requires the Rust toolchain. Install it via rustup:

```bash
curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh
```

After installation, restart your terminal and verify:
```bash
rustc --version   # should print rustc 1.70+
cargo --version
```

### 2. Platform-specific dependencies

**macOS**  
Xcode Command Line Tools are required:
```bash
xcode-select --install
```

**Linux (Debian/Ubuntu)**
```bash
sudo apt install libwebkit2gtk-4.1-dev build-essential curl wget file \
  libxdo-dev libssl-dev libayatana-appindicator3-dev librsvg2-dev
```

**Windows**  
Install Microsoft C++ Build Tools from aka.ms/buildtools. Select "Desktop development with C++".

---

## Development mode

Runs the native window wrapping the Vite dev server (hot reload works):

```bash
# Make sure the orchestrator is running first
cd apps/orchestrator
source .venv/bin/activate
uvicorn app.main:app --reload --port 8787

# In a separate terminal, start the Tauri dev window
cd apps/desktop
npm install       # first time only
npm run tauri:dev
```

A native window will open pointing to `http://localhost:5173`. The Vite dev server must be reachable.

---

## Production build

Creates a distributable binary for your current platform:

```bash
cd apps/desktop
npm run tauri:build
```

Output location:
```
apps/desktop/src-tauri/target/release/bundle/
├── macos/         .app bundle (macOS)
├── msi/           .msi installer (Windows)
├── nsis/          .exe installer (Windows)
└── deb/           .deb package (Linux)
```

Build time is typically 2–5 minutes on first run (Rust compilation). Subsequent builds are faster.

---

## System tray behaviour

| Action | Result |
|--------|--------|
| Click tray icon | Toggle window visibility |
| Right-click tray icon → Show | Bring window to front |
| Right-click tray icon → Quit | Exit the application |

The tray icon appears in the macOS menu bar, Windows system tray, or Linux notification area.

---

## Encrypted credential store

In Tauri mode, API keys are stored in an encrypted file using `@tauri-apps/plugin-store` instead of plain browser `localStorage`.

**Storage location:**
- **macOS:** `~/Library/Application Support/com.robo-wakeup.app/.robo-config.dat`
- **Windows:** `%APPDATA%\com.robo-wakeup.app\.robo-config.dat`
- **Linux:** `~/.local/share/com.robo-wakeup.app/.robo-config.dat`

The file is AES-encrypted by Tauri. The key is derived from the OS keychain / credential store.

The `src/lib/secureStore.ts` abstraction handles both modes transparently:
- In Tauri: reads/writes through `@tauri-apps/plugin-store`
- In browser: reads/writes through `localStorage` (fallback, same `robo-*` key names)

When the app starts in Tauri mode, `hydrateFromTauriStore()` is called before React mounts, copying the encrypted store values into `localStorage` for the runtime hooks to read.

---

## App configuration

Tauri app identity and window settings are in `apps/desktop/src-tauri/tauri.conf.json`.

Key settings:

```json
{
  "productName": "Robo Wake-Up",
  "identifier": "com.robo-wakeup.app",
  "window": {
    "width": 1200,
    "height": 800,
    "title": "Robo Wake-Up"
  }
}
```

---

## Checking if running in Tauri

The app detects the runtime environment automatically. Components and hooks check `window.__TAURI__` to determine which storage backend to use. No manual configuration is needed.

---

## Troubleshooting

**"cargo: command not found"**  
Rust is not installed or `~/.cargo/bin` is not in your `PATH`. Restart your terminal after installing Rust, or run: `source ~/.cargo/env`.

**Build fails with "linker not found"**  
Install the platform-specific C/C++ toolchain (see Prerequisites above).

**Tauri window is blank**  
The Vite dev server is not running. Start it with `npm run dev` in a separate terminal before running `npm run tauri:dev`.

**"Error: tauri.conf.json not found"**  
Make sure you are in the `apps/desktop` directory, not the repo root.

**Native window appears but can't connect to orchestrator**  
The orchestrator must be running on port 8787. `tauri://localhost` is included in the orchestrator's `allowed_origins` by default.
