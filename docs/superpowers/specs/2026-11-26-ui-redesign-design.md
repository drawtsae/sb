# Làm lại giao diện + kiểu chuyển cho từng tiết mục — Thiết kế

Ngày: 2026-11-26
Trạng thái: bản nháp, chờ duyệt
Liên quan: `2026-11-25-wedding-soundboard-design.md`. Mọi ràng buộc trong bản đó vẫn giữ nguyên: không có lúc im lặng ngoài ý muốn, không cắt nhạc đột ngột, Live chạy không cần mạng, nút to và dễ bấm khi đang căng thẳng.

## 1. Mục đích

Người dùng thấy giao diện hiện tại "hơi xấu". Lý do: ứng dụng vẫn dùng nguyên bộ shadcn mặc định, màu xám trung tính và font Geist, chưa có bản sắc riêng. Người dùng gửi một ảnh mẫu với các đặc điểm:

- Nền tím đậm.
- Thanh menu bên trái.
- Thẻ "Đang phát" lớn.
- Thẻ "Chuyển tới" màu vàng.
- Danh sách tiết mục dạng bảng, mỗi dòng có trạng thái.
- Thanh âm lượng tổng.
- Dải nút điều khiển nhanh ở dưới cùng.

Người dùng chọn:

1. **Làm lại giao diện theo phong cách đó** cho toàn bộ ứng dụng.
2. **Thêm kiểu chuyển cho từng tiết mục**: *Crossfade* (hai bài chồng nhau) hoặc *Fade out → In* (bài cũ nhỏ hẳn rồi bài mới mới vào).

**Không làm** (người dùng không chọn, hoặc trái với nguyên tắc an toàn):

- Bảng hiệu ứng âm thanh (SFX).
- Ảnh bìa bài hát.
- Kiểu chuyển "Instant" (cắt ngang bài).
- Nút "Stop All" dừng tức thì. Thay vào đó dùng "Fade out & dừng" như hiện có.
- "Pause All".
- Nút thu nhỏ/đóng cửa sổ: ứng dụng chạy trên trình duyệt, không phải app desktop.

## 2. Hệ thống thiết kế

### Màu

Toàn bộ ứng dụng dùng nền tối. Các màu khai báo thành token trong `globals.css` theo đúng tên token của shadcn, để các component hiện có tự đổi màu theo.

| Token | Giá trị | Dùng cho |
|---|---|---|
| background | `#0E0A1A` | Nền trang |
| card | `#171128` | Thẻ, panel |
| card-2 (`--surface-2`) | `#1F1836` | Ô nổi, dòng đang chọn |
| border | `#2E2550` | Viền |
| foreground | `#F1EDFF` | Chữ chính |
| muted-foreground | `#A79FC4` | Chữ phụ |
| primary | `#8B5CF6` (chữ trên nền primary: `#FFFFFF`) | Nút chính, thanh tiến độ, tiết mục đang phát |
| accent (vàng) | `#F5C451` (chữ trên nền vàng: `#1A1408`) | Thẻ "Chuyển tới", nút "Chuyển bài ngay" |
| success | `#22C55E` | Huy hiệu LIVE, "Sẵn sàng offline" |
| destructive | `#F87171` trên nền `#3A1A22` | "Fade out & dừng", xoá |

Mọi cặp màu chữ/nền phải đạt độ tương phản tối thiểu 4.5:1. Người viết đã kiểm tra:

- Chữ `#F1EDFF` trên nền `#171128`: khoảng 15:1.
- Chữ phụ `#A79FC4` trên nền `#171128`: khoảng 7:1.
- Chữ `#1A1408` trên nền vàng `#F5C451`: khoảng 11:1.
- Chữ trắng trên nền `#8B5CF6`: khoảng 4.6:1.

### Chữ và icon

- Font: **Be Vietnam Pro** qua `next/font/google`, gồm subset `vietnamese` và `latin`, độ đậm 400/500/600/700. Font được build tự lưu trong ứng dụng và đã nằm trong precache, nên Live vẫn hiện đúng font khi mất mạng.
- Bỏ Geist.
- Mọi con số thời gian dùng `tabular-nums` để chữ số không nhảy khi đếm.
- Icon dùng `lucide-react` (đã cài sẵn). Không dùng emoji làm icon.

### Hiệu ứng

- Bo góc: thẻ 16px, nút và ô nhập 10px.
- Bóng đổ nhẹ. Không dùng hiệu ứng glow neon.
- Chuyển trạng thái trong 150–200 ms và tôn trọng thiết lập `prefers-reduced-motion`.
- Mọi phần tử bấm được có vòng focus rõ ràng.
- Vùng bấm tối thiểu 44×44 px.

## 3. Bố cục

### Các trang soạn thảo

Gồm Chương trình, Soạn chương trình, Kiểm tra & nạp, Kho nhạc và Người dùng.

- **Thanh bên trái cố định:**
  - Logo chữ "Wedding Soundboard", kèm icon hai chiếc nhẫn (vẽ bằng SVG).
  - Các mục: "Chương trình", "Kho nhạc", "Người dùng" (chỉ admin thấy), "Đăng xuất".
  - Mục đang ở được làm nổi bật.
  - Dưới cùng là ô trạng thái nhỏ, ví dụ "Sẵn sàng offline" khi service worker đã điều khiển trang.
- **Màn hình hẹp hơn 1024px:** thanh bên thu lại thành thanh trên cùng có menu.
- Nội dung chính nằm trong các thẻ màu tối.
- Trang Soạn chương trình giữ nguyên ba khu "Nhạc nền", "Kịch bản" và "Cài đặt", nhưng làm lại thành thẻ. Danh sách tiết mục hiển thị như bảng trong ảnh mẫu: tay kéo, số thứ tự, tên, ghi chú, kiểu chuyển kèm thời gian, trạng thái lưu.

### Màn hình Live

Live **không có thanh bên**. Nhờ vậy không có đường nào lỡ bấm rời trang giữa tiệc, và cũng không có liên kết nào cần mạng.

```
┌ LIVE ● ─ Âm lượng tổng [====o---] 80% ─────────── Sẵn sàng offline · Thoát ┐
├──────────────── ĐANG PHÁT ──────────────┬──────── TIẾP THEO (vàng) ─────────┤
│ [ô nhạc]  2. Cô dâu chú rể vào           │ 3. Cắt bánh                        │
│           A Thousand Years               │ Kiểu: Crossfade · 3 giây           │
│           ████████░░░░  1:24 / 3:20      │ [ ⇄ Chuyển bài ngay  (N) ]         │
│           → hết bài: phát tiếp nhạc nền  │                                    │
├──────────────── KỊCH BẢN ───────────────┴─── NHẠC NỀN ──────────────────────┤
│ ✓ 01 Đón khách            Nhạc nền            │ Perfect · tạm dừng 2:15       │
│ ▶ 02 Cô dâu chú rể vào    Crossfade 3s [Đang phát] │ tiếp: Marry You          │
│   03 Cắt bánh             Fade out → In 2s+2s [Chọn]│ Âm lượng nền 70% (chỉ xem)│
│   …                                                 │ Gợi ý: <ghi chú tiết mục> │
├─ ĐIỀU KHIỂN NHANH ──────────────────────────────────────────────────────────┤
│ [ Về nhạc nền (B) ]   [ Fade out & dừng (F) ]   Kiểu chuyển mặc định: …    │
└─────────────────────────────────────────────────────────────────────────────┘
```

Các thành phần giữ nguyên như hiện tại:

- Banner "ĐANG IM LẶNG".
- Banner âm thanh bị trình duyệt tạm dừng.
- Lớp phủ "Bấm để bắt đầu điều khiển".
- Hộp thoại "Tiếp tục từ chỗ cũ".
- Phím tắt N, B, F, ↑ và ↓.

Các thành phần này chỉ được làm lại về giao diện, không đổi hành vi.

Dòng tiết mục đang phát hiển thị "Đang phát" và không bấm được (như hiện tại). Các dòng khác có nút "Chọn".

**Ô nhạc** thay cho ảnh bìa là một khối màu tím–vàng có icon nốt nhạc. Ứng dụng không có ảnh bìa.

## 4. Tính năng: kiểu chuyển cho từng tiết mục

### Dữ liệu

- **Bảng `cues`:** thêm cột `transition`, kiểu text, có thể null.
  - Ràng buộc: `CHECK (transition IN ('crossfade','fade_out_in'))`.
  - `null` nghĩa là dùng kiểu mặc định của chương trình.
- **`EventSettings`:** thêm `defaultTransition`, mặc định là `'crossfade'`.
- **Type `Cue`:** thêm `transition: 'crossfade' | 'fade_out_in' | null`.
- **Cập nhật kèm:**
  - `cueSchema` và `settingsSchema`;
  - các hàm chuyển đổi dòng DB;
  - định dạng xuất/nhập JSON. Phiên bản vẫn là 1; trường mới là tuỳ chọn, file cũ thiếu trường thì coi như `null`;
  - snapshot.

### Hành vi

Gọi `T` là kiểu chuyển của tiết mục, tính bằng `cue.transition ?? settings.defaultTransition`.

**Khi chuyển *vào* một tiết mục Bài riêng**, từ nhạc nền hoặc từ một tiết mục khác:

| Kiểu | Hành vi |
|---|---|
| Crossfade | Giữ nguyên như hiện tại: bài cũ nhỏ dần, bài mới to dần, hai fade chạy cùng lúc. |
| Fade out → In | Bài cũ nhỏ dần trong `d_out` giây (dùng thời gian fade của bài cũ, như hiện tại). Bài mới được nạp và tua tới giây bắt đầu ngay, nhưng chỉ `play` và bắt đầu fade in **sau `d_out` giây**. Tổng thời gian chuyển là `d_out + d_in`. |

**Khi một tiết mục kết thúc rồi phát tiếp nhạc nền**, hoặc khi bấm "Về nhạc nền": dùng kiểu `T` của tiết mục đang kết thúc, áp dụng theo cùng nguyên tắc như bảng trên.

**Những trường hợp không đổi:**

- Fade out & dừng.
- Crossfade giữa hai bài nhạc nền.
- Tiết mục loại Nhạc nền đi vào nhạc nền.

**Bấm liên tiếp trong lúc đang chờ:** nếu có lệnh mới trong khoảng chờ trước khi bài mới vào, lệnh `play`/`ramp` bị trì hoãn của deck đó bị huỷ.

- Driver đã có cơ chế "lệnh mới trên một deck huỷ lệnh đang chờ"; cơ chế này được mở rộng cho lệnh trì hoãn.
- Không deck nào phát ra tiếng mà máy trạng thái không biết.

**Khoảng lặng giữa hai bài:** khi bài cũ đã tắt hẳn và bài mới chưa vào, có một khoảng im lặng ngắn. Đây là im lặng **người dùng chủ động chọn**, nên không vi phạm nguyên tắc "không im lặng ngoài ý muốn". Hiện tại khoảng này gần bằng 0, vì bài mới bắt đầu fade in ngay khi bài cũ vừa nhỏ hẳn.

### Giao tiếp máy trạng thái ↔ driver

- Lệnh `play` và `ramp` có thêm trường tuỳ chọn `delaySec`.
- Driver xử lý như sau:
  - `ramp` có trễ: lên lịch theo đồng hồ của `AudioContext`, gồm `setValueAtTime` tại `now + delay` rồi đến `linearRamp`.
  - `play` có trễ: dùng `setTimeout`.
  - Mọi lệnh mới trên cùng deck huỷ timer đang chờ.
- Máy trạng thái vẫn là hàm thuần. Test bảng hiện có giữ nguyên. Bổ sung các test:
  - Fade out → In từ nhạc nền;
  - Fade out → In từ tiết mục khác;
  - bấm lại trong khoảng chờ;
  - kết thúc tiết mục với Fade out → In.

### Giao diện tính năng

- **Trình soạn tiết mục:** thêm ô chọn "Kiểu chuyển" với ba lựa chọn: "Theo cài đặt chung", "Crossfade", "Fade out → In".
- **Cài đặt:** thêm "Kiểu chuyển mặc định".
- **Live:**
  - mỗi dòng tiết mục ghi kiểu chuyển và thời gian, ví dụ "Crossfade 3s" hoặc "Fade out → In 2s + 2s";
  - thẻ "Tiếp theo" hiển thị kiểu chuyển của tiết mục kế tiếp.

## 5. Cách làm

Có ba cách đã cân nhắc:

1. **Chỉ đổi token màu và font.** Nhanh, nhưng bố cục vẫn như cũ, không giống ảnh mẫu.
2. **Đổi token, thêm khung trang có thanh bên, làm lại Live và trang soạn theo ảnh mẫu, rồi thêm tính năng kiểu chuyển.** *(Chọn cách này.)* Logic phát nhạc, lưu và nạp giữ nguyên; chỉ đổi phần hiển thị, ngoại trừ tính năng kiểu chuyển.
3. **Viết lại toàn bộ component.** Rủi ro cao làm hỏng các test e2e và các bản sửa an toàn đã làm.

Cách 2 phải giữ nguyên toàn bộ `data-testid`, nhãn tiếng Việt và vai trò ARIA mà các test e2e đang dùng. Khi đổi chữ hiển thị thì phải cập nhật test cùng lúc.

## 6. Để người xây dựng tự quyết

- Chi tiết khoảng cách giữa các phần tử.
- Kích thước chính xác của các khối.
- Hiệu ứng khi rê chuột.
- Cách vẽ logo nhẫn.
- Có dùng thêm component shadcn (Select, Dialog, Slider) hay không, miễn là component đó không làm hỏng chế độ offline của Live: không tải chunk lười (lazy-load) trên `/live`.

**Kiểm thử:**

- `npm test` và `npm run test:e2e` phải xanh.
- Chụp ảnh các trang chính bằng Playwright để soát mắt.
