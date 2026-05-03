# Sử dụng Node.js 20 Slim để tương thích tốt nhất với Prisma
FROM node:20-slim

# Cài đặt các thư viện cần thiết cho Prisma (openssl)
RUN apt-get update && apt-get install -y openssl && rm -rf /var/lib/apt/lists/*

# Thiết lập thư mục làm việc
WORKDIR /app

# Copy file cấu hình trước
COPY package*.json ./
COPY prisma ./prisma/

# Cài đặt thư viện (Bỏ qua scripts để tránh lỗi Prisma generate sớm)
RUN npm install --ignore-scripts

# Copy toàn bộ mã nguồn
COPY . .

# Bây giờ mới chạy Prisma generate khi đã có đủ file
RUN npx prisma generate

# Mở cổng 3000
EXPOSE 3000

# Chạy ứng dụng
CMD ["npm", "run", "start"]
