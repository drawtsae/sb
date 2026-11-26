# Kiểm tra thủ công (loa thật)

Các bài kiểm tra tự động không nghe được âm thanh. Trước mỗi lần dùng thật, chạy danh sách
này trên đúng máy, đúng trình duyệt và đúng loa sẽ dùng ở tiệc. Đánh dấu `[x]` và ghi ngày,
máy, trình duyệt vào cuối file.

## Chuẩn bị

- [ ] Tạo một chương trình thử có:
  - ít nhất 2 bài nhạc nền;
  - một tiết mục loại Nhạc nền ("Đón khách");
  - một tiết mục bắt đầu ở **0:45**, hành vi khi hết bài **Phát tiếp nhạc nền**;
  - một tiết mục có **giây kết thúc** (ví dụ 1:00), hành vi **Dừng**, có ghi chú.
- [ ] Mở "Kiểm tra & nạp", chờ hiện **"Sẵn sàng offline"**.
- [ ] Cắm loa, bật âm lượng máy ở mức vừa phải, tắt chế độ ngủ của máy.

## Bắt đầu

- [ ] Bấm **"Bắt đầu tiệc"**: trang Live mở ra, **không tự phát nhạc**.
- [ ] Hiện nút **"Bấm để bắt đầu điều khiển"**; bấm vào thì nút biến mất, vẫn im lặng.
- [ ] Màn hình nền tối, chữ to, đọc rõ từ khoảng cách đứng điều khiển.

## Phát nhạc (nghe bằng tai)

- [ ] Bấm **"Phát nhạc nền"** (hoặc phím `B`): nhạc nền **fade in** từ từ, không bật to đột ngột.
- [ ] Để nhạc nền chạy hết một bài: bài sau **crossfade** vào, không có khoảng lặng, không giật.
- [ ] Bấm tiết mục bắt đầu ở 0:45: nhạc nền fade out, bài tiết mục **bắt đầu đúng ở 0:45** và
      fade in; hai fade chồng lên nhau, không có khoảng im lặng ở giữa.
- [ ] Khung trên cùng hiện "ĐANG PHÁT: [Tiết mục] …", thời gian chạy, "còn m:ss" và
      **"→ hết bài: phát tiếp nhạc nền"**.
- [ ] Khung Nhạc nền hiện **"(tạm dừng ở m:ss)"**.
- [ ] Để tiết mục "phát tiếp" chạy tới cuối: nó fade out sớm đúng bằng thời gian fade, nhạc nền
      fade in **từ đúng chỗ đang dở** (đúng bài, đúng đoạn trước khi vào tiết mục).
- [ ] Tiết mục **[Dừng]** có giây kết thúc: tới gần giây kết thúc thì fade out về im lặng, màn hình
      hiện **"ĐANG IM LẶNG"**, khung trên ghi "→ hết bài: dừng" trước đó.
- [ ] Đang phát tiết mục A, bấm tiết mục B: A fade out, B fade in, không cắt đột ngột.
- [ ] Bấm **"Về nhạc nền"** khi đang phát tiết mục: tiết mục fade out, nhạc nền fade in từ chỗ dở.
- [ ] Bấm **"Fade out & dừng"** (phím `F`): mọi thứ fade out trong khoảng 3 giây rồi im lặng.
      Không có nút dừng tức thì.
- [ ] Phím `↑` / `↓`: âm lượng tổng tăng / giảm mượt (không nhảy), thanh "Âm lượng tổng" đổi theo.
- [ ] Kéo thanh "Âm lượng tổng": âm lượng đổi mượt.

## Phím và thao tác dưới áp lực

- [ ] `N` luôn chuyển tới tiết mục ngay sau tiết mục hiện tại; danh sách hiện ▶ ở tiết mục đang
      phát, ✓ ở tiết mục đã phát.
- [ ] Bấm đúp nhanh vào "TIẾT MỤC TIẾP": chỉ chuyển **một** tiết mục.
- [ ] Bấm chuột vào một nút rồi nhấn **Space**: không có gì xảy ra.
- [ ] Ghi chú của tiết mục hiện tại / tiết mục tiếp theo hiện dưới kịch bản.

## Màn hình không tắt, đóng nhầm tab

- [ ] Để máy yên hơn thời gian tự tắt màn hình: màn hình **không tắt** khi đang ở Live.
- [ ] Bấm đóng tab / tải lại trang khi đang phát: trình duyệt **hỏi lại** trước khi rời trang.

## Offline và tải lại

- [ ] Tắt Wi-Fi (hoặc rút mạng). Đang phát vẫn chạy bình thường.
- [ ] Tải lại trang /live (đồng ý rời trang): trang vẫn mở được khi offline, hiện
      **"Tiếp tục từ chỗ cũ"** / **"Bắt đầu lại"**.
- [ ] Bấm "Tiếp tục từ chỗ cũ", rồi "Bấm để bắt đầu điều khiển": **không tự phát**, dấu ✓ và ▶ đúng
      như trước khi tải lại, màn hình hiện "ĐANG IM LẶNG".
- [ ] Bấm "Phát nhạc nền": nhạc nền fade in ở **đúng bài và gần đúng chỗ** trước khi tải lại
      (sai lệch tối đa khoảng 5 giây).
- [ ] Bấm `N`: phát tiết mục tiếp sau tiết mục đã phát trước khi tải lại.
- [ ] Bấm "Bắt đầu lại" (ở lần tải lại khác): kịch bản trở về từ đầu, không còn dấu ✓.

## Thoát

- [ ] Bấm **"Thoát chế độ Live"**: hiện hộp xác nhận; "Ở lại" thì không có gì thay đổi.
- [ ] Bấm "Thoát" khi đang phát: nhạc **fade out** trước, rồi mới chuyển về danh sách chương trình.

## Thiếu nhạc

- [ ] Xoá dữ liệu trang web (Cache Storage) rồi mở /live: hiện
      **"Thiếu nhạc trong bộ nhớ — quay lại Kiểm tra & nạp"** và không bắt đầu được.

## Triển khai (Portainer)

- [ ] Stack từ `docker-compose.yml` với biến môi trường điền trong Portainer khởi động được;
      mở `https://<tên miền của reverse proxy>` thấy trang đăng nhập.
- [ ] Đăng nhập, tải lên một bài nhạc, tạo một chương trình.
- [ ] **Khởi động lại container, dữ liệu còn nguyên:** Restart container `app` trong Portainer;
      đăng nhập lại thì bài nhạc và chương trình vẫn còn, phát được.
- [ ] **Update the stack** với "Re-pull image" (không xoá volume); đăng nhập lại, bài nhạc và
      chương trình vẫn còn.
- [ ] Kiểm tra `sw.js` là bản mới: so `https://<tên miền>/sw.js` với nội dung `.next/BUILD_ID`
      trong container (Console của container: `cat .next/BUILD_ID`); chuỗi đó phải có trong `sw.js`.
- [ ] Đăng nhập sai 5 lần thì bị khoá 15 phút; đổi header `X-Forwarded-For` (ví dụ bằng curl)
      không mở khoá được (kiểm tra `TRUST_PROXY_HOPS` đúng với số reverse proxy).

## Kết quả

| Ngày | Máy / hệ điều hành | Trình duyệt | Loa | Người kiểm tra | Ghi chú |
|---|---|---|---|---|---|
|  |  |  |  |  |  |
