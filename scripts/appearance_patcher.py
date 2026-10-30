#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
appearance_patcher.py — ZCode 外观插件补丁器（纯 Python 标准库，零依赖）

把 scripts/zcode-90sOldschool.js（外观引擎）注入 ZCode 桌面客户端的 app.asar：
  1. 备份原始 app.asar（一次性，存为 app.asar.zcode-ap-bak）
  2. 在 asar 内新增 /out/renderer/assets/zcode-90sOldschool.js
  3. 修改 /out/renderer/index.html，在 </head> 前加 <script defer> 引用
  4. 重算 asar 头部与全部文件偏移，原子替换

用法：
  python appearance_patcher.py --check                 查看状态
  python appearance_patcher.py --apply                 注入（默认自提升管理员；客户端运行中则提示改用 --watch）
  python appearance_patcher.py --apply --watch         等待客户端退出后自动注入
  python appearance_patcher.py --revert                还原为官方原始 asar
  python appearance_patcher.py --apply --dry-run <输出路径> --asar <副本路径>
                                                       只对 asar 副本重包输出（测试用，不落盘安装目录）

自动注入（客户端更新自愈）：
  --apply 成功后自动安装计划任务 ZCode-Appearance-AutoHeal（SYSTEM、每 5 分钟），
  由 appearance_autoheal.pyw 检测「注入丢失 / 引擎文件更新」，等 ZCode 退出后静默重注入。
  客户端自动更新重置 asar 后，下次退出即自动恢复外观，无需手动干预。
  python appearance_patcher.py --install-autoheal      仅安装计划任务
  python appearance_patcher.py --remove-autoheal       仅移除计划任务（--revert 也会自动移除）
  python appearance_patcher.py --apply               注入（默认不装计划任务）
  python appearance_patcher.py --apply --with-autoheal  注入并安装「更新后自动注入」计划任务

安全性说明：
  - 已确认本客户端 Electron 的 EnableEmbeddedAsarIntegrityValidation fuse 为关闭，
    修改 asar 不会触发完整性校验失败。
  - 本脚本只读写本地文件，不发起任何网络请求。
  - 所有落盘路径均经 guard_path() 规范化校验：禁止 '..'，限制在允许目录内
    （默认仅 ZCode 安装目录 resources；--dry-run 场景追加测试输出目录）。
  - 客户端自动更新后会重置 app.asar（补丁丢失属正常现象），重新 --apply 即可。
"""

import argparse
import copy
import ctypes
import hashlib
import json
import os
import re
import shutil
import struct
import subprocess
import sys
import time
from pathlib import Path

SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
ENGINE_PATH = os.path.join(SCRIPT_DIR, 'zcode-90sOldschool.js')
DEFAULT_ASAR = r'C:\Program Files\ZCode\resources\app.asar'
DEFAULT_ROOT = os.path.normcase(r'C:\Program Files\ZCode\resources')
BACKUP_SUFFIX = '.zcode-ap-bak'
SIDECAR_SUFFIX = '.zcode-ap.json'
INJECT_PATH = '/out/renderer/assets/zcode-90sOldschool.js'
INDEX_PATH = '/out/renderer/index.html'
ENGINE_VERSION = '0.2.0'
TASK_NAME = 'ZCode-Appearance-AutoHeal'
AUTOHEAL_SCRIPT = os.path.join(SCRIPT_DIR, 'appearance_autoheal.pyw')
AUTOHEAL_LOG = DEFAULT_ASAR + '.zcode-ap-autoheal.log'
CHUNK = 4 * 1024 * 1024

# 允许目录白名单（normcase 形式）。--dry-run 时会追加测试源/输出目录。
ALLOWED_DIRS = [DEFAULT_ROOT]
TEST_DIRS = set()   # dry-run 测试目录（normcase 形式）


# ---------------------------------------------------------------- utilities
def die(msg, code=1):
    print('[外观补丁] 错误：%s' % msg)
    sys.exit(code)


def info(msg):
    print('[外观补丁] %s' % msg)


def is_admin():
    try:
        return bool(ctypes.windll.shell32.IsUserAnAdmin())
    except Exception:
        return False


def self_elevate(extra_args):
    """以管理员重新启动自己（UAC 弹窗）。参数逐个加引号，路径含空格也安全。"""
    quoted = ' '.join('"%s"' % a for a in extra_args)
    params = '"%s" %s' % (os.path.abspath(sys.argv[0]), quoted)
    ret = ctypes.windll.shell32.ShellExecuteW(
        None, 'runas', sys.executable, params, None, 1)
    if ret <= 32:
        die('需要管理员权限且自提升被取消。请以管理员身份运行，或改装在用户目录的客户端。')
    sys.exit(0)


def zcode_running():
    try:
        out = subprocess.check_output(
            ['tasklist', '/FI', 'IMAGENAME eq ZCode.exe', '/FO', 'CSV'],
            stderr=subprocess.DEVNULL)
        return b'ZCode.exe' in out
    except Exception:
        return False


# ---------------------------------------------------------------- 路径防护
def guard_path(path, must_exist=True):
    """所有落盘路径统一入口：规范化、禁止 '..'、限制在允许目录内。

    返回规范化后的绝对路径；不合法直接终止。must_exist=False 用于
    即将创建的目标文件（备份、sidecar、临时产物）。
    """
    p = os.path.realpath(os.path.abspath(path))
    parts = p.split(os.sep)
    if '..' in parts or (must_exist and not os.path.exists(p)):
        die('路径校验失败（禁止穿越%s）：%s' % ('/必须存在' if must_exist else '', path))
    nc = os.path.normcase(p)
    allowed = list(ALLOWED_DIRS) + list(TEST_DIRS)
    if not any(nc == d or nc.startswith(d + os.sep) for d in allowed):
        die('路径不在允许目录内：%s（允许：%s）' % (path, '；'.join(allowed)))
    return p


def validate_asar_arg(path, allow_test=False):
    """--asar 参数校验：文件名必须是 app.asar，位于允许目录或为测试副本。"""
    p = os.path.realpath(os.path.abspath(path))
    if '..' in p.split(os.sep):
        die('非法的 asar 路径（含穿越）：%s' % path)
    if os.path.basename(p).lower() != 'app.asar':
        die('非法的 asar 路径（文件名必须为 app.asar）：%s' % path)
    if os.path.normcase(p) == os.path.normcase(DEFAULT_ASAR):
        return p
    if allow_test and os.path.isfile(p):
        TEST_DIRS.add(os.path.normcase(os.path.dirname(p)))
        return p
    die('asar 路径不在允许范围内。仅允许 %s，或 --dry-run 下的测试副本。' % DEFAULT_ASAR)


def validate_output_arg(path):
    """--dry-run 输出路径校验：禁止穿越，父目录必须存在且被登记为测试目录。"""
    p = os.path.realpath(os.path.abspath(path))
    if '..' in p.split(os.sep):
        die('非法的输出路径（含穿越）：%s' % path)
    parent = os.path.dirname(p)
    if not os.path.isdir(parent):
        die('输出目录不存在：%s' % parent)
    TEST_DIRS.add(os.path.normcase(parent))
    return p


# ---------------------------------------------------------------- asar 解析
def parse_asar(path):
    """返回 (tree, base, blob_total, file_size)。

    asar 头布局（本机实测）：
      u32=4 | u32=payload+4 | u32=payload | u32=json_len | json + pad
      blob 区起点 base = 16 + json_len + pad(json_len)
    """
    p = guard_path(path)
    size = os.path.getsize(p)
    with open(p, 'rb') as f:
        head = f.read(16)
        if len(head) < 16:
            die('asar 头部读取失败：%s' % p)
        f1, f2, f3, json_len = struct.unpack('<4I', head)
        if f1 != 4 or json_len <= 0 or json_len > size or f3 < json_len:
            die('不是有效的 asar 文件：%s' % p)
        raw = f.read(json_len)
    tree = json.loads(raw.decode('utf-8'))
    base = 16 + json_len + ((4 - json_len % 4) % 4)
    return tree, base, size - base, size


def walk_entries(node, path='', out=None):
    """产出 (path, meta)，unpacked 条目（无 offset）也会被产出。"""
    if out is None:
        out = []
    files = node.get('files')
    if not files:
        return out
    for name, meta in files.items():
        pe = path + '/' + name
        out.append((pe, meta))
        if isinstance(meta, dict) and 'files' in meta:
            walk_entries(meta, pe, out)
    return out


def read_entry(fp, base, meta):
    fp.seek(base + int(meta['offset']))
    return fp.read(meta['size'])


def make_header_pickle(tree):
    raw = json.dumps(tree, ensure_ascii=False, separators=(',', ':')).encode('utf-8')
    pad = (-len(raw)) % 4
    payload_len = 4 + len(raw) + pad          # [json_len(4B)][json][pad]
    pickle_bytes = (struct.pack('<I', 4)
                    + struct.pack('<I', payload_len + 4)
                    + struct.pack('<I', payload_len)
                    + struct.pack('<I', len(raw))
                    + raw + b'\x00' * pad)
    return pickle_bytes, len(pickle_bytes)


def shift_offsets(tree, delta):
    """把所有带 offset 的条目平移 delta（字符串十进制）。

    注意：常规重包不需要调用本函数——asar 的 offset 相对数据区起点，
    而本补丁器原样拷贝数据区，原条目 offset 保持不变。仅保留给
    未来「改写既有文件内容」等需要重新布局的场景使用。
    """
    def rec(node):
        files = node.get('files')
        if not files:
            return
        for meta in files.values():
            if isinstance(meta, dict):
                if 'offset' in meta:
                    meta['offset'] = str(int(meta['offset']) + delta)
                rec(meta)
    rec(tree)
    return tree


def compute_integrity(data):
    """按 Electron asar 头的 integrity 口径计算整文件与分块 SHA-256。"""
    block_size = 4194304
    blocks = []
    for i in range(0, len(data), block_size):
        blocks.append(hashlib.sha256(data[i:i + block_size]).hexdigest())
    if not blocks:
        blocks = [hashlib.sha256(b'').hexdigest()]
    return {
        'algorithm': 'SHA256',
        'hash': hashlib.sha256(data).hexdigest(),
        'blockSize': block_size,
        'blocks': blocks,
    }


# ---------------------------------------------------------------- 状态机与通用注入
def patch_state(asar, engine_bytes=None):
    """判定当前需要什么动作。

    返回 (state, sidecar, engine_bytes)：
      none            已是最新注入，无需处理
      first_time      从未注入过（自动注入不做首装，只允许显式 --apply）
      engine_update   已注入但引擎文件有更新（从备份还原后重注入）
      official_changed 客户端更新/重置了 asar（刷新基线备份后注入）
    """
    guard_path(asar)
    if engine_bytes is None:
        engine_bytes = open(ENGINE_PATH, 'rb').read()
    tree, base, blob_total, _ = parse_asar(asar)
    html = read_index_html(asar, tree, base)
    applied = is_applied(html)
    sidecar = {}
    sp = asar + SIDECAR_SUFFIX
    if os.path.exists(sp):
        try:
            with open(guard_path(sp), encoding='utf-8') as f:
                sidecar = json.load(f)
        except Exception:
            sidecar = {}
    if applied and sidecar and \
            sidecar.get('engineSha') == hashlib.sha256(engine_bytes).hexdigest() and \
            sidecar.get('appliedSize') == os.path.getsize(asar):
        return 'none', sidecar, engine_bytes
    if not sidecar:
        return 'first_time', sidecar, engine_bytes
    if applied:
        return 'engine_update', sidecar, engine_bytes
    return 'official_changed', sidecar, engine_bytes


def apply_core(asar, silent=False, allow_first=False):
    """通用注入（幂等）。调用方需保证：ZCode 已退出、具备写权限。

    - engine_update：先从基线备份还原，再重注入（保证不会在旧产物上叠包）
    - 客户端更新（official_changed）：基线备份与当前官方包不一致时先刷新备份，
      防止「拿旧版本备份还原 = 降级客户端」
    - 返回 True 成功；False 表示 asar 被占用；first_time 且未 allow_first 时抛异常
    """
    state, sidecar, engine = patch_state(asar)
    if state == 'none':
        if not silent:
            info('已是最新注入（引擎 v%s），无需处理。' % ENGINE_VERSION)
        return True
    if state == 'first_time' and not allow_first:
        raise RuntimeError('从未注入过，自动注入不做首装；请先运行 应用外观.cmd')

    bak = asar + BACKUP_SUFFIX
    sidecar_path = asar + SIDECAR_SUFFIX

    if state == 'engine_update':
        if not os.path.exists(bak):
            raise RuntimeError('检测到旧注入但基线备份缺失，无法安全更新；请重装客户端后重新应用。')
        if not silent:
            info('引擎文件有更新，先还原基线备份再重新注入…')
        shutil.copyfile(guard_path(bak), guard_path(asar))

    # 统一基线：备份必须等于「当前官方包」（大小一致再比对哈希，避免每次全量读）
    if os.path.exists(bak):
        same = os.path.getsize(bak) == os.path.getsize(asar)
        if same:
            same = sha256_of(bak) == sha256_of(asar)
        if not same:
            shutil.copyfile(guard_path(asar), guard_path(bak, must_exist=False))
            if not silent:
                info('客户端版本已更新，已刷新基线备份。')
    else:
        shutil.copyfile(guard_path(asar), guard_path(bak, must_exist=False))
        if not silent:
            info('已创建备份：%s' % bak)

    payload = build_patched_asar_bytes(asar, engine, ENGINE_VERSION)
    tmp, final = write_atomic(asar, payload)
    try:
        os.replace(guard_path(tmp), guard_path(final))
    except PermissionError:
        try:
            os.remove(guard_path(tmp))
        except Exception:
            pass
        return False

    meta = {
        'version': ENGINE_VERSION,
        'appliedAt': time.strftime('%Y-%m-%d %H:%M:%S'),
        'engine': INJECT_PATH,
        'backup': os.path.basename(bak),
        'engineSha': hashlib.sha256(engine).hexdigest(),
        'baselineSha': sha256_of(bak),
        'appliedSize': os.path.getsize(asar),
    }
    Path(guard_path(sidecar_path, must_exist=False)).write_text(
        json.dumps(meta, ensure_ascii=False, indent=2), encoding='utf-8')
    if not silent:
        info('注入完成 ✅  外观引擎 v%s（%d 字节）' % (ENGINE_VERSION, len(engine)))
        info('重启 ZCode 后生效；悬浮球 🎨 或 Alt+Z 打开外观面板。')
    return True


# ---------------------------------------------------------------- 自动注入计划任务
def _pythonw_exe():
    cand = os.path.join(os.path.dirname(os.path.abspath(sys.executable)), 'pythonw.exe')
    return cand if os.path.isfile(cand) else sys.executable


def install_autoheal_task():
    if not os.path.isfile(AUTOHEAL_SCRIPT):
        info('缺少自动注入脚本，跳过安装：%s' % AUTOHEAL_SCRIPT)
        return False
    exe = _pythonw_exe()
    tr = '"%s" "%s"' % (exe, AUTOHEAL_SCRIPT)
    r = subprocess.run(['schtasks', '/Create', '/F', '/TN', TASK_NAME, '/TR', tr,
                        '/SC', 'MINUTE', '/MO', '5', '/RU', 'SYSTEM'],
                       capture_output=True, text=True)
    if r.returncode != 0:
        info('自动注入计划任务创建失败：%s %s' % (r.stdout.strip(), r.stderr.strip()))
        return False
    info('已安装自动注入计划任务 ✅（%s：SYSTEM，每 5 分钟检查，客户端更新后自动恢复外观）'
         % TASK_NAME)
    return True


def remove_autoheal_task():
    r = subprocess.run(['schtasks', '/Delete', '/F', '/TN', TASK_NAME],
                       capture_output=True, text=True)
    ok = r.returncode == 0
    info('自动注入计划任务已移除' if ok else
         '自动注入计划任务移除失败或不存在：%s %s' % (r.stdout.strip(), r.stderr.strip()))
    return ok


def autoheal_installed():
    r = subprocess.run(['schtasks', '/Query', '/TN', TASK_NAME],
                       capture_output=True, text=True)
    return r.returncode == 0


# ---------------------------------------------------------------- 补丁核心
def read_index_html(asar_path, tree, base):
    ents = dict((p, m) for p, m in walk_entries(tree))
    meta = ents.get(INDEX_PATH)
    if not meta or 'offset' not in meta:
        die('asar 内找不到 %s' % INDEX_PATH)
    with open(guard_path(asar_path), 'rb') as f:
        return read_entry(f, base, meta)


def is_applied(index_html_bytes):
    return b'zcode-90sOldschool.js' in index_html_bytes


SCRIPT_TAG_RE = re.compile(rb'<script defer src="\./assets/zcode-90sOldschool\.js"[^>]*></script>')


def patch_index(index_html_bytes, engine_version):
    tag = ('<script defer src="./assets/zcode-90sOldschool.js" data-zcode-90sOldschool="%s"></script>'
           % engine_version).encode('utf-8')
    if is_applied(index_html_bytes):
        patched, n = SCRIPT_TAG_RE.subn(tag, index_html_bytes)
        if n:
            return patched
        die('index.html 已有 zcode-90sOldschool 引用但与预期格式不符，请先 --revert。')
    idx = index_html_bytes.find(b'</head>')
    if idx < 0:
        idx = index_html_bytes.find(b'<script type="module"')
        if idx < 0:
            die('index.html 结构异常，找不到注入点')
        return index_html_bytes[:idx] + tag + b'\n    ' + index_html_bytes[idx:]
    return index_html_bytes[:idx] + tag + b'\n    ' + index_html_bytes[idx:]


def build_patched_asar_bytes(asar_path, engine_bytes, engine_version):
    """在内存中拼出完整的补丁后 asar 字节（新 header + 原 blob 区原样 + 追加区）。

    关键口径：
    - asar 的文件 offset 相对「数据区起点」。本函数把原始数据区整体原样拷贝，
      因此全部原条目的 offset **保持不变**（不做平移）。
    - 修改过的 index.html 与新增的引擎文件放在数据区末尾追加，offset =
      blob_total + 追加区内偏移；并按 Electron 口径重算/补写 integrity 哈希。
    """
    tree, base, blob_total, _ = parse_asar(asar_path)
    index_bytes = read_index_html(asar_path, tree, base)
    new_index = patch_index(index_bytes, engine_version)

    appended = []
    pos = 0

    def add(data):
        nonlocal pos
        off = pos
        appended.append(data)
        pos += len(data)
        return off

    idx_off = add(new_index)
    eng_off = add(engine_bytes)

    parent_segs = INJECT_PATH.strip('/').split('/')[:-1]
    inj_name = INJECT_PATH.rsplit('/', 1)[-1]

    work = copy.deepcopy(tree)
    work_parent = work
    for seg in parent_segs:
        work_parent = work_parent['files'][seg]
    new_entry = {'size': len(engine_bytes), 'offset': str(blob_total + eng_off),
                 'executable': False, 'integrity': compute_integrity(engine_bytes)}
    work_parent['files'][inj_name] = new_entry
    work_ents = {}
    for p, m in walk_entries(work):
        work_ents[p] = m
    im = work_ents[INDEX_PATH]
    im['size'] = len(new_index)
    im['offset'] = str(blob_total + idx_off)
    im['integrity'] = compute_integrity(new_index)

    final_bytes, new_base = make_header_pickle(work)

    buf = bytearray(final_bytes)
    src_path = guard_path(asar_path)
    with open(src_path, 'rb') as src:
        src.seek(base)
        remaining = blob_total
        while remaining > 0:
            chunk = src.read(min(CHUNK, remaining))
            if not chunk:
                break
            buf.extend(chunk)
            remaining -= len(chunk)
    for data in appended:
        buf.extend(data)
    return bytes(buf)


def sha256_of(path):
    p = guard_path(path)
    h = hashlib.sha256()
    with open(p, 'rb') as f:
        while True:
            b = f.read(CHUNK)
            if not b:
                break
            h.update(b)
    return h.hexdigest()


def write_atomic(path, data):
    """校验后写入：先落 .zcode-tmp 再 os.replace（均为已验证路径）。"""
    final = guard_path(path, must_exist=False)
    tmp = final + '.zcode-tmp'
    Path(tmp).write_bytes(data)
    return tmp, final


# ---------------------------------------------------------------- 命令实现
def cmd_check(asar):
    info('asar：%s' % guard_path(asar))
    tree, base, blob_total, size = parse_asar(asar)
    try:
        html = read_index_html(asar, tree, base)
        state = '已注入' if is_applied(html) else '未注入'
    except SystemExit:
        raise
    except Exception as e:
        state = '未知（%s）' % e
    bak = asar + BACKUP_SUFFIX
    sidecar = asar + SIDECAR_SUFFIX
    info('注入状态：%s' % state)
    info('备份文件：%s' % ('存在' if os.path.exists(guard_path(bak, must_exist=False)) else '缺失（首次 --apply 时创建）'))
    if os.path.exists(sidecar):
        try:
            with open(guard_path(sidecar), encoding='utf-8') as f:
                info('补丁信息：%s' % json.load(f))
        except Exception:
            info('补丁信息文件损坏')
    info('客户端进程：%s' % ('运行中（应用前需退出）' if zcode_running() else '未运行'))
    info('自动注入任务：%s' % ('已安装（%s，每 5 分钟）' % TASK_NAME if autoheal_installed() else '未安装（--apply 时自动安装）'))
    return 0


def cmd_apply(asar, watch=False, restart=False, dry_run=None, no_elevate=False, with_autoheal=False):
    if not os.path.isfile(ENGINE_PATH):
        die('找不到外观引擎文件：%s' % ENGINE_PATH)
    if not os.path.isfile(guard_path(asar)):
        die('找不到 asar：%s' % asar)
    install_root = os.path.dirname(os.path.dirname(guard_path(asar)))
    exe = os.path.join(install_root, 'ZCode.exe')

    is_default_target = os.path.normcase(guard_path(asar)) == os.path.normcase(DEFAULT_ASAR)
    need_admin = is_default_target and dry_run is None
    if need_admin and not is_admin() and not no_elevate:
        info('需要管理员权限，弹出 UAC…')
        self_elevate(['--apply', '--asar', DEFAULT_ASAR]
                     + (['--watch'] if watch else [])
                     + (['--restart'] if restart else [])
                     + (['--with-autoheal'] if with_autoheal else [])
                     + ['--no-elevate', '--pause'])
        return 0
    if need_admin and not is_admin():
        die('无管理员权限（--no-elevate 模式）。')

    if zcode_running() and need_admin:
        if not watch:
            info('ZCode 正在运行，asar 处于锁定状态。')
            info('→ 关闭 ZCode 后重新运行；或使用 应用外观.cmd（自动等待退出后注入）。')
            return 2
        info('等待 ZCode 退出（每 2 秒检测一次，最长 2 小时）…请现在关闭 ZCode 窗口。')
        waited = 0
        while zcode_running() and waited < 7200:
            time.sleep(2)
            waited += 2
            if waited % 30 == 0:
                info('仍在等待 ZCode 退出…（%d 秒）' % waited)
        if zcode_running():
            die('等待超时，放弃注入。')

    engine = open(ENGINE_PATH, 'rb').read()

    if dry_run:
        out = validate_output_arg(dry_run)
        payload = build_patched_asar_bytes(asar, engine, ENGINE_VERSION)
        tmp, final = write_atomic(out, payload)
        os.replace(guard_path(tmp), guard_path(final, must_exist=False))
        # 干跑自检：重解析，断言全部原条目 offset/size/integrity 不变，
        # 新条目存在且字节一致，并对原文件做抽样字节比对。
        t1, b1, bt1, _ = parse_asar(asar)
        t2, b2, bt2, s2 = parse_asar(out)
        ents1 = dict((p, m) for p, m in walk_entries(t1))
        ents2 = dict((p, m) for p, m in walk_entries(t2))
        assert INJECT_PATH in ents2, '引擎条目缺失'
        for p, m in ents1.items():
            if p in (INDEX_PATH, INJECT_PATH):
                continue   # 这两个是被改写/新增的条目，另行断言
            m2 = ents2[p]
            for k in ('offset', 'size', 'integrity'):
                if k in m or k in m2:
                    assert m.get(k) == m2.get(k), '原条目字段被改动 %s.%s' % (p, k)
        with open(guard_path(out), 'rb') as f2, open(guard_path(asar), 'rb') as f1:
            h2 = read_entry(f2, b2, ents2[INDEX_PATH])
            assert b'zcode-90sOldschool.js' in h2, 'index.html 断言失败'
            # 确定性等距抽样（自检需要可复现，不涉及安全随机性）
            sample = [p for p, m in ents1.items()
                      if 'offset' in m and p not in (INDEX_PATH, INJECT_PATH)]
            stride = max(1, len(sample) // 60)
            for p in sample[::stride][:60]:
                d1 = read_entry(f1, b1, ents1[p])
                d2 = read_entry(f2, b2, ents2[p])
                assert d1 == d2, '抽样字节不一致：%s' % p
            eng = read_entry(f2, b2, ents2[INJECT_PATH])
        assert eng == engine, '引擎字节不一致'
        info('干跑完成并通过自检：%s（%d 字节，引擎 %d 字节，原条目 %d 个全部不变）'
             % (out, s2, len(eng), len(ents1)))
        return 0

    # 真实注入：统一走 apply_core（幂等；自动处理引擎更新与客户端升级两种场景）
    ok = apply_core(asar, silent=False, allow_first=True)
    if not ok:
        die('asar 被占用（ZCode 是否已退出？）。')

    # 自动注入计划任务（默认不装：SYSTEM 级常驻任务由用户显式选择）
    if need_admin and with_autoheal:
        install_autoheal_task()
    elif need_admin and not autoheal_installed():
        info('未安装「更新后自动注入」计划任务（默认关闭）。需要的话运行：'
             'python scripts/appearance_patcher.py --install-autoheal')

    if restart and os.path.exists(exe) and need_admin:
        info('正在以普通权限重启 ZCode…')
        subprocess.Popen(['explorer.exe', exe])
    return 0


def cmd_revert(asar, no_elevate=False):
    bak = asar + BACKUP_SUFFIX
    sidecar = asar + SIDECAR_SUFFIX
    is_default_target = os.path.normcase(guard_path(asar)) == os.path.normcase(DEFAULT_ASAR)
    if is_default_target and not is_admin() and not no_elevate:
        info('需要管理员权限，弹出 UAC…')
        self_elevate(['--revert', '--asar', DEFAULT_ASAR, '--no-elevate', '--pause'])
        return 0
    if not os.path.exists(bak):
        die('备份不存在（%s）。可能从未注入过，无需还原。' % bak)
    if zcode_running() and is_default_target:
        die('ZCode 正在运行，请先退出再还原。')
    if is_default_target:
        remove_autoheal_task()
    shutil.copyfile(guard_path(bak), guard_path(asar))
    try:
        os.remove(guard_path(sidecar, must_exist=False))
    except FileNotFoundError:
        pass
    info('已还原为官方原始 app.asar ✅（自动注入任务已移除；备份保留，可手动删除：%s）' % bak)
    return 0


def main():
    ap = argparse.ArgumentParser(description='ZCode 外观插件补丁器')
    ap.add_argument('--apply', action='store_true', help='注入外观引擎')
    ap.add_argument('--revert', action='store_true', help='还原官方 asar')
    ap.add_argument('--check', action='store_true', help='查看状态')
    ap.add_argument('--watch', action='store_true', help='等待 ZCode 退出后执行（配合 --apply）')
    ap.add_argument('--restart', action='store_true', help='注入后以普通权限重启 ZCode')
    ap.add_argument('--asar', default=os.environ.get('ZCODE_ASAR', DEFAULT_ASAR),
                    help='asar 路径（默认官方安装路径；测试副本须配合 --dry-run）')
    ap.add_argument('--dry-run', metavar='OUT', default=None,
                    help='只对 asar 副本重包并输出到指定文件（测试）')
    ap.add_argument('--no-elevate', action='store_true', help='不自提升管理员')
    ap.add_argument('--with-autoheal', action='store_true',
                    help='本次 --apply 同时安装「客户端更新后自动注入」计划任务（SYSTEM 级、每 5 分钟；默认不装）')
    ap.add_argument('--no-autoheal', action='store_true',
                    help='（兼容旧参数）本次 --apply 不安装自动注入计划任务；现在默认就不装')
    ap.add_argument('--install-autoheal', action='store_true', help='仅安装自动注入计划任务')
    ap.add_argument('--remove-autoheal', action='store_true', help='仅移除自动注入计划任务')
    ap.add_argument('--pause', action='store_true', help='结束后暂停等待回车（供自提升窗口使用）')
    args = ap.parse_args()

    try:
        if args.install_autoheal or args.remove_autoheal:
            if not is_admin():
                info('需要管理员权限，弹出 UAC…')
                self_elevate((['--install-autoheal'] if args.install_autoheal else ['--remove-autoheal'])
                             + ['--no-elevate', '--pause'])
                return 0
            if args.install_autoheal:
                return 0 if install_autoheal_task() else 1
            remove_autoheal_task()
            return 0
        if not (args.apply or args.revert or args.check):
            ap.print_help()
            return 0
        asar = validate_asar_arg(args.asar, allow_test=bool(args.dry_run))
        if args.check:
            return cmd_check(asar)
        if args.apply:
            return cmd_apply(asar, watch=args.watch, restart=args.restart,
                             dry_run=args.dry_run, no_elevate=args.no_elevate,
                             with_autoheal=args.with_autoheal)
        return cmd_revert(asar, no_elevate=args.no_elevate)
    finally:
        if args.pause:
            try:
                input('\n按回车键退出…')
            except Exception:
                pass


if __name__ == '__main__':
    sys.exit(main() or 0)
