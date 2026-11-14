# syntax=docker/dockerfile:1
# ---------- 빌드 ----------
FROM node:22-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
COPY server/package.json server/
COPY web/package.json web/
RUN npm ci --ignore-scripts --no-audit --no-fund
COPY data data
COPY server server
COPY web web
# 웹앱 빌드 + 서버를 의존성 포함 단일 파일로 번들 (node_modules 불필요)
RUN npm run build -w web && npm run bundle -w server

# ---------- 실행 (npm 없는 alpine + nodejs + mariadb-dump) ----------
FROM alpine:3.22
# mariadb-client 중 백업에 쓰는 mariadb-dump 만 남기고 나머지 도구는 지운다 (이미지 크기 절감)
RUN apk add --no-cache nodejs mariadb-client tzdata \
 && find /usr/bin \( -name 'mariadb*' -o -name 'mysql*' \) ! -name 'mariadb-dump' -delete \
 && rm -rf /usr/share/man /usr/share/doc /usr/lib/node_modules/npm
WORKDIR /app
ENV NODE_ENV=production \
    NODE_OPTIONS=--max-old-space-size=96 \
    HOST=127.0.0.1 \
    PORT=3000 \
    TZ=Asia/Seoul \
    BACKUP_DIR=/backups
COPY --from=build /app/server/bundle server/bundle
COPY --from=build /app/server/migrations server/migrations
COPY --from=build /app/web/dist web/dist
COPY --from=build /app/data data
USER 1000:1000
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD wget -q -O /dev/null "http://127.0.0.1:${PORT}/healthz" || exit 1
CMD ["node", "server/bundle/index.mjs"]
