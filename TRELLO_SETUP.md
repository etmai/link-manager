# Hướng dẫn cấu hình Trello cho chức năng đính kèm file

## Bước 1: Lấy Trello API Key
1. Truy cập: https://trello.com/power-ups/admin
2. Nhấn "Create a Power-Up" hoặc đăng nhập nếu chưa có tài khoản
3. Sao chép **Key** hiển thị

## Bước 2: Lấy Trello Token
1. Truy cập URL sau (thay YOUR_API_KEY bằng key từ bước 1):
```
https://trello.com/1/connect?name=LinkManager&expiration=never&response_type=token&scope=read,write&key=YOUR_API_KEY
```
2. Nhấn Allow để cấp quyền
3. Sao chép **Token** hiển thị

## Bước 3: Tạo Trello Board
1. Truy cập https://trello.com
2. Tạo Board mới cho công việc
3. Từ URL của board, sao chép Board ID (chuỗi ký tự cuối URL)
   - Ví dụ: https://trello.com/b/abc123xyz/work-schedule → Board ID là `abc123xyz`

## Bước 4: Cấu hình .env file
1. Copy file `.env.example` thành `.env`:
```bash
cp .env.example .env
```

2. Chỉnh sửa file `.env` với thông tin của bạn:
```
TRELLO_API_KEY=your_actual_api_key
TRELLO_TOKEN=your_actual_token
TRELLO_BOARD_ID=your_actual_board_id
PORT=3000
JWT_SECRET=your_secure_jwt_secret
```

## Lưu ý quan trọng
- ⚠️ File `.env` đã được thêm vào `.gitignore`, không push lên GitHub
- ✅ File `.env.example` chứa mẫu cấu hình, an toàn để push lên GitHub
- 📁 Giới hạn file: 10MB/file trên Trello
- 🔒 Bảo mật: Chỉ người dùng có quyền mới xem/download được file

## API Endpoints mới

### Upload file
```
POST /api/schedule/:id/attachments/upload
Body: { fileName: string, fileData: base64, mimeType: string }
```

### Lấy danh sách file
```
GET /api/schedule/:id/attachments
```

### Xóa file
```
DELETE /api/schedule/:id/attachments/:attachmentId
```

## Kiểm tra hoạt động
1. Khởi động server: `npm start`
2. Mở ứng dụng web, vào tab "Lịch Công Việc"
3. Tạo/tìm một công việc
4. Click vào công việc để mở chi tiết
5. Sử dụng nút upload file để thêm file đính kèm
6. File sẽ được lưu trữ trên Trello và hiển thị trong giao diện
