#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""tools/package-release.py — 打发布包（zip）

只打包运行时需要的文件，排除 .mimosa/、tests/、__pycache__、.github/ 等。
产物：dist/zcode-90sOldschool-v<版本>.zip

用法：
    python tools/package-release.py
"""
import json
import re
import sys
import zipfile
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
DIST = ROOT / 'dist'

# 需要进包的文件/目录（相对仓库根）
INCLUDE_FILES = [
    'README.md', 'LICENSE', 'CHANGELOG.md', 'SECURITY.md', 'CONTRIBUTING.md',
    '应用外观.cmd', '还原外观.cmd', '检查状态.cmd', '关闭自动注入.cmd',
    '.zcode-plugin/plugin.json',
    'scripts/zcode-90sOldschool.js',
    'scripts/appearance_patcher.py',
    'scripts/appearance_autoheal.pyw',
    'skills/zcode-90sOldschool/SKILL.md',
]
INCLUDE_DIRS = [('assets/screenshots', ('*.png', '*.jpg', '*.gif'))]
EXCLUDE_PARTS = {'.mimosa', '__pycache__', 'tests', '.github', 'dist', 'node_modules'}


def version():
    txt = (ROOT / 'scripts' / 'zcode-90sOldschool.js').read_text(encoding='utf-8')
    m = re.search(r"var VERSION = '([^']+)'", txt)
    if not m:
        sys.exit('无法从引擎读取 VERSION')
    pv = json.loads((ROOT / '.zcode-plugin' / 'plugin.json').read_text(encoding='utf-8'))['version']
    if m.group(1) != pv:
        sys.exit('版本不一致：引擎 %s / plugin.json %s' % (m.group(1), pv))
    return m.group(1)


def collect():
    files = []
    for rel in INCLUDE_FILES:
        p = ROOT / rel
        if p.is_file():
            files.append(p)
        else:
            print('[跳过] 不存在：' + rel)
    for rel, patterns in INCLUDE_DIRS:
        d = ROOT / rel
        if not d.is_dir():
            continue
        for pat in patterns:
            files.extend(sorted(d.glob(pat)))
    return files


def main():
    ver = version()
    DIST.mkdir(exist_ok=True)
    out = DIST / ('zcode-90sOldschool-v%s.zip' % ver)
    files = collect()
    with zipfile.ZipFile(out, 'w', zipfile.ZIP_DEFLATED) as z:
        for f in files:
            if EXCLUDE_PARTS & set(f.parts):
                continue
            arc = str(f.relative_to(ROOT)).replace('\\', '/')
            z.write(f, 'zcode-90sOldschool/' + arc)
    print('已生成 %s（%d 个文件，%.1f KB）' % (out, len(files), out.stat().st_size / 1024))
    print('提示：cmd 文件按二进制原样打包（GBK+CRLF 不变）。')


if __name__ == '__main__':
    main()
