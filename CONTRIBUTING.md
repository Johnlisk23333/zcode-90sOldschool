# 参与贡献

## 开发环境

- Windows 10/11（补丁器依赖 Windows 的 `schtasks`、UAC 提权与文件锁行为）
- Python 3.9+（补丁器只用标准库，不需要 pip 安装任何东西）
- Node.js 18+（仅跑语法检查与冒烟测试）

## 目录约定

```
scripts/zcode-90sOldschool.js     引擎（注入到客户端渲染层，单文件）
scripts/appearance_patcher.py   补丁器（asar 解包/重包/注入/还原/计划任务）
scripts/appearance_autoheal.pyw 自动注入巡检脚本（计划任务调用）
tests/                          冒烟测试（假 DOM，无需真实客户端）
```

## 改引擎的规矩

1. **只在 `scripts/zcode-90sOldschool.js` 里改**，不要动 `app.asar`；注入一律走补丁器。
2. 改完必须 `node --check scripts/zcode-90sOldschool.js`。
3. 跑冒烟：`node tests/run-all.cjs`（全部用例；单跑某个用例：`node tests/cases/<name>.cjs`）。
4. 版本四处同步：引擎 `VERSION`、补丁器 `ENGINE_VERSION`、`.zcode-plugin/plugin.json`、`plugins/marketplace.json`（如随仓库发布）。
5. 干跑验证注入链路（不碰安装目录）：

   ```bash
   python scripts/appearance_patcher.py --apply --dry-run out/test.asar --asar <官方 asar 副本> --no-elevate
   ```

## 提交要求

- 一次提交只做一件事；message 首行 `type: 概览`（中文，≤72 字符），正文分行说明改动与验证结果。
- 涉及 UI 行为变更请附截图或说明验证方式。
- **不得**提交：`app.asar`、备份文件、`.mimosa/`、`__pycache__`、任何真实业务数据或凭据。
- `.cmd` 文件必须保持 **GBK 编码 + CRLF 换行**（仓库已用 `.gitattributes` 按二进制保护），改完请用 `python -c "print(open('x.cmd','rb').read())"` 抽查。
