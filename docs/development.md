# Development Guide

## Prerequisites

<!-- List required tools and versions. -->

- 

## Setup

```bash
# Clone the repository
git clone https://github.com/ritexlabs/<repo-name>.git
cd <repo-name>

# Install dependencies
# TODO: add your install command

# Copy environment variables
cp .env.example .env
# Edit .env with your local values

# One-time setup: protects AI instruction files from being accidentally pushed
# macOS / Linux
./scripts/setup.sh
# Windows (PowerShell)
.\scripts\setup.ps1

# Now edit CLAUDE.md, GEMINI.md, .gemini/styleguide.md freely —
# your changes will never be staged or committed.
```

## Running Locally

```bash
# TODO: add your dev start command
```

## Running Tests

```bash
# TODO: add your test command
```

## Project Structure

```
.
├── .github/          # GitHub configuration, workflows, templates
├── docs/             # Project documentation
├── src/              # Source code
└── ...
```

## Environment Variables

| Variable | Description | Required | Default |
|----------|-------------|----------|---------|
|          |             |          |         |

## Branching Strategy

- `main` — production-ready code, protected
- `develop` — integration branch (if used)
- `feat/*`, `fix/*`, `chore/*` — short-lived feature branches
