"""실행 중인 백엔드(local 프로파일, dev 로그인 활성)에 대한 동기화 핵심 시나리오 스모크 테스트.

사용: python backend/scripts/smoke_test.py [http://localhost:8080]
"""
import json
import sys
import time
import urllib.error
import urllib.request
import uuid

BASE = sys.argv[1] if len(sys.argv) > 1 else "http://localhost:8080"
failures = []


def call(method, path, body=None, token=None, headers=None):
    req = urllib.request.Request(BASE + path, method=method)
    req.add_header("Content-Type", "application/json")
    if token:
        req.add_header("Authorization", "Bearer " + token)
    for k, v in (headers or {}).items():
        req.add_header(k, v)
    data = json.dumps(body).encode() if body is not None else None
    try:
        with urllib.request.urlopen(req, data) as r:
            raw = r.read()
            return r.status, (json.loads(raw) if raw else None)
    except urllib.error.HTTPError as e:
        raw = e.read()
        try:
            return e.code, json.loads(raw)
        except Exception:
            return e.code, raw


def check(name, cond, detail=""):
    print(("PASS " if cond else "FAIL ") + name + ("" if cond else "  -> " + str(detail)))
    if not cond:
        failures.append(name)


def login(email):
    s, b = call("POST", "/api/auth/dev", {"email": email})
    assert s == 200, (s, b)
    return b


def item(nid=None, content="메모", deleted=False, version=0, date="2026-08-27"):
    return {"id": nid or str(uuid.uuid4()), "date": date, "content": content, "color": "#ff0",
            "deleted": deleted, "deleted_version": version}


def push(token, items, **hdr):
    return call("POST", "/api/sync/push", items, token, hdr)


def pull_all(token, since=None, limit=50):
    items, cursor, pages = [], None, 0
    while True:
        q = f"?limit={limit}" + (f"&since={since}" if since else "") + (f"&cursor={cursor}" if cursor else "")
        s, b = call("GET", "/api/sync/pull" + q, token=token)
        assert s == 200, (s, b)
        items += b["items"]
        pages += 1
        if not b["hasMore"]:
            return items, b["serverTime"], pages
        cursor = b["nextCursor"]


run = uuid.uuid4().hex[:8]
a = login(f"a-{run}@test.com")
b = login(f"b-{run}@test.com")
ta, tb = a["accessToken"], b["accessToken"]

# 인증
check("인증 없이 pull -> 401", call("GET", "/api/sync/pull")[0] == 401)
check("잘못된 토큰 -> 401", call("GET", "/api/sync/pull", token="x.y.z")[0] == 401)
check("refresh로 재발급", call("POST", "/api/auth/refresh", {"refreshToken": a["refreshToken"]})[0] == 200)
check("access 토큰으로 refresh 불가", call("POST", "/api/auth/refresh", {"refreshToken": ta})[0] == 401)

# 기본 push/pull + 서버 발급 updatedAt
n1 = item(content="회의 3시")
s, r = push(ta, [n1])
check("push 성공", s == 200 and r[0]["success"], (s, r))
items, server_time, _ = pull_all(ta)
got = next(i for i in items if i["id"] == n1["id"])
check("date는 순수 날짜 그대로", got["date"] == "2026-08-27", got)
check("서버가 updatedAt 발급", got["updatedAt"] and got["updatedAt"].endswith("Z"), got)

# 수정(LWW)
time.sleep(0.01)
push(ta, [item(n1["id"], "회의 4시로 변경")])
items, _, _ = pull_all(ta)
got2 = next(i for i in items if i["id"] == n1["id"])
check("수정 반영 + updatedAt 갱신", got2["content"] == "회의 4시로 변경" and got2["updatedAt"] > got["updatedAt"], got2)

# 청크/커서 Pull: 120건 → limit 50 → 3페이지, 중복/누락 없음
bulk = [item(content=f"bulk-{i}") for i in range(120)]
for i in range(0, 120, 60):
    s, r = push(ta, bulk[i:i + 60])
    assert s == 200 and all(x["success"] for x in r)
items, _, pages = pull_all(ta, limit=50)
ids = [i["id"] for i in items]
check("청크 Pull 페이지 수", pages == 3, pages)
check("청크 Pull 중복 없음", len(ids) == len(set(ids)), len(ids) - len(set(ids)))
check("청크 Pull 누락 없음", {x["id"] for x in bulk} <= set(ids))

# 부분 Pull 복구: 첫 청크만 받고 끊긴 뒤 cursor로 재개
s, p1 = call("GET", "/api/sync/pull?limit=50", token=ta)
resumed = p1["items"]
cur = p1["nextCursor"]
while cur:
    s, p = call("GET", f"/api/sync/pull?limit=50&cursor={cur}", token=ta)
    resumed += p["items"]
    cur = p["nextCursor"]
check("cursor 재개 시 전체 일치", [i["id"] for i in resumed] == ids)
check("잘못된 cursor -> 400", call("GET", "/api/sync/pull?cursor=zzz", token=ta)[0] == 400)

# since 이후만 조회
time.sleep(6)  # serverTime은 5초 lookback이므로, 앞선 push가 since 이전이 되도록 대기
_, st, _ = pull_all(ta)
time.sleep(6)
late = item(content="since 이후")
push(ta, [late])
items, _, _ = pull_all(ta, since=st)
check("since 이후 변경분 포함", any(i["id"] == late["id"] for i in items))
check("since 이전 변경분 제외", not any(i["id"] == bulk[0]["id"] for i in items))

# Tombstone 버전닝: 삭제 -> 삭제를 모르는 기기의 오래된 수정은 거부(부활 방지)
t = item(content="삭제될 메모")
push(ta, [t])
s, r = push(ta, [item(t["id"], "삭제될 메모", deleted=True)])
items, _, _ = pull_all(ta)
tomb = next(i for i in items if i["id"] == t["id"])
check("삭제는 tombstone으로 유지", tomb["deleted"] is True and tomb["deleted_version"] == 1, tomb)
s, r = push(ta, [item(t["id"], "오래된 수정", deleted=False, version=0)])
check("삭제된 항목에 대한 오래된 수정 거부", r[0]["success"] is False and r[0]["error"] == "CONFLICT_DELETED", r)
items, _, _ = pull_all(ta)
tomb = next(i for i in items if i["id"] == t["id"])
check("거부 후에도 삭제 상태 유지", tomb["deleted"] is True and tomb["content"] == "삭제될 메모", tomb)

# 복구: tombstone 버전을 확인한 클라이언트(version>=1)만 허용, 버전은 유지
s, r = push(ta, [item(t["id"], "복구됨", deleted=False, version=1)])
check("버전을 확인한 복구는 허용", r[0]["success"], r)
items, _, _ = pull_all(ta)
rest = next(i for i in items if i["id"] == t["id"])
check("복구 후 deleted=false, version 유지", rest["deleted"] is False and rest["deleted_version"] == 1, rest)
push(ta, [item(t["id"], "복구됨", deleted=True, version=1)])
items, _, _ = pull_all(ta)
check("재삭제 시 version 증가", next(i for i in items if i["id"] == t["id"])["deleted_version"] == 2)

# 다른 사용자의 id 충돌 -> 내용 변경 불가
s, r = push(tb, [item(n1["id"], "탈취 시도")])
check("타 사용자 노트 id로 push -> FORBIDDEN", r[0]["success"] is False and r[0]["error"] == "FORBIDDEN", r)
items, _, _ = pull_all(ta)
check("타 사용자 push가 내용을 바꾸지 못함", next(i for i in items if i["id"] == n1["id"])["content"] == "회의 4시로 변경")
check("타 사용자는 내 노트를 pull 못함", all(i["id"] != n1["id"] for i in pull_all(tb)[0]))

# 배치 부분 실패: 잘못된 항목 하나가 전체를 막지 않음
s, r = push(ta, [item(), {**item(), "id": "not-a-uuid"}])
check("검증 실패 항목이 있으면 400", s == 400, (s, r))
good = [item(), item(n1["id"], "x", deleted=False), item(t["id"], "y", deleted=False, version=0)]
s, r = push(ta, good)
check("배치 일부 실패해도 항목 단위 응답",
      s == 200 and [x["success"] for x in r] == [True, True, False], r)

# 공휴일 엔드포인트 (API 키가 없으면 빈 배열)
s, h = call("GET", "/api/holidays?year=2026", token=ta)
check("holidays 응답", s == 200 and isinstance(h, list), (s, h))
check("holidays 범위 검증", call("GET", "/api/holidays?year=1", token=ta)[0] == 400)

print("\n실패 %d건" % len(failures) if failures else "\n전체 통과")
sys.exit(1 if failures else 0)
