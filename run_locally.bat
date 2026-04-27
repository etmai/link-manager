@echo off
title Link Manager Local Startup
echo [*] Dang kiem tra thu vien (node_modules)...
if not exist node_modules (
    echo [!] Khong tim thay node_modules. Dang tien hanh npm install...
    call npm install
)
echo [*] Dang khoi chay server o che do DEV...
call npm run dev
pause
