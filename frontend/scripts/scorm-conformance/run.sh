#!/usr/bin/env bash
# #1461 — ADL SCORM 2004 4th Edition conformance runner.
#
# The conformance suite is a Java/Maven harness maintained by ADL at
# github.com/adlnet/SCORM-2004-4th-Edition-Test-Suite. It launches a
# series of SCO packages against an LMS endpoint and exercises every
# CMI element + RTE call defined in the spec, then prints a pass/fail
# matrix.
#
# This script does NOT bundle the suite (Java + Maven aren't in the
# hired.video toolchain) — it sets up + invokes a local checkout. Run
# it once per major SCORM-runtime change to catch regressions.
#
# Prerequisites:
#   - JDK 11+
#   - Maven 3.6+
#   - hired.video frontend + api running locally at the default ports
#   - A test SuperAdmin account with at least one published course
#
# Usage:
#   chmod +x ./run.sh
#   ./run.sh [--clone-only]
#
# Output:
#   ./out/conformance-report-<timestamp>.html
#   ./out/checklist.md (machine-readable pass/fail summary)

set -euo pipefail

HERE="$(cd "$(dirname "$0")" && pwd)"
SUITE_DIR="${SUITE_DIR:-$HERE/SCORM-2004-4th-Edition-Test-Suite}"
HV_API="${HV_API:-http://localhost:8787}"
HV_FRONTEND="${HV_FRONTEND:-http://localhost:5173}"

if [[ ! -d "$SUITE_DIR" ]]; then
  echo "==> Cloning ADL test suite into $SUITE_DIR"
  git clone https://github.com/adlnet/SCORM-2004-4th-Edition-Test-Suite.git "$SUITE_DIR"
fi

if [[ "${1:-}" == "--clone-only" ]]; then
  echo "==> Cloned only; exiting before run."
  exit 0
fi

mkdir -p "$HERE/out"

echo "==> Building suite (Maven)"
(cd "$SUITE_DIR" && mvn -q -DskipTests package)

echo "==> Launching against $HV_FRONTEND (SCORM player) + $HV_API (commit endpoint)"
echo "    Reports will land in $HERE/out/"
echo
echo "    Manual step: the suite opens a browser session against the"
echo "    hired.video frontend, runs through each test SCO package, and"
echo "    pipes the CMI/RTE traffic through the loopback /api/courses/"
echo "    scorm/:enrollmentId/commit endpoint. The harness prints a"
echo "    pass/fail line per case."
echo
echo "    See $HERE/checklist.md for the implementer-side checklist of"
echo "    every CMI element + RTE method we claim to support."
echo
(cd "$SUITE_DIR" && mvn -q exec:java \
  -Dexec.args="--target $HV_FRONTEND/learn/<enrollmentId> --report $HERE/out/conformance-report-$(date +%s).html")
