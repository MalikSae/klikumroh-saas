#!/usr/bin/env bash
# Cross-compiles the Go binaries for the Linux VPS (DEPLOY.md, Bagian 0).
# Pure Go only (CGO_ENABLED=0): the binaries must run without system C libraries or external tools.
# Usage, from the repository root:  bash scripts/build-linux.sh
set -euo pipefail

cd "$(dirname "$0")/.."
mkdir -p dist

export GOOS=linux GOARCH=amd64 CGO_ENABLED=0

build() {
  local name=$1 pkg=$2
  echo "build dist/${name}  <- ${pkg}"
  go build -trimpath -ldflags "-s -w" -o "dist/${name}" "${pkg}"
}

build klikumroh-api ./cmd/api
build klikumroh-migrate ./cmd/migrate
build klikumroh-seed-demo ./cmd/seed-demo
build klikumroh-create-staff ./cmd/create-staff

echo "done:"
ls -l dist/klikumroh-api dist/klikumroh-migrate dist/klikumroh-seed-demo dist/klikumroh-create-staff
