# Development Guide

How to set up a development environment, compile the application, and produce distribution builds on Linux and Windows.

---

## Table of contents

- [Prerequisites](#prerequisites)
  - [Linux](#linux)
  - [Windows](#windows)
- [Install JavaScript dependencies](#install-javascript-dependencies)
- [Development build](#development-build)
- [Distribution build](#distribution-build)
- [Command reference](#command-reference)
- [Troubleshooting (Linux)](#troubleshooting-linux)

---

## Prerequisites

### Linux

Tauri uses **WebKit2GTK** as its rendering engine on Linux. You need the GTK and WebKit development headers before the Rust build can succeed.

**Option A — run the setup script** (installs everything, including Node.js and Rust if missing):

```bash
bash scripts/setup-linux.sh
```

**Option B — install system packages manually:**

```bash
sudo apt-get update
sudo apt-get install -y \
  libwebkit2gtk-4.1-dev \
  libgtk-3-dev \
  build-essential \
  curl wget file \
  libxdo-dev \
  libssl-dev \
  libayatana-appindicator3-dev \
  librsvg2-dev \
  libdbus-1-dev \
  pkg-config
```

| Package | Purpose |
|---|---|
| `libwebkit2gtk-4.1-dev` | Tauri's rendering engine on Linux |
| `libgtk-3-dev` | GTK3 UI toolkit and GDK headers |
| `build-essential` | gcc, make, linker |
| `libxdo-dev` | X11 automation used by Tauri internals |
| `libssl-dev` | TLS support |
| `libayatana-appindicator3-dev` | System tray support |
| `librsvg2-dev` | SVG icon rendering |
| `libdbus-1-dev` | D-Bus IPC — transitive dep via `dbus` crate |
| `pkg-config` | Build-time library discovery |

**Node.js 20:**

```bash
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt-get install -y nodejs
```

**Rust stable (1.85+):**

```bash
curl https://sh.rustup.rs -sSf | sh -s -- -y --profile minimal
source "$HOME/.cargo/env"
```

> [!IMPORTANT]
> Inkwell's dependency tree requires Cargo **1.85+** (Rust edition 2024). Run `rustup update stable` if your toolchain is older.

---

### Windows

On Windows, Tauri uses **WebView2** — the same engine that powers Microsoft Edge — which ships pre-installed on Windows 10 and 11. No GTK or WebKit packages are needed.

| Requirement | Notes |
|---|---|
| [Rust (stable)](https://rustup.rs) | Choose the **MSVC** toolchain when prompted (`x86_64-pc-windows-msvc`) |
| [Node.js 18+](https://nodejs.org) | Download the LTS installer |
| [Visual Studio Build Tools](https://visualstudio.microsoft.com/visual-cpp-build-tools/) | Workload: **Desktop development with C++** |
| WebView2 | Pre-installed on Windows 10 (1803+) and Windows 11 |

> [!WARNING]
> When `rustup` asks which toolchain to install, choose **MSVC** (`x86_64-pc-windows-msvc`). The GNU toolchain does not link against the Visual Studio headers that Tauri requires.

**Install Rust on Windows (PowerShell):**

```powershell
Invoke-WebRequest -Uri https://sh.rustup.rs -OutFile rustup-init.exe
.\rustup-init.exe
```

---

## Install JavaScript dependencies

Run once from the project root after cloning:

```bash
npm install
```

---

## Development build

Starts the Vite dev server and the Tauri process together with hot-reload. Frontend changes refresh the window live; Rust changes trigger an incremental recompile.

```bash
npm run tauri dev
```

> [!NOTE]
> The first run takes several minutes — Cargo downloads and compiles all Rust dependencies from scratch. Subsequent runs are much faster.

**Frontend only (no Tauri):**

Runs the React app in a browser at `http://localhost:1420`. Any `invoke()` call will fail, so the splash screen will show an initialization error — expected behaviour.

```bash
npm run dev
```

---

## Distribution build

Compiles the frontend, then builds the Rust binary in release mode and bundles platform installers.

```bash
npm run tauri build
```

Output is written to `src-tauri/target/release/bundle/`.

**Linux bundles:**

| Format | Path |
|---|---|
| Debian package | `bundle/deb/inkwell_*.deb` |
| AppImage | `bundle/appimage/inkwell_*.AppImage` |
| Raw binary | `target/release/inkwell` |

**Windows bundles:**

| Format | Path |
|---|---|
| NSIS installer | `bundle\nsis\Inkwell_*.exe` |
| MSI installer | `bundle\msi\Inkwell_*.msi` |
| Raw binary | `target\release\inkwell.exe` |

**Binary only (no installers):**

Skips AppImage/deb/NSIS packaging and produces only the standalone binary. Useful for Docker or CI pipelines.

```bash
npm run tauri build -- --no-bundle
```

---

## Command reference

| Command | Description |
|---|---|
| `npm run tauri dev` | Full dev mode — Vite + Tauri with hot-reload |
| `npm run tauri build` | Release build with platform installers |
| `npm run tauri build -- --no-bundle` | Release build, binary only |
| `npm run dev` | Frontend only at `localhost:1420` (no Tauri IPC) |
| `npx tsc --noEmit` | TypeScript type-check without emitting files |

Run from `src-tauri/`:

| Command | Description |
|---|---|
| `cargo test` | Run Rust unit tests |
| `cargo clippy -- -D warnings` | Lint — treat warnings as errors |
| `cargo fmt` | Format Rust source files |

---

## Troubleshooting (Linux)

### Rust toolchain too old

```
error: feature `edition2024` is required (Cargo 1.83.0)
```

Update to Rust stable 1.85+:

```bash
rustup update stable
```

---

### Pango version conflict on Ubuntu 22.04 (Jammy)

```
libpango1.0-dev : Depends: libpango-1.0-0 (= 1.50.6+ds-2) but 1.50.6+ds-2ubuntu1 is to be installed
```

Jammy ships runtime pango libraries with an `ubuntu1` suffix but the `-dev` package requires the exact Debian version. Downgrade the runtime libraries to match:

```bash
sudo apt install \
  libpango-1.0-0=1.50.6+ds-2 \
  libpangocairo-1.0-0=1.50.6+ds-2 \
  libpangoft2-1.0-0=1.50.6+ds-2 \
  libpangoxft-1.0-0=1.50.6+ds-2 \
  gir1.2-pango-1.0=1.50.6+ds-2
sudo apt install libgtk-3-dev
```

---

### Package dbus-1 not found

```
The system library `dbus-1` required by crate `libdbus-sys` was not found.
```

```bash
sudo apt install libdbus-1-dev pkg-config
```

---

### Permission denied in cargo registry

```
failed to open ~/.cargo/registry/cache/… — Permission denied (os error 13)
```

```bash
sudo chown -R $USER:$USER ~/.cargo/registry
```
