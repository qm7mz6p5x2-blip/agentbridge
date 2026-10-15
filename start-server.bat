@echo off
chcp 65001 >nul
title AgentBridge - 工具服务器
echo ============================================
echo   AgentBridge v0.1.0
echo   启动本地工具服务器...
echo ============================================
echo.

cd /d "%~dp0"

echo [1] 检查 Node.js...
node --version >nul 2>&1
if %errorlevel% neq 0 (
    echo ❌ 未找到 Node.js！请安装 Node.js: https://nodejs.org/
    pause
    exit /b 1
)
echo ✅ Node.js 可用:
node --version

echo.
echo [2] 启动 Launcher (自动管理工具服务器)...
echo     工具服务器: http://localhost:3004
echo     Launcher API: http://localhost:3005
echo     按 Ctrl+C 停止服务
echo.
node server\launcher.js

pause
