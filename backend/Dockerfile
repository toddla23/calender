# eclipse-temurin 공식 이미지는 arm64(Raspberry Pi 5)를 포함한 멀티아키텍처를
# 지원하므로 베이스 이미지는 그대로 두고, 빌드 시 --platform으로 타겟만 지정하면 됩니다.

# ---------- 1단계: 빌드 ----------
FROM eclipse-temurin:21-jdk-jammy AS build
WORKDIR /app

# Gradle wrapper 및 설정 파일 먼저 복사 (의존성 캐싱 최적화)
COPY gradlew .
COPY gradle gradle
# settings.gradle(.kts)가 없는 프로젝트도 있으므로 와일드카드로 존재하는 파일만 복사
COPY build.gradle* settings.gradle* ./

RUN chmod +x gradlew
# 의존성만 미리 받아서 레이어 캐싱 (소스 변경 시 재다운로드 방지)
RUN ./gradlew dependencies --no-daemon || true

# 소스 복사 후 빌드
COPY src src
RUN ./gradlew bootJar --no-daemon -x test

# ---------- 2단계: 실행 ----------
FROM eclipse-temurin:21-jre-jammy
WORKDIR /app

# 보안: root가 아닌 사용자로 실행
RUN addgroup --system spring && adduser --system --ingroup spring spring
USER spring:spring

COPY --from=build /app/build/libs/*.jar app.jar

EXPOSE 8080

# Raspberry Pi 5 (4~8GB RAM)는 메모리가 넉넉하지 않으므로
# 컨테이너 메모리 제한 기준으로 힙을 자동 조절하도록 설정
ENTRYPOINT ["java", \
  "-XX:MaxRAMPercentage=70.0", \
  "-XX:InitialRAMPercentage=50.0", \
  "-XX:+UseSerialGC", \
  "-jar", "/app/app.jar"]