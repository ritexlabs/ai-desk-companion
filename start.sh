#!/usr/bin/env bash
# Robo Wake-Up — macOS / Linux launcher
# Double-click in Finder, or run: bash start.sh

set -euo pipefail
cd "$(dirname "$0")"
exec python3 start.py "$@"
