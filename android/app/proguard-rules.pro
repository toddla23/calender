# 나중에 minifyEnabled 를 켜더라도 TWA 라이브러리 컴포넌트 이름이 바뀌지 않게 보호
-keep class com.google.androidbrowserhelper.** { *; }
-keep class androidx.browser.** { *; }
-keep class io.github.toddla23.batangcalendar.** { *; }
