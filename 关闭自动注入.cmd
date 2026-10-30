@echo off
title ZCode 外观增强 - 关闭自动注入
echo ============================================
echo   移除「客户端更新后自动注入」计划任务
echo   （外观本体保留；需要时重跑 应用外观.cmd 会重新安装）
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
%PY% "%~dp0scripts\appearance_patcher.py" --remove-autoheal
echo.
echo 退出码: %errorlevel%
pause
