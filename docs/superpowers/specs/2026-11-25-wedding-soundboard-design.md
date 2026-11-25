# Sound board điều khiển nhạc đám cưới — Thiết kế

Ngày: 2026-11-25
Trạng thái: bản nháp, chờ duyệt (bản 4: Next.js + SQLite, triển khai bằng Docker)

## 1. Mục đích và lý do

Một ứng dụng web cho **một người điều khiển** phát nhạc trong tiệc cưới. Người đó ngồi
ở laptop nối loa.

- Nhạc nền chạy liên tục và xoay vòng suốt buổi.
- Đến từng tiết mục trong kịch bản (cô dâu chú rể vào, cắt bánh, rót rượu, cảm ơn bố
  mẹ…), người điều khiển bấm một nút để chuyển sang bài dành riêng cho tiết mục đó.
- Mọi lần chuyển đều mượt (fade out / fade in), không bao giờ cắt cụt.

Chỉ người điều khiển nhìn màn hình. Khách chỉ nghe qua loa.

Ứng dụng còn dùng để **quản lý kho nhạc** (tải lên, sắp xếp, đổi tên, xoá) và **lưu
nhiều chương trình**, mỗi đám cưới một kịch bản.

Điều quan trọng nhất là **không được trục trặc trong ngày cưới**:

- không có lúc im lặng ngoài ý muốn;
- không cắt nhạc đột ngột;
- không phụ thuộc vào internet ở nhà hàng.

## 2. Mục tiêu, không làm, và những điều coi là thất bại

**Mục tiêu**

- **Kho nhạc:** tải lên từ trình duyệt, xếp vào thư mục, đổi tên, chuyển thư mục, thay
  file, xoá, tìm kiếm, nghe thử.
- **Nhiều chương trình (event):** mỗi chương trình có playlist nhạc nền, kịch bản và cài
  đặt riêng.
- **Playlist nhạc nền:** phát lần lượt, hết bài cuối thì quay lại bài đầu, giữa hai bài
  có crossfade.
- **Kịch bản:** danh sách tiết mục theo thứ tự. Mỗi tiết mục có bài hát, giây bắt đầu,
  giây kết thúc (không bắt buộc) và hành vi khi hết bài.
- **Chuyển nhạc mượt:** thời gian fade chỉnh được.
- **Chế độ Live:**
  - phải nạp và kiểm tra xong toàn bộ nhạc thì mới được bắt đầu;
  - sau đó chạy hoàn toàn không cần internet, cũng không cần server, kể cả khi lỡ tải
    lại trang.
- **Chỉ người có tài khoản** mới xem và sửa được dữ liệu.
- **Môi trường:**
  - lúc phát triển chỉ cần `npm run dev`, không cần Docker;
  - khi đưa lên server thì chạy bằng **Docker**.

**Không làm (non-goals)**

- Màn hình chiếu cho khách (lời bài hát, ảnh, video).
- Phát nhạc từ Spotify, YouTube hay nguồn trực tuyến khác.
- Tự đăng ký tài khoản; phân quyền chi tiết (chỉ có hai vai trò: admin và người dùng).
- Nhiều người cùng sửa một kịch bản theo thời gian thực. Ai lưu sau thì được giữ.
- Sửa kịch bản khi mất mạng.
- Chạy nhiều bản server song song (scale ngang). Chỉ có một container.
- Tối ưu cho điện thoại. Mục tiêu là laptop màn hình từ 13 inch trở lên.
- Trộn nhạc kiểu DJ.

**Coi là thất bại dù vẫn "chạy được" (anti-goals)**

- Có khoảng im lặng mà người điều khiển không chủ động tạo ra.
- Có nút hoặc phím tắt làm nhạc tắt cái rụp trước mặt khách.
- Chế độ Live cần internet, hoặc cần server còn sống, trong lúc tiệc diễn ra.
- Giao diện rối, khiến người điều khiển phải suy nghĩ hay tìm kiếm khi đang căng thẳng.
- Người ngoài tải được nhạc hoặc sửa được dữ liệu.
- Mất database hoặc nhạc khi khởi động lại hay cập nhật container.
- Trình duyệt nặng, giật hoặc treo vì giữ quá nhiều dữ liệu âm thanh.

## 3. Ràng buộc

**Trình duyệt**

- Bắt buộc: Chrome và Edge desktop bản mới (Windows, macOS).
- Safari: tốt nếu chạy được, không bắt buộc.

**Stack** (người dùng đã chọn)

- **Next.js** (App Router, TypeScript) chạy như một server Node (`output: 'standalone'`).
- **SQLite** là cơ sở dữ liệu duy nhất.
- **File nhạc** lưu trên ổ đĩa của server.
- Không dùng Supabase hay dịch vụ đám mây nào.

**Phát triển**

- `npm install && npm run dev` là chạy được, không cần Docker.
- Dữ liệu lúc dev nằm trong `./data/` (gitignore).

**Triển khai**

- Một `Dockerfile` và một `docker-compose.yml`.
- Toàn bộ dữ liệu nằm trong **một volume** gắn vào `/data`:
  - `/data/app.db`: database;
  - `/data/music/`: file nhạc.
- Cập nhật hay khởi động lại container không được làm mất dữ liệu.

**HTTPS**

- Service worker (cần cho chế độ offline) **chỉ chạy trên HTTPS**, ngoại trừ
  `localhost`.
- Vì vậy server thật cần một tên miền và HTTPS. `docker-compose.yml` kèm **Caddy** làm
  reverse proxy để tự lấy chứng chỉ.

**Định dạng nhạc**

- Hỗ trợ MP3, M4A/AAC, WAV. Khuyên dùng MP3.
- File không đọc được phải bị từ chối ngay lúc tải lên.
- Bước nạp trước tiệc kiểm tra lại lần nữa.

**Quy mô dự kiến**

- Khoảng 30–300 bài, tổng 0,3–3 GB.
- Giới hạn mỗi file mặc định 100 MB, chỉnh được bằng biến môi trường.

**Bộ nhớ**

- Không giải mã toàn bộ nhạc thành PCM rồi giữ trong RAM.
- Giữ **file gốc** trong Cache Storage của trình duyệt và phát qua `HTMLAudioElement`.

## 4. Các cách đã cân nhắc

**Cách triển khai**: web đưa lên mạng, cài được như ứng dụng (PWA), chế độ Live chạy
offline. Đã chọn ở vòng đầu. Hai cách bị loại:

- web mở thẳng file `index.html`;
- server Node chạy trên laptop.

**Backend và nơi lưu dữ liệu**

| Cách | Ưu điểm | Nhược điểm |
|---|---|---|
| Next.js trên Vercel + Supabase | Dịch vụ lo hết, không phải giữ server | Gói miễn phí giới hạn 1 GB, project tự tạm dừng, Vercel Hobby không cho dùng thương mại, dev cần Docker để chạy Supabase trên máy |
| **Next.js + SQLite + file trên ổ đĩa, triển khai bằng Docker** | Một container, không phụ thuộc dịch vụ ngoài, không giới hạn dung lượng ngoài ổ đĩa, dev không cần Docker | Phải tự có server (VPS hoặc máy riêng), tên miền, HTTPS, và tự sao lưu |
| Next.js + Postgres trong Docker | Database mạnh hơn | Dev cần Docker hoặc phải cài Postgres; với một người dùng thì quá mức cần |

**Người dùng chọn Next.js + SQLite, triển khai bằng Docker, dev không cần Docker.**

Các phương án trước đó bị thay thế:

- IndexedDB;
- thư mục nhạc tĩnh + `config.json`;
- Supabase.

## 5. Các điều người dùng đã quyết định

1. Chỉ có một màn hình điều khiển trên laptop, nhạc phát ra loa, không có màn hình
   chiếu.
2. Có playlist nhạc nền phát liên tục và xoay vòng.
3. Có kịch bản. Bấm một tiết mục thì nhạc nền fade out và bài tiết mục fade in.
4. Khi hết bài tiết mục, hành vi được **cài riêng cho từng tiết mục**:
   - *Phát tiếp nhạc nền*: tiếp tục đúng bài, đúng chỗ đang dở;
   - *Dừng*: im lặng.
5. Mỗi tiết mục chọn được phát từ giây thứ mấy.
6. Là ứng dụng web đưa lên mạng. **Phải nạp hết nhạc rồi mới được chạy.** Lúc tiệc diễn
   ra không cần internet.
7. Playlist và kịch bản được soạn trên giao diện web.
8. Dùng Next.js, có SQL, cho phép tải nhạc lên và quản lý file trên web.
9. **Dùng SQLite, không dùng Supabase. Triển khai bằng Docker. Lúc dev chạy bình thường,
   không dùng Docker.**

## 6. Thiết kế

### 6.1 Các màn hình

1. **Đăng nhập**: email và mật khẩu. Không có nút đăng ký.
2. **Kho nhạc** (6.2).
3. **Danh sách chương trình**: tạo, đổi tên, nhân bản, xoá.
4. **Soạn chương trình**: playlist nhạc nền, kịch bản, cài đặt.
5. **Kiểm tra & nạp** (6.7). Nút **"Bắt đầu tiệc"** chỉ bấm được khi mọi thứ đã đạt.
6. **Biểu diễn (Live)** (6.6). Không có thao tác sửa. Muốn thoát phải xác nhận.
7. **Người dùng** (chỉ admin): tạo tài khoản, đặt lại mật khẩu, xoá tài khoản.

### 6.2 Kho nhạc

**Tải lên**

- Kéo thả nhiều file hoặc cả thư mục, hoặc dùng nút chọn file.
- Mỗi file có thanh tiến độ và nút thử lại riêng.

**Kiểm tra trùng trước khi tải**

- Trình duyệt tính SHA-256 của file rồi hỏi server xem mã băm đã tồn tại chưa.
- Nếu trùng, hiện "Bài này đã có trong kho" với hai lựa chọn: bỏ qua, hoặc vẫn thêm.

**Gửi file lên server**

- Mỗi file được gửi bằng một request `PUT` riêng (thân request là file thô).
- Server **ghi thẳng ra đĩa theo dạng luồng** (không đọc cả file vào RAM). Trong lúc
  ghi, server tính lại mã băm và đếm số byte. Vượt giới hạn dung lượng thì dừng và xoá
  file tạm.

**Sau khi nhận xong file**

- Server đọc thẻ ID3/MP4 (tên bài, nghệ sĩ) và thời lượng.
- Không đọc được thì từ chối và xoá file.
- Không có tên bài thì lấy tên file (bỏ đuôi, chuẩn hoá Unicode NFC).
- Chuyển file tạm thành `/data/music/<song_id>.<ext>`, rồi ghi một dòng vào bảng
  `songs`.
- Ghi DB lỗi thì xoá file.

**Phát nhạc từ server**

- Route `GET /api/songs/<id>/file` trả file nhạc, có hỗ trợ Range request (để tua khi
  nghe thử).
- Bắt buộc đã đăng nhập.

**Thư mục**

- Thư mục là thư mục ảo, lưu trong DB (`folders`, lồng nhau được).
- Chuyển một bài sang thư mục khác không di chuyển file trên đĩa.

**Thao tác khác**

- Đổi tên hiển thị, sửa nghệ sĩ.
- Chuyển thư mục.
- Tìm theo tên hoặc nghệ sĩ.
- Lọc theo thư mục.
- Nghe thử.
- Thay file: giữ nguyên bài và mọi chỗ đang dùng bài đó.
- Hiện tổng dung lượng nhạc và dung lượng đĩa còn trống.

**Xoá**

- Bài đang được dùng trong chương trình nào thì bị chặn xoá, và hiện danh sách các
  chương trình đó.
- Ngược lại thì xoá cả file lẫn dòng DB, có hộp xác nhận.
- Thư mục chỉ xoá được khi trống.

### 6.3 Playlist nhạc nền (mỗi chương trình một playlist)

- Danh sách có thứ tự. Thêm bài từ kho, kéo thả để sắp xếp. Một bài có thể xuất hiện
  nhiều lần.
- Phát lần lượt; hết bài cuối thì quay lại bài đầu. Có tuỳ chọn trộn ngẫu nhiên, mặc
  định tắt.
- Crossfade giữa hai bài: N giây, mặc định 4.
- Nhạc nền có mức âm lượng riêng, mặc định 70%.

### 6.4 Kịch bản (danh sách tiết mục)

**Các trường của một tiết mục**

| Trường | Ý nghĩa | Mặc định |
|---|---|---|
| Loại | *Bài riêng* hoặc *Nhạc nền* | Bài riêng |
| Tên tiết mục | ví dụ "Cô dâu chú rể vào" | — |
| Bài hát | chọn từ kho; bắt buộc với loại Bài riêng | — |
| Giây bắt đầu | phát từ mm:ss | 0:00 |
| Giây kết thúc | không bắt buộc; tới đây thì tự fade out | hết bài |
| Fade in / fade out | số giây | theo cài đặt chung |
| Âm lượng | % | 100% |
| Khi hết bài | *Phát tiếp nhạc nền* / *Dừng* | Phát tiếp nhạc nền |
| Ghi chú | gợi ý cho người điều khiển | trống |

**Tiết mục loại Nhạc nền**

- Không có bài hát.
- Bấm vào thì có tác dụng như "Về nhạc nền", và tiết mục được đánh dấu là tiết mục hiện
  tại.

**Thao tác trên kịch bản**

- Kéo thả để sắp xếp. Thêm, sửa, xoá, nhân bản tiết mục.
- Chọn giây bắt đầu / kết thúc bằng thanh tua, kèm hai nút **"Nghe thử từ điểm này"**
  và **"Lấy vị trí đang nghe"**.

**Lưu**

- Mọi thay đổi **tự lưu**. Có chỉ báo trạng thái: "Đã lưu" / "Đang lưu…" / "Lỗi lưu,
  thử lại".
- Hai người cùng sửa: ai lưu sau thì bản của người đó được giữ.

### 6.5 Hành vi phát nhạc (phần lõi)

**Hai kênh phát**

- **Kênh nhạc nền**: phát playlist. Khi tạm dừng vẫn giữ bài và vị trí đang phát, không
  bị huỷ.
- **Kênh tiết mục**: phát bài của tiết mục hiện tại.

**Đường đi âm thanh của mỗi kênh**

`HTMLAudioElement` → `MediaElementAudioSourceNode` → `GainNode` → master `GainNode` → loa.

- Fade dùng `gain.linearRampToValueAtTime` (hoặc đường cong equal-power), chạy theo đồng
  hồ của `AudioContext`.
- Crossfade nhạc nền cần ít nhất hai phần tử audio, luân phiên nhau.

**Bảng chuyển trạng thái**

| Từ | Hành động | Kết quả |
|---|---|---|
| Nhạc nền đang phát | Bấm một tiết mục | Nhạc nền fade out rồi tạm dừng (giữ vị trí). Bài tiết mục tua tới giây bắt đầu và fade in. Hai fade chồng lên nhau. |
| Tiết mục A đang phát | Bấm tiết mục B | A fade out, B fade in. Nhạc nền vẫn tạm dừng. |
| Tiết mục đang phát | Hết bài / tới giây kết thúc, hành vi "Phát tiếp nhạc nền" | Tiết mục fade out. Nhạc nền fade in **từ đúng chỗ đang dở**. |
| Tiết mục đang phát | Hết bài / tới giây kết thúc, hành vi "Dừng" | Tiết mục fade out về im lặng. Màn hình hiện rõ "ĐANG IM LẶNG". |
| Bất kỳ | Bấm **"Về nhạc nền"** hoặc tiết mục loại Nhạc nền | Bài đang phát fade out. Nhạc nền fade in từ chỗ đang dở. |
| Bất kỳ | Bấm **"Fade out & dừng"** | Mọi thứ fade out về im lặng (mặc định 3 giây). **Không có nút dừng tức thì.** |
| Im lặng | Bấm "Phát nhạc nền" hoặc một tiết mục | Fade in tương ứng. |

**Quy tắc bổ sung**

- **Bấm liên tiếp khi đang fade**: huỷ fade cũ, bắt đầu fade mới từ mức âm lượng hiện
  tại.
- **"Bắt đầu tiệc"** chỉ chuyển sang màn hình Live, không tự phát nhạc.
- **Độ dài fade khi đổi tiết mục**: bài cũ dùng fade out của nó, bài mới dùng fade in
  của nó, hai fade chạy cùng lúc.
- **Khi bài hết tự nhiên**: tiết mục bắt đầu fade out sớm hơn điểm kết thúc đúng bằng
  thời gian fade out. Nhạc nền (nếu được phát tiếp) fade in chồng lên trong khoảng đó.
- **Phím N** luôn chuyển tới tiết mục ngay sau tiết mục hiện tại.
- Tiết mục đã phát thì hiện dấu ✓.

### 6.6 Màn hình Biểu diễn (bố cục đề xuất)

```
┌───────────────────────────────────────────────────────────────────┐
│ ĐANG PHÁT: [Tiết mục] Cô dâu chú rể vào — "A Thousand Years"      │
│ ████████████░░░░░░  1:42 / 3:10   → hết bài: phát tiếp nhạc nền   │
├──────────────────────────────┬────────────────────────────────────┤
│ KỊCH BẢN                     │ NHẠC NỀN (tạm dừng ở 2:15)         │
│  ✓ 1. Đón khách (nhạc nền)   │  ▸ Bài 4/25: "Perfect"             │
│  ▶ 2. Cô dâu chú rể vào      │    tiếp theo: "Marry You"          │
│    3. Cắt bánh               │                                    │
│    4. Rót rượu               │ Âm lượng nền  ▬▬▬▬▬▬▬○──  70%      │
│    5. Cảm ơn bố mẹ  [Dừng]   │ Âm lượng tổng ▬▬▬▬▬▬▬▬○─  90%      │
│  Ghi chú: chờ MC giới thiệu  │                                    │
├──────────────────────────────┴────────────────────────────────────┤
│ [ ▶ TIẾT MỤC TIẾP: Cắt bánh ]  [ Về nhạc nền ]  [ Fade out & dừng ]│
└───────────────────────────────────────────────────────────────────┘
```

**Giao diện**

- Nút lớn, chữ to, tương phản cao, nền tối.

**Phím tắt**

| Phím | Tác dụng |
|---|---|
| `N` | Tiết mục tiếp theo |
| `B` | Về nhạc nền |
| `F` | Fade out & dừng |
| `↑` / `↓` | Tăng / giảm âm lượng tổng |
| Space | Không làm gì (cố ý không gán) |

- Bấm thẳng vào bất kỳ tiết mục nào để nhảy tới tiết mục đó.

### 6.7 Nạp nhạc và chạy offline

**Bước Kiểm tra & nạp**

1. Lấy dữ liệu chương trình từ server, đóng băng thành một **bản chụp (snapshot)** và
   lưu vào `localStorage`. Live chạy theo bản chụp này.
2. Với mỗi bài được dùng, tải `GET /api/songs/<id>/file` về và lưu vào Cache Storage.
   - Cache được khoá theo `song_id` + mã băm.
   - Bài đã có sẵn với cùng mã băm thì bỏ qua.
3. Kiểm tra từng bài:
   - phát được hay không (cho audio nạp metadata từ blob);
   - giây bắt đầu và giây kết thúc có nằm trong thời lượng bài không.
4. Hiện tiến độ và danh sách lỗi.
   - Không còn lỗi thì mới cho bấm "Bắt đầu tiệc".
   - Dọn khỏi cache những bài không còn được dùng.

**Trong lúc Live**

- Mọi bài phát từ object URL tạo từ blob trong cache.
- Không có request mạng nào tới server.

**Tải lại trang khi mất mạng**

- Service worker phục vụ trang Live và mã JS của nó từ cache.
- Trang Live render hoàn toàn phía client từ snapshot.
- Trang Live **không đi qua kiểm tra đăng nhập** phía server. Dữ liệu trên trang chỉ là
  bản chụp mà người đã đăng nhập tải về chính máy đó, nên không lộ gì cho người khác.

**Các chi tiết khác**

- Gọi `navigator.storage.persist()`.
- Hiện badge **"Sẵn sàng offline"** khi đã đủ ba điều kiện:
  - service worker đã cài;
  - snapshot đã lưu;
  - nhạc đã nằm trong cache.
- Có nút **"Thử chế độ offline"**.

### 6.8 Dữ liệu (SQLite)

**Các bảng**

| Bảng | Cột chính |
|---|---|
| `users` | `id`, `email` (unique), `password_hash`, `is_admin`, `created_at` |
| `sessions` | `id` (token ngẫu nhiên), `user_id`, `expires_at` |
| `folders` | `id`, `name`, `parent_id` |
| `songs` | `id`, `folder_id`, `title`, `artist`, `duration_sec`, `file_name`, `file_size`, `mime_type`, `content_hash`, `created_at`, `updated_at` |
| `events` | `id`, `name`, `event_date`, `settings` (JSON), `created_at`, `updated_at` |
| `background_tracks` | `id`, `event_id`, `position`, `song_id` |
| `cues` | `id`, `event_id`, `position`, `kind`, `name`, `song_id`, `start_sec`, `end_sec`, `fade_in_sec`, `fade_out_sec`, `volume`, `on_end`, `note` |

**Ràng buộc**

- Bảng `cues` có `CHECK`:
  - tiết mục loại `song` thì phải có `song_id`;
  - `end_sec` phải lớn hơn `start_sec`.
- Khoá ngoại tới `songs` dùng `ON DELETE RESTRICT`.
- Khoá ngoại tới `events` dùng `ON DELETE CASCADE`.
- Bật `PRAGMA foreign_keys = ON`, `journal_mode = WAL`, `busy_timeout = 5000`.

**Migration**

- Schema được quản lý bằng migration và lưu trong repo.
- Migration tự chạy khi server khởi động.

**Đăng nhập**

- Mật khẩu được băm bằng **argon2id**.
- Phiên đăng nhập lưu trong bảng `sessions`. Cookie `HttpOnly`, `Secure` (khi chạy
  HTTPS), `SameSite=Lax`, hạn 30 ngày.
- Đăng nhập sai nhiều lần thì bị chậm lại (rate limit đơn giản trong bộ nhớ).

**Tài khoản admin đầu tiên**

- Tạo từ biến môi trường `ADMIN_EMAIL` / `ADMIN_PASSWORD` khi database chưa có người
  dùng nào.
- Sau đó admin tạo thêm tài khoản trong trang Người dùng.

**Phân quyền**

- Mọi người dùng đã đăng nhập dùng chung một không gian làm việc, được xem và sửa mọi
  thứ.
- Chỉ admin được quản lý người dùng.

### 6.9 An toàn trong lúc tiệc

- Bật Screen Wake Lock khi ở chế độ Live.
- Hiện cảnh báo `beforeunload` khi lỡ đóng tab.
- Định kỳ lưu trạng thái Live vào `localStorage`. Khi tải lại trang thì cho chọn
  **"Tiếp tục từ chỗ cũ"**, và không tự phát nhạc.
- Mọi thao tác xoá đều có hộp xác nhận.

### 6.10 Cài đặt của mỗi chương trình

| Cài đặt | Mặc định |
|---|---|
| Fade khi chuyển tiết mục | 3 giây |
| Crossfade nhạc nền | 4 giây |
| Fade out & dừng | 3 giây |
| Âm lượng nhạc nền | 70% |
| Âm lượng tổng | 90% |
| Trộn ngẫu nhiên nhạc nền | Tắt |

### 6.11 Sao lưu

- **Một chương trình**: xuất ra JSON và nhập lại được. Bài hát được khớp theo mã băm.
- **Toàn bộ server**: chỉ cần sao lưu volume `/data`.
  - README hướng dẫn cách dùng `sqlite3 .backup` (hoặc dừng container) cộng chép thư
    mục `music/`.
  - Có thêm nút admin **"Tải bản sao lưu database"**, dùng `VACUUM INTO` để xuất một
    file `.db` nhất quán.

## 7. Các quyết định kỹ thuật (người viết chọn, người dùng có thể sửa)

**Thư viện**

| Việc | Lựa chọn |
|---|---|
| Truy cập SQLite | **better-sqlite3** + **Drizzle ORM** (migration bằng `drizzle-kit`) |
| Băm mật khẩu | `@node-rs/argon2` |
| Giao diện | Tailwind + shadcn/ui |
| Kéo thả | dnd-kit |
| Service worker | Serwist |
| Đọc thông tin file nhạc | `music-metadata` (phía server) |

- Phiên đăng nhập tự viết, khoảng 100 dòng. Không dùng Auth.js, vì chỉ cần
  email/mật khẩu.

**Ghi dữ liệu**

- Server Actions dùng cho các thao tác dữ liệu.
- Route Handlers dùng cho tải lên, phát file và sao lưu.

**Kiểm tra đăng nhập**

- Middleware/proxy của Next.js chỉ kiểm tra cookie có tồn tại hay không.
- Mọi Server Action, Route Handler và trang server đều gọi `requireUser()` để xác thực
  phiên thật với DB.

**Docker**

- Image nhiều tầng dựa trên `node:<LTS>-slim`. Dùng bản slim (không dùng alpine) để
  better-sqlite3 và argon2 có sẵn bản build.
- Chạy bằng user không phải root.
- `docker-compose.yml` gồm hai service:
  - `app` (volume `/data`);
  - `caddy` (HTTPS tự động, cấu hình tên miền qua biến môi trường).

**Giao diện**

- Chỉ tiếng Việt.

## 8. Để người xây dựng tự quyết

- Cấu trúc code, quản lý state, chi tiết giao diện các màn hình soạn và quản lý.
- Đường cong fade, miễn là nghe mượt.
- Mức kiểm tra "phát được" ở bước nạp.

**Kiểm thử, tối thiểu phải có**

- State machine ở mục 6.5.
- Logic nạp và cache ở mục 6.7.
- Kiểm tra đăng nhập trên mọi route API.
- Tải lên: file sai định dạng, file quá lớn, rollback.
- Kiểm thử thủ công: nghe thật trên loa, tắt wifi rồi tải lại trang Live, khởi động lại
  container và kiểm tra dữ liệu còn nguyên.
