@echo off
title ZCode 外观增强 - 状态检查
setlocal
set PY=
py -3 -c "print(1)" >nul 2>&1 && set PY=py -3
if not defined PY python -c "print(1)" >nul 2>&1 && set PY=python
if not defined PY (
    echo [错误] 未找到 Python，请先安装 Python 3.x 并加入 PATH。
    pause
    exit /b 1
)
%PY% "%~dp0scripts\appearance_patcher.py" --check
pause
