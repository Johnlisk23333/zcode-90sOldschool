#!/usr/bin/env node
/**
 * tests/run-all.cjs — 冒烟测试总入口
 *
 * 逐个以子进程运行 tests/cases/*.cjs，用例内部自带假 DOM 桩，不需要真实客户端。
 * 退出码：0 全部通过；1 有失败；2 无用例。
 *
 * 用法：
 *   node tests/run-all.cjs              # 跑全部
 *   node tests/run-all.cjs tps          # 只跑名字含 tps 的用例
 */
'use strict';

const { spawnSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const casesDir = path.join(__dirname, 'cases');
const filter = process.argv[2] || '';
const TIMEOUT_MS = 180000;

let files;
try {
  files = fs.readdirSync(casesDir).filter(f => f.endsWith('.cjs')).sort();
} catch (e) {
  console.error('找不到 tests/cases 目录：', casesDir);
  process.exit(2);
}
if (filter) files = files.filter(f => f.includes(filter));
if (!files.length) {
  console.error('没有匹配的用例' + (filter ? '：' + filter : ''));
  process.exit(2);
}

let pass = 0, fail = 0;
const failed = [];

for (const f of files) {
  const full = path.join(casesDir, f);
  process.stdout.write(`▶ ${f} ... `);
  const r = spawnSync(process.execPath, [full], {
    cwd: path.join(__dirname, '..'),
    encoding: 'utf8',
    timeout: TIMEOUT_MS,
  });
  const out = (r.stdout || '') + (r.stderr || '');
  const okLine = out.match(/^SMOKE_OK\s+(\d+\/\d+)$/m);
  const failLine = out.match(/^SMOKE_FAIL\s+.*$/m);
  const crashed = r.status === null || /SMOKE_CRASH|SyntaxError|ReferenceError|TypeError/.test(out);

  if (r.status === 0 && okLine) {
    pass++;
    console.log('PASS ' + okLine[1]);
  } else {
    fail++;
    failed.push(f);
    console.log('FAIL' + (failLine ? ' — ' + failLine[0] : '') + (crashed ? '（异常）' : ''));
    const tail = out.trim().split('\n').slice(-12).join('\n');
    if (tail) console.log(tail.split('\n').map(l => '    ' + l).join('\n'));
  }
}

console.log('\n────────────────────────────');
console.log(`用例 ${pass + fail} 个：通过 ${pass}，失败 ${fail}`);
if (fail) {
  console.log('失败用例：' + failed.join(', '));
  process.exit(1);
}
console.log('ALL_SMOKE_OK');
