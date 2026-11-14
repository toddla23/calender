import { describe, expect, it } from 'vitest';
import { isDark, lookVars, mix } from '../src/desktop-look';

describe('데스크톱 모양 설정', () => {
  it('배경색을 지정하지 않으면 시스템 테마 값을 그대로 쓴다', () => {
    const v = lookVars({ opacity: 0.85, bgColor: null, textColor: null }, false);
    expect(v['--surface']).toBeNull();
    expect(v['--text']).toBeNull();
    expect(v['--text-shadow']).toBe('none');
  });

  it('어두운 배경을 고르면 글자가 자동으로 밝아진다', () => {
    const v = lookVars({ opacity: 1, bgColor: '#102030', textColor: null }, false);
    expect(v['--surface']).toBe('#102030');
    expect(isDark(v['--text']!)).toBe(false);
  });

  it('밝은 배경을 고르면 글자가 자동으로 어두워진다', () => {
    const v = lookVars({ opacity: 1, bgColor: '#fff3c0', textColor: null }, true);
    expect(isDark(v['--text']!)).toBe(true);
  });

  it('글자색을 직접 지정할 수 있다', () => {
    const v = lookVars({ opacity: 1, bgColor: '#ffffff', textColor: '#ff0000' }, false);
    expect(v['--text']).toBe('#ff0000');
  });

  it('투명도 0 까지 가능하고, 옅을 때는 글자 그림자를 넣는다', () => {
    const v = lookVars({ opacity: 0, bgColor: null, textColor: null }, true);
    expect(v['--app-opacity']).toBe('0');
    expect(v['--text-shadow']).toContain('rgba(0,0,0');
    const light = lookVars({ opacity: 0.2, bgColor: null, textColor: '#111111' }, false);
    expect(light['--text-shadow']).toContain('rgba(255,255,255');
  });

  it('색 섞기', () => {
    expect(mix('#000000', '#ffffff', 0.5)).toBe('#808080');
  });
});
