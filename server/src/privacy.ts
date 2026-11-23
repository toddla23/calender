import type { Config } from './config.js';
import { contactLink, layout } from './pages.js';

/** 시행일. 내용을 바꾸면 날짜도 바꾼다. */
export const PRIVACY_EFFECTIVE = '2026-11-23';

const MB = (b: number) => Math.round(b / 1024 / 1024);

/** 개인정보처리방침 (/privacy). Google OAuth 동의 화면에 등록하는 주소다. */
export function privacyPage(cfg: Config): string {
  const origin = new URL(cfg.publicUrl).origin;
  return layout(
    cfg,
    '개인정보처리방침 - 바탕 달력',
    `<h1>개인정보처리방침</h1>
<p>바탕 달력(${origin}, 이하 "서비스")은 개인이 운영하는 메모 달력입니다. 이 문서는 서비스가 어떤 정보를 받고, 왜 쓰고, 어디에 얼마나 보관하고, 언제 지우는지 설명합니다.</p>

<h2>1. Google 사용자 데이터</h2>
<p>서비스는 "Google 계정으로 로그인"에 Google OAuth 를 씁니다. 요청하는 범위는 <code>openid</code> 와 <code>email</code> 두 가지뿐입니다.</p>
<table>
<tr><th>받는 Google 데이터</th><th>쓰는 곳</th></tr>
<tr><td>이메일 주소</td><td>내 달력을 다른 사용자의 달력과 구분하고, 로그인된 기기를 관리하고, 허용된 계정인지 확인합니다.</td></tr>
<tr><td>이메일 인증 여부</td><td>Google 이 확인한 이메일인지 검사합니다. 저장하지 않습니다.</td></tr>
<tr><td>Google 계정 고유 ID 등 ID 토큰의 나머지 값</td><td>로그인 순간 서명 검증에만 쓰고 저장하지 않습니다.</td></tr>
</table>
<ul>
<li>이름, 프로필 사진, 연락처, Gmail, Google 캘린더, Google 드라이브 등 다른 Google 데이터는 요청하지 않고 읽지 않습니다.</li>
<li>Google 액세스 토큰·리프레시 토큰은 저장하지 않습니다. 로그인이 끝나면 서비스는 Google API 를 다시 부르지 않습니다.</li>
<li>Google 사용자 데이터를 광고, 판매, 신용 평가, AI·머신러닝 모델 학습에 쓰지 않고, 다른 사람에게 넘기지 않습니다.</li>
<li>서비스의 Google 사용자 데이터 사용은 <a href="https://developers.google.com/terms/api-services-user-data-policy">Google API 서비스 사용자 데이터 정책</a>(제한적 사용 요구사항 포함)을 따릅니다.</li>
</ul>

<h2>2. 서비스가 저장하는 정보</h2>
<table>
<tr><th>정보</th><th>목적</th><th>보관 기간</th></tr>
<tr><td>Google 이메일 주소</td><td>계정 구분, 로그인</td><td>계정 삭제 때까지</td></tr>
<tr><td>달력 메모, 칸 색, 수정 이력(칸마다 최근 ${cfg.historyKeep}개)</td><td>달력 기능, 여러 기기 동기화, 되돌리기</td><td>계정 삭제 때까지 (이력은 개수·용량 한도를 넘으면 오래된 것부터 지움)</td></tr>
<tr><td>로그인한 기기 정보: 기기 이름(브라우저·운영체제 종류 또는 PC 이름), 로그인 시각, 마지막 사용 시각, 마지막 접속 IP 주소</td><td>로그인된 기기 목록 표시와 해제, 무단 접근 확인</td><td>계정 삭제 때까지. 로그인은 ${cfg.tokenIdleDays}일 동안 안 쓰면 만료</td></tr>
<tr><td>로그인 토큰의 해시값(원문은 저장하지 않음)</td><td>기기 로그인 유지</td><td>위와 같음</td></tr>
<tr><td>서버 기록(로그): 로그인 성공·실패 시 IP 주소와 이메일, 오류</td><td>보안, 남용 방지, 장애 확인</td><td>최대 30MB 를 넘으면 오래된 것부터 자동 삭제</td></tr>
<tr><td>백업 파일(위 정보 전체)</td><td>장애·실수 복구</td><td>매일 만들고 최근 ${cfg.backup.keep}개(약 ${cfg.backup.keep}일)만 보관</td></tr>
</table>
<p>운영자는 저장 공간 관리와 남용 방지를 위해 관리자 화면에서 계정별 이메일, 가입일, 마지막 사용 시각, 기기 수, 메모 칸 수, 저장 용량, 저장 횟수를 봅니다. 메모 내용은 관리자 화면에 나오지 않습니다.</p>
<p>서비스는 광고 추적 도구, 분석 도구, 제3자 쿠키를 쓰지 않습니다.</p>

<h2>3. 내 기기에 저장되는 정보</h2>
<ul>
<li>웹·휴대폰: 로그인 쿠키(<code>dc_session</code>, HttpOnly·Secure), 오프라인에서 쓰기 위한 달력 사본과 아직 보내지 못한 수정(브라우저 IndexedDB)</li>
<li>윈도우 앱: 달력 사본·설정 파일, Windows DPAPI 로 암호화한 로그인 토큰</li>
<li>로그아웃하거나 계정을 삭제하면 이 기기의 사본을 지웁니다.</li>
</ul>

<h2>4. 다른 곳에 주는 정보</h2>
<p>저장한 정보를 팔거나 다른 사람·회사에 주지 않습니다. 법에 따른 요청이 있을 때만 예외로 합니다. 서비스를 위해 다음 업체를 거칩니다.</p>
<ul>
<li>Google: 로그인 처리</li>
<li>Tailscale: 서버로 오가는 연결을 전달합니다. 연결은 HTTPS 로 암호화돼 있어 내용을 볼 수 없습니다.</li>
</ul>
<p>서버와 데이터는 운영자가 직접 관리하는 장비(대한민국)에 있습니다.</p>

<h2>5. 보안</h2>
<ul>
<li>모든 연결은 HTTPS 로 암호화합니다. 로그인 토큰은 해시값만 저장합니다.</li>
<li>다른 사용자의 달력은 서비스 안에서 볼 수 없습니다.</li>
<li>메모는 서버에 암호화하지 않고 저장되므로 서버 운영자는 기술적으로 볼 수 있습니다. 장애 대응 외에는 보지 않습니다. 비밀번호 같은 민감한 정보는 적지 마세요.</li>
</ul>

<h2>6. 내 정보 보기·받기·지우기</h2>
<ul>
<li>보기·받기: 설정 → JSON 내보내기로 내 메모 전체를 받습니다. 설정에서 로그인된 기기와 사용량을 봅니다.</li>
<li>기기 해제: 설정 → 로그인된 기기에서 폐기합니다.</li>
<li>삭제: 설정 → 계정 삭제. 메모·이력·기기 정보를 서버에서 바로 지우고, 백업에서는 최대 ${cfg.backup.keep}일 뒤 사라집니다. 로그인할 수 없으면 아래 문의처로 요청하세요.</li>
<li>Google 계정의 <a href="https://myaccount.google.com/connections">서드 파티 연결</a>에서 이 서비스의 접근을 끊을 수도 있습니다.</li>
</ul>

<h2>7. 이용 대상</h2>
<p>만 14세 미만은 쓸 수 없습니다. 만 14세 미만의 정보가 저장된 것을 알게 되면 지웁니다.</p>

<h2>8. 저장 공간 한도</h2>
<p>관리자가 아닌 사용자는 메모·이력 저장 공간이 각각 ${MB(cfg.quotaBytes)}MB 입니다.</p>

<h2>9. 변경</h2>
<p>이 방침을 바꾸면 이 페이지에 올리고 시행일을 고칩니다.</p>

<h2>10. 문의</h2>
<p>개인정보 관련 문의·삭제 요청: ${contactLink(cfg)}</p>
<p class="muted">시행일: ${PRIVACY_EFFECTIVE}</p>

<h2 lang="en">Summary (English)</h2>
<div lang="en">
<p>Batang Calendar requests only the <code>openid</code> and <code>email</code> scopes. It stores your email address to identify your own calendar and manage your signed-in devices. It does not request or read any other Google data, does not store Google access or refresh tokens, and never sells, shares or uses Google user data for advertising or AI training. Its use of information received from Google APIs adheres to the <a href="https://developers.google.com/terms/api-services-user-data-policy">Google API Services User Data Policy</a>, including the Limited Use requirements.</p>
<p>Stored data: email, calendar notes and their history, device names, last-used time and IP address, server logs, and daily backups (kept ${cfg.backup.keep} days). You can export your notes as JSON and delete your account in Settings, which immediately erases your data from the server (backups expire within ${cfg.backup.keep} days). Contact: ${contactLink(cfg)}.</p>
</div>`,
  );
}
