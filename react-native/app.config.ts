import type { ExpoConfig, ConfigContext } from 'expo/config';

/**
 * 환경변수는 빌드 시점(app.config 평가 시)에 extra로 주입된다. 소스에 하드코딩하지 않는다.
 *  - EXPO_PUBLIC_API_BASE_URL            기본 서버 주소 (설정 화면에서 런타임에 변경 가능)
 *  - GOOGLE_WEB_CLIENT_ID                Google "웹" 클라이언트 ID (ID Token의 audience, 서버 검증과 동일해야 함)
 *  - GOOGLE_IOS_CLIENT_ID                Google iOS 클라이언트 ID
 *  - GOOGLE_IOS_URL_SCHEME               iOS 클라이언트 ID의 역순 형태 (com.googleusercontent.apps.xxxx)
 *  - GOOGLE_SERVICES_JSON(옵션)           Android google-services.json 경로 (Firebase 쓸 때만)
 *  - APP_VARIANT=production              운영 빌드: 평문 HTTP 비허용
 */
const isProduction = process.env.APP_VARIANT === 'production';

export default ({ config }: ConfigContext): ExpoConfig => ({
  ...config,
  name: '내 캘린더',
  slug: 'my-calendar',
  scheme: 'mycalendar',
  version: '1.0.0',
  orientation: 'portrait',
  userInterfaceStyle: 'light',
  icon: './assets/icon.png',
  ios: {
    supportsTablet: false,
    bundleIdentifier: process.env.IOS_BUNDLE_ID ?? 'com.example.mycalendar',
    infoPlist: {
      // iOS ATS: 개발 빌드에서만 평문 HTTP 허용 (운영은 HTTPS 필수)
      NSAppTransportSecurity: { NSAllowsArbitraryLoads: !isProduction },
    },
  },
  android: {
    package: process.env.ANDROID_PACKAGE ?? 'com.example.mycalendar',
    adaptiveIcon: {
      backgroundColor: '#E6F4FE',
      foregroundImage: './assets/android-icon-foreground.png',
      backgroundImage: './assets/android-icon-background.png',
      monochromeImage: './assets/android-icon-monochrome.png',
    },
    predictiveBackGestureEnabled: false,
  },
  plugins: [
    'expo-secure-store',
    [
      'expo-build-properties',
      {
        android: {
          // 개발 빌드에서만 평문 HTTP(예: http://10.0.2.2:8080)를 허용한다.
          // 운영(APP_VARIANT=production)은 HTTPS(홈서버 리버스 프록시)만 사용하도록 false.
          usesCleartextTraffic: !isProduction,
        },
      },
    ],
    [
      '@react-native-google-signin/google-signin',
      {
        // iOS: 역순 클라이언트 ID(URL scheme). 없으면 플레이스홀더로 두어 prebuild가 깨지지 않게 한다.
        iosUrlScheme: process.env.GOOGLE_IOS_URL_SCHEME ?? 'com.googleusercontent.apps.not-configured',
      },
    ],
  ],
  extra: {
    apiBaseUrl: process.env.EXPO_PUBLIC_API_BASE_URL ?? 'http://10.0.2.2:8080',
    googleWebClientId: process.env.GOOGLE_WEB_CLIENT_ID ?? '',
    googleIosClientId: process.env.GOOGLE_IOS_CLIENT_ID ?? '',
    isProductionBuild: isProduction,
  },
});
