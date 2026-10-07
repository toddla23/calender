/** 메모 색상 팔레트. 서버에는 hex 문자열(최대 32자)로 저장된다. '' 는 기본색. */
export const NOTE_COLORS: ReadonlyArray<{ name: string; value: string }> = [
  { name: '기본', value: '' },
  { name: '빨강', value: '#EF5350' },
  { name: '주황', value: '#FF9800' },
  { name: '노랑', value: '#FBC02D' },
  { name: '초록', value: '#43A047' },
  { name: '파랑', value: '#1E88E5' },
  { name: '보라', value: '#8E24AA' },
  { name: '분홍', value: '#EC407A' },
];

export const DEFAULT_NOTE_COLOR = '#9E9E9E';

export const noteDotColor = (color: string): string => color || DEFAULT_NOTE_COLOR;

export const theme = {
  bg: '#FFFFFF',
  surface: '#F6F7F9',
  text: '#1C1C1E',
  subtext: '#6B7280',
  border: '#E5E7EB',
  primary: '#3B82F6',
  holiday: '#E53935',
  sunday: '#E53935',
  saturday: '#1E66F5',
  danger: '#D32F2F',
  warnBg: '#FFF4E5',
  errorBg: '#FDECEA',
  infoBg: '#E8F1FE',
};
