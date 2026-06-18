#!/usr/bin/env bash
# Run once after cloning: ./scripts/setup.sh
# Sets up local git config so AI instruction files are never accidentally committed.

set -euo pipefail

ROOT="$(git rev-parse --show-toplevel)"

# ---------------------------------------------------------------------------
# 1. Mark AI instruction files as skip-worktree.
#    Git will track the template version but ignore all local edits.
#    Fill these files in freely — they will never be staged or pushed.
# ---------------------------------------------------------------------------
PROTECTED_FILES=(
  "CLAUDE.md"
  "GEMINI.md"
  ".gemini/styleguide.md"
)

echo "Marking AI instruction files as skip-worktree..."
for f in "${PROTECTED_FILES[@]}"; do
  if [ -f "$ROOT/$f" ]; then
    git -C "$ROOT" update-index --skip-worktree "$f"
    echo "  skip-worktree: $f"
  fi
done

# ---------------------------------------------------------------------------
# 2. Point git to the project's tracked hooks directory.
#    This enables the pre-push safety check for all contributors.
# ---------------------------------------------------------------------------
git -C "$ROOT" config core.hooksPath .github/hooks
echo "Git hooks path set to .github/hooks"

echo ""
echo "Setup complete. Edit CLAUDE.md, GEMINI.md, and .gemini/styleguide.md freely."
echo "Your changes will never be staged or pushed."
