# Dinoz Link Manager

Hệ thống quản lý link, sales và trending niches cho POD business.

## Hướng dẫn cài đặt nhanh

1. **Yêu cầu**: Đã cài đặt [Node.js](https://nodejs.org/) (phiên bản 18 trở lên).
2. **Khởi chạy nhanh (Windows)**: Double-click vào file `run_locally.bat`. Nó sẽ tự động cài đặt thư viện và bật server.
3. **Khởi chạy thủ công**:
   - Mở terminal trong thư mục này.
   - Chạy lệnh: `npm install` (chỉ cần chạy lần đầu).
   - Chạy lệnh: `npm run dev` để bật server chế độ phát triển (tự động reload khi sửa code).
   - Truy cập: [http://localhost:3000](http://localhost:3000)

## Cấu hình hệ thống

Các thông số cấu hình nằm trong file `.env`:
- `PORT`: Cổng chạy server (mặc định 3000).
- `JWT_SECRET`: Mã bảo mật cho token đăng nhập.
- `TELEGRAM_BOT_TOKEN`: Token của bot Telegram để nhận niches tự động.

## Lưu ý về Cổng (Port)

Nếu bạn gặp lỗi `EADDRINUSE`, nghĩa là cổng 3000 đang bị một ứng dụng khác chiếm dụng. Bạn có thể:
1. Tắt ứng dụng đang dùng cổng đó.
2. Hoặc đổi `PORT=3001` (hoặc số khác) trong file `.env`.

## Tài khoản mặc định

- **Username**: `admin`
- **Password**: `Hello0` (có thể đổi trong giao diện Settings)
