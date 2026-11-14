// 데스크톱 위젯 모양(배경색·글자색·투명도) → CSS 변수 계산. DOM 없이 테스트 가능.

export interface Look {
  /** 배경 불투명도 0~1 (0 이면 글자만 보임) */
  opacity: number;
  /** 배경색 #rrggbb. null 이면 시스템 테마 */
  bgColor: string | null;
  /** 글자색 #rrggbb. null 이면 배경 밝기에 맞춰 자동 */
  textColor: string | null;
}

const HEX = /^#[0-9a-f]{6}$/i;

export function hexToRgb(hex: string): [number, number, number] {
  return [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16)) as [number, number, number];
}

const toHex = (rgb: number[]) => '#' + rgb.map((v) => Math.round(Math.min(255, Math.max(0, v))).toString(16).padStart(2, '0')).join('');

/** 두 색을 t(0~1) 비율로 섞는다 */
export function mix(a: string, b: string, t: number): string {
  const x = hexToRgb(a);
  const y = hexToRgb(b);
  return toHex(x.map((v, i) => v + (y[i] - v) * t));
}

/** WCAG 상대 휘도 (0=검정, 1=흰색) */
export function luminance(hex: string): number {
  const [r, g, b] = hexToRgb(hex).map((v) => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

export const isDark = (hex: string) => luminance(hex) < 0.35;

/**
 * 설정값으로 덮어쓸 CSS 변수들. 값이 null 인 변수는 스타일시트 기본값(시스템 테마)을 쓴다.
 * systemDark: 배경색을 지정하지 않았을 때 시스템이 다크 모드인지
 */
export function lookVars(look: Look, systemDark: boolean): Record<string, string | null> {
  const bg = look.bgColor && HEX.test(look.bgColor) ? look.bgColor : null;
  const darkBg = bg ? isDark(bg) : systemDark;
  const text = look.textColor && HEX.test(look.textColor) ? look.textColor : bg ? (darkBg ? '#f1f1f5' : '#1d1d22') : null;
  const textForShadow = text ?? (systemDark ? '#e8e8ee' : '#1d1d22');
  // 글자가 밝으면 어두운 그림자, 어두우면 밝은 그림자 (배경이 옅을 때 바탕화면 위에서도 읽히게)
  const shadow = isDark(textForShadow) ? 'rgba(255,255,255,0.85)' : 'rgba(0,0,0,0.75)';
  return {
    '--app-opacity': String(Math.min(1, Math.max(0, look.opacity))),
    '--surface': bg,
    '--bg': bg ? mix(bg, darkBg ? '#ffffff' : '#000000', 0.06) : null,
    '--line': bg ? mix(bg, darkBg ? '#ffffff' : '#000000', 0.16) : null,
    '--text': text,
    '--muted': text ? mix(text, bg ?? (systemDark ? '#1f1f24' : '#ffffff'), 0.4) : null,
    '--text-shadow': look.opacity < 0.6 ? `0 0 2px ${shadow}, 0 0 4px ${shadow}` : 'none',
  };
}
