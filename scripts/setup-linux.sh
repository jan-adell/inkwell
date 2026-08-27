#!/usr/bin/env bash
set -euo pipefail

# ── System packages ───────────────────────────────────────────────────────────
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

# ── Node.js 20 ────────────────────────────────────────────────────────────────
#if ! command -v node &>/dev/null; then
#  curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
#  sudo apt-get install -y nodejs
#fi

# ── Rust stable ───────────────────────────────────────────────────────────────
#if ! command -v cargo &>/dev/null; then
#  curl https://sh.rustup.rs -sSf | sh -s -- -y --profile minimal
#  source "$HOME/.cargo/env"
#fi

echo "All dependencies installed. Run 'npm install && npm run tauri dev' to start."
