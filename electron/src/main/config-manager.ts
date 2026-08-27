import fs from 'fs';
import path from 'path';
import { app } from 'electron';

export interface WidgetConfig {
  position: {
    x: number;
    y: number;
  };
  appearance: {
    backgroundColor: string;
    opacity: number;
    textColor: string;
    fontSize: number;
  };
}

const DEFAULT_CONFIG: WidgetConfig = {
  position: {
    x: -420,
    y: -520,
  },
  appearance: {
    backgroundColor: '#ffffff',
    opacity: 0.95,
    textColor: '#333333',
    fontSize: 14,
  },
};

export class ConfigManager {
  private configPath: string;

  constructor() {
    const userDataPath = app.getPath('userData');
    this.configPath = path.join(userDataPath, 'widget-config.json');
  }

  getConfig(): WidgetConfig {
    try {
      if (fs.existsSync(this.configPath)) {
        const data = fs.readFileSync(this.configPath, 'utf-8');
        const config = JSON.parse(data);
        return {
          ...DEFAULT_CONFIG,
          ...config,
          appearance: { ...DEFAULT_CONFIG.appearance, ...config.appearance },
        };
      }
    } catch (error) {
      console.error('설정 파일 로드 실패:', error);
    }
    return DEFAULT_CONFIG;
  }

  saveConfig(config: WidgetConfig): void {
    try {
      const userDataPath = app.getPath('userData');
      if (!fs.existsSync(userDataPath)) {
        fs.mkdirSync(userDataPath, { recursive: true });
      }
      fs.writeFileSync(this.configPath, JSON.stringify(config, null, 2));
    } catch (error) {
      console.error('설정 파일 저장 실패:', error);
    }
  }

  updatePosition(x: number, y: number): void {
    const config = this.getConfig();
    config.position = { x, y };
    this.saveConfig(config);
  }

  updateAppearance(backgroundColor: string, opacity: number, textColor: string, fontSize: number): void {
    const config = this.getConfig();
    config.appearance = { backgroundColor, opacity, textColor, fontSize };
    this.saveConfig(config);
  }
}
