# Soundboard đám cưới

Ứng dụng soundboard cho đám cưới (Next.js 16 + SQLite, tự host, giao diện tiếng Việt).
Mọi dữ liệu (database `app.db` và thư mục nhạc `music/`) nằm trong một thư mục dữ liệu duy nhất.

## Phát triển (không cần Docker)

```bash
npm install
cp .env.example .env.local   # rồi sửa giá trị nếu cần
npm run dev                  # http://localhost:3000
npm test                     # kiểm tra đơn vị (vitest)
npm run test:e2e             # kiểm tra end-to-end (Playwright)
```

Biến môi trường:

| Biến | Ý nghĩa |
|---|---|
| `DATA_DIR` | Thư mục chứa `app.db` và `music/` (mặc định `./data`) |
| `ADMIN_EMAIL`, `ADMIN_PASSWORD` | Tạo quản trị viên đầu tiên khi chưa có người dùng nào (mật khẩu tối thiểu 8 ký tự, không được chứa `change-me`) |
| `MAX_UPLOAD_MB` | Dung lượng tối đa mỗi file nhạc tải lên (mặc định 100). Phải nhỏ hơn hoặc bằng giới hạn `request_body` 200MB của Caddy; muốn tăng thì tăng cả hai |
| `COOKIE_SECURE` | Ở chế độ production, cookie đăng nhập có cờ Secure trừ khi đặt `false` |

Tạo người dùng khi phát triển: `npm run user -- --email a@b.c --password '...' [--admin]`.

## Triển khai (Docker + Caddy)

Chạy bằng một container ứng dụng, đứng sau Caddy (Caddy lo HTTPS tự động).

**Yêu cầu:** một VPS hoặc máy có Docker (kèm Docker Compose) và một tên miền đã trỏ về máy đó
(bản ghi A/AAAA), cổng 80 và 443 mở. Nên có ít nhất 2 GB RAM để build (hoặc thêm swap).
Nên chỉ đặt bản ghi A (không AAAA), hoặc bật IPv6 cho Docker, để giới hạn đăng nhập thấy đúng IP
thật của client.

> **HTTPS là bắt buộc** để dùng chế độ offline: service worker và Cache Storage chỉ hoạt
> động trên HTTPS (hoặc localhost). Không có HTTPS thì không nạp được nhạc để chạy offline.

```bash
git clone <repo> soundboard && cd soundboard
cp .env.production.example .env
# sửa .env: DOMAIN, ACME_EMAIL, ADMIN_EMAIL, ADMIN_PASSWORD, MAX_UPLOAD_MB
docker compose up -d --build
```

Lần đầu khởi động, nếu chưa có người dùng nào, ứng dụng tạo quản trị viên từ
`ADMIN_EMAIL` / `ADMIN_PASSWORD`. Sau khi đăng nhập được, nên xoá `ADMIN_PASSWORD` khỏi `.env`.

**Không publish cổng 3000 của `app`.** Chỉ Caddy mở cổng 80/443. Giới hạn đăng nhập sai theo
IP dựa vào phần tử đầu tiên của `X-Forwarded-For`; Caddy đặt giá trị này từ IP thật của
client (không tin header do client gửi), nên ứng dụng chỉ được truy cập qua Caddy.

Muốn đổi `.env`, chạy `docker compose up -d` (tạo lại container); `docker compose restart`
không nạp biến môi trường mới.

Lưu ý tải lên: `requestTimeout` mặc định của Node là 300 giây, nên file 100 MB cần đường
upload tối thiểu khoảng 3 Mbit/s. Mạng yếu hơn thì tải file nhỏ hơn.

### Tạo người dùng

```bash
docker compose exec app node dist-scripts/create-user.js --email nguoi@dung.vn --password 'mat-khau-dai' [--admin]
```

### Cập nhật

```bash
git pull && docker compose up -d --build
```

Dữ liệu nằm trong volume `soundboard-data` nên được giữ nguyên. **Không cập nhật trong lúc
đang diễn ra tiệc.**

### Sao lưu

- Cách nhanh: đăng nhập quản trị, bấm **"Tải bản sao lưu database"**. File này chỉ chứa
  database (`app.db`), **không** có nhạc.
- Sao lưu đầy đủ: sao lưu **cả volume** `soundboard-data`. Cần **cả hai**: `app.db`
  (chương trình, tiết mục, người dùng) **và** `music/` (các file nhạc). Chỉ có một trong hai
  thì không khôi phục được. Dừng app trong lúc sao lưu để database nhất quán:

```bash
docker compose stop app
docker run --rm -v soundboard-data:/data -v $(pwd):/backup debian:stable-slim   tar czf /backup/soundboard-data-$(date +%F).tar.gz -C /data .
docker compose start app
```

### Khôi phục

Từ bản sao lưu đầy đủ (tar.gz). Phải xoá sạch volume trước, vì file `app.db-wal`/`-shm` cũ
còn sót có thể bị SQLite ghi đè lên database vừa khôi phục và làm hỏng nó.

```bash
docker compose stop app
docker run --rm -v soundboard-data:/data alpine sh -c 'find /data -mindepth 1 -delete'
docker run --rm -v soundboard-data:/data -v $(pwd):/backup debian:stable-slim   tar xzf /backup/soundboard-data-YYYY-MM-DD.tar.gz -C /data
docker compose start app
```

Từ file tải bằng nút "Tải bản sao lưu database" (chỉ có database): thư mục `/data/music/`
trong volume phải còn nguyên (các file nhạc không nằm trong file này).

```bash
docker compose stop app
docker run --rm -v soundboard-data:/data alpine sh -c 'rm -f /data/app.db /data/app.db-wal /data/app.db-shm'
docker run --rm -v soundboard-data:/data -v $(pwd):/backup alpine   cp /backup/app.db /data/app.db     # app.db là file đã tải về, đặt trong thư mục hiện tại
docker run --rm -v soundboard-data:/data alpine chown 1000:1000 /data/app.db
docker compose start app
```

## Chạy thủ công không Docker (standalone)

```bash
npm ci
npm run build
S=.next/standalone
# Thứ tự quan trọng: `next build` chép public/ vào standalone TRƯỚC khi `serwist build`
# ghi public/sw.js, nên phải chép lại public/ sau build để có sw.js mới.
# (dùng "thư-mục/." vì $S/public đã tồn tại; `cp -r public $S/public` sẽ tạo public/public)
mkdir -p $S/.next/static $S/public $S/drizzle
cp -r .next/static/. $S/.next/static/
cp -r public/.       $S/public/
cp -r drizzle/.      $S/drizzle/
DATA_DIR=./data ADMIN_EMAIL=... ADMIN_PASSWORD=... COOKIE_SECURE=false PORT=3000 node $S/server.js
```

(`COOKIE_SECURE=false` chỉ dùng khi chạy HTTP thuần để thử; sau proxy HTTPS thì bỏ đi.)

Kiểm tra nhanh `sw.js` là bản mới, phải in ra `1` (hoặc số lớn hơn 0):

```bash
curl -s http://localhost:3000/sw.js | grep -c "$(cat .next/BUILD_ID)"
```

## Danh sách kiểm tra ngày diễn ra

1. Mở chương trình, bấm **"Kiểm tra & nạp"** để nạp toàn bộ nhạc.
2. Chờ hiện **"Sẵn sàng offline"**.
3. Bấm **"Thử chế độ offline"** và xác nhận chạy được.
4. Cắm loa.
5. Tắt chế độ ngủ và trình bảo vệ màn hình của máy.
6. **Không** mở "Kiểm tra & nạp" ở tab khác trong lúc diễn ra tiệc.
7. **Không** triển khai bản cập nhật trong lúc diễn ra tiệc.

Danh sách kiểm tra thủ công với loa thật: [`docs/manual-test.md`](docs/manual-test.md).
