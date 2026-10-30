# -*- coding: utf-8 -*-
"""appearance_autoheal.pyw — ZCode 外观自动注入守护（计划任务调用，无窗口）

由计划任务 ZCode-Appearance-AutoHeal（SYSTEM，每 5 分钟）拉起：
  1. 命名互斥锁保证单例；
  2. patch_state 判定：已是最新 → 直接退出；从未注入过 → 退出（不做首装）；
  3. 需要重注入（客户端更新重置 asar / 引擎文件更新）→ 等待 ZCode 退出
     （避开 electron-updater 退出即装即启的窗口）；
  4. asar 尺寸稳定窗校验后，静默调用 apply_core 重注入；
  5. 日志追加到 app.asar.zcode-ap-autoheal.log（保留最近 40 行）。

不做的事：不重启客户端（更新器会自己拉起）、不弹任何窗口、不发起网络请求。
"""
import ctypes
import os
import sys
import time
import traceback

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import appearance_patcher as ap   # noqa: E402

MUTEX_NAME = 'Global\\ZcodeAppearanceAutoHeal'


def log(msg):
    try:
        from pathlib import Path
        lines = []
        if os.path.exists(ap.AUTOHEAL_LOG):
            with open(ap.AUTOHEAL_LOG, encoding='utf-8', errors='replace') as f:
                lines = f.read().splitlines()[-40:]
        lines.append(time.strftime('%Y-%m-%d %H:%M:%S ') + msg)
        Path(ap.AUTOHEAL_LOG).write_text('\n'.join(lines) + '\n', encoding='utf-8')
    except Exception:
        pass


def asar_stable():
    """连续两次尺寸一致才动手（避开更新器还在写文件的瞬间）。"""
    try:
        a = os.path.getsize(ap.DEFAULT_ASAR)
        time.sleep(4)
        b = os.path.getsize(ap.DEFAULT_ASAR)
        return a == b
    except Exception:
        return False


def main():
    if not ap.is_admin():
        log('非管理员上下文，跳过')
        return
    try:
        state, sidecar, engine = ap.patch_state(ap.DEFAULT_ASAR)
    except Exception as e:
        log('状态判定失败：%s' % e)
        return
    if state == 'none':
        return
    if state == 'first_time':
        return   # 从未注入过，自动注入不做首装
    # 等 ZCode 退出（最长 6 小时；任务每 5 分钟拉新实例，互斥锁保证单例）
    waited = 0
    while ap.zcode_running() and waited < 21600:
        time.sleep(5)
        waited += 5
    if ap.zcode_running():
        return
    if not asar_stable():
        log('asar 尚在变化（更新器写入中），本轮跳过')
        return
    try:
        ok = ap.apply_core(ap.DEFAULT_ASAR, silent=True)
        log('state=%s 重注入%s' % (state, '成功' if ok else '失败(占用)'))
    except Exception as e:
        log('state=%s 重注入异常：%s' % (state, e))


if __name__ == '__main__':
    try:
        handle = ctypes.windll.kernel32.CreateMutexW(None, False, MUTEX_NAME)
        if handle and ctypes.windll.kernel32.GetLastError() == 183:   # ERROR_ALREADY_EXISTS
            sys.exit(0)
        main()
    except Exception:
        log('fatal ' + traceback.format_exc()[-300:])
