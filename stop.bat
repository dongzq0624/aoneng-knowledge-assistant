@echo off
chcp 65001 >nul
title 知识库助手 - 停止

echo ========================================
echo 🛑 停止知识库助手服务...
echo ========================================
echo.

REM 停止后端服务
taskkill /FI "WINDOWTITLE eq 知识库助手-后端*" /F >nul 2>&1
if %errorlevel% equ 0 (
    echo ✅ 后端服务已停止
) else (
    echo ⚠️  后端服务未运行
)

REM 停止前端服务
taskkill /FI "WINDOWTITLE eq 知识库助手-前端*" /F >nul 2>&1
if %errorlevel% equ 0 (
    echo ✅ 前端服务已停止
) else (
    echo ⚠️  前端服务未运行
)

REM 清理可能残留的进程
echo.
echo 🧹 清理残留进程...
taskkill /F /IM node.exe /FI "WINDOWTITLE eq vite*" >nul 2>&1
taskkill /F /IM node.exe /FI "WINDOWTITLE eq tsx*" >nul 2>&1

echo.
echo ✅ 所有服务已停止
echo.
pause
