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
| `MAX_UPLOAD_MB` | Dung lượng tối đa mỗi file nhạc tải lên (mặc định 100). Giới hạn body của reverse proxy phải cho phép ít nhất chừng này |
| `COOKIE_SECURE` | Ở chế độ production, cookie đăng nhập có cờ Secure trừ khi đặt `false` |
| `TRUST_PROXY_HOPS` | Số reverse proxy của bạn đứng trước app (mặc định 0 = không tin `X-Forwarded-For`). Dùng để giới hạn đăng nhập sai theo đúng IP thật |

Tạo người dùng khi phát triển: `npm run user -- --email a@b.c --password '...' [--admin]`.

## Triển khai (Portainer)

Image được GitHub Actions (`.github/workflows/docker.yml`) dựng sẵn mỗi lần đẩy lên `main` và
đẩy lên `ghcr.io/drawtsae/sb` với tag `latest` và `sha-<mã commit>` (tag git `v1.2.3` cho ra
`1.2.3`). Máy chủ không cần build, chỉ cần kéo image về.

> **HTTPS là bắt buộc** để dùng chế độ offline: service worker và Cache Storage chỉ hoạt
> động trên HTTPS (hoặc localhost). Đặt app sau reverse proxy có TLS của bạn (Nginx Proxy
> Manager, Traefik, Cloudflare Tunnel…), trỏ về cổng `APP_PORT` của máy chủ.

1. Portainer → **Stacks → Add stack**. Dán nội dung `docker-compose.yml` vào Web editor (hoặc
   chọn **Repository** trỏ tới repo này, file `docker-compose.yml`).
2. Ở mục **Environment variables**, điền các biến (hoặc **Load variables from .env file** với
   file `.env.production.example` rồi sửa giá trị). Không có file `.env` nào trên máy chủ.

   | Biến | Ý nghĩa |
   |---|---|
   | `IMAGE_TAG` | Tag image, mặc định `latest`. Ghim `sha-<mã commit>` hoặc `1.2.3` để không tự lên bản mới |
   | `APP_PORT` | Cổng trên máy chủ, mặc định 3000. Reverse proxy chuyển tới cổng này |
   | `ADMIN_EMAIL`, `ADMIN_PASSWORD` | Quản trị viên đầu tiên (chỉ dùng khi chưa có người dùng nào) |
   | `MAX_UPLOAD_MB` | Dung lượng tối đa mỗi file nhạc, mặc định 100 |
   | `COOKIE_SECURE` | `true` (mặc định). Chỉ đặt `false` khi thử qua http thường |
   | `TRUST_PROXY_HOPS` | `1` khi đứng sau một reverse proxy; `0` nếu publish thẳng cổng ra ngoài |

3. **Deploy the stack.** Lần đầu khởi động, nếu chưa có người dùng nào, ứng dụng tạo quản trị
   viên từ `ADMIN_EMAIL` / `ADMIN_PASSWORD`. Đăng nhập được rồi thì xoá `ADMIN_PASSWORD` khỏi
   biến môi trường của stack và **Update the stack**.

**Reverse proxy:** cho phép body request ít nhất bằng `MAX_UPLOAD_MB` (Nginx Proxy Manager mặc
định chỉ 1 MB: thêm `client_max_body_size 200m;` ở tab Advanced), và đừng nén (gzip) các đường
dẫn `/api/songs/*` vì sẽ làm hỏng việc tua nhạc (Range request).

**Giới hạn đăng nhập sai** tính theo email + IP. IP lấy từ `X-Forwarded-For`, chỉ tin đúng số
proxy khai báo ở `TRUST_PROXY_HOPS` (tính từ phải sang). Đặt sai số này thì kẻ tấn công có thể
giả header để né giới hạn (đặt quá lớn), hoặc mọi người dùng chung một bộ đếm (đặt 0 khi có proxy).

Đổi biến môi trường xong phải **Update the stack** (tạo lại container); Restart không nạp biến mới.

Nếu package trên GHCR để riêng tư, thêm registry `ghcr.io` trong Portainer (**Registries**) với
token có quyền `read:packages`, hoặc đổi package sang Public trong GitHub.

Lưu ý tải lên: `requestTimeout` mặc định của Node là 300 giây, nên file 100 MB cần đường
upload tối thiểu khoảng 3 Mbit/s. Mạng yếu hơn thì tải file nhỏ hơn.

Không dùng Portainer: chép biến vào file `.env` cạnh `docker-compose.yml` rồi chạy
`docker compose up -d` (Compose tự đọc `.env` để thay các biến `${...}`).

### Tạo người dùng

Portainer → container `app` → **Console** (`/bin/sh`), rồi chạy:

```bash
node dist-scripts/create-user.js --email nguoi@dung.vn --password 'mat-khau-dai' [--admin]
```

### Cập nhật

Portainer → stack → **Update the stack**, bật **Re-pull image and redeploy**. Dữ liệu nằm trong
volume `soundboard-data` nên được giữ nguyên. **Không cập nhật trong lúc đang diễn ra tiệc.**

### Sao lưu

- Cách nhanh: đăng nhập quản trị, bấm **"Tải bản sao lưu database"**. File này chỉ chứa
  database (`app.db`), **không** có nhạc.
- Sao lưu đầy đủ: sao lưu **cả volume** `soundboard-data`. Cần **cả hai**: `app.db`
  (chương trình, tiết mục, người dùng) **và** `music/` (các file nhạc). Chỉ có một trong hai
  thì không khôi phục được. Dừng app trong lúc sao lưu để database nhất quán:

```bash
# Portainer: Stop container app (hoặc: docker stop <tên container app>)
docker run --rm -v soundboard-data:/data -v $(pwd):/backup debian:stable-slim   tar czf /backup/soundboard-data-$(date +%F).tar.gz -C /data .
# Portainer: Start container app (hoặc: docker start <tên container app>)
```

### Khôi phục

Từ bản sao lưu đầy đủ (tar.gz). Phải xoá sạch volume trước, vì file `app.db-wal`/`-shm` cũ
còn sót có thể bị SQLite ghi đè lên database vừa khôi phục và làm hỏng nó.

```bash
# Portainer: Stop container app (hoặc: docker stop <tên container app>)
docker run --rm -v soundboard-data:/data alpine sh -c 'find /data -mindepth 1 -delete'
docker run --rm -v soundboard-data:/data -v $(pwd):/backup debian:stable-slim   tar xzf /backup/soundboard-data-YYYY-MM-DD.tar.gz -C /data
# Portainer: Start container app (hoặc: docker start <tên container app>)
```

Từ file tải bằng nút "Tải bản sao lưu database" (chỉ có database): thư mục `/data/music/`
trong volume phải còn nguyên (các file nhạc không nằm trong file này).

```bash
# Portainer: Stop container app (hoặc: docker stop <tên container app>)
docker run --rm -v soundboard-data:/data alpine sh -c 'rm -f /data/app.db /data/app.db-wal /data/app.db-shm'
docker run --rm -v soundboard-data:/data -v $(pwd):/backup alpine   cp /backup/app.db /data/app.db     # app.db là file đã tải về, đặt trong thư mục hiện tại
docker run --rm -v soundboard-data:/data alpine chown 1000:1000 /data/app.db
# Portainer: Start container app (hoặc: docker start <tên container app>)
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
