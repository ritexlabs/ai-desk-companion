#!/usr/bin/env python3
"""
gen_tests.py — Auto-generate boilerplate test stubs for new modules.

Scans Python agent and service source files and creates a skeleton
test file for any module that does not already have one.

Usage:
    python scripts/gen_tests.py            # create stubs (safe — never overwrites)
    python scripts/gen_tests.py --dry-run  # print what would be created
    python scripts/gen_tests.py --list     # list source files vs test coverage
"""
from __future__ import annotations

import argparse
import ast
import sys
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parent.parent
BACKEND   = REPO_ROOT / 'apps' / 'orchestrator'

# Maps source directory → test directory
SCAN_MAP = {
    BACKEND / 'app' / 'agents':   BACKEND / 'tests' / 'test_agents',
    BACKEND / 'app' / 'services': BACKEND / 'tests' / 'test_services',
    BACKEND / 'app' / 'api':      BACKEND / 'tests' / 'test_api',
}

# Files to skip (not worth generating stubs for)
SKIP_NAMES = {'__init__', 'base', 'registry', 'clock'}


def _public_functions(source: Path) -> list[str]:
    """Return names of module-level functions/classes from a Python source file."""
    try:
        tree = ast.parse(source.read_text(encoding='utf-8'))
    except SyntaxError:
        return []
    names: list[str] = []
    for node in ast.walk(tree):
        if isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef, ast.ClassDef)):
            if not node.name.startswith('_'):
                names.append(node.name)
    return names


def _stub_content(source: Path, module_name: str, symbols: list[str]) -> str:
    import_path = f'app.{source.parent.name}.{module_name}'
    symbol_imports = ', '.join(symbols[:6]) if symbols else module_name.title()

    import_line = (
        f'from {import_path} import {symbol_imports}'
        if symbols else
        f'# from {import_path} import ...'
    )

    test_classes = []
    for sym in symbols[:8]:
        if sym[0].isupper():
            # It's a class → generate a test class
            test_classes.append(
                f'class Test{sym}:\n'
                f'    def test_{sym.lower()}_initialises(self):\n'
                f'        """Verify {sym} can be instantiated."""\n'
                f'        instance = {sym}()\n'
                f'        assert instance is not None\n'
            )
        else:
            # It's a function → generate a standalone test function
            test_classes.append(
                f'class Test{sym.title().replace("_", "")}:\n'
                f'    def test_{sym}_returns_expected(self):\n'
                f'        """TODO: implement test for {sym}."""\n'
                f'        result = {sym}()\n'
                f'        assert result is not None\n'
            )

    body = '\n\n'.join(test_classes) if test_classes else (
        f'class Test{module_name.title().replace("_", "")}:\n'
        f'    def test_placeholder(self):\n'
        f'        """TODO: add tests for {module_name}."""\n'
        f'        pass\n'
    )

    return (
        f'from __future__ import annotations\n\n'
        f'import pytest\n\n'
        f'{import_line}\n\n\n'
        f'{body}\n'
    )


def main() -> None:
    parser = argparse.ArgumentParser(description='Generate test stubs for untested modules.')
    parser.add_argument('--dry-run', action='store_true', help='Print actions without writing files')
    parser.add_argument('--list',    action='store_true', help='Show coverage table and exit')
    args = parser.parse_args()

    created: list[Path] = []
    already_covered: list[Path] = []
    skipped: list[Path] = []

    for src_dir, test_dir in SCAN_MAP.items():
        if not src_dir.exists():
            continue
        test_dir.mkdir(parents=True, exist_ok=True)
        init = test_dir / '__init__.py'
        if not init.exists() and not args.dry_run:
            init.touch()

        for src_file in sorted(src_dir.glob('*.py')):
            stem = src_file.stem
            if stem.startswith('__') or stem in SKIP_NAMES:
                skipped.append(src_file)
                continue

            test_file = test_dir / f'test_{stem}.py'
            if test_file.exists():
                already_covered.append(src_file)
                continue

            symbols = _public_functions(src_file)
            content = _stub_content(src_file, stem, symbols)

            if args.dry_run or args.list:
                print(f'  [WOULD CREATE] {test_file.relative_to(REPO_ROOT)}')
            else:
                test_file.write_text(content, encoding='utf-8')
                print(f'  [CREATED]      {test_file.relative_to(REPO_ROOT)}')
            created.append(src_file)

    if args.list:
        print('\n── Coverage status ──────────────────────────────────────')
        for src_dir in SCAN_MAP:
            if not src_dir.exists():
                continue
            for src_file in sorted(src_dir.glob('*.py')):
                stem = src_file.stem
                if stem.startswith('__') or stem in SKIP_NAMES:
                    continue
                test_file = SCAN_MAP[src_dir] / f'test_{stem}.py'
                status = '✓' if test_file.exists() else '✗'
                print(f'  {status}  {src_file.relative_to(REPO_ROOT)}')
        return

    print(f'\nDone. {len(created)} stub(s) created, {len(already_covered)} already covered, {len(skipped)} skipped.')
    if created and not args.dry_run:
        print('\nNext steps:')
        print('  1. Fill in the generated test stubs with real assertions.')
        print('  2. Run: ./scripts/test.sh --backend')


if __name__ == '__main__':
    main()
