import { execSync } from 'child_process';
import path from 'path';
import { app } from 'electron';

export const setupWindowsStartup = () => {
  try {
    const appPath = app.getPath('exe');
    const startupScript = `
      New-Item -Path "HKCU:\\Software\\Microsoft\\Windows\\CurrentVersion\\Run" -Force | Out-Null
      Set-ItemProperty -Path "HKCU:\\Software\\Microsoft\\Windows\\CurrentVersion\\Run" -Name "CalendarWidget" -Value '"${appPath}" --hidden'
    `;

    execSync(`powershell -Command "${startupScript.replace(/"/g, '\\"')}"`, {
      windowsHide: true,
    });

    console.log('윈도우 시작프로그램 등록 완료');
  } catch (error) {
    console.error('시작프로그램 등록 실패:', error);
  }
};
