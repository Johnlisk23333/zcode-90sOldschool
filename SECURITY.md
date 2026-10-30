# 安全说明

## 这个项目做了什么

`zcode-90sOldschool` 通过一个纯 Python 标准库脚本（`scripts/appearance_patcher.py`），把自研的渲染层脚本注入到 ZCode 桌面客户端安装目录下的 `app.asar`，并在 `out/renderer/index.html` 的 `</head>` 前插入一行 `<script defer>`。

**只新增两个东西**：一个引擎文件、一行 script 标签。其余约 2.7 万个文件字节与偏移保持不变，被改写的条目会按 Electron 规范重算 SHA-256 分块 integrity。

## 风险与免责

- 本项目**非官方**，与 ZCode 客户端开发方无关。
- 修改客户端安装包可能违反其用户协议，**风险自负**；升级客户端、系统还原等场景请先 `还原外观.cmd`。
- 每次都自动备份官方原始包为 `app.asar.zcode-ap-bak`，`还原外观.cmd` 永远还原到这份原始备份。
- 引擎所有逻辑包在 `try/catch` 中，异常只会静默降级，不会阻断客户端启动；但**不提供任何担保**（见 LICENSE）。

## 计划任务（默认不安装）

`--with-autoheal`（或 `应用外观.cmd` 里输入 Y）会注册计划任务 `ZCode-Appearance-AutoHeal`：

- 以 **SYSTEM** 权限、每 5 分钟检查一次；
- 只在「注入丢失 / 引擎文件更新」且 ZCode 已退出时静默重注入；
- 单例互斥锁，不做首装；
- 卸载：`关闭自动注入.cmd` 或 `python scripts/appearance_patcher.py --remove-autoheal`。

默认不安装，是因为 SYSTEM 级常驻任务属于敏感操作，应由使用者显式选择。

## 网络访问

引擎默认**零网络请求**，配置/背景图/字体全部存本机（localStorage + IndexedDB）。

唯一例外：可选的「联动本地天气」（默认关闭）。

- 只向 `https://api.open-meteo.com` 发送经纬度（3 位小数）查询实况；
- 代码里固定 https + 主机白名单校验，拒绝任何本地/私网目标；
- 失败静默，不影响客户端。

## 报告安全问题

请**不要**在公开 Issue 中粘贴可利用细节或完整复现脚本。请通过仓库的 Security 页面私密报告（Security advisories），或邮件联系维护者，说明：影响范围、复现步骤、你的环境（客户端版本 / Windows 版本）。
