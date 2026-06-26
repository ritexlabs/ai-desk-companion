#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
# scripts/test.sh  —  Master test runner
#
# Runs the full test suite (backend + frontend) and prints a per-module
# summary report.
#
# Usage:
#   ./scripts/test.sh              # run all tests
#   ./scripts/test.sh --backend    # backend only
#   ./scripts/test.sh --frontend   # frontend only
#   ./scripts/test.sh --coverage   # include coverage report
# ─────────────────────────────────────────────────────────────────────────────

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
BACKEND_DIR="$REPO_ROOT/apps/orchestrator"
FRONTEND_DIR="$REPO_ROOT/apps/desktop"

# ── Colours ───────────────────────────────────────────────────────────────────
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
BOLD='\033[1m'
RESET='\033[0m'

# ── Argument parsing ──────────────────────────────────────────────────────────
RUN_BACKEND=true
RUN_FRONTEND=true
WITH_COVERAGE=false

for arg in "$@"; do
  case "$arg" in
    --backend)   RUN_FRONTEND=false ;;
    --frontend)  RUN_BACKEND=false  ;;
    --coverage)  WITH_COVERAGE=true ;;
    --help|-h)
      echo "Usage: $0 [--backend] [--frontend] [--coverage]"
      exit 0
      ;;
  esac
done

# ── Helpers ───────────────────────────────────────────────────────────────────
print_header() {
  echo ""
  echo -e "${BOLD}${CYAN}══════════════════════════════════════════════════════${RESET}"
  echo -e "${BOLD}${CYAN}  $1${RESET}"
  echo -e "${BOLD}${CYAN}══════════════════════════════════════════════════════${RESET}"
  echo ""
}

print_module_row() {
  local module="$1" passed="$2" failed="$3" status="$4"
  if [[ "$status" == "PASS" ]]; then
    printf "  ${GREEN}%-30s  %-6s  %-6s  %s${RESET}\n" "$module" "$passed" "$failed" "✓ PASS"
  else
    printf "  ${RED}%-30s  %-6s  %-6s  %s${RESET}\n"   "$module" "$passed" "$failed" "✗ FAIL"
  fi
}

BACKEND_EXIT=0
FRONTEND_EXIT=0
BACKEND_JSON=""
FRONTEND_JSON=""

# ── Backend (pytest) ──────────────────────────────────────────────────────────
if $RUN_BACKEND; then
  print_header "Backend Tests  (pytest)"

  VENV="$BACKEND_DIR/.venv"
  if [[ ! -f "$VENV/bin/python" ]]; then
    echo -e "${YELLOW}⚠  No .venv found at $VENV — creating one...${RESET}"
    python3 -m venv "$VENV"
  fi

  PYTHON="$VENV/bin/python3"

  echo "→ Installing dev dependencies..."
  "$PYTHON" -m pip install -q -r "$BACKEND_DIR/requirements.txt"
  "$PYTHON" -m pip install -q -r "$BACKEND_DIR/requirements-dev.txt"

  PYTEST_ARGS=(
    "--tb=short"
    "-q"
    "--no-header"
  )

  if $WITH_COVERAGE; then
    PYTEST_ARGS+=(
      "--cov=app"
      "--cov-report=term-missing"
      "--cov-report=json:$BACKEND_DIR/coverage.json"
    )
  fi

  set +e
  (
    cd "$BACKEND_DIR"
    "$PYTHON" -m pytest "${PYTEST_ARGS[@]}" tests/
  )
  BACKEND_EXIT=$?
  set -e
fi

# ── Frontend (vitest) ─────────────────────────────────────────────────────────
if $RUN_FRONTEND; then
  print_header "Frontend Tests  (vitest)"

  if [[ ! -d "$FRONTEND_DIR/node_modules" ]]; then
    echo "→ Installing npm dependencies..."
    (cd "$FRONTEND_DIR" && npm install --silent)
  fi

  VITEST_ARGS=("run")
  if $WITH_COVERAGE; then
    VITEST_ARGS+=("--coverage")
  fi

  set +e
  (
    cd "$FRONTEND_DIR"
    npx vitest "${VITEST_ARGS[@]}" --reporter=verbose 2>&1
  )
  FRONTEND_EXIT=$?
  set -e
fi

# ── Summary report ────────────────────────────────────────────────────────────
print_header "Test Summary Report"

echo -e "  ${BOLD}$(date '+%Y-%m-%d %H:%M:%S')${RESET}"
echo ""
printf "  ${BOLD}%-30s  %-6s  %-6s  %s${RESET}\n" "MODULE" "PASSED" "FAILED" "STATUS"
echo "  ──────────────────────────────────────────────────────────"

# Backend module results (from pytest output, manual parse if no JSON plugin)
if $RUN_BACKEND; then
  echo -e "  ${YELLOW}── Backend ────────────────────────────────────────────${RESET}"
  BACKEND_TEST_DIR="$BACKEND_DIR/tests"
  if [[ -d "$BACKEND_TEST_DIR" ]]; then
    for test_file in "$BACKEND_TEST_DIR"/**/*.py; do
      [[ "$test_file" == *"__init__"* ]] && continue
      [[ "$test_file" == *"conftest"* ]] && continue
      module=$(basename "$test_file" .py | sed 's/^test_//')
      # Run individual module for per-module counts
      set +e
      result=$(cd "$BACKEND_DIR" && "$VENV/bin/python3" -m pytest "$test_file" \
        -q --no-header --tb=no 2>&1 | tail -1)
      module_exit=$?
      set -e
      passed=$(echo "$result" | grep -oE '[0-9]+ passed' | grep -oE '[0-9]+' || echo "0")
      failed=$(echo "$result" | grep -oE '[0-9]+ failed' | grep -oE '[0-9]+' || echo "0")
      [[ -z "$passed" ]] && passed=0
      [[ -z "$failed" ]] && failed=0
      if [[ $module_exit -eq 0 ]]; then
        print_module_row "$module" "$passed" "$failed" "PASS"
      else
        print_module_row "$module" "$passed" "$failed" "FAIL"
      fi
    done
  fi
fi

if $RUN_FRONTEND; then
  echo ""
  echo -e "  ${YELLOW}── Frontend ───────────────────────────────────────────${RESET}"
  FE_TEST_DIR="$FRONTEND_DIR/src/__tests__"
  if [[ -d "$FE_TEST_DIR" ]]; then
    for test_file in "$FE_TEST_DIR"/**/*.test.ts "$FE_TEST_DIR"/**/*.test.tsx; do
      [[ -f "$test_file" ]] || continue
      module=$(basename "$test_file" | sed 's/\.test\.\(ts\|tsx\)$//')
      set +e
      result=$(cd "$FRONTEND_DIR" && npx vitest run "$test_file" \
        --reporter=verbose 2>&1)
      module_exit=$?
      set -e
      passed=$(echo "$result" | grep -oE '[0-9]+ passed'  | grep -oE '[0-9]+' | tail -1 || echo "0")
      failed=$(echo "$result" | grep -oE '[0-9]+ failed'  | grep -oE '[0-9]+' | tail -1 || echo "0")
      [[ -z "$passed" ]] && passed=0
      [[ -z "$failed" ]] && failed=0
      if [[ $module_exit -eq 0 ]]; then
        print_module_row "$module" "$passed" "$failed" "PASS"
      else
        print_module_row "$module" "$passed" "$failed" "FAIL"
      fi
    done
  fi
fi

echo ""
echo "  ──────────────────────────────────────────────────────────"

OVERALL_EXIT=0
if $RUN_BACKEND  && [[ $BACKEND_EXIT  -ne 0 ]]; then OVERALL_EXIT=1; fi
if $RUN_FRONTEND && [[ $FRONTEND_EXIT -ne 0 ]]; then OVERALL_EXIT=1; fi

if [[ $OVERALL_EXIT -eq 0 ]]; then
  echo -e "  ${GREEN}${BOLD}All tests passed!${RESET}"
else
  echo -e "  ${RED}${BOLD}Some tests failed — see output above.${RESET}"
fi
echo ""

exit $OVERALL_EXIT
