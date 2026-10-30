@echo off
title ZCode 外观增强 - 还原官方客户端
echo ============================================
echo   ZCode 外观增强：还原官方原始 app.asar
echo   - 需先退出 ZCode；个人外观配置与素材会保留
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
%PY% "%~dp0scripts\appearance_patcher.py" --revert
echo.
echo 补丁器退出码: %errorlevel%
pause
