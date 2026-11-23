#!/usr/bin/env bash
# SessionStart(startup·clear) 훅: docs/ 핵심 문서를 세션 맥락에 넣는다.
# 01·05·06 은 전체, 나머지는 제목 목차만. 전체가 필요하면 /read-docs.
cd "${CLAUDE_PROJECT_DIR:-.}" 2>/dev/null || exit 0
[ -d docs ] || exit 0

cat <<'EOF'
# 이 프로젝트의 문서 (docs/) — 세션 시작 시 자동으로 읽음

작업 규칙:
- 기능을 시작하면 docs/05-progress.md 상태를 `진행중`, 확인 요청할 때 `확인대기`로 바꾼다. `완료`는 사용자가 승인한 뒤에만.
- 작업 로그는 05-progress.md "작업 로그" 맨 위에 `YYYY-MM-DD F00 — 한 줄`로 추가한다.
- 새 결정은 06-decisions.md 에 D-0xx 로 이유와 함께 남긴다. 뒤집으면 새 항목 + 이전 항목에 `→ D-0xx로 대체`.
- 코드를 바꾸면 관련 문서(02 구조, 03 프로토콜, 07 빌드, 08 운영)도 같이 고친다. README 에는 기능 설명과 받기(시작하기) 링크만 둔다.
- 아래에 전체가 없는 문서는 필요할 때 Read 로 읽는다(전부 필요하면 /read-docs).

EOF

for f in docs/01-overview.md docs/05-progress.md docs/06-decisions.md; do
  [ -f "$f" ] || continue
  printf '\n===== %s =====\n' "$f"
  if [ "$f" = docs/05-progress.md ]; then
    # 작업 로그는 최근 10줄만 (로그가 길어져도 훅 출력이 커지지 않게)
    awk '/^## 작업 로그/{inlog=1} inlog && /^- /{n++; if (n>10) {if (!cut) print "- … (이전 기록은 docs/05-progress.md)"; cut=1; next}} {print}' "$f"
  else
    cat "$f"
  fi
done

printf '\n===== 나머지 문서 목차 =====\n'
for f in docs/*.md; do
  case "$f" in docs/01-*|docs/05-*|docs/06-*) continue ;; esac
  printf '\n%s\n' "$f"
  # 코드 블록 안의 # 주석은 제외
  awk '/^```/{code=!code; next} !code && /^#{1,2} /{print "  " $0}' "$f"
done
exit 0
