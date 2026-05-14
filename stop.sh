#!/bin/bash

# 知识库助手 - 停止脚本
# 说明: 停止所有运行中的服务

echo "🛑 停止知识库助手服务..."
echo ""

# 从 PID 文件读取并停止进程
if [ -f "logs/backend.pid" ]; then
    BACKEND_PID=$(cat logs/backend.pid)
    if ps -p $BACKEND_PID > /dev/null 2>&1; then
        kill $BACKEND_PID
        echo "✅ 后端服务已停止 (PID: $BACKEND_PID)"
    else
        echo "⚠️  后端服务未运行"
    fi
    rm -f logs/backend.pid
else
    echo "⚠️  未找到后端 PID 文件"
fi

if [ -f "logs/frontend.pid" ]; then
    FRONTEND_PID=$(cat logs/frontend.pid)
    if ps -p $FRONTEND_PID > /dev/null 2>&1; then
        kill $FRONTEND_PID
        echo "✅ 前端服务已停止 (PID: $FRONTEND_PID)"
    else
        echo "⚠️  前端服务未运行"
    fi
    rm -f logs/frontend.pid
else
    echo "⚠️  未找到前端 PID 文件"
fi

# 清理可能残留的 node 进程
echo ""
echo "🧹 清理残留进程..."
pkill -f "vite" 2>/dev/null
pkill -f "tsx watch" 2>/dev/null

echo ""
echo "✅ 所有服务已停止"
