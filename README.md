# MediQueue Web — Responsive GitHub Pages

Website tĩnh 100% HTML/CSS/JavaScript (không cần Node, build service hoặc framework). Dùng được trên điện thoại và desktop.

## Chế độ thử ngay: DEMO

- Mở `index.html` qua local HTTP server, hoặc GitHub Pages. Demo có dữ liệu **giả**, lưu `localStorage` và đồng bộ nhiều tab trên cùng trình duyệt.
- Chuyển chế độ bệnh nhân/nhân viên trong **Tài khoản**.
- Bệnh nhân: lấy số, theo dõi số, sao chép mã check-in, hủy phiếu.
- Nhân viên: check-in bằng mã, gọi số theo phòng (mỗi phòng một lượt hoạt động), bắt đầu khám, hoàn tất, gọi lại, ưu tiên, chuyển phòng, tạm dừng khoa.
- Thống kê: số lượt theo khoa, tiến độ phục vụ.
- Demo không dùng và **không gửi** dữ liệu người bệnh thật lên cloud.

## Tự chạy trên Mac

```bash
cd MediQueue_Web_GitHub_Pages
python3 -m http.server 8080
```

Truy cập `http://localhost:8080/` trên trình duyệt.

## Deploy GitHub Pages

1. Tạo repository mới tên `mediqueue-web` trên GitHub (ưu tiên **public**, vì GitHub Pages cơ bản cho public repositories).
2. Đưa toàn bộ file và thư mục dự án này lên **nhánh main**, ở thư mục gốc của repository.
3. Trên GitHub chọn **Settings → Pages → Build and deployment**; chọn **GitHub Actions** (repo đã kèm `.github/workflows/pages.yml`).
4. Workflow sẽ chạy kiểm thử và publish trang tĩnh. Kiểm tra trạng thái tại tab **Actions**.

**Trên macOS:** Sau khi tạo repository trống, có thể chạy `bash GITHUB_DEPLOY_MAC.command` và dán URL repository để push toàn bộ source. Cần đăng nhập GitHub trong Terminal hoặc có credential helper. Không nhập mật khẩu vào script.
5. URL dự kiến sau khi deploy thành công: `https://<username>.github.io/mediqueue-web/` (không phải URL đã xác minh).

## Cloud Supabase (tùy chọn, KHÔNG bật trên website public khi chưa kiểm thử an toàn)

- Sao chép `config.example.js` thành `config.js` và nhập `SUPABASE_URL`, `SUPABASE_PUBLISHABLE_KEY` (publishable key là khóa có thể hiện trong frontend).
- Đảm bảo RLS, quyền nhân viên và mọi RPC được kiểm thử end-to-end, có giới hạn dữ liệu bệnh nhân hợp pháp trước khi công khai website.
- Khi có `config.js`, trang hiển thị nút đổi từ **DEMO → Cloud** ở trang Tài khoản; đăng nhập email/mật khẩu qua Supabase Auth.
- **TUYỆT ĐỐI KHÔNG** đưa service-role/secret key, Firebase service-account, mật khẩu, hoặc hồ sơ bệnh nhân thật vào GitHub.
- `config.js` đã được `.gitignore` loại trừ để tránh vô tình push cấu hình production. Nếu muốn deploy cloud frontend, cần cung cấp cấu hình không bí mật qua cơ chế release phù hợp và kiểm tra quyền trước.
- Cloud dùng polling 15s trong tab đang mở, không phải WebSocket hay FCM nền.
- Trang web không hỗ trợ quét camera QR; nhân viên nhập mã check-in từ phiếu. Việc hiển thị QR trực quan là bước sau.

## Nguyên tắc an toàn

Website này chỉ dùng để demo và phát triển. Đây **không phải** phần mềm quản lý bệnh nhân được chứng nhận. Cần kiểm thử bảo mật, quyền riêng tư, truy cập, sao lưu, nhật ký, hiệu năng và quy trình phân loại cấp cứu trước khi sử dụng thực tế. Số lượng khám và ETA trong demo là giả lập, không phải số liệu bệnh viện thật.
