# List available tasks.
default:
    @just --list

# Serve locally; rebuild web sources on changes (fetch first).
dev:
    python -m vottle dev

# Download and validate official prices for today and tomorrow.
fetch:
    python -m vottle fetch

# Build the static dashboard from previously validated data.
build:
    python -m vottle build

# Fetch fresh official data and build the website.
update: fetch build

# Build a clearly marked, deterministic offline demonstration.
demo:
    python -m vottle fetch --date 2026-11-01 --fixtures tests/fixtures
    just build

# Run deterministic Python and JavaScript tests without network access.
test:
    python -m unittest discover -s tests -v
    node --test tests/*.test.mjs

# Check source formatting, Python lint and workflow syntax.
lint:
    ruff check vottle tests
    ruff format --check vottle tests
    nixfmt --check flake.nix nix/chartjs.nix
    actionlint
    node --check web/assets/app.js
    prettier --check web tests/*.mjs scripts/*.mjs README.md VERIFICATION.md nix/README.md tests/fixtures/README.md config/tariffs.json .github/workflows/*.yml

# Format Python and Nix sources.
fmt:
    ruff check --fix vottle tests
    ruff format vottle tests
    nixfmt flake.nix nix/chartjs.nix
    prettier --write web tests/*.mjs scripts/*.mjs README.md VERIFICATION.md nix/README.md tests/fixtures/README.md config/tariffs.json .github/workflows/*.yml

# Run every quality check.
check: lint test

# Remove generated website, downloaded data and caches.
clean:
    python -c 'import shutil; [shutil.rmtree(p, ignore_errors=True) for p in ["dist", "data", ".ruff_cache", "vottle/__pycache__", "tests/__pycache__"]]'
