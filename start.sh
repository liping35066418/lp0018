#!/bin/bash

echo "=========================================="
echo "  �️ 3D展厅搭建实训系统 - 启动脚本"
echo "=========================================="
echo ""

ROOT_DIR="$(cd "$(dirname "$0")" && pwd)"

echo "📦 检查并安装依赖..."
echo ""

if [ ! -d "$ROOT_DIR/node_modules" ]; then
  echo "🔧 安装根目录依赖..."
  cd "$ROOT_DIR" && npm install --silent
  if [ $? -eq 0 ]; then
    echo "✅ 根目录依赖安装完成"
  else
    echo "❌ 根目录依赖安装失败"
    exit 1
  fi
else
  echo "✅ 根目录依赖已存在"
fi

if [ ! -d "$ROOT_DIR/backend/node_modules" ]; then
  echo "🔧 安装后端依赖..."
  cd "$ROOT_DIR/backend" && npm install --silent
  if [ $? -eq 0 ]; then
    echo "✅ 后端依赖安装完成"
  else
    echo "❌ 后端依赖安装失败"
    exit 1
  fi
else
  echo "✅ 后端依赖已存在"
fi

if [ ! -d "$ROOT_DIR/frontend/node_modules" ]; then
  echo "🔧 安装前端依赖..."
  cd "$ROOT_DIR/frontend" && npm install --silent
  if [ $? -eq 0 ]; then
    echo "✅ 前端依赖安装完成"
  else
    echo "❌ 前端依赖安装失败"
    exit 1
  fi
else
  echo "✅ 前端依赖已存在"
fi

echo ""
echo "🚀 启动服务..."
echo ""
echo "📡 后端校验引擎: http://localhost:9918"
echo "🌐 前端3D画布:   http://localhost:3917"
echo ""
echo "💡 提示: 按 Ctrl+C 停止所有服务"
echo "=========================================="
echo ""

cd "$ROOT_DIR"

if command -v npx &> /dev/null && npx concurrently --version &> /dev/null 2>&1 || [ -d "$ROOT_DIR/node_modules/concurrently" ]; then
  npx concurrently \
    --names "BACKEND,FRONTEND" \
    --prefix-colors "red,blue" \
    --kill-others \
    "cd $ROOT_DIR/backend && node server.js" \
    "cd $ROOT_DIR/frontend && node server.js"
else
  cd "$ROOT_DIR/backend" && node server.js &
  BACKEND_PID=$!
  
  cd "$ROOT_DIR/frontend" && node server.js &
  FRONTEND_PID=$!
  
  echo "✅ 后端 PID: $BACKEND_PID"
  echo "✅ 前端 PID: $FRONTEND_PID"
  echo ""
  
  wait $BACKEND_PID $FRONTEND_PID
fi
