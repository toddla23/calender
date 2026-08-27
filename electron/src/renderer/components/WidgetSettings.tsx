import React, { useState, useEffect } from 'react';
import styles from './WidgetSettings.module.css';

interface WidgetConfig {
  position: { x: number; y: number };
  appearance: { backgroundColor: string; opacity: number; textColor: string; fontSize: number };
}

interface WidgetSettingsProps {
  isOpen: boolean;
  onClose: () => void;
}

export const WidgetSettings: React.FC<WidgetSettingsProps> = ({ isOpen, onClose }) => {
  const [config, setConfig] = useState<WidgetConfig | null>(null);
  const [backgroundColor, setBackgroundColor] = useState('#ffffff');
  const [opacity, setOpacity] = useState(0.95);
  const [textColor, setTextColor] = useState('#333333');
  const [fontSize, setFontSize] = useState(14);

  useEffect(() => {
    if (isOpen) {
      loadConfig();
    }
  }, [isOpen]);

  const loadConfig = async () => {
    try {
      const electron = (globalThis as any).electron;
      if (electron?.config?.getConfig) {
        const cfg = await electron.config.getConfig();
        setConfig(cfg);
        setBackgroundColor(cfg.appearance.backgroundColor);
        setOpacity(cfg.appearance.opacity);
        setTextColor(cfg.appearance.textColor);
        setFontSize(cfg.appearance.fontSize);
      }
    } catch (error) {
      console.error('설정 로드 실패:', error);
    }
  };

  const handleSave = async () => {
    try {
      const electron = (globalThis as any).electron;
      if (electron?.config?.updateAppearance) {
        await electron.config.updateAppearance(backgroundColor, opacity, textColor, fontSize);
      }
      onClose();
    } catch (error) {
      console.error('설정 저장 실패:', error);
    }
  };

  if (!isOpen) return null;

  return (
    <div className={styles.modal}>
      <div className={styles.modalContent}>
        <div className={styles.header}>
          <h2>위젯 설정</h2>
          <button className={styles.closeBtn} onClick={onClose}>
            ✕
          </button>
        </div>

        <div className={styles.settings}>
          <div className={styles.setting}>
            <label>배경색</label>
            <div className={styles.colorPickerContainer}>
              <input
                type="color"
                value={backgroundColor}
                onChange={(e) => setBackgroundColor(e.target.value)}
                className={styles.colorPicker}
              />
              <span className={styles.colorValue}>{backgroundColor}</span>
            </div>
          </div>

          <div className={styles.setting}>
            <label>투명도</label>
            <div className={styles.opacityContainer}>
              <input
                type="range"
                min="0.1"
                max="1"
                step="0.05"
                value={opacity}
                onChange={(e) => setOpacity(parseFloat(e.target.value))}
                className={styles.slider}
              />
              <span className={styles.opacityValue}>{Math.round(opacity * 100)}%</span>
            </div>
          </div>

          <div className={styles.setting}>
            <label>글자색</label>
            <div className={styles.colorPickerContainer}>
              <input
                type="color"
                value={textColor}
                onChange={(e) => setTextColor(e.target.value)}
                className={styles.colorPicker}
              />
              <span className={styles.colorValue}>{textColor}</span>
            </div>
          </div>

          <div className={styles.setting}>
            <label>글자 크기</label>
            <div className={styles.fontSizeContainer}>
              <input
                type="range"
                min="10"
                max="24"
                step="1"
                value={fontSize}
                onChange={(e) => setFontSize(parseInt(e.target.value))}
                className={styles.slider}
              />
              <span className={styles.fontSizeValue}>{fontSize}px</span>
            </div>
          </div>

          <div className={styles.preview}>
            <div
              className={styles.previewContent}
              style={{
                backgroundColor: backgroundColor,
                opacity: opacity,
                color: textColor,
                fontSize: `${fontSize}px`,
              }}
            >
              <div>미리보기 제목</div>
              <div className={styles.previewText}>이것은 미리보기 텍스트입니다</div>
            </div>
          </div>
        </div>

        <div className={styles.buttons}>
          <button className={styles.cancelBtn} onClick={onClose}>
            취소
          </button>
          <button className={styles.saveBtn} onClick={handleSave}>
            저장
          </button>
        </div>
      </div>
    </div>
  );
};
