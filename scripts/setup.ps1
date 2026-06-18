# Run once after cloning: .\scripts\setup.ps1
# Sets up local git config so AI instruction files are never accidentally committed.

$ErrorActionPreference = "Stop"

$ProtectedFiles = @(
    "CLAUDE.md",
    "GEMINI.md",
    ".gemini/styleguide.md"
)

# ---------------------------------------------------------------------------
# 1. Mark AI instruction files as skip-worktree.
#    Git will track the template version but ignore all local edits.
#    Fill these files in freely — they will never be staged or pushed.
# ---------------------------------------------------------------------------
Write-Host "Marking AI instruction files as skip-worktree..."
foreach ($file in $ProtectedFiles) {
    if (Test-Path $file) {
        git update-index --skip-worktree $file
        Write-Host "  skip-worktree: $file"
    }
}

# ---------------------------------------------------------------------------
# 2. Point git to the project's tracked hooks directory.
#    This enables the pre-push safety check for all contributors.
# ---------------------------------------------------------------------------
git config core.hooksPath .github/hooks
Write-Host "Git hooks path set to .github/hooks"

Write-Host ""
Write-Host "Setup complete. Edit CLAUDE.md, GEMINI.md, and .gemini/styleguide.md freely."
Write-Host "Your changes will never be staged or pushed."
