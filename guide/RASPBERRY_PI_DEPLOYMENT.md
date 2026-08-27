# 🍓 라즈베리파이 배포 가이드

**대상:** DevOps, 홈서버 운영자  
**마지막 업데이트:** 2026-08-27  
**예상 배포 시간:** 2-4시간

---

## 📋 개요

이 가이드는 Calendar App의 Backend (Spring Boot)를 라즈베리파이에 배포하는 방법을 설명합니다.

### 라즈베리파이 선택 기준

| 모델 | CPU | RAM | 추천도 | 비고 |
|------|-----|-----|--------|------|
| **Raspberry Pi 4B** | ARM v8 | 4GB/8GB | ⭐⭐⭐⭐⭐ | **추천** - 충분한 성능 |
| **Raspberry Pi 5** | ARM v8 | 4GB/8GB | ⭐⭐⭐⭐⭐ | 최신, 더 빠름 |
| **Raspberry Pi Zero 2 W** | ARM v7 | 512MB | ⭐⭐ | 예산 저렴하지만 느림 |
| **Raspberry Pi 3B+** | ARM v7 | 1GB | ⭐⭐⭐ | 이전 세대 |

---

## 🔧 1단계: 라즈베리파이 초기 설정

### 1.1 OS 설치

#### 1️⃣ SD 카드 준비 (32GB 이상 권장)

```bash
# macOS/Linux
# Raspberry Pi Imager 다운로드: https://www.raspberrypi.com/software/

# 또는 명령어로 직접
dd if=raspberry-pi-os.img of=/dev/sdX bs=4m && sync
```

#### 2️⃣ OS 선택 및 설치

1. Raspberry Pi Imager 실행
2. OS 선택: **Raspberry Pi OS Lite** (64-bit 권장)
   - 왜 Lite? 데스크톱 환경 없이 서버로만 사용
   - 왜 64-bit? Java/Spring Boot 성능 향상
3. 저장소 선택: SD 카드
4. 고급 설정 (톱니바퀴 아이콘):
   ```
   호스트명: calender-pi
   SSH 활성화: ✅
   사용자명: pi
   비밀번호: 강력한 비밀번호
   WiFi 설정: (필요시)
   로케일: Asia/Seoul
   시간대: Asia/Seoul
   ```
5. 쓰기 시작

#### 3️⃣ 첫 부팅

```bash
# SD 카드를 라즈베리파이에 삽입 후 전원 켜기
# 약 2-3분 대기

# SSH로 접속
ssh pi@calender-pi.local
# 또는
ssh pi@[라즈베리파이-IP]
```

### 1.2 시스템 업데이트

```bash
# 패키지 리스트 업데이트
sudo apt update

# 시스템 업그레이드
sudo apt upgrade -y

# 필수 패키지 설치
sudo apt install -y \
  build-essential \
  curl \
  wget \
  git \
  htop \
  vim \
  net-tools
```

### 1.3 스왑 메모리 확장 (중요!)

라즈베리파이의 RAM이 부족할 수 있으니 스왑 메모리를 확장합니다.

```bash
# 현재 스왑 확인
free -h
# Swap: 100M (기본값)

# 스왑 크기 변경 (2GB로 확대)
sudo dphys-swapfile swapoff
sudo sed -i 's/CONF_SWAPSIZE=100/CONF_SWAPSIZE=2048/g' /etc/dphys-swapfile
sudo dphys-swapfile setup
sudo dphys-swapfile swapon

# 확인
free -h
# Swap: 2.0G
```

---

## ☕ 2단계: Java 설치

### 2.1 Java 17 설치

```bash
# 설치
sudo apt install -y openjdk-17-jre-headless

# 버전 확인
java -version
# openjdk 17.0.x LTS
```

### 2.2 JAVA_HOME 설정 (선택)

```bash
# 경로 확인
which java
# /usr/bin/java

readlink -f /usr/bin/java
# /usr/lib/jvm/java-17-openjdk-arm64/bin/java

# .bashrc에 추가
echo 'export JAVA_HOME=/usr/lib/jvm/java-17-openjdk-arm64' >> ~/.bashrc
source ~/.bashrc
```

---

## 💾 3단계: PostgreSQL 설치 (선택)

**선택사항:** 라즈베리파이에 DB를 설치할 수도, AWS RDS를 사용할 수도 있습니다.

### 3.1 로컬 PostgreSQL 설치

```bash
# 설치
sudo apt install -y postgresql postgresql-contrib

# 서비스 시작
sudo systemctl start postgresql
sudo systemctl enable postgresql

# 상태 확인
sudo systemctl status postgresql
```

### 3.2 데이터베이스 및 사용자 생성

```bash
# PostgreSQL 접속
sudo -u postgres psql

# 명령어 실행
CREATE DATABASE calender;
CREATE USER calender_prod WITH PASSWORD 'your_strong_password';
GRANT ALL PRIVILEGES ON DATABASE calender TO calender_prod;

# 스키마 생성
\c calender

CREATE TABLE users (
  id UUID PRIMARY KEY,
  email VARCHAR(255) UNIQUE NOT NULL,
  google_sub VARCHAR(255) UNIQUE NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE notes (
  id UUID PRIMARY KEY,
  user_id UUID REFERENCES users(id),
  date DATE NOT NULL,
  content TEXT,
  color VARCHAR(50),
  deleted BOOLEAN DEFAULT FALSE,
  deleted_version INT DEFAULT 0,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  synced BOOLEAN DEFAULT FALSE
);

CREATE TABLE sync_meta (
  user_id UUID PRIMARY KEY REFERENCES users(id),
  last_synced_at TIMESTAMP,
  last_pull_cursor UUID,
  pull_in_progress BOOLEAN DEFAULT FALSE
);

CREATE INDEX idx_notes_user_id ON notes(user_id);
CREATE INDEX idx_notes_date ON notes(date);
CREATE INDEX idx_notes_updated_at ON notes(updated_at);

\q
```

### 3.3 AWS RDS 사용 (권장)

로컬 DB 대신 AWS RDS를 사용하면:
- 백업 자동화
- 성능 향상
- 라즈베리파이 부하 감소

```bash
# RDS 엔드포인트 예시
export SPRING_DATASOURCE_URL="jdbc:postgresql://calender-db.xxxx.rds.amazonaws.com:5432/calender"
export SPRING_DATASOURCE_USERNAME="calender_prod"
export SPRING_DATASOURCE_PASSWORD="your_password"
```

---

## 🚀 4단계: Spring Boot 배포

### 4.1 빌드 준비 (개발 PC에서)

라즈베리파이에서 직접 빌드하면 시간이 오래 걸리니, 개발 PC에서 빌드합니다.

```bash
# 개발 PC에서
cd backend

# ARM64 아키텍처용 빌드
./gradlew clean build -DskipTests

# JAR 파일 생성
ls -lh build/libs/calender-*.jar
# calender-1.0.0.jar (약 80MB)
```

### 4.2 JAR 파일 전송

```bash
# 개발 PC에서
scp -r build/libs/calender-*.jar pi@calender-pi.local:~/calender.jar

# 또는 GitHub Releases에서 다운로드
# 라즈베리파이에서:
wget https://github.com/your-repo/releases/download/v1.0.0/calender-1.0.0.jar
```

### 4.3 배포 디렉토리 준비 (라즈베리파이)

```bash
# 디렉토리 생성
mkdir -p ~/calender/app
mkdir -p ~/calender/logs
mkdir -p ~/calender/backups

# JAR 파일 이동
mv ~/calender.jar ~/calender/app/

# 실행 권한
chmod +x ~/calender/app/calender.jar
```

### 4.4 환경 변수 설정

```bash
# .env 파일 생성
cat > ~/calender/app/.env << 'EOF'
SPRING_PROFILES_ACTIVE=prod

# Database (로컬 또는 AWS RDS)
SPRING_DATASOURCE_URL=jdbc:postgresql://localhost:5432/calender
SPRING_DATASOURCE_USERNAME=calender_prod
SPRING_DATASOURCE_PASSWORD=your_password

# JWT
JWT_SECRET=$(openssl rand -hex 32)
JWT_EXPIRATION=3600000
JWT_REFRESH_EXPIRATION=86400000

# Google OAuth
GOOGLE_CLIENT_ID=your_client_id
GOOGLE_CLIENT_SECRET=your_client_secret

# 공휴일 API
HOLIDAY_API_KEY=your_api_key
HOLIDAY_API_URL=http://apis.data.go.kr/...

# Server
SERVER_PORT=8080
LOGGING_LEVEL_ROOT=INFO
EOF

chmod 600 ~/calender/app/.env
```

### 4.5 Systemd 서비스 등록

```bash
# 서비스 파일 생성
sudo tee /etc/systemd/system/calender.service << 'EOF'
[Unit]
Description=Calendar App Backend
After=network.target

[Service]
Type=simple
User=pi
WorkingDirectory=/home/pi/calender/app
EnvironmentFile=/home/pi/calender/app/.env
ExecStart=/usr/bin/java -Xmx256m -Xms128m -jar calender.jar
Restart=on-failure
RestartSec=10
StandardOutput=append:/home/pi/calender/logs/app.log
StandardError=append:/home/pi/calender/logs/error.log

[Install]
WantedBy=multi-user.target
EOF

# 서비스 활성화 및 시작
sudo systemctl daemon-reload
sudo systemctl enable calender
sudo systemctl start calender

# 상태 확인
sudo systemctl status calender
```

### 4.6 메모리 최적화

라즈베리파이의 메모리가 부족할 수 있으니, Systemd 서비스에서 힙 메모리를 제한합니다.

```bash
# 메모리 설정 (라즈베리파이 모델에 따라)
# Raspberry Pi 4B (4GB RAM): -Xmx256m -Xms128m
# Raspberry Pi 5 (8GB RAM): -Xmx512m -Xms256m
# Raspberry Pi Zero 2 W (512MB RAM): -Xmx64m -Xms32m

# /etc/systemd/system/calender.service 수정
sudo nano /etc/systemd/system/calender.service

# ExecStart 라인 수정:
# ExecStart=/usr/bin/java -Xmx256m -Xms128m -jar calender.jar

# 재로드 및 재시작
sudo systemctl daemon-reload
sudo systemctl restart calender
```

### 4.7 로그 확인

```bash
# 실시간 로그 확인
tail -f ~/calender/logs/app.log

# 에러 필터
grep ERROR ~/calender/logs/app.log

# 최근 로그
tail -100 ~/calender/logs/app.log
```

---

## 🔗 5단계: 네트워크 설정

### 5.1 포트 열기

```bash
# 방화벽 설정 (ufw 사용)
sudo ufw enable
sudo ufw allow 8080/tcp
sudo ufw allow 22/tcp
sudo ufw allow 443/tcp

# 상태 확인
sudo ufw status
```

### 5.2 공유기 포트 포워딩

**공유기 관리 페이지에서:**

1. 포트 포워딩 설정
```
외부 포트: 443 (HTTPS)
내부 IP: 192.168.1.100 (라즈베리파이 IP)
내부 포트: 8080
프로토콜: TCP
```

2. 라즈베리파이 고정 IP 설정 (선택)
```bash
# IP 주소 확인
hostname -I
# 192.168.1.100

# 고정 IP 설정
sudo nano /etc/dhcpcd.conf

# 추가:
interface wlan0
static ip_address=192.168.1.100/24
static routers=192.168.1.1
static domain_name_servers=8.8.8.8 8.8.4.4
```

### 5.3 DDNS 설정

```bash
# DuckDNS 자동 갱신 스크립트
mkdir -p ~/duckdns
cat > ~/duckdns/update.sh << 'SCRIPT'
#!/bin/bash
curl -k "https://www.duckdns.org/update?domains=my-calendar&token=$DUCKDNS_TOKEN&ip=$(curl -s https://api.ipify.org)"
SCRIPT

chmod +x ~/duckdns/update.sh

# Cron 작업 (매 5분)
(crontab -l 2>/dev/null; echo "*/5 * * * * /home/pi/duckdns/update.sh >> /dev/null 2>&1") | crontab -

# 환경 변수 설정
export DUCKDNS_TOKEN="your_duckdns_token"
```

---

## 🛡️ 6단계: 보안 설정

### 6.1 SSH 보안

```bash
# SSH 설정 파일 편집
sudo nano /etc/ssh/sshd_config

# 변경사항:
Port 22                           # 기본 포트 변경 권장
PermitRootLogin no
PasswordAuthentication no         # 공개키만 사용
X11Forwarding no
MaxAuthTries 3
ClientAliveInterval 300

# 재시작
sudo systemctl restart sshd
```

### 6.2 공개키 인증 설정

```bash
# 개발 PC에서 공개키 생성 (처음 한 번만)
ssh-keygen -t ed25519 -f ~/.ssh/id_calender

# 공개키를 라즈베리파이로 전송
ssh-copy-id -i ~/.ssh/id_calender.pub pi@calender-pi.local

# 비밀번호 없이 접속 테스트
ssh -i ~/.ssh/id_calender pi@calender-pi.local
```

### 6.3 방화벽 강화

```bash
# SSH 포트 제한
sudo ufw limit 22/tcp

# 상태 확인
sudo ufw status verbose
```

---

## 📊 7단계: 모니터링

### 7.1 시스템 리소스 확인

```bash
# CPU 및 메모리 사용율
top -b -n 1 | head -20

# 또는
htop

# 디스크 사용량
df -h

# 온도 확인 (라즈베리파이 특화)
vcgencmd measure_temp
```

### 7.2 서비스 상태 확인

```bash
# 서비스 상태
sudo systemctl status calender

# 최근 로그
sudo journalctl -u calender -n 50

# 지속적인 모니터링
sudo journalctl -u calender -f
```

### 7.3 API 테스트

```bash
# 헬스 체크
curl -X GET http://localhost:8080/api/health

# 또는 외부에서
curl -X GET https://my-calendar.duckdns.org/api/health
```

---

## 🔄 8단계: 자동 재시작

### 8.1 장시간 운영을 위한 설정

```bash
# 주기적 재부팅 (매주 일요일 새벽 2시)
crontab -e

# 추가:
0 2 * * 0 sudo reboot

# 또는 매월 첫날
0 2 1 * * sudo reboot
```

### 8.2 메모리 누수 대비

```bash
# 매일 자정에 서비스 재시작
crontab -e

# 추가:
0 0 * * * sudo systemctl restart calender
```

---

## 📈 9단계: 성능 최적화

### 9.1 Java 옵션 튜닝

```bash
# /etc/systemd/system/calender.service 수정

# 현재 (기본)
ExecStart=/usr/bin/java -Xmx256m -Xms128m -jar calender.jar

# 최적화 1: GC 튜닝 (더 빠른 응답)
ExecStart=/usr/bin/java \
  -Xmx256m -Xms128m \
  -XX:+UseG1GC \
  -XX:G1HeapRegionSize=16M \
  -XX:InitiatingHeapOccupancyPercent=35 \
  -jar calender.jar

# 최적화 2: 아그레시브 옵션 (메모리 절약)
ExecStart=/usr/bin/java \
  -Xmx128m -Xms64m \
  -XX:+TieredCompilation \
  -XX:TieredStopAtLevel=1 \
  -jar calender.jar
```

### 9.2 데이터베이스 최적화

**AWS RDS 사용 시:**
```
- DB 인스턴스: db.t3.micro (프리티어)
- 스토리지: 20GB (자동 확장)
- 백업: 자동 (7일 유지)
```

**로컬 PostgreSQL 사용 시:**
```bash
# PostgreSQL 설정 최적화
sudo nano /etc/postgresql/13/main/postgresql.conf

# 변경사항 (라즈베리파이 4GB RAM 기준):
shared_buffers = 64MB          # (기본 128MB → 64MB)
effective_cache_size = 256MB   # (기본 1GB → 256MB)
work_mem = 4MB                 # (기본 4MB)
maintenance_work_mem = 32MB    # (기본 64MB)

# 재시작
sudo systemctl restart postgresql
```

---

## 🔄 10단계: 자동 업데이트

### 10.1 OS 보안 업데이트 자동화

```bash
# unattended-upgrades 설치
sudo apt install -y unattended-upgrades

# 설정
sudo nano /etc/apt/apt.conf.d/50unattended-upgrades

# 유효한 옵션 확인 후 저장
sudo systemctl enable unattended-upgrades
sudo systemctl start unattended-upgrades
```

### 10.2 Application 자동 업데이트 (선택)

```bash
# GitHub Actions로 새 버전 빌드
# → JAR 파일 자동 생성
# → 라즈베리파이에서 스크립트로 자동 다운로드

cat > ~/calender/update.sh << 'EOF'
#!/bin/bash
sudo systemctl stop calender
cd ~/calender/app
wget https://github.com/your-repo/releases/latest/download/calender-latest.jar
sudo systemctl start calender
EOF

chmod +x ~/calender/update.sh

# 매월 첫 날 자정에 업데이트
crontab -e
# 추가: 0 0 1 * * /home/pi/calender/update.sh
```

---

## 📋 라즈베리파이 배포 체크리스트

### 초기 설정
- [ ] OS 설치 (Raspberry Pi OS Lite 64-bit)
- [ ] SSH 활성화
- [ ] 시스템 업데이트 (`apt update && apt upgrade`)
- [ ] 스왑 메모리 확대 (2GB)

### Java & Database
- [ ] Java 17 설치
- [ ] PostgreSQL 설치 또는 AWS RDS 설정
- [ ] 데이터베이스 스키마 생성

### Spring Boot 배포
- [ ] 개발 PC에서 JAR 빌드
- [ ] JAR 파일을 라즈베리파이로 전송
- [ ] 배포 디렉토리 생성
- [ ] 환경 변수 파일 (.env) 작성
- [ ] Systemd 서비스 등록
- [ ] 서비스 시작 및 확인

### 네트워크 설정
- [ ] 포트 포워딩 설정 (443 → 8080)
- [ ] DDNS 설정 (DuckDNS)
- [ ] 방화벽 설정 (ufw)

### 보안
- [ ] SSH 포트 변경 (기본 22 → 다른 포트)
- [ ] 공개키 인증 설정
- [ ] 비밀번호 인증 비활성화
- [ ] 방화벽 강화

### 모니터링
- [ ] 로그 확인 방법 숙지
- [ ] 리소스 모니터링 (CPU, 메모리, 디스크)
- [ ] API 헬스 체크

### 자동화
- [ ] 자동 재시작 설정 (선택)
- [ ] 자동 업데이트 설정 (선택)
- [ ] 로그 로테이션 설정

---

## 🐛 문제 해결

### Spring Boot 시작 실패

```bash
# 로그 확인
tail -100 ~/calender/logs/error.log

# 일반적인 문제:
# 1. 메모리 부족 → 스왑 확대
# 2. DB 연결 실패 → DATASOURCE_URL 확인
# 3. 포트 이미 사용 중 → 다른 포트 사용
```

### 높은 CPU 사용률

```bash
# 프로세스 확인
top -b -n 1 | grep java

# Java 프로세스 PID 확인
jps -l

# 힙 메모리 덤프 (고급)
jmap -heap [PID]
```

### 메모리 부족

```bash
# 현재 메모리 상태
free -h

# Java 메모리 제한 감소
# /etc/systemd/system/calender.service
ExecStart=/usr/bin/java -Xmx128m -Xms64m -jar calender.jar

# 재시작
sudo systemctl daemon-reload
sudo systemctl restart calender
```

### 데이터베이스 연결 오류

```bash
# PostgreSQL 연결 테스트
psql -U calender_prod -d calender -h localhost -c "SELECT 1"

# AWS RDS 연결 테스트
psql -U calender_prod -d calender -h calender-db.xxxx.rds.amazonaws.com -c "SELECT 1"
```

---

## 📞 유용한 명령어

```bash
# 서비스 시작/중지/재시작
sudo systemctl start calender
sudo systemctl stop calender
sudo systemctl restart calender

# 서비스 자동 시작 활성화/비활성화
sudo systemctl enable calender
sudo systemctl disable calender

# 실시간 로그
tail -f ~/calender/logs/app.log

# 로그 검색
grep "ERROR" ~/calender/logs/app.log
grep "2026-08-27" ~/calender/logs/app.log

# 시스템 리소스
df -h                    # 디스크 사용량
free -h                  # 메모리 사용량
top                      # 실시간 리소스
ps aux | grep java       # Java 프로세스

# 온도 확인 (라즈베리파이)
vcgencmd measure_temp
vcgencmd measure_clock arm

# 네트워크
ifconfig
ip addr show
netstat -tulpn | grep 8080
```

---

## 🎯 예상 성능

### Raspberry Pi 4B (4GB RAM)
```
메모리 사용: ~150-200MB (Spring Boot)
CPU 사용률: 5-15% (유휴 시)
응답 시간: 200-500ms (로컬 DB)
동시 연결: 100+ 명
```

### Raspberry Pi 5 (8GB RAM)
```
메모리 사용: ~200MB (Spring Boot)
CPU 사용률: 3-10% (유휴 시)
응답 시간: 100-300ms (로컬 DB)
동시 연결: 200+ 명
```

---

## 💡 팁

1. **USB SSD 사용**: SD 카드 대신 USB SSD 사용하면 성능 향상
2. **히트싱크**: CPU 과열 방지를 위해 히트싱크 또는 쿨러 설치
3. **24시간 운영**: 전원 안정화 (UPS 또는 안정화 전원 사용)
4. **백업**: 정기적인 DB 백업 설정
5. **모니터링**: Prometheus + Grafana로 고급 모니터링

---

**축하합니다! 라즈베리파이 배포 준비 완료! 🍓🚀**
