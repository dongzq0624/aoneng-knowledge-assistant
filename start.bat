@echo off
chcp 65001 >nul
title 知识库助手 - 启动

echo ========================================
echo 🚀 知识库助手 - 启动中...
echo ========================================
echo.

REM 检查 Node.js 是否安装
where node >nul 2>nul
if %errorlevel% neq 0 (
    echo ❌ 错误: 未检测到 Node.js，请先安装 Node.js
    pause
    exit /b 1
)

echo ✅ Node.js 已安装
echo.

REM 检查后端依赖
if not exist "backend\node_modules" (
    echo 📦 安装后端依赖...
    cd backend
    call npm install
    cd ..
    echo.
)

REM 检查前端依赖
if not exist "frontend\node_modules" (
    echo 📦 安装前端依赖...
    cd frontend
    call npm install
    cd ..
    echo.
)

REM 检查 .env 文件
if not exist "backend\.env" (
    echo ⚙️  创建后端配置文件...
    copy backend\.env.example backend\.env
    echo ✅ 已创建 backend\.env
    echo.
)

REM 创建日志目录
if not exist "logs" mkdir logs

REM 启动后端服务
echo 🔧 启动后端服务...
start "知识库助手-后端" /min cmd /c "cd backend && npm run dev > ..\logs\backend.log 2>&1"
timeout /t 3 /nobreak >nul
echo ✅ 后端服务已启动
echo    访问地址: http://localhost:3001
echo.

REM 启动前端服务
echo 🎨 启动前端服务...
start "知识库助手-前端" /min cmd /c "cd frontend && npm run dev > ..\logs\frontend.log 2>&1"
timeout /t 2 /nobreak >nul
echo ✅ 前端服务已启动
echo    访问地址: http://localhost:5173
echo.

echo ========================================
echo 🎉 启动完成！
echo ========================================
echo.
echo 📊 服务状态:
echo    后端: http://localhost:3001
echo    前端: http://localhost:5173
echo.
echo 💡 使用说明:
echo    - 打开浏览器访问: http://localhost:5173
echo    - 查看后端日志: type logs\backend.log
echo    - 查看前端日志: type logs\frontend.log
echo    - 停止服务: 运行 stop.bat
echo.
echo ========================================
echo.
echo 按任意键打开浏览器...
pause >nul

start http://localhost:5173
