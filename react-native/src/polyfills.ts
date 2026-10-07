/**
 * React Native용 폴리필. 앱 진입점(index.ts)에서 가장 먼저 import 한다.
 * @stomp/stompjs는 TextEncoder/TextDecoder를 사용하는데, 런타임(Hermes 버전)에 따라 없을 수 있다.
 */
const g = globalThis as any;

if (typeof g.TextEncoder === 'undefined' || typeof g.TextDecoder === 'undefined') {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { TextEncoder, TextDecoder } = require('text-encoding');
  g.TextEncoder ??= TextEncoder;
  g.TextDecoder ??= TextDecoder;
}

export {};
