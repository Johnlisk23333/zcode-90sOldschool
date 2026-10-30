@echo off
title ZCode 外观增强 - 应用/更新
echo ============================================
echo   ZCode 外观增强：应用 / 更新注入补丁
echo   - 若弹出 UAC 窗口，请点“是”
echo   - 若 ZCode 正在运行，本窗口会等它退出后自动注入并重启
echo ============================================
setlocal
set PY=
py -3 -c "print(1)" >nul 2>&1 && set PY=py -3
if not defined PY python -c "print(1)" >nul 2>&1 && set PY=python
if not defined PY (
    echo [错误] 未找到 Python，请先安装 Python 3.x 并加入 PATH。
    pause
    exit /b 1
)

set AH=
echo.
echo   是否同时安装「客户端更新后自动恢复外观」计划任务？
echo   - 该任务以 SYSTEM 权限每 5 分钟检查一次，ZCode 更新后自动重注入
echo   - 不安装也能用，只是客户端每次更新后需要重跑本脚本
set /p AH=   输入 Y 安装，直接回车跳过（默认跳过）:
if /i "%AH%"=="Y" (
    %PY% "%~dp0scripts\appearance_patcher.py" --apply --watch --restart --with-autoheal
) else (
    %PY% "%~dp0scripts\appearance_patcher.py" --apply --watch --restart
)
echo.
echo 补丁器退出码: %errorlevel%
pause
