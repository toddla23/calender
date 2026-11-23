// 로그인 없이 보는 공개 페이지: 소개(/about), 개인정보처리방침(/privacy), 이용약관(/terms).
// Google OAuth 앱 인증은 로그인 없이 볼 수 있는 홈페이지와 개인정보처리방침을 요구한다 (08-hosting 6절).
// CSP 가 인라인 스타일을 막으므로 스타일은 /pages.css 로 따로 준다.
import type { Config } from './config.js';

export const esc = (s: string) => s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);

export const PAGES_CSS = `:root{--bg:#f7f7f9;--surface:#fff;--text:#1d1d22;--muted:#6b6b76;--line:#e2e2e8;--accent:#2f6fde;color-scheme:light dark}
@media (prefers-color-scheme:dark){:root{--bg:#17171b;--surface:#222228;--text:#ececf1;--muted:#a0a0ab;--line:#34343c;--accent:#6b9cff}}
*{box-sizing:border-box}
body{margin:0;background:var(--bg);color:var(--text);font:16px/1.65 system-ui,-apple-system,"Segoe UI","Malgun Gothic","Apple SD Gothic Neo",sans-serif}
main{max-width:760px;margin:0 auto;padding:32px 16px 64px}
header.top{display:flex;align-items:center;gap:12px;margin-bottom:24px}
header.top img{width:48px;height:48px;border-radius:12px}
header.top b{font-size:20px}
nav{display:flex;flex-wrap:wrap;gap:16px;margin:8px 0 32px;font-size:15px}
a{color:var(--accent)}
h1{font-size:28px;line-height:1.3;margin:0 0 12px}
h2{font-size:19px;margin:32px 0 8px;padding-top:16px;border-top:1px solid var(--line)}
.lead{font-size:18px;color:var(--muted)}
.cta{display:inline-block;margin:16px 0;padding:12px 22px;border-radius:10px;background:var(--accent);color:#fff;text-decoration:none;font-weight:600}
.card{background:var(--surface);border:1px solid var(--line);border-radius:12px;padding:16px 20px;margin:12px 0}
table{border-collapse:collapse;width:100%;font-size:15px}
th,td{border:1px solid var(--line);padding:8px;text-align:left;vertical-align:top}
th{background:var(--surface)}
.muted{color:var(--muted);font-size:14px}
footer{margin-top:48px;color:var(--muted);font-size:14px}
`;

export function layout(cfg: Config, title: string, body: string): string {
  return `<!doctype html><html lang="ko"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(title)}</title><link rel="stylesheet" href="/pages.css"><link rel="icon" href="/icons/icon.svg" type="image/svg+xml"></head>
<body><main>
<header class="top"><img src="/icons/icon-192.png" alt=""><b>바탕 달력</b></header>
<nav><a href="/about">소개</a><a href="/privacy">개인정보처리방침</a><a href="/terms">이용약관</a><a href="/">달력 열기</a></nav>
${body}
<footer>바탕 달력 · 개인이 운영하는 서버 · 문의 ${contactLink(cfg)}</footer>
</main></body></html>`;
}

export function contactLink(cfg: Config): string {
  return cfg.contactEmail ? `<a href="mailto:${esc(cfg.contactEmail)}">${esc(cfg.contactEmail)}</a>` : '서버 운영자';
}

const MB = (b: number) => Math.round(b / 1024 / 1024);

/** 소개 페이지 (Google OAuth 동의 화면의 "애플리케이션 홈페이지") */
export function aboutPage(cfg: Config): string {
  const signup = cfg.openSignup
    ? `<p>Google 계정이 있으면 누구나 가입할 수 있습니다. 처음 로그인하면 내 달력이 새로 만들어집니다.</p>`
    : `<p>지금은 운영자가 허용한 Google 계정만 로그인할 수 있습니다.</p>`;
  return layout(
    cfg,
    '바탕 달력 - 바탕화면에 붙는 메모 달력',
    `<h1>바탕화면에 붙는 메모 달력</h1>
<p class="lead">날짜 칸에 메모를 바로 적고, 윈도우 바탕화면·휴대폰·브라우저에서 같은 달력을 실시간으로 봅니다.</p>
<a class="cta" href="/">달력 열기 (Google 계정으로 로그인)</a>
${signup}

<h2>무엇을 하나요</h2>
<div class="card"><b>날짜 칸에 바로 메모</b><br>칸을 더블클릭(휴대폰은 탭)해서 적고, 칸마다 배경색을 고릅니다. 한국 공휴일과 대체공휴일이 표시됩니다.</div>
<div class="card"><b>모든 기기에서 실시간 동기화</b><br>한 기기에서 고치면 다른 기기에 1초 안에 반영됩니다. 오프라인에서 고친 내용은 연결되면 보냅니다. 두 기기에서 동시에 고쳐도 한쪽을 버리지 않고 합칩니다.</div>
<div class="card"><b>이전 버전으로 되돌리기</b><br>칸마다 최근 ${cfg.historyKeep}개 버전을 보관합니다.</div>
<div class="card"><b>윈도우 바탕화면 앱</b><br>테두리 없는 달력이 바탕화면에 붙어 있고, Win+D 를 눌러도 보입니다. 배경 투명도와 색을 바꿀 수 있습니다.</div>
<div class="card"><b>내 데이터는 내가</b><br>JSON 으로 내 달력 전체를 받을 수 있고, 계정을 삭제하면 서버에서 모두 지워집니다.</div>

<h2>Google 계정을 어떻게 쓰나요</h2>
<p>로그인할 때 Google 에서 <b>이메일 주소</b>만 받습니다(범위: <code>openid</code>, <code>email</code>). 이메일은 내 달력을 구분하고 로그인된 기기를 관리하는 데만 씁니다. 이름·사진·연락처·Gmail·Google 캘린더 등 다른 Google 데이터는 받지도, 읽지도 않습니다. 자세한 내용은 <a href="/privacy">개인정보처리방침</a>에 있습니다.</p>

<h2>알아 둘 점</h2>
<ul>
<li>개인이 집에서 운영하는 서버(라즈베리파이)입니다. 무료이고, 광고가 없습니다.</li>
<li>예고 없이 멈추거나 서비스를 끝낼 수 있습니다. 중요한 내용은 JSON 으로 따로 보관하세요.</li>
${cfg.openSignup ? `<li>가입 인원은 ${cfg.maxUsers}명까지이고, 메모·이력 저장 공간은 각각 ${MB(cfg.quotaBytes)}MB 입니다.</li>` : ''}
</ul>

<h2 lang="en">About (English)</h2>
<p lang="en">Batang Calendar is a personal, self-hosted desktop calendar. You write notes directly in day cells, and the same calendar syncs in real time across a Windows desktop app, phones and browsers. Signing in with Google only gives the app your email address (scopes <code>openid</code> and <code>email</code>), which is used solely to identify your own calendar and manage your signed-in devices. No other Google data is accessed. See the <a href="/privacy">privacy policy</a> and <a href="/terms">terms</a>.</p>`,
  );
}

/** 이용약관 */
export function termsPage(cfg: Config): string {
  return layout(
    cfg,
    '이용약관 - 바탕 달력',
    `<h1>이용약관</h1>
<p>바탕 달력(이하 "서비스")을 쓰면 아래 내용에 동의한 것으로 봅니다.</p>

<h2>1. 서비스</h2>
<p>서비스는 개인이 운영하는 무료 메모 달력입니다. 운영자는 서비스를 언제든 바꾸거나 멈추거나 끝낼 수 있습니다. 끝낼 때는 가능하면 미리 알리고, 데이터를 내보낼 시간을 둡니다.</p>

<h2>2. 계정</h2>
<p>Google 계정으로 로그인합니다. 계정과 로그인된 기기는 본인이 관리해야 합니다. 설정에서 언제든 계정을 삭제할 수 있습니다.</p>

<h2>3. 이용 규칙</h2>
<ul>
<li>법에 어긋나는 내용, 다른 사람의 권리를 침해하는 내용을 저장하지 않습니다.</li>
<li>서버에 과도한 부하를 주거나, 보안을 우회하거나, 다른 사용자의 데이터에 접근하려 하지 않습니다.</li>
<li>정해진 저장 공간과 요청 횟수 한도를 지킵니다.</li>
</ul>
<p>규칙을 어기면 운영자는 경고 없이 계정의 로그인을 막거나 데이터를 지울 수 있습니다.</p>

<h2>4. 데이터</h2>
<p>달력에 적은 내용의 권리는 작성한 사용자에게 있습니다. 운영자는 서비스를 제공하는 데 필요한 만큼만 저장·처리합니다(<a href="/privacy">개인정보처리방침</a>). 백업을 하지만 데이터 보존을 보장하지는 않습니다. 중요한 내용은 JSON 내보내기로 따로 보관하세요.</p>

<h2>5. 책임</h2>
<p>서비스는 "있는 그대로" 무료로 제공됩니다. 법이 허용하는 범위에서 운영자는 서비스 중단, 데이터 손실, 동기화 오류로 생긴 손해에 책임지지 않습니다.</p>

<h2>6. 변경</h2>
<p>약관을 바꾸면 이 페이지에 올리고 시행일을 고칩니다. 바뀐 뒤에도 계속 쓰면 바뀐 약관에 동의한 것으로 봅니다.</p>

<h2>7. 문의</h2>
<p>${contactLink(cfg)}</p>
<p class="muted">시행일: ${TERMS_EFFECTIVE}</p>`,
  );
}

export const TERMS_EFFECTIVE = '2026-11-23';
