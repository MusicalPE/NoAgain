#!/usr/bin/env bash
# 올리기 전 시험
#   bash tests/run.sh code   → 코드 검사만 (글귀·색·여백·그림 교체 같은 단순 수정)
#   bash tests/run.sh full   → 코드 검사 + 전체 시험 (새 기능·화면 배치·저장 방식 수정, 애매할 때)
set -e
cd "$(dirname "$0")/.."
node tests/check.mjs
if [ "${1:-full}" = "full" ]; then echo; python3 tests/full.py; fi
