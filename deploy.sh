#!/usr/bin/env bash
# 원격 배포 (GitHub Pages) — 저장소가 이미 존재해야 합니다.
# 사용: ./deploy.sh [저장소이름]   (기본 my-car-log)
set -euo pipefail
REPO="${1:-my-car-log}"
OWNER="${2:-luxrank-ops}"
DIR="$(cd "$(dirname "$0")" && pwd)"
cd "$DIR"

echo "[1/4] 원격 확인"
if ! gh repo view "$OWNER/$REPO" --json name >/dev/null 2>&1; then
  echo "저장소 $OWNER/$REPO 가 없습니다. https://github.com/new 에서 이름만 '$REPO'로 만들어 주세요." >&2
  exit 2
fi

echo "[2/4] 푸시"
git remote remove origin 2>/dev/null || true
git remote add origin "https://github.com/$OWNER/$REPO.git"
git branch -M main
git push -u origin main --force

echo "[3/4] GitHub Pages 켜기"
gh api -X POST "repos/$OWNER/$REPO/pages" -f "source[branch]=main" -f "source[path]=/" >/dev/null 2>&1 || \
gh api -X PUT "repos/$OWNER/$REPO/pages" -f "build_type=legacy" -f "source[branch]=main" -f "source[path]=/" >/dev/null 2>&1 || true

echo "[4/4] 빌드 대기"
URL="https://$OWNER.github.io/$REPO/"
for i in $(seq 1 40); do
  code=$(curl -s -o /dev/null -w '%{http_code}' "$URL" || true)
  if [ "$code" = "200" ]; then echo "OK  $URL"; exit 0; fi
  sleep 6
done
echo "아직 200이 아닙니다. 1~2분 뒤 다시 확인하세요: $URL" >&2
exit 3
