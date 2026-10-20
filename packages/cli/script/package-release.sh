#!/usr/bin/env bash
# Package each built target under <dist>/cli-<target>/bin into a GitHub release asset
# <out>/dude-<target>.tar.gz with the binary at the archive root, matching how ./install
# downloads and extracts it (tar -xzf, then the binary is at the tarball root).
#
# Usage: package-release.sh [dist-dir] [out-dir]
#   dist-dir  directory containing the build output (default: packages/cli/dist)
#   out-dir   where to write the .tar.gz assets (default: same as dist-dir)
set -euo pipefail

dist="${1:-packages/cli/dist}"
out="${2:-$dist}"
mkdir -p "$out"

shopt -s nullglob
found=0
for d in "$dist"/cli-*/; do
  name="$(basename "$d")"   # e.g. cli-linux-x64-baseline
  target="${name#cli-}"     # e.g. linux-x64-baseline
  bindir="${d}bin"
  binfile=""
  for cand in dude dude.exe; do
    if [ -f "$bindir/$cand" ]; then binfile="$cand"; break; fi
  done
  if [ -z "$binfile" ]; then
    echo "warning: no binary under $bindir, skipping" >&2
    continue
  fi
  tar -czf "$out/dude-$target.tar.gz" -C "$bindir" "$binfile"
  echo "packaged $out/dude-$target.tar.gz ($binfile)"
  found=$((found + 1))
done

if [ "$found" -eq 0 ]; then
  echo "error: no built targets found under $dist (expected $dist/cli-*/bin/opencode)" >&2
  exit 1
fi
