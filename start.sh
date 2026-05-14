#!/bin/bash

# 知识库助手 - 一键启动脚本
# 作者: AI Assistant
# 说明: 同时启动前端和后端服务

echo "🚀 知识库助手 - 启动中..."
echo ""

# 检查 Node.js 是否安装
if ! command -v node &> /dev/null; then
    echo "❌ 错误: 未检测到 Node.js，请先安装 Node.js"
    exit 1
fi

echo "✅ Node.js 版本: $(node -v)"
echo ""

# 检查依赖是否已安装
if [ ! -d "backend/node_modules" ]; then
    echo "📦 安装后端依赖..."
    cd backend && npm install && cd ..
    echo ""
fi

if [ ! -d "frontend/node_modules" ]; then
    echo "📦 安装前端依赖..."
    cd frontend && npm install && cd ..
    echo ""
fi

# 检查 .env 文件
if [ ! -f "backend/.env" ]; then
    echo "⚙️  创建后端配置文件..."
    cp backend/.env.example backend/.env
    echo "✅ 已创建 backend/.env，请根据需要修改配置"
    echo ""
fi

# 创建日志目录
mkdir -p logs

# 启动后端服务
echo "🔧 启动后端服务..."
cd backend
npm run dev > ../logs/backend.log 2>&1 &
BACKEND_PID=$!
cd ..
echo "✅ 后端服务已启动 (PID: $BACKEND_PID)"
echo "   日志文件: logs/backend.log"
echo "   访问地址: http://localhost:3001"
echo ""

# 等待后端启动
echo "⏳ 等待后端服务就绪..."
sleep 3

# 启动前端服务
echo "🎨 启动前端服务..."
cd frontend
npm run dev > ../logs/frontend.log 2>&1 &
FRONTEND_PID=$!
cd ..
echo "✅ 前端服务已启动 (PID: $FRONTEND_PID)"
echo "   日志文件: logs/frontend.log"
echo "   访问地址: http://localhost:5173"
echo ""

# 保存 PID 到文件
echo $BACKEND_PID > logs/backend.pid
echo $FRONTEND_PID > logs/frontend.pid

echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "🎉 启动完成！"
echo ""
echo "📊 服务状态:"
echo "   后端: http://localhost:3001 (PID: $BACKEND_PID)"
echo "   前端: http://localhost:5173 (PID: $FRONTEND_PID)"
echo ""
echo "💡 使用说明:"
echo "   - 打开浏览器访问: http://localhost:5173"
echo "   - 查看后端日志: tail -f logs/backend.log"
echo "   - 查看前端日志: tail -f logs/frontend.log"
echo "   - 停止服务: ./stop.sh"
echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

# 等待用户按 Ctrl+C
echo ""
echo "按 Ctrl+C 停止所有服务..."
echo ""

# 捕获 Ctrl+C 信号
trap "echo ''; echo '🛑 正在停止服务...'; kill $BACKEND_PID $FRONTEND_PID 2>/dev/null; rm -f logs/*.pid; echo '✅ 所有服务已停止'; exit 0" INT

# 保持脚本运行
wait
