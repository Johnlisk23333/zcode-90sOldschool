---
name: zcode-90sOldschool
description: ZCode 桌面客户端外观增强插件的运维技能：应用/更新/还原 app.asar 注入补丁，排查客户端升级后补丁失效、asar 被锁、权限不足等问题。当用户要求给 ZCode 换主题、开背景/玻璃/雨雪效果、装字体、看模型速度或余额，或要求还原客户端外观时使用。
---

# ZCode 外观增强（zcode-90sOldschool）运维指南

本插件由两部分组成：

- `scripts/zcode-90sOldschool.js` — 外观引擎（注入到 ZCode 渲染层运行）
- `scripts/appearance_patcher.py` — 补丁器（把引擎写入客户端 `app.asar`，纯 Python 标准库）

已确认本机客户端 Electron 的 `EnableEmbeddedAsarIntegrityValidation` fuse 为关闭，修改 asar 安全；
补丁器会重算被改文件的 per-file SHA-256 integrity，原条目字节与偏移保持不变。

## 功能清单（引擎注入后）

- **主题配色**：12 套方案（樱花粉/薄荷绿/海空蓝/落日橙/葡萄紫/玫瑰红/琥珀金/青碧/靛蓝/荧光粉紫/水墨黑金），强度可调，可深度染色
- **背景图「我的方案」**（0.1.12 起）：自选图片自动入库（缩略图网格、上限 12、点选切换、✕ 删除、旧版单图迁移）
- **发送按键/输入光标/火星子**（0.1.24 起，0.1.25 升级）：空格发送（Shift+空格输空格，找不到发送键不拦截）；输入光标 native=caret-color、custom=系统光标透明+自绘 `#zcode-ap-caret`（形状竖线/方块/下划线、粗细 1–6、闪烁四档）；火星子监听 input/beforeinput/keydown，`caretRectOf` 失败时退回输入框左下角/最近鼠标点；输入框底色只画到 `tagComposerCard()` 标记的圆角层
- **菜单/浮层配色**（0.1.27 起）：运行时识别浮层（fixed/absolute + z-index≥50 + role/类名特征）打 `.zcode-ap-pop`，600ms 轮询 + 交互后补标；主题色混 popover 作底 + 毛玻璃 + accent 描边；文字色按表面对比度恒定下发；`overflow:visible` 修子菜单裁切
- **可读性遮罩 L1–L4**（0.1.26 起）：L1 全局压暗 rgab(0,0,0,.3) 兜底；L2 局部渐变（底部/顶部/上下，最深与覆盖比例可调）；L3 毛玻璃容器 blur+saturate+半透明底；L4 双层 text-shadow 轮廓光（free 场景按 `.prose` 区域采样背景亮度自动切黑白字）；场景预设 hero/nav/card/badge/free/off
- **输入框底色/透明度**（0.1.19 起）：composerBg 独立底色+不透明度（color-mix，只作用输入框卡片）
- **输入框字号/放大显示**（0.1.12 起）：输入框字号 小13/中15/大17；点代码框放大查看、双击输入框放大编辑；0.1.18 起双击结果里的代码块/文字块（p/li/h*/blockquote/td/整条消息）也放大查看（独立 Shadow 浮层；开层 350ms 内不误关；`openZoom(text,opts)` 正文取第一参数）；0.1.20 起放大编辑回填：textarea 走原型 setter+input，contenteditable/富文本走全选+execCommand insertText（否则编辑器会用自身 doc 覆盖），节点被替换时按输入区容器重定位，失败复制到剪贴板；0.1.19 起代码/文本卡片外层（code-block/file-card/attachment）也放大并上爬取内层 pre
- **上下文选择条**（0.1.12 起）：toolbar/context/select-trigger/combobox/popover/dropdown/listbox/menu/dialog 纳入换色、呼吸灯 outline、毛玻璃/果冻玻璃
- **暗色主题**（0.1.7 起）：强制深色（html 挂 `.dark` 复用客户端深色盘；关闭还原开启前状态；被客户端摘类后 2s 重断言）
- **天气动效**：雨（雨量/风力/闪电）与雪（雪量），respect 减少动效设置；**星光闪烁**（0.1.7 起，冷暖星眨眼+亮星十字光芒+偶发流星，密度/流星可调；0.1.10 起上密下稀天穹分布）；**风吹落叶**（0.1.10 起，叶量可调）；**联动本地天气**（0.1.10 起，可选联网默认关，geolocation+open-meteo 实况自动切雨/雪/风/夜星，30 分钟刷新）
- **文字颜色**（0.1.10 起）：两路取色器；（0.1.21）弹层/菜单按自身表面色单独取文字色（popover token 叠可见背景→对比度），弹层不透明度下限 86%/卡片 55%，修「白底白字/白茫茫」；（0.1.15）自动适配=可见背景 + 界面整体色相 → 推亮度满足 WCAG（文字≥4.5:1、正文≥5.5:1），结果带色相非纯黑白；任何背景/透明度/压暗/开关变化与图片采样完成都重算，面板显示判定并可手动重算；0.1.13 修 .dark 生成顺序、输入框文字保持默认
- **输入区统一**（0.1.14 起）：composer 内 toolbar/footer/controls/access/mode 等行与 bg-* 浅底类透明；0.1.16 起行与行内按钮/下拉的边框、投影、描边也清零（:is() 作用域，保留 :focus-visible 焦点环）
- **提示横幅与发送钮**（0.1.11 起）：alert/banner/notice/toast 纳入呼吸灯·火星文（不受界面文字子开关限制）·聊天字体；发送按钮自动标记做主题色霓虹辉光脉冲（1.5s 轮询补标）
- **呼吸灯**（0.1.6 起）覆盖层+悬浮球；0.1.10 的控件 outline 脉冲**已在 0.1.13 移除**（会套满屏描边框），现只有柔光+球发光
- **呼吸灯**（0.1.6 起）：随主题色柔光呼吸（soft-light 覆盖层 + 悬浮球发光），亮度/节奏可调，需配色方案，reduce-motion 自动关
- **背景图**：14 款内置渐变（含 v0.1.23 新增「浅绿」「豆绿」浅色系）+ 自定义图片（自动缩放存 IndexedDB）、不透明度/压暗/铺满方式
- **玻璃效果**：毛玻璃（frosted）/ 果冻玻璃（jelly，Q 弹动画 + 流光边框）
- **字体**：宋体/黑体/楷体/仿宋/隶书/幼圆/华文行楷/主席书法（毛体，需装字体文件）/花体英文/手写英文等，界面/正文/等宽三路独立；自定义 .ttf/.otf/.woff2 运行时安装（IndexedDB）；界面字号 85–125%、行距、圆角微调
- **模型速度**：TPS 与 token 统计（v0.1.5 起接管 ServicePort 事件流真实 usage；实时=4s 滑窗差分、收尾=out/decode；接管不到回退 DOM 估算）；v0.1.12 起总速度（Σout/Σ解码秒）+ 面板逐任务明细（标签/out/首字/解码）+ 指标条文案火星文；v0.1.17 加统计源诊断（帧/usage/chunk/未识别帧/握手/最后帧字段）、双入口握手监听、更多帧形态兼容、解码时长兜底
- **火星文**：显示层改写（我的消息/助手回复/界面文字三分开关，0.1.8 起界面 chrome 文本也覆盖）；0.1.22 起加装饰符号（fun.decor 0–100，`ゞ〃彡☆﹏〆灬丶`，只插汉字后；demartianize 先剔符号再反查，复制仍还原原文）；代码块与输入框跳过；复制自动还原原文；范围收窄时全量还原再重扫
- **余额**：自动抓取客户端用量页文本（实验性）或手动填写
- 入口：悬浮球 🎨 或快捷键 `Alt+Z`；配置可导出/导入 JSON

## 常用操作（在插件目录执行）

```bash
# 查看注入状态（含自动注入任务是否在装）
python scripts/appearance_patcher.py --check

# 注入/更新（自提升管理员；ZCode 运行中则等待退出后自动注入并重启）
# 计划任务默认不装，要装加 --with-autoheal（SYSTEM 级、每 5 分钟）
python scripts/appearance_patcher.py --apply --watch --restart
python scripts/appearance_patcher.py --apply --watch --restart --with-autoheal

# 还原官方原始 asar（自动移除自动注入任务）
python scripts/appearance_patcher.py --revert

# 自动注入任务单独管理
python scripts/appearance_patcher.py --install-autoheal
python scripts/appearance_patcher.py --remove-autoheal

# 测试（对 asar 副本重包，不碰安装目录）
python scripts/appearance_patcher.py --apply --dry-run <输出.asar> --asar <副本.asar> --no-elevate
```

用户也可以直接双击插件根目录的 `应用外观.cmd` / `还原外观.cmd` / `检查状态.cmd` / `关闭自动注入.cmd`。

## 客户端更新自愈（v0.1.3 起，v0.1.28 起默认关闭）

计划任务 **ZCode-Appearance-AutoHeal**（SYSTEM、每 5 分钟）**默认不安装**，需显式开启：
`--apply --with-autoheal`，或双击 `应用外观.cmd` 时在提问处输入 `Y`，或单独 `--install-autoheal`。
由 `scripts/appearance_autoheal.pyw` 检测「注入丢失 / 引擎文件更新」，等 ZCode 退出并过
4 秒稳定窗后静默重注入（单例互斥锁；不做首装；日志在 `app.asar.zcode-ap-autoheal.log`）。
补丁器内部状态机：`first_time / none / engine_update / official_changed`，
其中 official_changed 会先刷新基线备份再注入，防止旧备份还原导致客户端降级。

## 排障

| 现象 | 处置 |
|---|---|
| **启动即卡死/白屏不动**（v0.1.8） | 已知 bug：主题快照观察器自旋（回调摘 html 类+applyCSS 回填再触发自己）。v0.1.9 已修（150ms 去抖+重入闩）。恢复：任务管理器结束 ZCode → 双击 `应用外观.cmd`（或等自动注入任务 ≤5 分钟换上新引擎）→ 再启动；极端情况 `还原外观.cmd` |
| ZCode 自动更新后外观消失 | 正常（更新重置 app.asar），重跑 `--apply` 即可，配置不丢（存 localStorage/IndexedDB） |
| `asar 被占用` | ZCode 没退干净，等进程消失后重试，或用 `--watch` |
| UAC 被取消 | 以管理员身份重开终端执行，或右键 cmd“以管理员身份运行” |
| 面板找不到了 | `Alt+Z` 唤出；或清 localStorage 的 `zcode-90sOldschool-pos-v1` 复位悬浮球位置 |
| 面板/浮层挡住界面（v0.1.3 及以前） | 升到 v0.1.4+：面板支持点面板外任意处关闭、`Esc` 关闭、标题栏 ✕；悬浮球/指标条可直接拖走，位置自动记忆 |
| 升级引擎 | 改 `scripts/zcode-90sOldschool.js` 后重跑 `--apply`（自动先还原备份再注入新版） |
| 想彻底卸载 | `--revert` 后删除插件目录与 `app.asar.zcode-ap-bak` |

## 安全边界

- 引擎与补丁器默认**零网络请求**；配置、背景图、字体全部存本机（localStorage / IndexedDB）。唯一例外：可选「联动本地天气」（默认关）仅向 `https://api.open-meteo.com` 传经纬度取实况（代码固定 https+主机白名单，失败静默）。
- 补丁器只接受位于 `C:\Program Files\ZCode\resources` 的 `app.asar`（或 `--dry-run` 测试副本），路径经规范化校验禁止穿越。
- 修改仅限：新增引擎文件 + index.html 一行 `<script defer>`；其余 2.7 万个文件字节级不变（补丁器自检 + 外部比对双重验证过）。
- 备份 `app.asar.zcode-ap-bak` 是首次注入时的官方原始包，`--revert` 永远还原到它。
