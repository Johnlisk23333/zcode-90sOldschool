/*!
 * zcode-90sOldschool — ZCode 桌面端外观增强引擎
 * 由 plugins/zcode-90sOldschool/scripts/appearance_patcher.py 注入到客户端渲染层。
 *
 * 功能：主题配色 / 暗色主题 / 呼吸灯（覆盖层+控件发光）/ 文字颜色 /
 *       背景图（内置渐变·无背景·自定义图片）/ 毛玻璃·果冻玻璃 /
 *       天气动效：雨（风·闪电）·雪·星光（上密下稀+流星）·风吹落叶 /
 *       可选联动本地天气（open-meteo 实况，默认关）/
 *       字体切换（宋体·楷体·行楷·花体英文·自定义字体文件）/
 *       模型速度 TPS（ServicePort 事件流真实计数）/ 余额显示 / 火星文显示层 /
 *       圆角·字号·行距微调 / 配置导入导出。
 *
 * 约束：除「联动本地天气」（仅向 api.open-meteo.com 传经纬度，可选）外零网络
 *       请求、零外部依赖；所有状态存本地（localStorage + IndexedDB）；
 *       全部逻辑 try/catch 包裹，任何异常不影响客户端本身运行。
 */
(function () {
  'use strict';

  if (window.top !== window) return;              // 只在主窗口运行
  if (window.__ZCODE_APPEARANCE__) return;         // 防重复注入
  window.__ZCODE_APPEARANCE__ = true;

  var VERSION = '0.2.0';
  var TAG = '[zcode-90sOldschool]';
  var LS_KEY = 'zcode-appearance-config-v1';
  var LS_POS_KEY = 'zcode-90sOldschool-pos-v1';

  function log() { try { console.log.apply(console, [TAG].concat([].slice.call(arguments))); } catch (e) {} }
  function warn() { try { console.warn.apply(console, [TAG].concat([].slice.call(arguments))); } catch (e) {} }

  /* ==================================================================
   * 默认配置
   * ================================================================== */
  var DEFAULTS = {
    enabled: true,
    theme: 'default',            // 见 THEMES
    themeIntensity: 60,          // 0-100，主题染色强度
    themeDeep: false,            // 深度染色（连背景一起染）
    forceDark: false,            // 暗色主题（给 html 强制挂 .dark，复用客户端深色盘）
    breath: {
      enabled: false,            // 呼吸灯（随主题色柔光呼吸；需选了配色方案）
      strength: 35,              // 呼吸亮度 5-100
      speed: 'slow'              // slow 5.6s | medium 3.8s | fast 2.4s
    },
    background: {
      enabled: false,
      kind: 'preset',            // preset | image
      preset: 'aurora',
      imageDataId: null,         // IndexedDB 中的背景图 id
      opacity: 90,               // 0-100
      dim: 25,                   // 压暗程度 0-100（保证前景可读）
      fit: 'cover'               // cover | contain
    },
    glass: { mode: 'none', strength: 55 },   // none | frost | jelly
    effects: {
      rain: false, rainDensity: 40, wind: 0, thunder: false,
      snow: false, snowDensity: 40,
      stars: false, starDensity: 40,   // 星光闪烁（上密下稀；含偶发流星）
      meteor: true,                    // 星光开启时的偶发流星
      leaf: false, leafDensity: 40,    // 风吹落叶
      neonSend: false,                 // 发送按钮霓虹灯（v0.1.11）
      sparks: false, sparkDensity: 50  // 打字时在光标处崩火星子（v0.1.24）
    },
    chat: { sendKey: 'enter' },        // 发送按键 enter | space（v0.1.24）
    readability: {                     // 分层可读性遮罩（v0.1.26）
      scene: 'off',                    // off|hero|nav|card|badge|free
      l1: { enabled: true, opacity: 30 },
      l2: { enabled: false, edge: 'bottom', strength: 65, size: 55 },
      l3: { enabled: false, strength: 20, saturate: 150, tint: 'rgba(255,255,255,0.15)' },
      l4: { enabled: false, white: true, shadow: '0 1px 2px rgba(0,0,0,.6), 0 2px 8px rgba(0,0,0,.4)' }
    },
    caretFx: {
      mode: 'native',            // native=只用系统光标（可改色）| custom=自绘输入光标
      color: 'theme',            // theme | hex | off
      shape: 'bar',              // bar 竖线 | block 方块 | underline 下划线（仅 custom）
      width: 2,                  // 1-4 px（仅 custom）
      blink: 'normal',           // normal | slow | fast | off（仅 custom）
      cursor: 'default'          // 鼠标指针形状（附加项）
    },
    weather: { link: false },          // 联动本地天气（联网取 open-meteo 实况，默认关）
    zoom: { enabled: true },           // 点击代码框/双击输入框放大显示（v0.1.12）
    composerFlat: { enabled: true },    // 输入区按钮行底色透明，与输入框融为一体（v0.1.14）
    composerBg: { enabled: false, color: '#1b1d24', opacity: 85 },  // 输入框独立底色/透明度（v0.1.19）
    textColor: { enabled: false, auto: true, ui: '', chat: '' },   // 文字颜色（auto=按背景明暗自适应）
    font: {
      ui: 'system',              // 见 FONT_STACKS
      chat: 'system',
      mono: 'system',
      inputSize: 'auto',         // 输入框字号 auto | s | m | l（v0.1.12）
      size: 100,                 // 界面字号 85-125 (%)
      lineHeight: 100,           // 聊天正文行距 100-200 (%)
      radius: 100                // 圆角比例 50-150 (%)
    },
    metrics: {
      showBar: true,
      showBalance: true,
      balanceMode: 'auto',       // auto | manual | off
      balanceManual: ''
    },
    fun: {
      martian: false,            // 火星文显示模式（纯显示层，不改数据）
      mine: true,                // 我的消息也火星文化
      assistant: true,           // 助手回复火星文化
      chrome: true,              // 界面文字也火星文化（侧边栏/菜单/按钮等；v0.1.8 起）
      decor: 60                  // 装饰符号浓度 0-100（0=只用同形字，100=每 2 字一个符号；v0.1.22）
    },
    hotkey: true                 // Alt+Z 唤出/隐藏面板
  };

  /* ==================================================================
   * 主题方案（accent = 主色；deepBg = 深度染色时的底色倾向）
   * ================================================================== */
  var THEMES = {
    default:  { label: '默认',    accent: null },
    sakura:   { label: '樱花粉',  accent: '#f472b6' },
    mint:     { label: '薄荷绿',  accent: '#34d399' },
    ocean:    { label: '海空蓝',  accent: '#38bdf8' },
    sunset:   { label: '落日橙',  accent: '#fb923c' },
    grape:    { label: '葡萄紫',  accent: '#a78bfa' },
    rose:     { label: '玫瑰红',  accent: '#f87171' },
    amber:    { label: '琥珀金',  accent: '#fbbf24' },
    teal:     { label: '青碧',    accent: '#2dd4bf' },
    indigo:   { label: '靛蓝',    accent: '#818cf8' },
    neon:     { label: '荧光粉紫', accent: '#e879f9' },
    ink:      { label: '水墨黑金', accent: '#d4af37' }
  };

  /* 内置背景渐变（kind=preset；none=无背景） */
  var BG_PRESETS = {
    none:     { label: '无背景', css: 'none' },
    aurora:   { label: '极光',   css: 'linear-gradient(160deg,#0b1026 0%,#123a5f 35%,#1c6e7a 60%,#113 100%)' },
    dawn:     { label: '晨曦',   css: 'linear-gradient(160deg,#ffd9c0 0%,#f7b2ad 30%,#9fa7df 100%)' },
    forest:   { label: '青峦',   css: 'linear-gradient(165deg,#0f2b1d 0%,#1d4d33 45%,#3a6b4f 100%)' },
    galaxy:   { label: '星河',   css: 'radial-gradient(1200px 700px at 70% 20%,#3b2f63 0%,#171233 45%,#05030f 100%)' },
    sakura:   { label: '樱雨',   css: 'linear-gradient(160deg,#fdeef2 0%,#f9cdd9 45%,#c1a0c9 100%)' },
    cyber:    { label: '赛博夜城', css: 'linear-gradient(150deg,#05010f 0%,#160b33 40%,#390d5c 70%,#0b1b3a 100%)' },
    snowland: { label: '雪国',   css: 'linear-gradient(170deg,#dfe9f3 0%,#b8c9dc 50%,#8fa8c4 100%)' },
    desert:   { label: '大漠',   css: 'linear-gradient(165deg,#3b2f1d 0%,#8a6a3b 50%,#d9b476 100%)' },
    inkwash:  { label: '水墨',   css: 'linear-gradient(170deg,#f4f2ec 0%,#d9d6cc 55%,#b9b6a8 100%)' },
    deepsea:  { label: '深海',   css: 'linear-gradient(165deg,#02121f 0%,#053a52 55%,#0a5e6e 100%)' },
    peach:    { label: '蜜桃',   css: 'linear-gradient(160deg,#ffe3d3 0%,#ffc2ba 50%,#e79fb4 100%)' },
    moss:     { label: '苔原',   css: 'linear-gradient(165deg,#1a2416 0%,#39492e 55%,#5f6f4a 100%)' },
    lightgreen: { label: '浅绿', css: 'linear-gradient(160deg,#eefaf2 0%,#cdeedb 45%,#a3dcbb 100%)' },
    beangreen:  { label: '豆绿', css: 'linear-gradient(165deg,#f0f4da 0%,#d3e0a6 50%,#adc17b 100%)' }
  };

  /* 系统字体栈（Windows 常见 + 通用回退） */
  var FONT_STACKS = {
    system:   { label: '默认（系统）', stack: null },
    yahei:    { label: '微软雅黑',     stack: '"Microsoft YaHei UI","Microsoft YaHei","PingFang SC",sans-serif' },
    song:     { label: '宋体',         stack: '"SimSun","NSimSun","Songti SC",serif' },
    hei:      { label: '黑体',         stack: '"SimHei","PingFang SC","Microsoft YaHei",sans-serif' },
    kai:      { label: '楷体',         stack: '"KaiTi","STKaiti","楷体",serif' },
    fangsong: { label: '仿宋',         stack: '"FangSong","STFangsong","仿宋",serif' },
    lishu:    { label: '隶书',         stack: '"LiSu","隶书",serif' },
    youyuan:  { label: '幼圆',         stack: '"YouYuan","幼圆",sans-serif' },
    xingkai:  { label: '华文行楷',     stack: '"STXingkai","华文行楷","KaiTi",cursive' },
    mao:      { label: '主席书法（毛体）', stack: '"ZAP_MAO","MaoZedong","方正毛体","STXingkai","KaiTi",cursive' },
    script:   { label: '花体英文',     stack: '"Gabriola","Segoe Script","Palace Script MT","Edwardian Script ITC","Apple Chancery",cursive' },
    inkfree:  { label: '手写英文（Ink）', stack: '"Ink Free","Segoe Print","Comic Sans MS",cursive' },
    serifen:  { label: '衬线英文',     stack: '"Times New Roman",Georgia,"Noto Serif",serif' }
  };

  /* ==================================================================
   * 工具：深合并 / 存储 / IndexedDB
   * ================================================================== */
  function deepMerge(base, extra) {
    var out = Array.isArray(base) ? base.slice() : (base ? JSON.parse(JSON.stringify(base)) : {});
    if (!extra || typeof extra !== 'object') return out;
    Object.keys(extra).forEach(function (k) {
      var v = extra[k];
      if (v && typeof v === 'object' && !Array.isArray(v) && out && typeof out[k] === 'object' && !Array.isArray(out[k])) {
        out[k] = deepMerge(out[k], v);
      } else if (v !== undefined) {
        out[k] = v;
      }
    });
    return out;
  }

  function loadConfig() {
    try {
      var raw = localStorage.getItem(LS_KEY);
      if (!raw) return JSON.parse(JSON.stringify(DEFAULTS));
      return deepMerge(DEFAULTS, JSON.parse(raw));
    } catch (e) { warn('配置读取失败，使用默认', e); return JSON.parse(JSON.stringify(DEFAULTS)); }
  }
  function saveConfig(cfg) {
    try { localStorage.setItem(LS_KEY, JSON.stringify(cfg)); } catch (e) { warn('配置保存失败', e); }
  }

  var _db = null;
  function db() {
    if (_db) return Promise.resolve(_db);
    return new Promise(function (resolve, reject) {
      var req = indexedDB.open('zcode-90sOldschool', 1);
      req.onupgradeneeded = function () { req.result.createObjectStore('blobs'); };
      req.onsuccess = function () { _db = req.result; resolve(_db); };
      req.onerror = function () { reject(req.error); };
    });
  }
  function idbSet(key, val) {
    return db().then(function (d) {
      return new Promise(function (res, rej) {
        var tx = d.transaction('blobs', 'readwrite');
        tx.objectStore('blobs').put(val, key);
        tx.oncomplete = function () { res(true); };
        tx.onerror = function () { rej(tx.error); };
      });
    });
  }
  function idbGet(key) {
    return db().then(function (d) {
      return new Promise(function (res, rej) {
        var tx = d.transaction('blobs', 'readonly');
        var rq = tx.objectStore('blobs').get(key);
        rq.onsuccess = function () { res(rq.result); };
        rq.onerror = function () { rej(rq.error); };
      });
    });
  }
  function idbDel(key) {
    return db().then(function (d) {
      return new Promise(function (res, rej) {
        var tx = d.transaction('blobs', 'readwrite');
        tx.objectStore('blobs')['delete'](key);
        tx.oncomplete = function () { res(true); };
        tx.onerror = function () { rej(tx.error); };
      });
    });
  }
  function idbKeys() {
    return db().then(function (d) {
      return new Promise(function (res, rej) {
        var rq = d.transaction('blobs', 'readonly').objectStore('blobs').getAllKeys();
        rq.onsuccess = function () { res(rq.result || []); };
        rq.onerror = function () { rej(rq.error); };
      });
    });
  }

  /* ==================================================================
   * 状态
   * ================================================================== */
  var cfg = loadConfig();
  var customFonts = [];        // [{id,name,dataUrl}]，运行时注册的自定义字体
  var bgImageDataUrl = null;   // 当前自定义背景图
  var bgGallery = [];          // 我的方案：[{id,name,at,thumb}]（全图另存 bgimg-<id>）
  var bgGalleryData = new Map(); // id -> dataUrl（已取过的全图缓存）
  var origTokens = null;       // 原始 token 快照（用于透明度混合）
  var htmlEl = document.documentElement;

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  /* 判断当前是否深色主题（客户端在 <html> 上挂 .dark / .theme-zai-dark） */
  function isDarkMode() {
    var cls = ' ' + (htmlEl.className || '') + ' ';
    if (cls.indexOf(' theme-zai-dark ') >= 0 || cls.indexOf(' dark ') >= 0) return true;
    if (cls.indexOf(' theme-zai-light ') >= 0) return false;
    try {
      var bgc = getComputedStyle(htmlEl).getPropertyValue('--color-background').trim();
      if (!bgc) return false;
      var m = bgc.match(/^#([0-9a-f]{3,8})$/i);
      var rgb = null;
      if (m) {
        var hx = m[1]; if (hx.length === 3) hx = hx.replace(/./g, function (c) { return c + c; });
        rgb = [parseInt(hx.substr(0, 2), 16), parseInt(hx.substr(2, 2), 16), parseInt(hx.substr(4, 2), 16)];
      } else {
        var p = bgc.match(/(\d+(?:\.\d+)?)/g);
        if (p && p.length >= 3) rgb = [+p[0], +p[1], +p[2]];
      }
      if (rgb) return (0.299 * rgb[0] + 0.587 * rgb[1] + 0.114 * rgb[2]) < 128;
    } catch (e) {}
    return matchMedia && matchMedia('(prefers-color-scheme: dark)').matches;
  }

  /* 记录注入前原始 token 值（供背景透明度混合使用） */
  function captureTokens() {
    try {
      var cs = getComputedStyle(htmlEl);
      var names = ['--color-background', '--color-background-alt', '--color-background-win-alt',
        '--color-card', '--color-popover', '--color-input',
        '--color-surface', '--color-menu-hover', '--color-primary', '--color-primary-foreground',
        '--color-brand', '--color-accent',
        // v0.1.13：前景 token 快照——输入框内文字要还原成客户端默认前景色
        '--color-foreground', '--color-card-foreground', '--color-popover-foreground',
        '--color-muted-foreground', '--color-secondary-foreground', '--color-accent-foreground'];
      origTokens = {};
      names.forEach(function (n) { origTokens[n] = cs.getPropertyValue(n).trim(); });
    } catch (e) { warn('token 快照失败', e); origTokens = {}; }
  }

  /* ==================================================================
   * CSS 生成
   * ================================================================== */
  var PREFIX = 'zcode-ap-on';
  // 双写类名提升优先级（0-2-0 > 客户端 .dark/.theme-zai-* 的 0-1-0），
  // 并对 token 加 !important，避免被内联样式或加载顺序干扰。
  function SEL() { return 'html.' + PREFIX + '.' + PREFIX; }

  function themeCSS() {
    var t = THEMES[cfg.theme];
    if (cfg.theme === 'default' || !t || !t.accent) return '';
    var a = t.accent;
    var s = Math.max(0.15, cfg.themeIntensity / 100);
    var mix = function (pct) { return 'color-mix(in oklab, ' + a + ' ' + Math.round(pct) + '%, transparent)'; };
    var light = [
      '--color-brand:' + a,
      '--color-accent:' + mix(10 + 16 * s),
      '--color-selected:' + mix(7 + 13 * s),
      '--color-hover:' + mix(5 + 9 * s),
      '--color-surface:' + mix(3 + 6 * s),
      '--color-surface-hover:' + mix(5 + 10 * s),
      '--color-input-border-focused:' + a,
      '--color-ring:' + a,
      '--color-primary:' + (cfg.themeDeep ? ('color-mix(in oklab, ' + a + ' 30%, #0a0a0a)') : 'var(--color-neutral-950)'),
      '--color-primary-foreground:#fff'
    ];
    var dark = [
      '--color-brand:' + a,
      '--color-accent:' + mix(14 + 20 * s),
      '--color-selected:' + mix(10 + 15 * s),
      '--color-hover:' + mix(7 + 11 * s),
      '--color-surface:' + mix(5 + 8 * s),
      '--color-surface-hover:' + mix(8 + 12 * s),
      '--color-input-border-focused:' + a,
      '--color-ring:' + a,
      '--color-primary:' + (cfg.themeDeep ? ('color-mix(in oklab, ' + a + ' 40%, #fafafa)') : 'var(--color-neutral-50)'),
      '--color-primary-foreground:#0a0a0a'
    ];
    var css = SEL() + '{' + light.map(function (x) { return x + '!important;'; }).join('') + '}';
    css += SEL() + '.dark,' + SEL() + '.theme-zai-dark{' + dark.map(function (x) { return x + '!important;'; }).join('') + '}';
    if (cfg.themeDeep) {
      var bgL = 'color-mix(in oklab, ' + a + ' ' + Math.round(4 + 8 * s) + '%, #f8f8f8)';
      var cardL = 'color-mix(in oklab, ' + a + ' ' + Math.round(3 + 6 * s) + '%, #ffffff)';
      var popL = cardL;
      var bgD = 'color-mix(in oklab, ' + a + ' ' + Math.round(6 + 12 * s) + '%, #141414)';
      var cardD = 'color-mix(in oklab, ' + a + ' ' + Math.round(5 + 10 * s) + '%, #242424)';
      var popD = cardD;
      css += SEL() + '{--color-background:' + bgL + '!important;--color-card:' + cardL + '!important;--color-popover:' + popL + '!important;}';
      css += SEL() + '.dark,' + SEL() + '.theme-zai-dark{--color-background:' + bgD + '!important;--color-card:' + cardD + '!important;--color-popover:' + popD + '!important;}';
    }
    return css;
  }

  function backgroundCSS() {
    if (!cfg.background || !cfg.background.enabled) return '';
    var b = cfg.background;
    // 「无背景」预设：不注入任何背景与透明化规则，客户端保留自己的底色
    if (b.kind === 'preset' && b.preset === 'none') return '';
    var css = '';
    var bgVal;
    if (b.kind === 'image' && bgImageDataUrl) {
      bgVal = 'url("' + bgImageDataUrl.replace(/"/g, '%22') + '") center center/' + b.fit + ' no-repeat';
    } else {
      var p = BG_PRESETS[b.preset] || BG_PRESETS.aurora;
      bgVal = p.css;
    }
    // 背景层：z-index:-1（画在普通文档流内容之下、画布之上），不会盖住 UI
    css += '#zcode-ap-bg{position:fixed;inset:0;z-index:-1;pointer-events:none;background:' + bgVal +
      ';opacity:' + (b.opacity / 100) + ';filter:brightness(' + (1 - b.dim / 200) + ');}';
    // 画布与外壳保持透明（客户端自身对 html/body/#root 已是 transparent!important，这里双保险）
    css += SEL() + ', ' + SEL() + ' body, ' + SEL() + ' #root{background:transparent!important;}';
    // 所有 bg-background 及其不透明度变体（/30.../95，含写死字面色的）一刀切透明。
    // 客户端布局壳用这些类画底色，不透明就看不见背景层。
    css += SEL() + ' [class*="bg-background"]{background-color:transparent!important;}';
    // 面板类 token 改为半透明（基于注入前快照混合），与背景不透明度联动
    if (origTokens) {
      var op = 0.30 + 0.60 * (b.opacity / 100); // 30%-90%：背景越浓，表面越实
      // v0.1.21：弹层/菜单必须够实，否则叠在背景图上白茫茫、字看不清
      var opPop = Math.max(0.86, op);
      var opCard = Math.max(0.55, op);
      var out = [];
      ['--color-background', '--color-background-alt', '--color-background-win-alt'
      ].forEach(function (token) {
        var v = origTokens[token];
        if (v) out.push(token + ':color-mix(in oklab,' + v + ' ' + Math.round(op * 100) + '%,transparent)!important;');
      });
      ['--color-card', '--color-input', '--color-menu-hover'].forEach(function (token) {
        var v = origTokens[token];
        if (v) out.push(token + ':color-mix(in oklab,' + v + ' ' + Math.round(opCard * 100) + '%,transparent)!important;');
      });
      ['--color-popover'].forEach(function (token) {
        var v = origTokens[token];
        if (v) out.push(token + ':color-mix(in oklab,' + v + ' ' + Math.round(opPop * 100) + '%,transparent)!important;');
      });
      if (out.length) css += SEL() + '{' + out.join('') + '}';
    }
    return css;
  }

  function glassCSS() {
    var g = cfg.glass || { mode: 'none' };
    if (g.mode === 'none') return '';
    var blur = 4 + Math.round((g.strength || 50) / 100 * 32); // 4-36px
    var targets = '.bg-card,.bg-popover,.bg-input,.bg-surface,.bg-menu,.bg-secondary,' +
      '[class*="bg-card/"],[class*="bg-popover/"],' +
      // 上下文选择条 / 工具栏 / 下拉与弹层（v0.1.12）
      '[class*="toolbar"],[class*="context"],[class*="popover"],[class*="dropdown"],[class*="select-trigger"],[role="listbox"],[role="menu"],[role="dialog"]';
    var css = '';
    if (g.mode === 'frost') {
      css += SEL() + ' ' + targets + '{backdrop-filter:blur(' + blur + 'px) saturate(1.5);-webkit-backdrop-filter:blur(' + blur + 'px) saturate(1.5);}';
    } else if (g.mode === 'jelly') {
      var accent = (THEMES[cfg.theme] && THEMES[cfg.theme].accent) || '#7dd3fc';
      css += SEL() + ' ' + targets + '{backdrop-filter:blur(' + blur + 'px) saturate(1.9) hue-rotate(4deg);' +
        '-webkit-backdrop-filter:blur(' + blur + 'px) saturate(1.9) hue-rotate(4deg);' +
        'border:1px solid color-mix(in oklab,' + accent + ' 35%,transparent)!important;' +
        'box-shadow:0 6px 24px -8px color-mix(in oklab,' + accent + ' 40%,transparent),inset 0 1px 0 rgba(255,255,255,.18)!important;}';
      // 果冻 Q 弹入场 & 悬停微晃（尊重系统减少动效）
      css += '@media (prefers-reduced-motion: no-preference){';
      css += SEL() + ' .bg-card,' + SEL() + ' .bg-popover{animation:zap-jelly-in .5s cubic-bezier(.34,1.56,.64,1);transition:border-radius .25s cubic-bezier(.34,1.56,.64,1),transform .25s cubic-bezier(.34,1.56,.64,1);}';
      css += SEL() + ' .bg-card:hover,' + SEL() + ' .bg-popover:hover{transform:scale(1.006) rotate(-.12deg);border-radius:1.15em;}';
      css += '@keyframes zap-jelly-in{0%{transform:scale(.96,1.03);}45%{transform:scale(1.02,.985);}75%{transform:scale(.995,1.004);}100%{transform:scale(1,1);}}';
      css += '}';
    }
    return css;
  }

  /* ==================================================================
   * 呼吸灯：随主题色柔光呼吸（覆盖层 soft-light 混合 + 悬浮球发光）
   * ================================================================== */
  var BREATH_SPEEDS = { slow: 5.6, medium: 3.8, fast: 2.4 };
  function breathEnabled() {
    var t = THEMES[cfg.theme];
    return !!(cfg.enabled && cfg.breath && cfg.breath.enabled && !reduceMotion && t && t.accent);
  }
  /* 上下文选择条 / 工具栏（模型·上下文长度等选择器）：呼吸灯与换色共用 */
  var BAR_SEL = '[class*="toolbar"],[class*="context"],[class*="select-trigger"],' +
    '[role="combobox"],[class*="model-picker"],[class*="model-select"]';

  /* 提示横幅/告警条（用量上限、升级提示、toast 等）：呼吸灯、火星文、字体三处共用 */
  var ALERT_SEL = '[class*="alert"],[class*="banner"],[class*="notice"],[class*="toast"],' +
    '[class*="notification"],[class*="limit"],[role="alert"],[role="status"]';

  function hexRgb(x) {
    var m = /^#?([0-9a-f]{6})$/i.exec(x || '');
    if (!m) return '127,127,127';
    var n = parseInt(m[1], 16);
    return ((n >> 16) & 255) + ',' + ((n >> 8) & 255) + ',' + (n & 255);
  }
  function breathCSS() {
    if (!breathEnabled()) return '';
    var a = THEMES[cfg.theme].accent;
    var rgb = hexRgb(a);
    var max = Math.min(0.6, Math.max(0.06, (cfg.breath.strength || 35) / 100 * 0.55));
    var dur = BREATH_SPEEDS[cfg.breath.speed] || BREATH_SPEEDS.slow;
    var css = '#zcode-ap-breath{position:fixed;inset:0;z-index:2147482990;pointer-events:none;';
    css += 'mix-blend-mode:soft-light;opacity:0;';
    css += 'background:radial-gradient(120% 80% at 50% -10%,' + a + ' 0%,transparent 55%),';
    css += 'radial-gradient(90% 70% at 85% 110%,' + a + ' 0%,transparent 60%);';
    css += 'animation:zapBreath ' + dur + 's ease-in-out infinite;}';
    css += '@keyframes zapBreath{0%,100%{opacity:0;}50%{opacity:' + max.toFixed(3) + ';}}';
    // v0.1.13：移除控件 outline 呼吸（会给几乎所有元素套描边框，观感极差）。
    // 呼吸只保留：主题色柔光覆盖层 + 悬浮球发光。
    return css;
  }
  /* 发送按钮霓虹灯（v0.1.11）：JS 标记 .zcode-ap-send 后由 CSS 做多层辉光脉冲 */
  function neonSendCSS() {
    if (!cfg.enabled || !cfg.effects || !cfg.effects.neonSend) return '';
    var a = (THEMES[cfg.theme] && THEMES[cfg.theme].accent) || '#22d3ee';
    var rgb = hexRgb(a);
    var css = SEL() + ' .zcode-ap-send{position:relative;' +
      'border-color:rgba(' + rgb + ',.85)!important;' +
      'box-shadow:0 0 4px rgba(' + rgb + ',.85),0 0 12px rgba(' + rgb + ',.55),0 0 24px rgba(' + rgb + ',.3),' +
      'inset 0 0 8px rgba(' + rgb + ',.35)!important;' +
      'animation:zapNeonSend 1.7s ease-in-out infinite;}';
    css += '@keyframes zapNeonSend{' +
      '0%,100%{box-shadow:0 0 3px rgba(' + rgb + ',.7),0 0 9px rgba(' + rgb + ',.4),0 0 18px rgba(' + rgb + ',.2),inset 0 0 6px rgba(' + rgb + ',.25);}' +
      '50%{box-shadow:0 0 7px rgba(' + rgb + ',1),0 0 18px rgba(' + rgb + ',.75),0 0 34px rgba(' + rgb + ',.45),inset 0 0 12px rgba(' + rgb + ',.5);}}';
    // 霓虹下文字描边发光（图标型按钮也受益）
    css += SEL() + ' .zcode-ap-send svg,' + SEL() + ' .zcode-ap-send{filter:drop-shadow(0 0 3px rgba(' + rgb + ',.85));}';
    return css;
  }
  /* 输入区按钮行透明（v0.1.14）：完全访问/发送/模型选择等所在行去掉底色，
   * 与输入框卡片融为一体；只清背景色，保留边框与文字 */
  function composerFlatCSS() {
    if (!cfg.enabled || !cfg.composerFlat || !cfg.composerFlat.enabled) return '';
    // 用 :is() 做笛卡尔组合——避免逗号列表只有首项带前缀的作用域漏配
    var C = ':is([class*="composer" i],[class*="input-box" i],[class*="chat-input" i],[class*="prompt" i])';
    var ROWS = ':is([class*="toolbar"],[class*="footer"],[class*="bottom"],[class*="controls"],' +
      '[class*="action"],[class*="actions"],[class*="row"],[class*="bar"],' +
      '[class*="access"],[class*="mode"],[class*="permission"],[class*="selector"])';
    var PILL = ':is(button,[role="button"],[role="combobox"],[class*="select-trigger"],' +
      '[class*="segmented"],[class*="pill"],[class*="chip"])';
    var rowScope = SEL() + ' ' + C + ' ' + ROWS;
    // 行本身：底色 + 边框 + 投影 + 描边全部去掉
    var css = rowScope + '{background:transparent!important;background-color:transparent!important;' +
      'border-color:transparent!important;border-width:0!important;box-shadow:none!important;' +
      'outline:none!important;}';
    // 行内浅色底类（含 /xx 不透明度变体）一并透明
    css += SEL() + ' ' + C + ' ' +
      ':is([class*="bg-card"],[class*="bg-surface"],[class*="bg-secondary"],[class*="bg-muted"],' +
      '[class*="bg-accent"],[class*="bg-input"],[class*="bg-popover"],[class*="bg-card/"])' +
      '{background-color:transparent!important;}';
    // 行内按钮/下拉（完全访问、发送、模型选择等）：无边框、无阴影、无渐变底；
    // 键盘操作时仍保留焦点环（无障碍），鼠标点击不出现框
    css += rowScope + ' ' + PILL + ':not(:focus-visible)' +
      '{border-color:transparent!important;border-width:0!important;box-shadow:none!important;' +
      'outline:none!important;background-image:none!important;}';
    return css;
  }

  /* 输入框独立底色与透明度（v0.1.19）：只作用于对话输入框卡片本体，
   * 用 color-mix 把十六进制色按不透明度混成透明色，避免再叠一层半透明遮罩 */
  function composerBgCSS() {
    var b = cfg.composerBg;
    if (!cfg.enabled || !b || !b.enabled) return '';
    var op = Math.max(0, Math.min(100, b.opacity == null ? 85 : b.opacity));
    var col = b.color || '#1b1d24';
    // 只画到「真正带圆角的那层卡片」：由 tagComposerCard() 运行时标记，
    // 直接画在外层 wrapper 上会变成方角、露出圆角之外（v0.1.25）
    return SEL() + ' .zcode-ap-composer-card{' +
      'background-color:color-mix(in srgb,' + col + ' ' + op + '%,transparent)!important;' +
      'background-image:none!important;' +
      'border-radius:inherit;}';
  }
  /* 给输入框所在的那层圆角卡片打标：从输入元素向上找第一个 border-radius 非 0 的祖先 */
  function tagComposerCard() {
    if (!cfg.enabled || !cfg.composerBg || !cfg.composerBg.enabled) {
      var olds = document.querySelectorAll('.zcode-ap-composer-card');
      for (var i = 0; i < olds.length; i++) olds[i].classList.remove('zcode-ap-composer-card');
      return;
    }
    var els = document.querySelectorAll('textarea,[contenteditable="true"],[contenteditable=""]');
    for (var k = 0; k < els.length; k++) {
      var el = els[k];
      if (el.closest && el.closest('#zcode-90sOldschool-ui,#zcode-90sOldschool-zoom')) continue;
      var wrap = el.closest && el.closest('[class*="composer" i],[class*="input-box" i],[class*="chat-input" i],[class*="prompt" i]');
      if (!wrap) continue;
      var node = wrap, best = null, guard = 0;
      while (node && guard++ < 4) {
        try {
          var rad = parseFloat(getComputedStyle(node).borderTopLeftRadius || '0');
          if (rad > 0) { best = node; break; }
        } catch (e) { /* 取不到样式就继续往上 */ }
        node = node.parentElement;
      }
      (best || wrap).classList.add('zcode-ap-composer-card');
    }
  }

  /* ==================================================================
   * 自绘输入光标（v0.1.25）：系统只允许改 caret-color，形状/宽度/闪烁需自己画
   *  - custom 模式下系统光标透明，用 #zcode-ap-caret 跟随真实光标位置
   *  - 位置来源与火星子共用 caretRect（textarea 镜像 / contenteditable 选区）
   * ================================================================== */
  var caretUI = { box: null, raf: 0, lastKey: '' };
  var CARET_BLINK = { normal: '1.06s', slow: '1.6s', fast: '0.7s', off: '0s' };
  function caretRectOf(el) {
    try {
      if (el.tagName === 'TEXTAREA' || el.tagName === 'INPUT') {
        var cs = getComputedStyle(el);
        var rect = el.getBoundingClientRect();
        var mirror = document.createElement('div');
        ['fontFamily', 'fontSize', 'fontWeight', 'letterSpacing', 'lineHeight',
          'paddingTop', 'paddingRight', 'paddingBottom', 'paddingLeft',
          'borderTopWidth', 'borderRightWidth', 'borderBottomWidth', 'borderLeftWidth', 'boxSizing'
        ].forEach(function (k) { mirror.style[k] = cs[k]; });
        mirror.style.position = 'fixed';
        mirror.style.left = rect.left + 'px';
        mirror.style.top = rect.top + 'px';
        mirror.style.width = rect.width + 'px';
        mirror.style.whiteSpace = 'pre-wrap';
        mirror.style.wordWrap = 'break-word';
        mirror.style.visibility = 'hidden';
        mirror.style.overflow = 'hidden';
        mirror.textContent = (el.value || '').slice(0, el.selectionStart == null ? 0 : el.selectionStart);
        var tail = document.createElement('span');
        tail.textContent = '​';
        mirror.appendChild(tail);
        document.body.appendChild(mirror);
        var tr = tail.getBoundingClientRect();
        var out = { x: tr.left, y: tr.top, h: tr.height || parseFloat(cs.lineHeight) || 18 };
        mirror.remove();
        return out;
      }
      var sel = window.getSelection && window.getSelection();
      if (sel && sel.rangeCount && sel.isCollapsed) {
        var r = sel.getRangeAt(0).cloneRange();
        r.collapse(true);
        var rects = r.getClientRects();
        if (rects && rects.length) return { x: rects[0].left, y: rects[0].top, h: rects[0].height };
        var rr = r.getBoundingClientRect();
        if (rr) return { x: rr.left, y: rr.top, h: rr.height };
      }
    } catch (e) { /* 取不到就交给调用方兜底 */ }
    return null;
  }
  function ensureCaretBox() {
    if (caretUI.box && caretUI.box.isConnected) return caretUI.box;
    var box = document.createElement('div');
    box.id = 'zcode-ap-caret';
    box.setAttribute('aria-hidden', 'true');
    document.body.appendChild(box);
    caretUI.box = box;
    return box;
  }
  function hideCaretBox() {
    if (caretUI.box) caretUI.box.style.display = 'none';
  }
  function caretApplyStyle(box) {
    var c = cfg.caretFx || {};
    var color = caretColor() || '#7dd3fc';
    var w = Math.max(1, Math.min(6, c.width || 2));
    box.style.background = color;
    box.style.opacity = '1';
    box.style.animationDuration = CARET_BLINK[c.blink] || CARET_BLINK.normal;
    if ((CARET_BLINK[c.blink] || '1.06s') === '0s') box.style.animation = 'none';
    else box.style.animation = '';
    if (c.shape === 'block') {
      box.style.width = '0.55em';
      box.style.borderRadius = '1px';
    } else if (c.shape === 'underline') {
      box.style.width = '0.5em';
      box.style.borderRadius = '1px';
    } else {
      box.style.width = w + 'px';
      box.style.borderRadius = w > 2 ? '2px' : '1px';
    }
    box.style.height = '1em';
  }
  function caretSync() {
    var c = cfg.caretFx || {};
    if (!cfg.enabled || c.mode !== 'custom') { hideCaretBox(); return; }
    var el = document.activeElement;
    if (!el) { hideCaretBox(); return; }
    var editable = isEditable(el) || (el.getAttribute && el.getAttribute('contenteditable') !== null);
    if (!editable) { hideCaretBox(); return; }
    if (el.closest && el.closest('#zcode-90sOldschool-ui,#zcode-90sOldschool-zoom')) { hideCaretBox(); return; }
    var r = caretRectOf(el);
    if (!r) { hideCaretBox(); return; }
    var box = ensureCaretBox();
    var h = Math.max(10, r.h);
    box.style.display = 'block';
    caretApplyStyle(box);
    if ((c.shape || 'bar') === 'underline') {
      box.style.height = Math.max(1, Math.min(6, c.width || 2)) + 'px';
      box.style.top = (r.y + h - 2) + 'px';
    } else if (c.shape === 'block') {
      box.style.height = h + 'px';
      box.style.top = r.y + 'px';
    } else {
      box.style.height = (h * 0.92) + 'px';
      box.style.top = (r.y + h * 0.04) + 'px';
    }
    box.style.left = r.x + 'px';
  }
  function caretFxStart() {
    hideCaretBox();
    var schedule = function () {
      if (caretUI.raf) return;
      caretUI.raf = requestAnimationFrame(function () {
        caretUI.raf = 0;
        caretSync();
      });
    };
    ['selectionchange', 'keyup', 'mouseup', 'input', 'click', 'focusin', 'focusout'].forEach(function (evt) {
      var target = evt === 'selectionchange' ? document : document;
      target.addEventListener(evt, schedule, true);
    });
    window.addEventListener('resize', schedule);
    document.addEventListener('scroll', schedule, true);
    schedule();
  }

  /* ==================================================================
   * 空格发送 + 打字火星子（v0.1.24）
   * ================================================================== */
  function findComposerSendBtn(el) {
    var wrap = el && el.closest ?
      el.closest('[class*="composer" i],[class*="input-box" i],[class*="chat-input" i],[class*="prompt" i]') : null;
    if (!wrap || !wrap.querySelectorAll) return null;
    var btns = wrap.querySelectorAll('button');
    for (var i = 0; i < btns.length; i++) {
      if (isSendButton(btns[i])) return btns[i];
    }
    return btns.length ? btns[btns.length - 1] : null;
  }
  function sendKeyStart() {
    document.addEventListener('keydown', function (ev) {
      if (!cfg.enabled || !cfg.chat || cfg.chat.sendKey !== 'space') return;
      if (ev.key !== ' ' || ev.shiftKey || ev.ctrlKey || ev.altKey || ev.metaKey || ev.isComposing) return;
      if (!isEditable(ev.target)) return;
      var btn = findComposerSendBtn(ev.target);
      if (!btn) return;                      // 找不到发送键就不拦截，避免空格打不出来
      ev.preventDefault();
      ev.stopPropagation();
      try { btn.click(); } catch (e) { /* 触发失败不阻断 */ }
    }, true);
  }

  /* ---- 光标处火星子粒子 ---- */
  var sparks = { canvas: null, ctx: null, parts: [], raf: 0, lastT: 0 };
  var SPARK_GLYPHS = ['✦', '✧', '☆', '★', '·', 'ﾟ', '✳'];
  function ensureSparkCanvas() {
    if (sparks.canvas && sparks.canvas.isConnected) return;
    sparks.canvas = document.createElement('canvas');
    sparks.canvas.id = 'zcode-ap-sparks';
    Object.assign(sparks.canvas.style, {
      position: 'fixed', inset: '0', zIndex: '2147483050', pointerEvents: 'none', display: 'block'
    });
    document.body.appendChild(sparks.canvas);
    sparks.ctx = sparks.canvas.getContext('2d');
    sparkResize();
    window.addEventListener('resize', sparkResize);
  }
  function sparkResize() {
    if (!sparks.canvas) return;
    var dpr = Math.min(2, window.devicePixelRatio || 1);
    sparks.canvas.width = Math.round(window.innerWidth * dpr);
    sparks.canvas.height = Math.round(window.innerHeight * dpr);
    sparks.canvas.style.width = window.innerWidth + 'px';
    sparks.canvas.style.height = window.innerHeight + 'px';
    sparks.dpr = dpr;
  }
  /* 火星子定位：优先精确光标位置，取不到时退回输入框左下角 / 最近鼠标点。
   * （客户端输入区若是自绘编辑器，选区 rect 与镜像都取不到，必须兜底，否则不冒火） */
  var lastPointer = { x: 0, y: 0 };
  function sparkPoint(el) {
    var r = caretRectOf(el);
    if (r) return { x: r.x, y: r.y + r.h / 2 };
    try {
      var rect = el.getBoundingClientRect();
      if (rect && (rect.width || rect.height)) {
        return { x: rect.left + 18, y: rect.bottom - 16 };
      }
    } catch (e) { /* 忽略 */ }
    if (lastPointer.x || lastPointer.y) return { x: lastPointer.x, y: lastPointer.y };
    return null;
  }
  function sparkBurst(pt) {
    if (!pt) return;
    var dens = Math.max(1, Math.min(100, (cfg.effects && cfg.effects.sparkDensity) || 50));
    var n = 2 + Math.round(dens / 34);           // 2-5 个/次
    var accent = (THEMES[cfg.theme] && THEMES[cfg.theme].accent) || '#fbbf24';
    for (var i = 0; i < n; i++) {
      sparks.parts.push({
        x: pt.x, y: pt.y,
        vx: (Math.random() - 0.5) * 2.4,
        vy: -(0.8 + Math.random() * 1.8),
        life: 1, ttl: 0.5 + Math.random() * 0.5,
        size: 8 + Math.random() * 7,
        rot: Math.random() * Math.PI,
        spin: (Math.random() - 0.5) * 6,
        ch: SPARK_GLYPHS[Math.floor(Math.random() * SPARK_GLYPHS.length)],
        color: accent
      });
    }
    if (sparks.parts.length > 160) sparks.parts.splice(0, sparks.parts.length - 160);
    if (!sparks.raf) {
      sparks.lastT = performance.now();
      sparks.raf = requestAnimationFrame(sparkTick);
    }
  }
  function sparkTick(t) {
    if (!sparks.canvas) { sparks.raf = 0; return; }
    var dt = Math.min(0.05, (t - sparks.lastT) / 1000 || 0.016);
    sparks.lastT = t;
    var ctx = sparks.ctx;
    var dpr = sparks.dpr || 1;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, window.innerWidth, window.innerHeight);
    for (var i = sparks.parts.length - 1; i >= 0; i--) {
      var p = sparks.parts[i];
      p.life -= dt / p.ttl;
      if (p.life <= 0) { sparks.parts.splice(i, 1); continue; }
      p.x += p.vx * 34 * dt;
      p.y += p.vy * 34 * dt;
      p.vy += 0.9 * dt;                          // 轻微重力，先升后落
      p.rot += p.spin * dt;
      ctx.save();
      ctx.globalAlpha = Math.max(0, Math.min(1, p.life));
      ctx.fillStyle = p.color;
      ctx.translate(p.x, p.y);
      ctx.rotate(p.rot);
      ctx.font = p.size + 'px system-ui,sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(p.ch, 0, 0);
      ctx.restore();
    }
    if (sparks.parts.length) {
      sparks.raf = requestAnimationFrame(sparkTick);
    } else {
      sparks.raf = 0;
      ctx.clearRect(0, 0, window.innerWidth, window.innerHeight);
    }
  }
  function sparksStart() {
    document.addEventListener('pointerdown', function (ev) {
      lastPointer.x = ev.clientX || 0; lastPointer.y = ev.clientY || 0;
    }, true);
    var onType = function (ev) {
      if (!cfg.enabled || !cfg.effects || !cfg.effects.sparks) return;
      var t = ev.target;
      if (!t || !isEditable(t)) {
        // 有些编辑器把焦点放在子节点上，向上找可编辑宿主
        t = t && t.closest ? t.closest('textarea,[contenteditable="true"],[contenteditable=""]') : null;
      }
      if (!t) return;
      if (t.closest && t.closest('#zcode-90sOldschool-ui,#zcode-90sOldschool-zoom')) return;
      ensureSparkCanvas();
      sparkBurst(sparkPoint(t));
    };
    // input 覆盖普通输入；beforeinput/keydown 兜住「自绘编辑器不派发 input」的情况
    document.addEventListener('input', onType, true);
    document.addEventListener('beforeinput', onType, true);
    document.addEventListener('keydown', function (ev) {
      if (!ev.key || ev.key.length !== 1 || ev.ctrlKey || ev.metaKey || ev.altKey) return;
      onType(ev);
    }, true);
  }

  /* ==================================================================
   * 分层可读性遮罩 L1-L4（v0.1.26）
   * ================================================================== */
  var READ_SCENES = {
    off: {},
    hero: {
      l1: { enabled: true, opacity: 30 },
      l2: { enabled: true, edge: 'bottom', strength: 65, size: 55 },
      l3: { enabled: false },
      l4: { enabled: true, white: true }
    },
    nav: {
      l1: { enabled: false },
      l2: { enabled: false },
      l3: { enabled: true, strength: 20, saturate: 150, tint: 'rgba(255,255,255,0.15)' },
      l4: { enabled: true, white: true }
    },
    card: {
      l1: { enabled: false },
      l2: { enabled: false },
      l3: { enabled: true, strength: 20, saturate: 150, tint: 'rgba(255,255,255,0.15)' },
      l4: { enabled: false }
    },
    badge: {
      l1: { enabled: false },
      l2: { enabled: false },
      l3: { enabled: true, strength: 14, saturate: 140, tint: 'rgba(0,0,0,0.45)' },
      l4: { enabled: true, white: true }
    },
    free: {
      l1: { enabled: true, opacity: 20 },
      l2: { enabled: false },
      l3: { enabled: false },
      l4: { enabled: true, white: true }
    }
  };
  function applyReadScene(name) {
    var r = cfg.readability;
    var preset = READ_SCENES[name] || {};
    r.scene = name;
    if (name === 'off') {
      ['l1', 'l2', 'l3', 'l4'].forEach(function (k) { r[k].enabled = false; });
      return;
    }
    ['l1', 'l2', 'l3', 'l4'].forEach(function (k) {
      if (!preset[k]) return;
      Object.keys(preset[k]).forEach(function (f) { r[k][f] = preset[k][f]; });
      if (preset[k].enabled !== undefined) r[k].enabled = preset[k].enabled;
    });
  }
  function readabilityCSS() {
    var r = cfg.readability;
    if (!cfg.enabled || !r || r.scene === 'off') return '';
    if (!r.l1.enabled && !r.l2.enabled && !r.l3.enabled && !r.l4.enabled) return '';
    var css = '';
    if (r.l1.enabled) {
      css += '#zcode-ap-dim{position:fixed;inset:0;z-index:-1;pointer-events:none;background:rgba(0,0,0,' +
        (r.l1.opacity / 100).toFixed(2) + ');}';
    }
    if (r.l2.enabled) {
      var a = Math.max(0, Math.min(1, (r.l2.strength || 65) / 100));
      var mid = (a * 0.5).toFixed(3);
      var size = Math.max(10, Math.min(100, r.l2.size || 55));
      var g;
      if (r.l2.edge === 'top') {
        g = 'linear-gradient(to bottom,rgba(0,0,0,' + a.toFixed(3) + ') 0%,rgba(0,0,0,' + mid + ') 18%,transparent ' + size + '%)';
      } else if (r.l2.edge === 'both') {
        g = 'linear-gradient(to bottom,rgba(0,0,0,' + a.toFixed(3) + ') 0%,transparent ' + (size / 2) +
          '%,transparent ' + (100 - size / 2) + '%,rgba(0,0,0,' + a.toFixed(3) + ') 100%)';
      } else {
        g = 'linear-gradient(to top,rgba(0,0,0,' + a.toFixed(3) + ') 0%,rgba(0,0,0,' + mid + ') 18%,transparent ' + size + '%)';
      }
      css += '#zcode-ap-scrim{position:fixed;inset:0;z-index:-1;pointer-events:none;background:' + g + ';}';
    }
    if (r.l3.enabled) {
      var blur = Math.max(2, Math.min(40, r.l3.strength || 20));
      var sat = Math.max(100, Math.min(220, r.l3.saturate || 150)) / 100;
      var surf = ':is([class*="card"],[class*="popover"],[class*="sidebar"],[class*="nav"],' +
        '[class*="toolbar"],[class*="composer"],[role="dialog"],[role="menu"],[role="tooltip"])';
      css += SEL() + ' ' + surf + '{background-color:' + (r.l3.tint || 'rgba(255,255,255,0.15)') + '!important;' +
        'backdrop-filter:blur(' + blur + 'px) saturate(' + sat.toFixed(2) + ');' +
        '-webkit-backdrop-filter:blur(' + blur + 'px) saturate(' + sat.toFixed(2) + ');}';
    }
    if (r.l4.enabled) {
      var sh = r.l4.shadow || '0 1px 2px rgba(0,0,0,.6), 0 2px 8px rgba(0,0,0,.4)';
      css += SEL() + ' .prose,' + SEL() + ' .prose *{text-shadow:' + sh + '!important;}';
      css += SEL() + ' ' + ALERT_SEL.replace(/,/g, ',' + SEL() + ' ') + '{text-shadow:' + sh + '!important;}';
      var wantWhite;
      if (r.scene === 'free') wantWhite = sampleUnderText() !== 'dark';
      else wantWhite = !!r.l4.white;
      css += SEL() + ' .prose{color:' + (wantWhite ? '#fff' : '#0b0d12') + '!important;}';
    }
    return css;
  }
  var sampleCache = { url: '', canvas: null };
  function bgImageCanvas() {
    if (!bgImageDataUrl) return null;
    if (sampleCache.url === bgImageDataUrl && sampleCache.canvas) return sampleCache.canvas;
    try {
      var img = new Image();
      img.src = bgImageDataUrl;
      var c = document.createElement('canvas');
      c.width = 64; c.height = 64;
      c.getContext('2d').drawImage(img, 0, 0, 64, 64);
      sampleCache = { url: bgImageDataUrl, canvas: c };
      return c;
    } catch (e) { return null; }
  }
  function sampleUnderText() {
    var el = document.querySelector('.prose') || document.querySelector('[class*="message"]');
    var rect = el && el.getBoundingClientRect ? el.getBoundingClientRect() : null;
    var W = window.innerWidth || 1, H = window.innerHeight || 1;
    var rgb = null;
    var c = bgImageCanvas();
    if (c && rect) {
      try {
        var cx = c.getContext('2d');
        var x = Math.max(0, Math.min(63, Math.floor(rect.left / W * 64)));
        var y = Math.max(0, Math.min(63, Math.floor(rect.top / H * 64)));
        var w = Math.max(1, Math.min(64 - x, Math.ceil(rect.width / W * 64)));
        var h = Math.max(1, Math.min(64 - y, Math.ceil(rect.height / H * 64)));
        var d = cx.getImageData(x, y, w, h).data;
        var rr = 0, gg = 0, bb = 0, n = 0;
        for (var i = 0; i < d.length; i += 4) { rr += d[i]; gg += d[i + 1]; bb += d[i + 2]; n++; }
        if (n) rgb = [rr / n, gg / n, bb / n];
      } catch (e) { rgb = null; }
    }
    if (!rgb) rgb = effectiveBgRgb();
    return relLum(rgb[0], rgb[1], rgb[2]) < 0.45 ? 'dark' : 'light';
  }

  /* ==================================================================
   * 浮层（菜单/下拉/弹窗）识别与主题配色（v0.1.27）
   *  - 客户端菜单常是 body 下的 fixed/absolute 浮层，类名与 role 五花八门，
   *    静态选择器覆盖不全 → 运行时按「定位 + z-index + 菜单特征」打 .zcode-ap-pop
   *  - 打标后：底色跟随主题配色（accent 混入）+ 毛玻璃 + 对比度合适的文字色
   *  - 同时放开 overflow，修「子菜单被父层 overflow:hidden 裁掉」
   * ================================================================== */
  function looksLikePopup(el) {
    try {
      var cs = getComputedStyle(el);
      if (cs.position !== 'fixed' && cs.position !== 'absolute') return false;
      var z = parseInt(cs.zIndex, 10);
      if (!(z >= 50)) return false;
      var r = el.getBoundingClientRect ? el.getBoundingClientRect() : null;
      if (r && (r.width < 60 || r.height < 30)) return false;
      return true;
    } catch (e) { return false; }
  }
  function tagFloatingPopovers() {
    if (!cfg.enabled) return;
    var sel = '[role="menu"],[role="listbox"],[role="dialog"],[role="tooltip"],[role="alertdialog"],' +
      '[class*="popover"],[class*="dropdown"],[class*="menu"],[class*="select-content"],[class*="panel"]';
    var list;
    try { list = document.querySelectorAll(sel); } catch (e) { return; }
    for (var i = 0; i < list.length; i++) {
      var el = list[i];
      if (el.closest && el.closest('#zcode-90sOldschool-ui,#zcode-90sOldschool-zoom')) continue;
      if (el.classList.contains('zcode-ap-pop')) continue;
      if (looksLikePopup(el)) el.classList.add('zcode-ap-pop');
    }
  }
  function menuThemeCSS() {
    if (!cfg.enabled) return '';
    var accent = (THEMES[cfg.theme] && THEMES[cfg.theme].accent) || '';
    var css = '';
    // 文字色：按弹层表面色算过对比度的前景色——与「是否开启文字颜色调整」无关，
    // 菜单可读性属于基础能力，始终下发（v0.1.27 修：手动色模式下菜单仍然是白字）
    var pal = autoTextColors();
    var fg = pal ? pal.pop : '';
    css += SEL() + ' .zcode-ap-pop{overflow:visible!important;}' +
      'html.zcode-ap-on .zcode-ap-pop{-webkit-overflow-scrolling:auto;}';
    if (accent) {
      var tint = Math.round(6 + 8 * Math.max(0.15, (cfg.themeIntensity || 60) / 100));
      css += SEL() + ' .zcode-ap-pop{' +
        'background-color:color-mix(in oklab,' + accent + ' ' + tint + '%,var(--color-popover,#ffffff))!important;' +
        'background-image:none!important;' +
        'backdrop-filter:blur(16px) saturate(1.35);-webkit-backdrop-filter:blur(16px) saturate(1.35);' +
        'border:1px solid color-mix(in oklab,' + accent + ' 30%,transparent)!important;' +
        'box-shadow:0 10px 30px -10px color-mix(in oklab,' + accent + ' 45%,transparent)!important;}';
    }
    if (fg) {
      css += SEL() + ' .zcode-ap-pop,' + SEL() + ' .zcode-ap-pop *{color:' + fg + '!important;}';
      css += SEL() + ' .zcode-ap-pop input,' + SEL() + ' .zcode-ap-pop textarea,' +
        SEL() + ' .zcode-ap-pop [contenteditable="true"]{color:var(--color-foreground,canvastext)!important;}';
    }
    return css;
  }

  /* 光标样式（v0.1.24）：文本插入光标颜色 + 鼠标指针形状 */
  var CURSOR_SHAPES = {
    default: '',
    pointer: 'pointer',
    crosshair: 'crosshair',
    text: 'text',
    move: 'move',
    'zoom-in': 'zoom-in',
    'not-allowed': 'not-allowed',
    help: 'help'
  };
  function caretColor() {
    var c = cfg.caretFx || {};
    if (c.color === 'theme') return (THEMES[cfg.theme] && THEMES[cfg.theme].accent) || '#7dd3fc';
    if (c.color && c.color !== 'off') return c.color;
    return '';
  }
  function caretFxCSS() {
    if (!cfg.enabled) return '';
    var c = cfg.caretFx || {};
    var css = '';
    var color = caretColor();
    var INPUTS = ' input,' + SEL() + ' textarea,' +
      SEL() + ' [contenteditable="true"],' + SEL() + ' [contenteditable=""]';
    if (c.mode === 'custom') {
      // 自绘光标时把系统光标藏掉（否则会看到两条）
      css += SEL() + INPUTS + '{caret-color:transparent!important;}';
      css += '#zcode-ap-caret{position:fixed;pointer-events:none;z-index:2147483040;border-radius:1px;' +
        'animation:zapCaretBlink 1.06s steps(1,end) infinite;}';
      css += '@keyframes zapCaretBlink{0%,49%{opacity:1}50%,100%{opacity:0}}';
    } else if (color) {
      css += SEL() + INPUTS + '{caret-color:' + color + '!important;}';
    }
    // 鼠标指针：作用于页面元素，但输入类保持文本光标
    var shape = CURSOR_SHAPES[c.cursor] || '';
    if (shape) {
      css += SEL() + ',' + SEL() + ' *:not(input):not(textarea):not([contenteditable="true"]):not([contenteditable=""])' +
        '{cursor:' + shape + '!important;}';
    }
    return css;
  }

  /* 文字颜色：auto=按背景明暗自动取深/浅；也可手动指定 */
  function relLum(r, g, b) {
    var f = function (c) { c = c / 255; return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4); };
    return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
  }
  function cssAvgRgb(css) {
    var m = (css || '').match(/#([0-9a-f]{6}|[0-9a-f]{3})\b/gi) || [];
    if (!m.length) return null;
    var r = 0, g = 0, b = 0;
    m.forEach(function (h) {
      var x = h.slice(1);
      if (x.length === 3) x = x[0] + x[0] + x[1] + x[1] + x[2] + x[2];
      var n = parseInt(x, 16);
      r += (n >> 16) & 255; g += (n >> 8) & 255; b += n & 255;
    });
    return [r / m.length, g / m.length, b / m.length];
  }
  var bgImageAvg = null;   // 自定义图片的 8x8 采样均值
  function sampleBgImage() {
    bgImageAvg = null;
    if (!bgImageDataUrl) return;
    try {
      var img = new Image();
      img.onload = function () {
        try {
          var c = document.createElement('canvas');
          c.width = 8; c.height = 8;
          var cx = c.getContext('2d');
          cx.drawImage(img, 0, 0, 8, 8);
          var d = cx.getImageData(0, 0, 8, 8).data;
          var r = 0, g = 0, b = 0, n = 0;
          for (var i = 0; i < d.length; i += 4) { r += d[i]; g += d[i + 1]; b += d[i + 2]; n++; }
          bgImageAvg = [r / n, g / n, b / n];
          // 采样完成后再算一次文字颜色（此前按无背景/旧图判定）
          if (cfg.enabled && cfg.textColor && cfg.textColor.enabled && cfg.textColor.auto) {
            try { applyCSS(); } catch (e2) { /* 重建失败保持旧值 */ }
          }
        } catch (e) { bgImageAvg = null; }
      };
      img.src = bgImageDataUrl;
    } catch (e) { bgImageAvg = null; }
  }
  /* ---- 颜色计算工具（v0.1.14 重写自适应逻辑） ---- */
  var colorProbe = null;
  function parseRgbStr(v) {
    if (!v) return null;
    var m = v.match(/^rgba?\(\s*([\d.]+)[,\s]+([\d.]+)[,\s]+([\d.]+)/i);
    if (m) return [+m[1], +m[2], +m[3]];
    m = v.match(/^color\(srgb\s+([\d.]+)\s+([\d.]+)\s+([\d.]+)/i);
    if (m) return [+m[1] * 255, +m[2] * 255, +m[3] * 255];
    return null;
  }
  /* 任意 CSS 颜色 → [r,g,b]：hex 直接解析，其余交给浏览器解析（支持 rgb/hsl/oklch/color-mix…） */
  function toRgb(c) {
    if (!c) return null;
    c = String(c).trim();
    var hex = c.match(/^#([0-9a-f]{3}|[0-9a-f]{6})$/i);
    if (hex) {
      var x = hex[1];
      if (x.length === 3) x = x[0] + x[0] + x[1] + x[1] + x[2] + x[2];
      var n = parseInt(x, 16);
      return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
    }
    var direct = parseRgbStr(c);
    if (direct) return direct;
    try {
      if (!colorProbe) {
        colorProbe = document.createElement('span');
        colorProbe.setAttribute('aria-hidden', 'true');
        colorProbe.style.cssText = 'position:fixed;left:-9999px;top:0;width:1px;height:1px;pointer-events:none;';
        document.body.appendChild(colorProbe);
      }
      colorProbe.style.color = '';
      colorProbe.style.color = c;
      return parseRgbStr(getComputedStyle(colorProbe).color);
    } catch (e) { return null; }
  }
  function mixRGB(a, b, t) {
    t = Math.max(0, Math.min(1, t));
    return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
  }
  function rgbHex(c) {
    return '#' + c.map(function (v) {
      var h = Math.max(0, Math.min(255, Math.round(v))).toString(16);
      return h.length === 1 ? '0' + h : h;
    }).join('');
  }
  function contrastRatio(l1, l2) {
    var a = Math.max(l1, l2), b = Math.min(l1, l2);
    return (a + 0.05) / (b + 0.05);
  }
  /* 实际可见背景色：客户端底色 × 背景层（含不透明度/压暗）× 深度染色 */
  function effectiveBgRgb() {
    var base = toRgb(origTokens && (origTokens['--color-background'] || origTokens['--color-card'])) ||
      toRgb(htmlEl.classList.contains('dark') ? '#141414' : '#fafafa') || [250, 250, 250];
    var b = cfg.background || {};
    var bg = base;
    if (b.enabled) {
      var layer = null;
      if (b.kind === 'image' && bgImageAvg) layer = bgImageAvg;
      else if (b.kind === 'preset' && b.preset !== 'none') layer = cssAvgRgb((BG_PRESETS[b.preset] || {}).css);
      if (layer) {
        var k = 1 - ((b.dim || 0) / 200);   // 与 backgroundCSS 的 brightness 同口径
        var dimmed = [layer[0] * k, layer[1] * k, layer[2] * k];
        bg = mixRGB(base, dimmed, (b.opacity == null ? 90 : b.opacity) / 100);
      }
    }
    if (cfg.themeDeep && THEMES[cfg.theme] && THEMES[cfg.theme].accent) {
      var acc = toRgb(THEMES[cfg.theme].accent);
      if (acc) bg = mixRGB(bg, acc, 0.12 * (cfg.themeIntensity || 60) / 100);
    }
    return bg;
  }
  function bgIsDark() {
    var bg = effectiveBgRgb();
    return relLum(bg[0], bg[1], bg[2]) < 0.35;
  }
  /* 自适应：在浅/深两套文字里选对比较高的；不足 4.5:1 则推向纯白/近黑保证可读 */
  /* ---- HSL 工具：文字色取「界面整体色」的色相，只推亮度满足对比度 ---- */
  function rgbToHsl(r, g, b) {
    r /= 255; g /= 255; b /= 255;
    var mx = Math.max(r, g, b), mn = Math.min(r, g, b);
    var l = (mx + mn) / 2, h = 0, s = 0;
    if (mx !== mn) {
      var d = mx - mn;
      s = l > 0.5 ? d / (2 - mx - mn) : d / (mx + mn);
      if (mx === r) h = ((g - b) / d + (g < b ? 6 : 0)) / 6;
      else if (mx === g) h = ((b - r) / d + 2) / 6;
      else h = ((r - g) / d + 4) / 6;
    }
    return { h: h, s: s, l: l };
  }
  function hslToRgb(h, s, l) {
    h = ((h % 1) + 1) % 1;
    if (s <= 0) { var v = Math.round(l * 255); return [v, v, v]; }
    var q = l < 0.5 ? l * (1 + s) : l + s - l * s;
    var p = 2 * l - q;
    var f = function (t) {
      t = ((t % 1) + 1) % 1;
      if (t < 1 / 6) return p + (q - p) * 6 * t;
      if (t < 1 / 2) return q;
      if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
      return p;
    };
    return [Math.round(f(h + 1 / 3) * 255), Math.round(f(h) * 255), Math.round(f(h - 1 / 3) * 255)];
  }
  /* 界面整体色：可见背景为主体，掺一点主题色——文字带同色系倾向而非纯黑白 */
  function interfaceRgb() {
    var bg = effectiveBgRgb();
    var acc = (THEMES[cfg.theme] && THEMES[cfg.theme].accent) ? toRgb(THEMES[cfg.theme].accent) : null;
    return acc ? mixRGB(bg, acc, 0.16) : bg;
  }
  /* 由界面整体色推导文字色：保留色相、温和饱和，亮度从浅/深两端向极值推进，
   * 直到与可见背景的对比度 ≥ target（默认 4.5）；达不到（极端中灰）则推到纯白/纯黑。 */
  function textFromInterface(bg, tint, target, lightFirst) {
    var Lbg = relLum(bg[0], bg[1], bg[2]);
    var hsl = rgbToHsl(tint[0], tint[1], tint[2]);
    // 低饱和底（近灰）时给一点点色相倾向，避免显得像纯黑/纯白但又不过分
    var sat = Math.max(0.06, Math.min(0.34, hsl.s * 0.55));
    var hue = hsl.h;
    var light = lightFirst;
    var l = light ? 0.96 : 0.12;
    var step = light ? -0.02 : 0.02;
    var best = null, bestC = 0;
    for (var i = 0; i < 46; i++) {
      var rgb = hslToRgb(hue, sat, l);
      var c = contrastRatio(Lbg, relLum(rgb[0], rgb[1], rgb[2]));
      if (c > bestC) { bestC = c; best = rgb; }
      if (c >= target) return { rgb: rgb, contrast: c };
      l += step;
      if (l < -0.02 || l > 1.02) break;
    }
    // 达不到目标：取对比度最高者（通常已接近纯白/纯黑）
    return { rgb: best, contrast: bestC };
  }
  /* 表面实际颜色：把客户端表面 token（popover/card）按背景开启时的混合比例
   * 叠到可见背景上——弹层即使在白底主题里也可能比页面亮，必须单独算文字色 */
  function surfaceRgb(baseBg, tokenKey, minAlpha) {
    var base = toRgb(origTokens && origTokens[tokenKey]);
    if (!base) return baseBg;
    var b = cfg.background || {};
    var op = 1;
    if (b.enabled) op = Math.max(minAlpha, 0.30 + 0.60 * ((b.opacity == null ? 90 : b.opacity) / 100));
    return mixRGB(baseBg, base, Math.min(1, op));
  }
  function pickForSurface(surf, acc, target) {
    var L = relLum(surf[0], surf[1], surf[2]);
    var lightFirst = contrastRatio(L, 1) >= contrastRatio(L, 0);
    var tint = acc ? mixRGB(surf, acc, 0.16) : surf;
    var r = textFromInterface(surf, tint, target, lightFirst);
    return { hex: rgbHex(r.rgb), contrast: +r.contrast.toFixed(2), light: lightFirst };
  }
  function autoTextColors() {
    var bg = effectiveBgRgb();
    var acc = (THEMES[cfg.theme] && THEMES[cfg.theme].accent) ? toRgb(THEMES[cfg.theme].accent) : null;
    var ui = pickForSurface(bg, acc, 4.5);
    var chat = pickForSurface(bg, acc, 5.5);
    if (chat.contrast < 4.5) chat = ui;
    // 弹层/菜单：按自身表面色（不低于 86% 混合）取色，避免「白底白字」
    var popSurf = surfaceRgb(bg, '--color-popover', 0.86);
    var pop = pickForSurface(popSurf, acc, 4.5);
    // 卡片/气泡：表面通常比页面略亮
    var cardSurf = surfaceRgb(bg, '--color-card', 0.55);
    var card = pickForSurface(cardSurf, acc, 4.5);
    return {
      ui: ui.hex, chat: chat.hex, pop: pop.hex, card: card.hex,
      dark: ui.light,
      contrast: ui.contrast, chatContrast: chat.contrast,
      popContrast: pop.contrast, cardContrast: card.contrast,
      bgHex: rgbHex(bg), popHex: rgbHex(popSurf), cardHex: rgbHex(cardSurf)
    };
  }
  function textColorCSS() {
    var t = cfg.textColor;
    if (!cfg.enabled || !t || !t.enabled) return '';
    var ui = t.ui, chat = t.chat, auto = !!t.auto;
    if (auto) {
      var ac = autoTextColors();
      ui = ac.ui; chat = ac.chat;
    }
    var css = '';
    // 输入类元素不参与颜色调整（用户要求：输入框内文字按默认）
    var INPUT_KEEP = 'input,textarea,select,[contenteditable="true"],[contenteditable=""]';
    var POP_SEL = ':is([role="menu"],[role="listbox"],[role="dialog"],[role="tooltip"],' +
      '[class*="popover"],[class*="dropdown"],[class*="submenu"],[class*="select-content"],[class*="context-menu"])';
    if (ui) {
      // 双管齐下：①客户端自身的前景 token（最贴合其组件体系）②全量兜底
      // card/popover 的前景色在下面按各自表面色单独设置（v0.1.21）
      css += SEL() + '{' +
        '--color-foreground:' + ui + '!important;' +
        '--color-muted-foreground:' + ui + '!important;' +
        '--color-secondary-foreground:' + ui + '!important;' +
        '--color-accent-foreground:' + ui + '!important;}';
      css += SEL() + ' *{color:' + ui + '!important;}';
      // 输入类元素还原成客户端「原始」前景色（快照值；取不到回退系统色，不跟随自定义/自适应）
      var keepColor = (origTokens && (origTokens['--color-foreground'] || origTokens['--color-card-foreground'])) || 'canvastext';
      css += SEL() + ' ' + INPUT_KEEP.replace(/,/g, ',' + SEL() + ' ') +
        '{color:' + keepColor + '!important;}';
    }
    if (chat) css += SEL() + ' .prose{color:' + chat + '!important;}';
    // 弹层/菜单按自身表面色取文字色（v0.1.21）：白底弹层上不会再出现白字
    if (auto) {
      var pal = autoTextColors();
      css += SEL() + '{--color-popover-foreground:' + pal.pop + '!important;' +
        '--color-menu-foreground:' + pal.pop + '!important;' +
        '--color-card-foreground:' + pal.card + '!important;}';
      css += SEL() + ' ' + POP_SEL + ',' + SEL() + ' ' + POP_SEL + ' *{color:' + pal.pop + '!important;}';
      css += SEL() + ' ' + POP_SEL + ' ' + INPUT_KEEP.replace(/,/g, ',' + SEL() + ' ' + POP_SEL + ' ') +
        '{color:var(--color-foreground,canvastext)!important;}';
      css += SEL() + ' :is([class*="card"],[class*="bubble"])' + ' *{color:' + pal.card + '!important;}';
    }
    return css;
  }

  function fontCSS() {
    var f = cfg.font || {};
    var css = '';
    var uiStack = fontStackValue(f.ui);
    var monoStack = fontStackValue(f.mono);
    var parts = [];
    if (uiStack) parts.push('--font-sans:' + uiStack + '!important;');
    if (monoStack) parts.push('--font-mono:' + monoStack + '!important;');
    if (f.size && f.size !== 100) parts.push('--ui-font-size:' + (14 * f.size / 100).toFixed(2) + 'px!important;');
    if (parts.length) css += SEL() + '{' + parts.join('') + '}';
    var chatStack = fontStackValue(f.chat);
    if (chatStack) {
      css += SEL() + ' .prose{font-family:' + chatStack + '!important;}';
      // 提示横幅/告警条跟随聊天字体（其内文字常写死 font-family）
      css += SEL() + ' ' + ALERT_SEL.replace(/,/g, ',' + SEL() + ' ') + '{font-family:' + chatStack + '!important;}';
    }
    if (f.lineHeight && f.lineHeight !== 100) css += SEL() + ' .prose{line-height:' + (f.lineHeight / 100).toFixed(2) + '!important;}';
    if (f.radius && f.radius !== 100) {
      var k = f.radius / 100;
      var radii = { '--radius-sm': 0.25, '--radius-md': 0.375, '--radius-lg': 0.5, '--radius-xl': 0.75, '--radius-2xl': 1, '--radius-3xl': 1.5 };
      var rp = [];
      Object.keys(radii).forEach(function (r) { rp.push(r + ':' + (radii[r] * k).toFixed(3) + 'rem!important;'); });
      css += SEL() + '{' + rp.join('') + '}';
    }
    // 输入框字号（大/中/小）
    var ISIZE = { s: 13, m: 15, l: 17 };
    if (f.inputSize && ISIZE[f.inputSize]) {
      var px = ISIZE[f.inputSize];
      var sel = [
        'textarea', '[contenteditable="true"]',
        '[class*="composer"] textarea', '[class*="composer"] [contenteditable="true"]',
        '[class*="chat-input"] textarea', '[class*="prompt"] textarea'
      ].map(function (s) { return SEL() + ' ' + s; }).join(',');
      css += sel + '{font-size:' + px + 'px!important;line-height:1.55!important;}';
    }
    return css;
  }

  /* ==================================================================
   * 放大显示（v0.1.12）：点代码框查看、双击输入框编辑
   *  - 独立 Shadow DOM 宿主，隔离客户端与我们的全局样式（含文字颜色覆盖）
   *  - 编辑器写完回填：React 受控组件需用原型 setter + input 事件
   * ================================================================== */
  var zoomUI = { host: null, root: null, body: null, title: null, src: null, editing: false, isArea: false };
  var ZOOM_CSS = [
    ':host{all:initial;}',
    '.mask{position:fixed;inset:0;z-index:2147483600;display:none;align-items:center;justify-content:center;',
    '  background:rgba(6,8,14,.72);backdrop-filter:blur(10px) saturate(1.4);-webkit-backdrop-filter:blur(10px) saturate(1.4);}',
    '.mask.show{display:flex;}',
    '.box{width:min(80vw,1000px);max-height:80vh;display:flex;flex-direction:column;overflow:hidden;',
    '  background:rgba(18,20,28,.97);border:1px solid rgba(255,255,255,.16);border-radius:14px;',
    '  box-shadow:0 24px 70px rgba(0,0,0,.65),inset 0 1px 0 rgba(255,255,255,.1);color:#e8ecf4;',
    '  font:14px/1.6 "Microsoft YaHei UI","PingFang SC",system-ui,sans-serif;}',
    '.head{display:flex;align-items:center;justify-content:space-between;gap:10px;padding:10px 14px;',
    '  border-bottom:1px solid rgba(255,255,255,.1);font-size:13px;letter-spacing:.4px;}',
    '.acts{display:flex;gap:8px;}',
    'button{all:unset;cursor:pointer;padding:3px 10px;border-radius:8px;font-size:12px;',
    '  border:1px solid rgba(255,255,255,.2);background:rgba(255,255,255,.08);color:#e8ecf4;}',
    'button:hover{background:rgba(255,255,255,.16);}',
    '.body{flex:1;overflow:auto;padding:16px 18px;white-space:pre-wrap;word-break:break-word;font-size:15.5px;line-height:1.7;}',
    '.body.mono{font-family:ui-monospace,Consolas,"Cascadia Mono",monospace;font-size:14.5px;}',
    'textarea{width:100%;min-height:46vh;resize:vertical;border-radius:10px;padding:12px;border:1px solid rgba(255,255,255,.18);',
    '  background:rgba(0,0,0,.35);color:#e8ecf4;font:15.5px/1.7 "Microsoft YaHei UI","PingFang SC",system-ui,sans-serif;outline:none;}'
  ].join('');
  function ensureZoomUI() {
    if (zoomUI.host && zoomUI.host.isConnected) return zoomUI;
    var host = document.createElement('div');
    host.id = 'zcode-90sOldschool-zoom';
    host.setAttribute('aria-hidden', 'true');
    var root = host.attachShadow({ mode: 'open' });
    var st = document.createElement('style');
    st.textContent = ZOOM_CSS;
    root.appendChild(st);
    var mask = document.createElement('div');
    mask.className = 'mask';
    var box = document.createElement('div');
    box.className = 'box';
    var head = document.createElement('div');
    head.className = 'head';
    var title = document.createElement('span');
    title.textContent = '放大显示';
    var acts = document.createElement('div');
    acts.className = 'acts';
    var saveBtn = document.createElement('button');
    saveBtn.textContent = '保存并关闭';
    saveBtn.style.display = 'none';
    var closeBtn = document.createElement('button');
    closeBtn.textContent = '✕';
    acts.appendChild(saveBtn); acts.appendChild(closeBtn);
    head.appendChild(title); head.appendChild(acts);
    var body = document.createElement('div');
    body.className = 'body';
    box.appendChild(head); box.appendChild(body);
    mask.appendChild(box);
    root.appendChild(mask);
    document.body.appendChild(host);

    closeBtn.addEventListener('click', closeZoom);
    saveBtn.addEventListener('click', function () { zoomCommit(); closeZoom(); });
    mask.addEventListener('click', function (ev) {
      if (ev.target !== mask) return;
      // 单击打开后紧接的双击第二下会落到遮罩上——此窗口内不关，避免「点了没反应」
      if (Date.now() - (zoomUI.openedAt || 0) < 350) return;
      zoomCommit(); closeZoom();
    });
    document.addEventListener('keydown', function (ev) {
      if (ev.key === 'Escape' && mask.classList.contains('show')) {
        zoomCommit(); closeZoom(); ev.stopPropagation();
      }
    }, true);
    zoomUI = { host: host, root: root, mask: mask, body: body, title: title, saveBtn: saveBtn,
      src: null, editing: false, isArea: false };
    return zoomUI;
  }
  function openZoom(text, opts) {
    opts = opts || {};
    var z = ensureZoomUI();
    zoomUI.openedAt = Date.now();
    z.body.innerHTML = '';
    z.body.className = 'body' + (opts.mono ? ' mono' : '');
    z.title.textContent = opts.title || '放大显示';
    z.src = opts.source || null;
    z.editing = !!opts.editing;
    z.isArea = !!opts.isArea;
    z.saveBtn.style.display = z.editing ? '' : 'none';
    if (z.editing) {
      var ta = document.createElement('textarea');
      ta.value = text || '';
      z.body.appendChild(ta);
      z.body.style.padding = '14px';
      setTimeout(function () { try { ta.focus(); } catch (e) { /* 焦点失败忽略 */ } }, 30);
    } else {
      z.body.textContent = text || '';
      z.body.style.padding = '16px 18px';
    }
    z.mask.classList.add('show');
  }
  function closeZoom() {
    if (zoomUI.mask) zoomUI.mask.classList.remove('show');
    zoomUI.src = null;
    zoomUI.editing = false;
  }
  /* 回填输入框（v0.1.20 重写）：
   *  - textarea/input：原型 value setter + input/change（React 受控组件采信）
   *  - contenteditable / 富文本编辑器：必须走浏览器编辑管线（全选 + execCommand
   *    insertText），否则编辑器会用自身 doc 状态覆盖掉我们写的 textContent
   *    （这正是「关闭保存后内容没进去」的原因）
   *  - 源节点被 React 重渲染换了：按输入区容器重新定位当前编辑器
   *  - 全部失败：复制到剪贴板并提示，至少不丢内容
   */
  function zoomFindLiveEditor(el) {
    if (el && el.isConnected !== false) return el;
    var wrap = null;
    try {
      wrap = document.querySelector('[class*="composer" i],[class*="input-box" i],[class*="chat-input" i],[class*="prompt" i]');
    } catch (e) { wrap = null; }
    var cand = wrap && wrap.querySelector ? wrap.querySelector('textarea,[contenteditable="true"],[contenteditable=""]') : null;
    return cand || el;
  }
  function zoomWriteArea(el, val) {
    try {
      var proto = (el.tagName === 'INPUT' ? window.HTMLInputElement : window.HTMLTextAreaElement);
      var desc = proto && proto.prototype && Object.getOwnPropertyDescriptor(proto.prototype, 'value');
      if (desc && desc.set) desc.set.call(el, val); else el.value = val;
      el.dispatchEvent(new Event('input', { bubbles: true }));
      el.dispatchEvent(new Event('change', { bubbles: true }));
      return el.value === val;
    } catch (e) { return false; }
  }
  function zoomWriteEditable(el, val) {
    try { el.focus(); } catch (e) { /* 焦点失败仍继续 */ }
    var ok = false;
    try {
      var sel = window.getSelection();
      var range = document.createRange();
      range.selectNodeContents(el);
      if (sel) { sel.removeAllRanges(); sel.addRange(range); }
      ok = document.execCommand('insertText', false, val);
    } catch (e) { ok = false; }
    var now = '';
    try { now = el.textContent || ''; } catch (e2) { now = ''; }
    if (!ok || now !== val) {
      // 编辑管线不接受时退回直接写入（简单 contenteditable 仍可用）
      try {
        el.textContent = val;
        el.dispatchEvent(new Event('input', { bubbles: true }));
      } catch (e3) { /* 写入失败走剪贴板兜底 */ }
    }
    try { return (el.textContent || '') === val; } catch (e4) { return false; }
  }
  function zoomCommit() {
    if (!zoomUI.editing || !zoomUI.src) return;
    var ta = zoomUI.root.querySelector('textarea');
    if (!ta) return;
    var val = ta.value;
    var el = zoomFindLiveEditor(zoomUI.src);
    if (!el) return;
    var wrote = false;
    try {
      var tag = (el.tagName || '').toUpperCase();
      if (tag === 'TEXTAREA' || tag === 'INPUT') {
        wrote = zoomWriteArea(el, val);
      } else if (el.isContentEditable || (el.getAttribute && el.getAttribute('contenteditable') !== null)) {
        wrote = zoomWriteEditable(el, val);
      }
    } catch (e) { wrote = false; }
    if (!wrote) {
      try {
        if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(val);
      } catch (e) { /* 剪贴板不可用则仅提示 */ }
      try { toast('未能写入输入框，内容已复制到剪贴板'); } catch (e2) { /* toast 不可用忽略 */ }
    }
  }
  function menuTagStart() {
    ['pointerdown', 'click', 'keydown', 'focusin'].forEach(function (evt) {
      document.addEventListener(evt, function () {
        setTimeout(tagFloatingPopovers, 30);
      }, true);
    });
  }
  function zoomStart() {
    document.addEventListener('click', function (ev) {
      if (!cfg.enabled || !cfg.zoom || !cfg.zoom.enabled) return;
      var t = ev.target;
      if (!t || !t.closest) return;
      if (t.closest('#zcode-90sOldschool-ui,#zcode-90sOldschool-zoom')) return;
      var blk = t.closest('pre, code');
      if (!blk) return;
      // 拖选文字时不弹（复制代码的常见操作）
      try {
        var sel = window.getSelection();
        if (sel && !sel.isCollapsed) return;
      } catch (e) { /* 取不到选区就当未选中 */ }
      var txt = blk.textContent || '';
      if (!txt.trim()) return;
      openZoom(txt, { title: '代码/文本（点击空白或 Esc 关闭）', mono: blk.tagName === 'PRE' });
    }, true);
    // 双击：
    //  - 输入框 → 放大编辑（单击保持正常输入，不干扰光标与发送）
    //  - 代码块 / 文字块（段落·列表·标题·引用·表格单元·整条消息）→ 放大查看（v0.1.18）
    document.addEventListener('dblclick', function (ev) {
      if (!cfg.enabled || !cfg.zoom || !cfg.zoom.enabled) return;
      var t = ev.target;
      if (!t || !t.closest) return;
      if (t.closest('#zcode-90sOldschool-ui,#zcode-90sOldschool-zoom')) return;
      var editEl = t.closest('textarea, [contenteditable="true"]');
      if (editEl) {
        openZoom(editEl.tagName === 'TEXTAREA' ? editEl.value : (editEl.textContent || ''), {
          title: '放大编辑（Esc 关闭并保存）', editing: true,
          isArea: editEl.tagName === 'TEXTAREA', source: editEl
        });
        return;
      }
      var blk = zoomBlockOf(t);
      if (!blk) return;
      var txt = blk.textContent || '';
      if (!txt.trim()) return;
      var isCode = blk.tagName === 'PRE' || blk.tagName === 'CODE' ||
        !!(blk.querySelector && blk.querySelector('pre, code'));
      openZoom(txt, {
        title: (isCode ? '代码/文本卡片' : '文字块') + '（点击空白或 Esc 关闭）',
        mono: isCode
      });
    }, true);
  }
  /* 双击放大的目标：优先最近的块级元素；否则退到整条消息容器 */
  var ZOOM_BLOCK = 'pre,code,p,li,h1,h2,h3,h4,h5,h6,blockquote,td,th,dt,dd,summary';
  /* 代码块/文本卡片的外层容器（带语言标题栏与复制/下载按钮的那种，v0.1.19） */
  var ZOOM_CARD = '[class*="code-block"],[class*="codeblock"],[class*="code-card"],[class*="code-wrapper"],' +
    '[class*="markdown-code"],[class*="file-card"],[class*="file-preview"],[class*="attachment"]';
  var ZOOM_ZONE = '.prose,[class*="prose"],[class*="markdown"],[class*="message"],[class*="bubble"],[class*="assistant"],[class*="chat-item"]';
  function zoomBlockOf(t) {
    var blk = t.closest(ZOOM_BLOCK);
    if (blk && blk.tagName === 'CODE' && blk.parentElement && blk.parentElement.tagName === 'PRE') {
      return blk.parentElement;   // 内层 code → 外层 pre（保留整段与换行）
    }
    // 卡片容器优先于普通块：点标题栏/按钮区/内边距也能放大。
    // 标题栏自身也可能带 code-block 类，需向上爬到「真正含 pre/code」的那层
    var card = t.closest(ZOOM_CARD), guard = 0, first = null;
    while (card && guard++ < 6) {
      var inner = card.querySelector ? card.querySelector('pre, code') : null;
      if (inner) return inner;
      if (!first) first = card;
      var up = card.parentElement || card.__parent || null;
      card = up && up.closest ? up.closest(ZOOM_CARD) : null;
    }
    if (first) return first;
    if (blk) return blk;
    return t.closest(ZOOM_ZONE);
  }

  function fontStackValue(key) {
    if (!key) return null;
    if (key.indexOf('zap:') === 0) {
      var fam = 'ZAP_' + key.slice(4).replace(/[^0-9A-Za-z\u4e00-\u9fff]+/g, '_');
      return '"' + fam + '",sans-serif';
    }
    var s = FONT_STACKS[key];
    return s ? s.stack : null;
  }

  function customFontCSS() {
    var css = '';
    customFonts.forEach(function (f) {
      var fam = 'ZAP_' + f.name.replace(/[^0-9A-Za-z\u4e00-\u9fff]+/g, '_');
      css += '@font-face{font-family:"' + fam + '";src:url(' + JSON.stringify(f.dataUrl) + ') format("' + (f.format || 'truetype') + '");font-display:swap;}';
    });
    // 毛体快捷选项：若用户装了名含“毛/书法/mao”的自定义字体，挂到 ZAP_MAO
    var mao = customFonts.find(function (f) { return /毛|mao|书法|calligra/i.test(f.name); });
    if (mao) {
      css += '@font-face{font-family:"ZAP_MAO";src:url(' + JSON.stringify(mao.dataUrl) + ') format("' + (mao.format || 'truetype') + '");font-display:swap;}';
    }
    return css;
  }

  function buildAllCSS() {
    return [
      '/* zcode-90sOldschool ' + VERSION + ' */',
      customFontCSS(),
      cfg.enabled ? themeCSS() : '',
      cfg.enabled ? breathCSS() : '',
      cfg.enabled ? neonSendCSS() : '',
      cfg.enabled ? composerFlatCSS() : '',
      cfg.enabled ? composerBgCSS() : '',
      cfg.enabled ? caretFxCSS() : '',
      cfg.enabled ? readabilityCSS() : '',
      cfg.enabled ? menuThemeCSS() : '',
      cfg.enabled ? textColorCSS() : '',
      cfg.enabled ? backgroundCSS() : '',
      cfg.enabled ? glassCSS() : '',
      cfg.enabled ? fontCSS() : ''
    ].join('\n');
  }

  var styleEl = null;
  function applyCSS() {
    if (!styleEl) {
      styleEl = document.createElement('style');
      styleEl.id = 'zcode-90sOldschool-style';
      document.head.appendChild(styleEl);
    }
    // 先同步 html 功能类与强制暗色，再生成 CSS——否则自适应的“背景明暗”判定会用到旧状态
    htmlEl.classList.toggle(PREFIX, !!cfg.enabled);
    htmlEl.classList.toggle('zcode-ap-bg', !!(cfg.enabled && cfg.background && cfg.background.enabled));
    htmlEl.classList.toggle('zcode-ap-glass', !!(cfg.enabled && cfg.glass && cfg.glass.mode !== 'none'));
    applyForceDark();
    htmlEl.classList.toggle('zcode-ap-breathe', breathEnabled());
    styleEl.textContent = buildAllCSS();
    syncBreath();
  }

  /* 暗色主题：给 html 强制挂 .dark（复用客户端自带的深色变量盘）。
   * 开启时记下客户端原本是否深色，关闭时按原样还原；客户端自身切主题会摘掉
   * .dark，用 2s 轻量重断言兜底（只在开启期间生效）。 */
  var darkWasOn = null;
  function applyForceDark() {
    var on = !!(cfg.enabled && cfg.forceDark);
    if (on) {
      if (darkWasOn === null) darkWasOn = htmlEl.classList.contains('dark');
      htmlEl.classList.add('dark');
    } else if (darkWasOn !== null) {
      if (!darkWasOn) htmlEl.classList.remove('dark');
      darkWasOn = null;
    }
  }

  /* ==================================================================
   * 背景图层
   * ================================================================== */
  var bgLayer = null;
  var dimLayer = null, scrimLayer = null;
  function ensureReadabilityLayers() {
    if (!dimLayer || !dimLayer.isConnected) {
      dimLayer = document.createElement('div');
      dimLayer.id = 'zcode-ap-dim';
      dimLayer.setAttribute('aria-hidden', 'true');
      document.body.appendChild(dimLayer);
    }
    if (!scrimLayer || !scrimLayer.isConnected) {
      scrimLayer = document.createElement('div');
      scrimLayer.id = 'zcode-ap-scrim';
      scrimLayer.setAttribute('aria-hidden', 'true');
      document.body.appendChild(scrimLayer);
    }
  }
  function ensureBgLayer() {
    if (bgLayer && bgLayer.isConnected) return;
    bgLayer = document.createElement('div');
    bgLayer.id = 'zcode-ap-bg';
    bgLayer.setAttribute('aria-hidden', 'true');
    document.body.insertBefore(bgLayer, document.body.firstChild);
  }

  /* 呼吸灯层 + 状态同步（html 类、层显示、悬浮球发光色） */
  var breathLayer = null;
  function ensureBreathLayer() {
    if (breathLayer && breathLayer.isConnected) return breathLayer;
    breathLayer = document.createElement('div');
    breathLayer.id = 'zcode-ap-breath';
    breathLayer.setAttribute('aria-hidden', 'true');
    document.body.appendChild(breathLayer);
    return breathLayer;
  }
  function syncBreath() {
    var on = breathEnabled();
    if (on) {
      var el = ensureBreathLayer();
      el.style.display = '';
    } else if (breathLayer) {
      breathLayer.style.display = 'none';
    }
    htmlEl.classList.toggle('zcode-ap-breathe', on);
    if (ui.orb) {
      ui.orb.classList.toggle('breathe', on);
      if (on) { try { ui.orb.style.setProperty('--zap-glow', THEMES[cfg.theme].accent); } catch (e) {} }
    }
  }

  /* ==================================================================
   * 雨 / 雪 动效（canvas 覆盖层）
   * ================================================================== */
  var fx = {
    canvas: null, ctx: null, raf: 0, running: false,
    drops: [], flakes: [], stars: [], meteor: null, meteorNext: 5, leafs: [],
    lastT: 0, flashT: 0, w: 0, h: 0, dpr: 1
  };
  function fxResize() {
    if (!fx.canvas) return;
    fx.dpr = Math.min(2, window.devicePixelRatio || 1);
    fx.w = window.innerWidth; fx.h = window.innerHeight;
    fx.canvas.width = Math.round(fx.w * fx.dpr);
    fx.canvas.height = Math.round(fx.h * fx.dpr);
    fx.canvas.style.width = fx.w + 'px';
    fx.canvas.style.height = fx.h + 'px';
  }
  function ensureFxCanvas() {
    if (fx.canvas && fx.canvas.isConnected) return;
    fx.canvas = document.createElement('canvas');
    fx.canvas.id = 'zcode-ap-fx';
    Object.assign(fx.canvas.style, {
      position: 'fixed', inset: '0', zIndex: '2147483000', pointerEvents: 'none', display: 'none'
    });
    document.body.appendChild(fx.canvas);
    fx.ctx = fx.canvas.getContext('2d');
    window.addEventListener('resize', fxResize);
    fxResize();
  }
  var reduceMotion = false;
  try { reduceMotion = matchMedia('(prefers-reduced-motion: reduce)').matches; } catch (e) {}

  function initDrops() {
    var e = cfg.effects;
    var n = Math.round(e.rainDensity / 100 * 220);
    fx.drops = [];
    for (var i = 0; i < n; i++) {
      fx.drops.push({
        x: Math.random() * (fx.w + 200) - 100,
        y: Math.random() * fx.h,
        len: 12 + Math.random() * 14,
        v: 620 + Math.random() * 480,
        o: 0.25 + Math.random() * 0.35
      });
    }
  }
  function initFlakes() {
    var e = cfg.effects;
    var n = Math.round(e.snowDensity / 100 * 160);
    fx.flakes = [];
    for (var i = 0; i < n; i++) {
      fx.flakes.push({
        x: Math.random() * fx.w, y: Math.random() * fx.h,
        r: 1 + Math.random() * 2.6,
        v: 28 + Math.random() * 55,
        sway: Math.random() * Math.PI * 2,
        swaySpeed: 0.4 + Math.random() * 1.1,
        o: 0.5 + Math.random() * 0.45
      });
    }
  }
  function initStars() {
    var e = cfg.effects;
    var n = Math.round((e.starDensity || 40) / 100 * 200);
    fx.stars = [];
    for (var i = 0; i < n; i++) {
      fx.stars.push({
        x: Math.random() * fx.w,
        // 上密下稀（天穹感）：y 用 pow 分布把星星推向屏幕上方
        y: fx.h * Math.pow(Math.random(), 2.2),
        r: 0.4 + Math.random() * 1.3,          // 小星为主，少量亮星
        phase: Math.random() * Math.PI * 2,
        spd: 0.5 + Math.random() * 1.6,        // 闪烁角速度
        warm: Math.random() < 0.3              // 三成暖色星
      });
    }
    fx.meteor = null;
    fx.meteorNext = 2 + Math.random() * 5;
  }
  var LEAF_COLORS = ['#d97706', '#dc2626', '#ca8a04', '#b45309', '#eab308', '#9a3412'];
  function initLeafs() {
    var e = cfg.effects;
    var n = Math.round((e.leafDensity || 40) / 100 * 90);
    fx.leafs = [];
    for (var i = 0; i < n; i++) {
      fx.leafs.push({
        x: Math.random() * fx.w, y: Math.random() * fx.h,
        r: 4 + Math.random() * 5,
        c: LEAF_COLORS[i % LEAF_COLORS.length],
        rot: Math.random() * Math.PI * 2,
        rotSpd: (Math.random() - 0.5) * 4,
        v: 26 + Math.random() * 40,
        sway: Math.random() * Math.PI * 2,
        swaySpd: 0.8 + Math.random() * 1.4
      });
    }
  }
  function fxTick(t) {
    if (!fx.running) return;
    var dt = Math.min(0.05, (t - fx.lastT) / 1000 || 0.016);
    fx.lastT = t;
    var ctx = fx.ctx, e = cfg.effects;
    ctx.setTransform(fx.dpr, 0, 0, fx.dpr, 0, 0);
    ctx.clearRect(0, 0, fx.w, fx.h);
    var wind = (e.wind || 0) * 2.2; // -100..100 → 像素/秒横向

    if (e.rain) {
      ctx.lineCap = 'round';
      ctx.strokeStyle = 'rgba(160,190,230,1)';
      for (var i = 0; i < fx.drops.length; i++) {
        var d = fx.drops[i];
        d.x += wind * dt; d.y += d.v * dt;
        if (d.y > fx.h + 30) { d.y = -30; d.x = Math.random() * (fx.w + 200) - 100; }
        if (d.x > fx.w + 60) d.x = -60; else if (d.x < -80) d.x = fx.w + 60;
        ctx.globalAlpha = d.o;
        ctx.beginPath();
        ctx.moveTo(d.x, d.y);
        ctx.lineTo(d.x - wind * 0.02, d.y - d.len);
        ctx.lineWidth = 1.1;
        ctx.stroke();
      }
      ctx.globalAlpha = 1;
      if (e.thunder) {
        fx.flashT -= dt;
        if (fx.flashT <= -8 && Math.random() < 0.0022) fx.flashT = 0.28 + Math.random() * 0.2;
        if (fx.flashT > 0) {
          ctx.fillStyle = 'rgba(220,230,255,' + (fx.flashT * 0.55).toFixed(3) + ')';
          ctx.fillRect(0, 0, fx.w, fx.h);
        }
      }
    }
    if (e.snow) {
      ctx.fillStyle = '#ffffff';
      for (var j = 0; j < fx.flakes.length; j++) {
        var f = fx.flakes[j];
        f.sway += f.swaySpeed * dt;
        f.y += f.v * dt;
        f.x += Math.sin(f.sway) * 18 * dt + wind * 0.35 * dt;
        if (f.y > fx.h + 8) { f.y = -8; f.x = Math.random() * fx.w; }
        if (f.x > fx.w + 10) f.x = -10; else if (f.x < -12) f.x = fx.w + 10;
        ctx.globalAlpha = f.o;
        ctx.beginPath();
        ctx.arc(f.x, f.y, f.r, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.globalAlpha = 1;
    }
    if (e.stars) {
      for (var k = 0; k < fx.stars.length; k++) {
        var st = fx.stars[k];
        st.phase += st.spd * dt;
        var tw = Math.abs(Math.sin(st.phase));       // 0..1 闪烁
        var a = 0.12 + 0.8 * tw * tw;                // 平方压低暗段，亮起来更「眨眼」
        ctx.globalAlpha = a;
        ctx.fillStyle = st.warm ? '#ffe9c4' : '#eaf3ff';
        ctx.beginPath();
        ctx.arc(st.x, st.y, st.r, 0, Math.PI * 2);
        ctx.fill();
        if (st.r > 1.25) {                           // 亮星带十字光芒
          ctx.globalAlpha = a * 0.5;
          var ray = st.r * 3.2;
          ctx.strokeStyle = st.warm ? '#ffe9c4' : '#eaf3ff';
          ctx.lineWidth = 0.7;
          ctx.beginPath();
          ctx.moveTo(st.x - ray, st.y); ctx.lineTo(st.x + ray, st.y);
          ctx.moveTo(st.x, st.y - ray); ctx.lineTo(st.x, st.y + ray);
          ctx.stroke();
        }
      }
      ctx.globalAlpha = 1;
      // 偶发流星：斜划的渐隐尾迹
      if (e.meteor !== false) {
        if (!fx.meteor) {
          fx.meteorNext -= dt;
          if (fx.meteorNext <= 0) {
            fx.meteor = {
              x: fx.w * (0.25 + Math.random() * 0.75), y: -10 - Math.random() * fx.h * 0.25,
              vx: -(260 + Math.random() * 220), vy: 150 + Math.random() * 110,
              life: 1.05, maxLife: 1.05
            };
            fx.meteorNext = 6 + Math.random() * 9;
          }
        } else {
          var m = fx.meteor;
          m.x += m.vx * dt; m.y += m.vy * dt; m.life -= dt;
          if (m.life <= 0 || m.y > fx.h + 40 || m.x < -80) fx.meteor = null;
          else {
            var fade = Math.min(1, m.life / m.maxLife * 1.6);
            var tail = 0.13;                          // 尾迹时长（秒）
            var tx = m.x - m.vx * tail, ty = m.y - m.vy * tail;
            var grad = ctx.createLinearGradient(m.x, m.y, tx, ty);
            grad.addColorStop(0, 'rgba(255,255,255,' + (0.9 * fade).toFixed(3) + ')');
            grad.addColorStop(1, 'rgba(255,255,255,0)');
            ctx.strokeStyle = grad;
            ctx.lineWidth = 2;
            ctx.lineCap = 'round';
            ctx.beginPath();
            ctx.moveTo(m.x, m.y);
            ctx.lineTo(tx, ty);
            ctx.stroke();
          }
        }
      }
    }
    if (e.leaf) {
      // 风吹落叶：旋转椭圆叶片，横向受风与自身摆动共同驱动
      for (var li = 0; li < fx.leafs.length; li++) {
        var lf = fx.leafs[li];
        lf.sway += lf.swaySpd * dt;
        lf.rot += lf.rotSpd * dt;
        lf.y += lf.v * dt;
        lf.x += Math.sin(lf.sway) * 26 * dt + (wind * 0.6 + Math.sin(lf.sway * 0.5) * 8) * dt;
        if (lf.y > fx.h + 14) { lf.y = -14; lf.x = Math.random() * fx.w; }
        if (lf.x > fx.w + 16) lf.x = -16; else if (lf.x < -18) lf.x = fx.w + 16;
        ctx.save();
        ctx.translate(lf.x, lf.y);
        ctx.rotate(lf.rot);
        ctx.globalAlpha = 0.85;
        ctx.fillStyle = lf.c;
        ctx.beginPath();
        ctx.ellipse(0, 0, lf.r, lf.r * 0.55, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
      }
      ctx.globalAlpha = 1;
    }
    fx.raf = requestAnimationFrame(fxTick);
  }
  function fxApply() {
    try {
      var e = cfg.effects;
      var any = !!(cfg.enabled && (e.rain || e.snow || e.stars || e.leaf) && !reduceMotion);
      ensureFxCanvas();
      if (!any) {
        fx.running = false;
        cancelAnimationFrame(fx.raf);
        fx.canvas.style.display = 'none';
        return;
      }
      fx.canvas.style.display = 'block';
      if (e.rain && fx.drops.length === 0) initDrops();
      if (!e.rain) fx.drops = [];
      if (e.snow && fx.flakes.length === 0) initFlakes();
      if (!e.snow) fx.flakes = [];
      if (e.stars && fx.stars.length === 0) initStars();
      if (!e.stars) { fx.stars = []; fx.meteor = null; }
      if (e.leaf && fx.leafs.length === 0) initLeafs();
      if (!e.leaf) fx.leafs = [];
      if (!fx.running) {
        fx.running = true;
        fx.lastT = performance.now();
        fx.raf = requestAnimationFrame(fxTick);
      }
    } catch (e) { warn('动效异常', e); }
  }
  document.addEventListener('visibilitychange', function () {
    if (document.hidden) { fx.running = false; cancelAnimationFrame(fx.raf); }
    else fxApply();
  });
  // 暗色主题重断言（客户端自身切主题会摘 .dark，开启期间每 2s 补挂）
  setInterval(function () {
    if (cfg.enabled && cfg.forceDark && !htmlEl.classList.contains('dark')) {
      htmlEl.classList.add('dark');
    }
  }, 2000);

  /* ==================================================================
   * 联动本地天气（可选联网功能，默认关闭；引擎其余部分零网络）
   *  流程：geolocation 取坐标 → https://api.open-meteo.com 免费无鉴权实况
   *  （只传经纬度，不传任何其他数据）→ 按 weather_code 映射雨/雪/风/夜星，
   *  每 30 分钟刷新。失败静默（面板 hint 可见原因），绝不弹窗。
   * ================================================================== */
  var WEATHER_URL_HOST = 'api.open-meteo.com';
  var weather = { timer: 0, busy: false, note: '', code: -1, at: 0 };
  function weatherApply(code, windMs, isDay) {
    code = code | 0;
    var e = cfg.effects;
    e.rain = false; e.snow = false; e.thunder = false;
    e.stars = isDay === 0 && code <= 2;   // 夜间晴/少云 → 星空
    if ((code >= 51 && code <= 67) || (code >= 80 && code <= 82)) {
      e.rain = true;
      e.rainDensity = code >= 95 ? 80 : (code >= 80 ? 70 : (code >= 61 ? 55 : 30));
      if (code >= 95) e.thunder = true;
    } else if ((code >= 71 && code <= 77) || code === 85 || code === 86) {
      e.snow = true;
      e.snowDensity = code >= 75 ? 65 : 45;
    }
    if (typeof windMs === 'number' && isFinite(windMs)) {
      e.wind = Math.max(-100, Math.min(100, Math.round(windMs * 6)));
    }
  }
  function weatherFetch() {
    if (weather.busy) return;
    weather.busy = true;
    Promise.resolve().then(function () {
      if (!navigator.geolocation) throw new Error('客户端无定位能力');
      return new Promise(function (res, rej) {
        navigator.geolocation.getCurrentPosition(res, rej, {
          timeout: 8000, maximumAge: 10 * 60 * 1000
        });
      });
    }).then(function (pos) {
      // 仅允许 https + 固定公网主机（拒绝任何本地/私网目标）
      var url = 'https://' + WEATHER_URL_HOST + '/v1/forecast?latitude=' +
        pos.coords.latitude.toFixed(3) + '&longitude=' + pos.coords.longitude.toFixed(3) +
        '&current=weather_code,wind_speed_10m,is_day&wind_speed_unit=ms';
      var u;
      try { u = new URL(url); } catch (e) { throw new Error('URL 非法'); }
      if (u.protocol !== 'https:' || u.hostname !== WEATHER_URL_HOST) {
        throw new Error('目标主机校验失败');
      }
      return fetch(url).then(function (r) {
        if (!r.ok) throw new Error('HTTP ' + r.status);
        return r.json();
      });
    }).then(function (j) {
      var c = (j && j.current) || {};
      weatherApply(c.weather_code, c.wind_speed_10m, c.is_day);
      weather.code = c.weather_code | 0;
      weather.at = Date.now();
      weather.note = '';
      refresh();
    }).catch(function (e) {
      weather.note = (e && e.message) || '获取失败';
    }).then(function () { weather.busy = false; });
  }
  function weatherStartStop() {
    if (weather.timer) { clearInterval(weather.timer); weather.timer = 0; }
    if (!(cfg.enabled && cfg.weather && cfg.weather.link)) return;
    weatherFetch();
    weather.timer = setInterval(weatherFetch, 30 * 60 * 1000);
  }

  /* ==================================================================
   * 模型速度（TPS）与 Token 统计 —— v0.1.5 事件流重写
   * 主数据源：客户端主进程经 window.postMessage 转交渲染层的 ServicePort
   *   （MessagePort）事件流，usage.delta 带真实 outputTokens/inputTokens/
   *   cacheReadTokens。算法口径对齐社区方案 c80361619/zcode-toolkit 的
   *   zcode-tps.js。端口接管认两种格式：旧版（≤3.11.x）data 为字符串
   *   "zcode:service-port"，3.12.2+ 为对象 {type:"zcode:service-port"|
   *   "zcode:scoped-service-port"}；拿 e.ports[0] 后只 addEventListener，
   *   绝不调用 port.start()——start 会让消息只派发给启用瞬间的监听器，
   *   吃掉客户端自身的 Initialize 握手，直接卡死启动（zcode-tps.js 实测）。
   * TPS 规则（zcode-tps.js 同款）：
   *   - 流式 = 4 秒滑动窗口差分：窗口内 ≥2 个采样且 dt≥1s 才更新，
   *     工具执行等静默期保持最近值（stream.chunk 作心跳采样维持时间轴）；
   *   - 结束 = out / decode，decode 优先 turnHeader.activeMs，否则
   *     lastUsageAt − firstChunkAt，>500ms 才算；
   *   - 首字延迟 = firstChunkAt（兜底行事件 createdAt）− startedAt；
   *   - 内容估算 estTok：CJK（charCode>0x2e7f）1 字/token，其余 4 字符/token。
   * 兜底：8s 内未接管到端口（客户端版本变化）时启用 DOM 观测估算——
   *   只统计字符节点增量（characterData 差分 + 新增文本节点），不再把整块
   *   重挂载的既有正文计入（React 流式 markdown 重排会重复计，v0.1.4 及
   *   之前把它计入且用「全量÷极小时间窗」，曾致 TPS 虚高上万 tok/s），
   *   TPS 同样按 4 秒滑动窗口差分计。
   * ================================================================== */
  var tps = {
    portHooked: false, domMode: false, domStarted: false, handoffSeen: 0,
    turns: new Map(), rowTurn: new Map(), respTurn: new Map(), scidTurn: new Map(),
    sess: { out: 0, in: 0, cache: 0, turns: 0, decodeMs: 0, decOut: 0, list: [] },
    last: { tps: 0, ttft: 0, out: 0 },
    diag: { frames: 0, rows: 0, usage: 0, chunks: 0, badFrames: 0, otherFrames: 0,
      lastFrameAt: 0, lastFrameKeys: '', lastKind: '' },
    dom: { active: false, t0: 0, firstTok: 0, lastMut: 0, tok: 0, win: [], lastTps: 0 }
  };
  function tpsEstTok(s) {
    if (!s) return 0;
    var n = 0;
    for (var i = 0; i < s.length; i++) n += s.charCodeAt(i) > 0x2e7f ? 1 : 0.25;
    return n;
  }
  function tpsGet(id) {
    var t = tps.turns.get(id);
    if (!t) {
      t = { id: id, startedAt: 0, endedAt: 0, modelDurationMs: 0, live: false,
        outputTokens: 0, inputTokens: 0, cacheReadTokens: 0, counted: false, label: '',
        textTok: 0, win: [], firstChunkAt: 0, rowFirstAt: 0, lastUsageAt: 0,
        streaming: false, lastTps: 0 };
      tps.turns.set(id, t);
      if (tps.turns.size > 400) {   // 长会话防膨胀：只留最近 400 个 turn
        var it = tps.turns.keys();
        for (var k = 0; k < 100; k++) { var old = it.next(); if (old.done) break; tps.turns.delete(old.value); }
      }
    }
    return t;
  }
  function tpsPushWin(t, ts, tok) {
    t.win.push([ts, tok]);
    var floor = ts - 6000;
    while (t.win.length > 2 && t.win[0][0] < floor) t.win.shift();
  }
  function tpsTurnOf(ev) {
    if (ev.assistantMessageId && tps.respTurn.has(ev.assistantMessageId)) {
      var rid = tps.respTurn.get(ev.assistantMessageId);
      if (tps.turns.has(rid)) return tps.turns.get(rid);
    }
    if (ev.sourceCommandId && tps.scidTurn.has(ev.sourceCommandId)) {
      var sid = tps.scidTurn.get(ev.sourceCommandId);
      if (tps.turns.has(sid)) return tps.turns.get(sid);
    }
    // 尚无归属（流事件先于行事件到达）：挂到最近活跃 turn，否则新建
    var best = null, ts = 0;
    tps.turns.forEach(function (x) {
      var xts = x.lastUsageAt || x.firstChunkAt || 0;
      if (!best || xts > ts) { best = x; ts = xts; }
    });
    if (best && best.streaming) return best;
    var t = tpsGet('anon-' + Date.now());
    if (ev.sourceCommandId) tps.scidTurn.set(ev.sourceCommandId, t.id);
    return t;
  }
  function tpsRowOn(row, ev) {
    if (!row || !row.id) return;
    tps.diag.rows += 1;
    if (ev.op !== 'row.appended' && ev.op !== 'row.upserted' && ev.op !== 'row.delta') return;
    var tid = row.turnId || tps.rowTurn.get(row.id);
    if (tid) tps.rowTurn.set(row.id, tid);
    if (ev.op === 'row.delta') {
      var path = row.path || ev.path, append = row.append !== undefined ? row.append : ev.append;
      if (tid && path === 'text' && typeof append === 'string') {
        var td = tpsGet(tid);
        td.textTok += tpsEstTok(append);
        tpsPushWin(td, Date.now(), td.textTok);
      }
      return;
    }
    var t = tpsGet(tid || row.id);
    var k = row.kind;
    if (k === 'turnHeader') {
      t.startedAt = Date.parse(row.startedAt || '') || t.startedAt;
      t.endedAt = Date.parse(row.endedAt || '') || t.endedAt;
      t.modelDurationMs = row.activeMs || row.durationMs || t.modelDurationMs;
      if (row.state === 'completedSuccess' || row.state === 'failed' ||
          row.state === 'stopped' || row.state === 'cancelled') {
        t.streaming = false;
        tpsTurnDone(t);
      } else if (row.state) t.streaming = true;
      if (row.sourceCommandId) tps.scidTurn.set(row.sourceCommandId, t.id);
    } else if (k === 'userInput') {
      if (row.sourceCommandId) tps.scidTurn.set(row.sourceCommandId, t.id);
      // 任务标签：取该轮用户输入的首段文字（速度明细里区分「各个任务」）
      if (typeof row.text === 'string' && row.text && !t.label) {
        t.label = row.text.replace(/\s+/g, ' ').trim().slice(0, 22);
      }
    } else if (k === 'reasoning' || k === 'assistantText') {
      if (row.assistantResponseId) tps.respTurn.set(row.assistantResponseId, t.id);
      var ca = Date.parse(row.createdAt || '') || 0;
      if (ca && !t.rowFirstAt) t.rowFirstAt = ca;
      if (typeof row.text === 'string' && row.text) {
        t.textTok = tpsEstTok(row.text);   // 全量文本，覆盖式
        tpsPushWin(t, Date.now(), t.textTok);
      }
    }
  }
  function tpsTurnDone(t) {
    if (t.counted || !t.live) return;   // live=收到过实时事件；纯历史行重放不计（客户端启动会重放全部旧轮次）
    var out = Math.max(t.outputTokens, t.textTok);
    if (out <= 0) return;
    t.counted = true;
    tps.sess.turns += 1;
    tps.sess.out += Math.round(out);
    tps.sess.in += t.inputTokens;
    tps.sess.cache += t.cacheReadTokens;
    var first = t.firstChunkAt || t.rowFirstAt;
    var decode = t.modelDurationMs || (t.lastUsageAt && first ? t.lastUsageAt - first : 0);
    // 兜底：endedAt−startedAt，再不行用「首块→现在」，保证有可算的速率而非一直 0
    if (!(decode > 500) && t.startedAt && t.endedAt && t.endedAt > t.startedAt) decode = t.endedAt - t.startedAt;
    if (!(decode > 500) && first) decode = Date.now() - first;
    if (decode > 500) t.lastTps = out / (decode / 1000);
    // 会话总速度：只累加「有可靠解码时长」的轮次（口径与单轮一致，避免除零/失真）
    if (decode > 500 && t.lastTps > 0) {
      tps.sess.decodeMs += decode;
      tps.sess.decOut += out;
    }
    // 逐任务明细（最近 40 轮，新在前）
    tps.sess.list.unshift({
      id: t.id,
      label: t.label || ('# ' + tps.sess.turns),
      out: Math.round(out),
      tps: t.lastTps,
      ttft: first && t.startedAt ? Math.max(0, first - t.startedAt) / 1000 : 0,
      decodeMs: decode,
      at: Date.now()
    });
    if (tps.sess.list.length > 40) tps.sess.list.length = 40;
    tps.last.tps = t.lastTps;
    tps.last.ttft = first && t.startedAt ? Math.max(0, first - t.startedAt) / 1000 : 0;
    tps.last.out = Math.round(out);
    updateMetricsChip();
  }
  function tpsEventOn(ev) {
    var type = ev.event || ev.type;
    if (type === 'stream.chunk') tps.diag.chunks += 1;
    if (type === 'usage.delta') tps.diag.usage += 1;
    if (type === 'stream.chunk') {
      var t = tpsTurnOf(ev);
      if (!t.firstChunkAt) t.firstChunkAt = Date.parse(ev.occurredAt || '') || Date.now();
      t.streaming = true;
      t.live = true;
      tpsPushWin(t, Date.now(), Math.max(t.outputTokens, t.textTok));  // 心跳采样
    } else if (type === 'usage.delta') {
      var t2 = tpsTurnOf(ev);
      t2.live = true;
      if (ev.outputTokens > t2.outputTokens) t2.outputTokens = ev.outputTokens;
      if (ev.inputTokens > t2.inputTokens) t2.inputTokens = ev.inputTokens;
      if (ev.cacheReadTokens > t2.cacheReadTokens) t2.cacheReadTokens = ev.cacheReadTokens;
      t2.lastUsageAt = Date.parse(ev.occurredAt || '') || Date.now();
      t2.streaming = true;
      updateMetricsChip();
    }
  }
  function tpsFrame(d) {
    if (d instanceof ArrayBuffer) d = new TextDecoder().decode(new Uint8Array(d));
    else if (ArrayBuffer.isView(d)) d = new TextDecoder().decode(d);
    if (typeof d !== 'string') return;
    var i = d.indexOf('{');
    if (i < 0) return;
    var j;
    try { j = JSON.parse(d.slice(i)); } catch (e) { return; }
    tps.diag.frames += 1;
    tps.diag.lastFrameAt = Date.now();
    try { tps.diag.lastFrameKeys = Object.keys(j || {}).slice(0, 8).join(','); } catch (e) { }
    var evs = null;
    if (j && j.version === 1 && Array.isArray(j.events)) evs = j.events;
    else if (j && j.frame && j.frame.payload && Array.isArray(j.frame.payload.events)) evs = j.frame.payload.events;
    else if (j && Array.isArray(j.events)) evs = j.events;
    else if (j && Array.isArray(j)) evs = j;
    else if (j && (j.event || j.type || j.op)) evs = [j];
    if (!evs) { tps.diag.otherFrames += 1; return; }
    for (var k = 0; k < evs.length; k++) {
      var ev = evs[k];
      if (!ev) continue;
      try {
        var row = ev.row || (ev.op ? ev : null);
        if (ev.op && row) tpsRowOn(row, ev);
        else tpsEventOn(ev);
      } catch (e) { /* 单条坏事件不拖垮整帧 */ }
    }
  }
  function tpsPortHook() {
    var onMsg = function (e) {
      try {
        var d = e.data;
        var tag = typeof d === 'string' ? d
          : (d && typeof d === 'object' && typeof d.type === 'string' ? d.type : '');
        if (tag !== 'zcode:service-port' && tag !== 'zcode:scoped-service-port') return;
        tps.handoffSeen += 1;
        var port = e.ports && e.ports[0];
        if (!port || typeof port.addEventListener !== 'function') return;
        tps.portHooked = true;
        tpsDomStop();
        // 只挂监听，绝不 port.start()（见模块头注）
        port.addEventListener('message', function (pe) {
          try { tpsFrame(pe.data); } catch (err) { /* 坏帧忽略 */ }
        });
      } catch (err) { /* 握手事件不完整时忽略 */ }
    };
    // 客户端可能把端口投递到 window 或 document，两处都监听（幂等，重复接管无害）
    window.addEventListener('message', onMsg, true);
    try { document.addEventListener('message', onMsg, true); } catch (e) { /* 老环境无此事件 */ }
  }
  /* ---------- DOM 观测兜底（未接管到事件流端口时） ---------- */
  function isEditable(t) {
    if (!t || !t.tagName) return false;
    return t.tagName === 'TEXTAREA' || t.tagName === 'INPUT' || t.isContenteditable === true;
  }
  var tpsDomMO = null;
  function tpsDomSend() {
    var d = tps.dom;
    d.t0 = performance.now(); d.firstTok = 0; d.lastMut = 0; d.tok = 0;
    d.win = []; d.lastTps = 0;
    d.active = true;
    updateMetricsChip();
  }
  function tpsDomFinish() {
    var d = tps.dom;
    d.active = false;
    if (d.tok <= 0) return;
    var out = Math.round(d.tok);
    var dur = (d.lastMut - d.firstTok) / 1000;
    if (dur > 0.5) d.lastTps = out / dur;
    tps.last.tps = d.lastTps;
    tps.last.ttft = (d.firstTok - d.t0) / 1000;
    tps.last.out = out;
    tps.sess.turns += 1;
    tps.sess.out += out;
    var durMs = (d.lastMut - d.firstTok);
    if (durMs > 500 && d.lastTps > 0) { tps.sess.decodeMs += durMs; tps.sess.decOut += out; }
    tps.sess.list.unshift({
      id: 'dom-' + tps.sess.turns,
      label: '本轮（估算）',
      out: out, tps: d.lastTps,
      ttft: (d.firstTok - d.t0) / 1000, decodeMs: durMs, at: Date.now(), est: true
    });
    if (tps.sess.list.length > 40) tps.sess.list.length = 40;
    updateMetricsChip();
  }
  function tpsDomStop() {
    if (tpsDomMO) { try { tpsDomMO.disconnect(); } catch (e) { /* 已断开 */ } }
    tps.domMode = false;
  }
  function tpsDomStart() {
    if (tps.domStarted) return;
    tps.domStarted = true;
    tps.domMode = true;
    // 发送时机：composer 内回车（无修饰键、非输入法组合键）
    document.addEventListener('keydown', function (ev) {
      if (ev.key !== 'Enter' || ev.shiftKey || ev.ctrlKey || ev.altKey || ev.metaKey || ev.isComposing) return;
      if (isEditable(ev.target)) tpsDomSend();
    }, true);
    // 点击发送按钮：按钮文案/aria-label 含 send/发送/提交，或点击发生在输入区容器内
    document.addEventListener('click', function (ev) {
      var btn = ev.target && ev.target.closest ? ev.target.closest('button') : null;
      if (!btn) return;
      var hay = (btn.className || '') + ' ' + (btn.getAttribute('aria-label') || '') + ' ' +
        (btn.getAttribute('title') || '') + ' ' + (btn.textContent || '').slice(0, 10);
      if (/send|submit|发送|提交/i.test(hay)) { tpsDomSend(); return; }
      if (btn.closest && btn.closest('[class*="composer" i],[class*="input-box" i],[class*="chat-input" i]')) tpsDomSend();
    }, true);
    // 只统计字符节点增量；整块重挂载的既有正文不计（v0.1.4 虚高根因）
    tpsDomMO = new MutationObserver(function (muts) {
      if (martian.writing) return;   // 火星文模块自己的 DOM 写入不计入 TPS
      var d = tps.dom;
      if (!d.active) return;
      var added = '';
      for (var i = 0; i < muts.length; i++) {
        var m = muts[i];
        if (m.type === 'characterData' && m.target && m.target.textContent) {
          var delta = m.target.textContent.length - (m.oldValue ? m.oldValue.length : 0);
          if (delta > 0) added += m.target.textContent.slice(-delta);
        } else if (m.type === 'childList') {
          for (var j = 0; j < m.addedNodes.length; j++) {
            var n = m.addedNodes[j];
            if (n && n.nodeType === 3 && n.textContent) added += n.textContent;
          }
        }
      }
      var now = performance.now();
      if (added && now - d.t0 > 400) {   // 忽略发送后 400ms 内的同步回显
        if (!d.firstTok) d.firstTok = now;
        d.tok += tpsEstTok(added);
        d.lastMut = now;
        tpsPushWin(d, now, d.tok);
        updateMetricsChip();
      }
    });
    tpsDomMO.observe(document.body, { characterData: true, childList: true, subtree: true });
    setInterval(function () {   // 心跳采样维持时间轴 + 收尾/空轮判定
      var d = tps.dom;
      if (!d.active) return;
      var now = performance.now();
      tpsPushWin(d, now, d.tok);
      if (d.firstTok && now - d.lastMut > 1600) tpsDomFinish();
      else if (!d.firstTok && now - d.t0 > 6000) d.active = false;   // 空轮丢弃
    }, 1000);
  }
  function tpsDisplay() {
    var mode = tps.portHooked ? 'stream' : (tps.domMode ? 'dom' : 'none');
    var r = { live: false, tps: 0, out: 0, est: mode === 'dom', mode: mode,
      lastTps: tps.last.tps, lastTtft: tps.last.ttft, lastOut: tps.last.out,
      sessTurns: tps.sess.turns, sessOut: tps.sess.out, sessIn: tps.sess.in,
      sessAvg: tps.sess.decodeMs > 500 ? tps.sess.decOut / (tps.sess.decodeMs / 1000) : 0,
      list: tps.sess.list, diag: tps.diag, handoffSeen: tps.handoffSeen,
      liveElapsed: 0, liveOut: 0 };
    if (tps.portHooked) {
      var cur = null, ts = 0;
      tps.turns.forEach(function (t) {
        var xts = t.lastUsageAt || t.firstChunkAt || t.rowFirstAt || t.startedAt || 0;
        if (xts >= ts) { ts = xts; cur = t; }
      });
      if (cur && cur.streaming) {
        r.live = true;
        var now = Date.now();
        var w = cur.win.filter(function (p) { return now - p[0] <= 4000; });
        if (w.length >= 2) {
          var dt = (w[w.length - 1][0] - w[0][0]) / 1000;
          var dtok = w[w.length - 1][1] - w[0][1];
          if (dt >= 1 && dtok > 0) cur.lastTps = dtok / dt;
        }
        r.tps = cur.lastTps;
        r.out = Math.round(Math.max(cur.outputTokens, cur.textTok));
        // 本轮实时累计：已用时长（自首块）与本轮产出，供指标条显示平均+瞬时
        var f = cur.firstChunkAt || cur.rowFirstAt;
        r.liveElapsed = f ? Math.max(0, (Date.now() - f) / 1000) : 0;
        r.liveOut = r.out;
        if (cur.label) r.liveLabel = cur.label;
      }
    } else if (tps.domMode) {
      r.est = true;
      var d = tps.dom;
      if (d.active && d.firstTok) {
        r.live = true;
        var now2 = performance.now();
        var w2 = d.win.filter(function (p) { return now2 - p[0] <= 4000; });
        if (w2.length >= 2) {
          var dt2 = (w2[w2.length - 1][0] - w2[0][0]) / 1000;
          var dtok2 = w2[w2.length - 1][1] - w2[0][1];
          if (dt2 >= 1 && dtok2 > 0) d.lastTps = dtok2 / dt2;
        }
        r.tps = d.lastTps;
        r.out = Math.round(d.tok);
        r.liveElapsed = d.firstTok ? Math.max(0, (performance.now() - d.firstTok) / 1000) : 0;
        r.liveOut = r.out;
      }
    }
    return r;
  }
  function tpsObserverStart() {
    tpsPortHook();
    // 8s 未接管到端口（客户端版本变化）→ DOM 兜底；一旦端口接管立即停兜底
    setTimeout(function () { if (!tps.portHooked) tpsDomStart(); }, 8000);
  }

  /* ==================================================================
   * 余额显示（实验性）
   *  auto：抓取客户端「用量/套餐」页面出现的 余额/剩余/额度/到期 文本（快照缓存）
   *  manual：显示用户手填文本
   * ================================================================== */
  var balance = { text: '', updated: 0, lastScrape: 0 };
  // 两遍匹配：紧间隙（标签紧挨数值，如「余额 ¥3.20」）优先，
  // 宽间隙兜底（标签与数值间隔文案）。i 标志兼容 Tokens/TOKENS 等大小写。
  var BAL_RE_TIGHT = /(余额|剩余额度|剩余|额度|已用|用量|套餐|到期|过期|积分|tokens?)((?:(?![0-9¥]).){0,6})(¥?\d[\d,，.]*(?:\s?(?:%|万|亿|k|K|M|G|GB|天|日|次|tok(?:en)?s?|字|积分))?)/gi;
  var BAL_RE_LOOSE = /(余额|剩余额度|剩余|额度|已用|用量|套餐|到期|过期|积分|tokens?)((?:(?![0-9¥]).){0,18})(¥?\d[\d,，.]*(?:\s?(?:%|万|亿|k|K|M|G|GB|天|日|次|tok(?:en)?s?|字|积分))?)/gi;
  function scrapeBalance() {
    if (cfg.metrics.balanceMode !== 'auto' || !cfg.metrics.showBalance) return;
    balance.lastScrape = Date.now();
    try {
      var root = document.querySelector('main') || document.body;
      if (!root) return;
      // 压平空白：用量页标签与数值几乎都分行/分块渲染，不压平则永远匹配不上
      var flat = (root.innerText || '').replace(/\s+/g, ' ');
      if (!flat || flat.length > 200000) return;
      var found = [];
      var seen = {};
      [BAL_RE_TIGHT, BAL_RE_LOOSE].forEach(function (re) {
        re.lastIndex = 0;
        var m;
        while ((m = re.exec(flat)) !== null && found.length < 5) {
          var item = m[1] + ' ' + (m[3] || '').trim();
          if (!/\d/.test(m[3] || '') || seen[item]) continue;
          seen[item] = 1;
          found.push(item);
        }
      });
      if (found.length) {
        balance.text = found.slice(0, 3).join(' · ');
        balance.updated = Date.now();
        persistBalance();
        updateMetricsChip();
      }
    } catch (e) { /* 静默 */ }
  }
  function balanceObserverStart() {
    var timer = 0;
    var mo = new MutationObserver(function () {
      if (cfg.metrics.balanceMode !== 'auto') return;
      clearTimeout(timer);
      timer = setTimeout(scrapeBalance, 1200);
    });
    mo.observe(document.body, { childList: true, subtree: true, characterData: true });
    // 兜底：页面静置时每 15s 也扫一次（打开用量页后不必再动鼠标）
    setInterval(function () {
      if (cfg.metrics.balanceMode === 'auto' && Date.now() - balance.lastScrape > 15000) {
        scrapeBalance();
      }
    }, 5000);
    try {
      var saved = localStorage.getItem('zcode-90sOldschool-balance-v1');
      if (saved) { var j = JSON.parse(saved); balance.text = j.text || ''; balance.updated = j.updated || 0; }
    } catch (e) {}
    scrapeBalance();
  }
  function persistBalance() {
    try { localStorage.setItem('zcode-90sOldschool-balance-v1', JSON.stringify(balance)); } catch (e) {}
  }
  setInterval(persistBalance, 30000);

  /* ==================================================================
   * 火星文显示模式（v0.1.2）
   *  - 纯显示层改写：只改 DOM 文本节点的展示值；发给模型的内容、消息存储、
   *    导出全部不受影响（引擎从不碰输入框，复制时剪贴板回填原文）。
   *  - 每个文本节点的原文存在 WeakMap；React 流式重渲染覆盖节点时，
   *    把新进值当作最新原文重新改写；关闭开关时全量还原。
   * ================================================================== */
  // 映射表：每两个字符为一对（原文字, 火星字）。未收录的字原样保留。
  var MARTIAN_PAIRS = '的旳我莪你沵他祂它牠们扪是媞不卟了ㄋ在侢有栯没莈吗嫲呢哩吧粑啊锕呀丫嘛蔴哦藕嗯摁哈蛤啦菈这這谁誰什甚么庅和啝就僦还還也乜都嘟很狠太忲最樶再洅要婹会浍能褦想葙说説话話讲講听聴写冩问問答荅给給让讓被褙从従向嚮往徃到箌上仩下丅里裏中狆间間进進出齣过過遍徧时溡天兲年秊月玥钟鐘点嚸早枣晚唍明眀夜亱梦夣星瑆光灮个嗰只祗双雙单単人亽男莮女钕子孓家傢学斆作莋做莋前偂买買卖賣吃喫觉覚走赱来唻去厺开開关関好恏坏壊对対错錯行垳知倁道噵记記忘莣爱嗳喜囍欢歓乐樂高髙兴興心吣气汔笑咲生笙美羙丽麗亮喨帅帥丑醜强強大汏小尐多哆长镸新噺旧舊电電脑腦网網络絡机機戏戲游遊视眎剧劇歌謌舞儛饭飯水氺床牀号號码碼录録击撃复復贴貼换換设設销銷删刪运運环環条條断斷执執结結果菓确確题題决決法琺原厡因洇如茹后後然燃而侕或戓外迯概槪许許认認样樣几幾第苐边邊面靣标標计計划劃员員领領导導资資老荖板闆师師同衕自洎别莂请請谢謝见見现現为為于於与與经經一①二②三③四④五⑤六⑥七⑦八⑧九⑨十⑩真眞假叚得嘚比毘较較应應该該须鬚远遠甜甛福褔幸倖念唸回迴等簦马馬即卽刻剋树樹花芲草艸云雲风風变変事亊情啨国國钱錢加咖傻儍聪聰厉厲动動意噫头頭发發收収总總额額速趚';
  var MARTIAN_MAP = {};
  var MARTIAN_REV = {};
  (function () {
    if (MARTIAN_PAIRS.length % 2 !== 0) {
      warn('火星文映射表长度为奇数，已截断末位');
      MARTIAN_PAIRS = MARTIAN_PAIRS.slice(0, -1);
    }
    for (var i = 0; i < MARTIAN_PAIRS.length; i += 2) {
      var src = MARTIAN_PAIRS[i], dst = MARTIAN_PAIRS[i + 1];
      MARTIAN_MAP[src] = dst;
      if (!(dst in MARTIAN_REV)) MARTIAN_REV[dst] = src; // 冲突时保留首个
    }
  })();
  /* 装饰符号（火星文「符号感」）：只插入、不参与同形字映射；
   * 反向还原时无条件剔除，所以复制出来仍是原文（v0.1.22） */
  var MARTIAN_DECOR = 'ゞ〆彡☆﹏〃灬丶';
  function martianDecorGap() {
    var dens = (cfg.fun && cfg.fun.decor != null) ? cfg.fun.decor : 60;
    if (dens <= 0) return 0;                                  // 关闭符号
    return Math.max(2, Math.round(12 - dens / 10));            // 60→6 字/个，100→2 字/个
  }
  function martianize(text) {
    var out = '';
    var gap = martianDecorGap();
    var cjk = 0;
    for (var i = 0; i < text.length; i++) {
      var ch = text[i];
      out += MARTIAN_MAP[ch] || ch;
      // 只在汉字后插符号，避免打断英文/数字/URL 的观感
      if (gap && /[㐀-鿿]/.test(ch)) {
        cjk += 1;
        if (cjk % gap === 0) out += MARTIAN_DECOR[(i * 3 + cjk) % MARTIAN_DECOR.length];
      }
    }
    return out;
  }
  function demartianize(text) {
    var out = '';
    for (var i = 0; i < text.length; i++) {
      var ch = text[i];
      if (MARTIAN_DECOR.indexOf(ch) >= 0) continue;   // 去掉我们插入的装饰符号
      out += MARTIAN_REV[ch] || ch;
    }
    return out;
  }

  var MARTIAN_ZONE = '.prose,[class*="prose"],[class*="markdown"],[class*="message"],[class*="bubble"],[class*="stream"],[class*="assistant"],[class*="chat-item"]';
  var MARTIAN_SKIP = 'code,pre,kbd,samp,script,style,textarea,input,[contenteditable="true"],[contenteditable=""]';
  var martian = {
    originals: new WeakMap(),     // textNode -> 原文
    nodes: new Set(),             // 已改写的文本节点（供还原/剪贴板遍历）
    writing: false,               // 我们自己的 DOM 写入进行中（TPS 计数与本观察器都要跳过）
    timer: 0
  };
  function martianSideAllowed(node) {
    var el = node.parentElement;
    if (!el) return true;
    var mine = el.closest('[class*="user" i],[class*="human" i],[class*="self" i],[data-role="user"]');
    return mine ? cfg.fun.mine : cfg.fun.assistant;
  }
  function martianWalkNode(tn) {
    if (!tn.nodeValue || !tn.nodeValue.trim()) return;
    var el = tn.parentElement;
    if (!el) return;
    if (el.closest(MARTIAN_SKIP)) return;
    if (el.closest(MARTIAN_ZONE)) {
      if (!martianSideAllowed(tn)) return;
    } else if (el.closest(ALERT_SEL)) {
      // 提示横幅（用量上限/升级提示/toast）：跟随火星文总开关，不受「界面文字」子开关限制
      if (!cfg.fun.martian) return;
    } else {
      // 界面文字（侧边栏/菜单/按钮等消息区之外的 chrome 文本）
      if (!(cfg.fun.martian && cfg.fun.chrome)) return;
      // 不碰我们自己的 UI 与装饰层
      if (el.closest('#zcode-90sOldschool-ui,#zcode-ap-bg,#zcode-ap-breath,#zcode-ap-fx')) return;
    }
    var stored = martian.originals.get(tn);
    var cur = tn.nodeValue;
    if (stored === undefined) {
      // 首次改写：记录原文
      martian.originals.set(tn, cur);
      martian.nodes.add(tn);
      martian.writing = true;
      try { tn.nodeValue = martianize(cur); } finally { martian.writing = false; }
    } else if (cur !== martianize(stored)) {
      // React 重渲染带来了新值：把它当作最新原文重新记录并改写
      martian.originals.set(tn, cur);
      martian.writing = true;
      try { tn.nodeValue = martianize(cur); } finally { martian.writing = false; }
    }
  }
  function martianWalkRoot(root) {
    if (!root || root.nodeType !== 1) return;
    var walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, null);
    var n;
    while ((n = walker.nextNode())) {
      try { martianWalkNode(n); } catch (e) { /* 单节点失败不影响整体 */ }
    }
  }
  function martianSchedule(targets) {
    if (!cfg.fun || !cfg.fun.martian) return;
    clearTimeout(martian.timer);
    martian.timer = setTimeout(function () {
      if (document.hidden) return;   // 窗口隐藏时不做全量遍历
      // 界面文字模式：全 body 走一遍（含消息区，分支规则在 martianWalkNode 里）
      if (cfg.fun.chrome) { martianWalkRoot(document.body); return; }
      var zones = new Set();
      targets.forEach(function (t) {
        var el = t.nodeType === 1 ? t : (t.parentElement || (t.nodeType === 3 ? null : null));
        if (!el) return;
        var zone = el.closest(MARTIAN_ZONE) || el.closest(ALERT_SEL);
        if (zone) zones.add(zone);
      });
      zones.forEach(function (z) { martianWalkRoot(z); });
    }, 120);
  }
  function martianRestoreAll() {
    martian.writing = true;
    try {
      martian.nodes.forEach(function (tn) {
        try {
          var orig = martian.originals.get(tn);
          if (orig !== undefined && tn.parentNode && tn.nodeValue !== orig) tn.nodeValue = orig;
        } catch (e) { /* 已被 React 替换的节点忽略 */ }
      });
    } finally { martian.writing = false; }
    martian.nodes.clear();
    // WeakMap 无法遍历，置空引用交 GC；后续再开时会重新当首次处理
    martian.originals = new WeakMap();
  }
  function martianApplyAll() {
    if (!cfg.fun.martian) { martianRestoreAll(); return; }
    if (cfg.fun.chrome) { martianWalkRoot(document.body); return; }
    document.querySelectorAll('.prose, [class*="prose"], [class*="markdown"], [class*="message"], [class*="bubble"]').forEach(martianWalkRoot);
    // 提示横幅不受「界面文字」子开关限制：消息区扫完后单独补一遍
    try { document.querySelectorAll(ALERT_SEL).forEach(martianWalkRoot); } catch (e) { /* 选择器不支持时忽略 */ }
  }
  var martianMo = null;
  function martianStart() {
    martianMo = new MutationObserver(function (muts) {
      if (martian.writing) return;
      if (!cfg.fun || !cfg.fun.martian) return;
      var targets = [];
      for (var i = 0; i < muts.length; i++) {
        var m = muts[i];
        if (m.type === 'characterData' && m.target) targets.push(m.target);
        else if (m.type === 'childList') {
          for (var j = 0; j < m.addedNodes.length; j++) targets.push(m.addedNodes[j]);
        }
      }
      if (targets.length) martianSchedule(targets);
    });
    martianMo.observe(document.body, { characterData: true, childList: true, subtree: true });
    // 复制时回填原文：选区里的火星文 → 剪贴板拿到的仍是原文
    document.addEventListener('copy', function (ev) {
      if (!cfg.fun || !cfg.fun.martian) return;
      try {
        var sel = window.getSelection();
        if (!sel || sel.isCollapsed || sel.rangeCount === 0) return;
        var range = sel.getRangeAt(0);
        var anchor = range.commonAncestorContainer;
        var el = anchor.nodeType === 1 ? anchor : anchor.parentElement;
        if (!el || !(el.closest(MARTIAN_ZONE) || (cfg.fun.chrome && !el.closest(MARTIAN_SKIP)))) return;   // 不在火星文覆盖范围，走默认复制
        // 精确路径：遍历选区内文本节点，整段用存储原文，边界节点做区间换算后反查
        var frag = range.cloneContents();
        var walker = document.createTreeWalker(frag, NodeFilter.SHOW_TEXT, null);
        var out = [];
        var n;
        while ((n = walker.nextNode())) out.push(n.nodeValue);
        var text = out.join('');
        // 克隆片段里的值是火星文 → 用反向表还原（未映射字符原样保留）
        ev.clipboardData.setData('text/plain', demartianize(text));
        ev.preventDefault();
      } catch (e) { /* 失败则回退默认复制（得到火星文） */ }
    }, true);
    // 初始全量转换推迟 1.2s：避开客户端启动渲染风暴（MO 会兜住期间的增量）
    if (cfg.fun.martian) setTimeout(martianApplyAll, 1200);
  }
  function martianRefresh() {
    // 覆盖范围变化（总开关/方向/界面文字）：先全量还原再按当前开关重扫，
    // 否则收窄范围时（如关掉「界面文字」）已转换节点会残留火星文
    martianRestoreAll();
    if (cfg.fun.martian) martianApplyAll();
  }

  /* ==================================================================
   * 浮层 UI：指标条 + 控制面板（Shadow DOM 隔离）
   * ================================================================== */
  var ui = { host: null, root: null, chip: null, panel: null, orb: null, speedHead: null, speedList: null };
  var PANEL_CSS = [
    ':host{all:initial;}',
    '*,*::before,*::after{box-sizing:border-box;font-family:"Microsoft YaHei UI","PingFang SC",system-ui,sans-serif;}',
    '.chip{position:fixed;z-index:2147483100;display:flex;gap:10px;align-items:center;padding:5px 12px;border-radius:999px;',
    '  background:rgba(20,22,30,.72);backdrop-filter:blur(14px) saturate(1.6);-webkit-backdrop-filter:blur(14px) saturate(1.6);',
    '  color:#e8ecf4;font-size:12px;line-height:1;box-shadow:0 4px 18px rgba(0,0,0,.35),inset 0 1px 0 rgba(255,255,255,.12);',
    '  border:1px solid rgba(255,255,255,.14);cursor:default;user-select:none;transition:opacity .2s;}',
    '.chip.hide{opacity:0;pointer-events:none;}',
    '.chip b{font-weight:600;font-variant-numeric:tabular-nums;}',
    '.chip .sep{opacity:.35;}',
    '.chip .bal{color:#9fe8c1;max-width:230px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}',
    '.chip .grip{cursor:grab;opacity:.5;padding:0 2px;}',
    '.orb{position:fixed;z-index:2147483200;width:38px;height:38px;border-radius:50%;border:none;cursor:pointer;',
    '  background:linear-gradient(135deg,#7c9cff,#b57cff 55%,#ff8cc8);color:#fff;font-size:17px;line-height:38px;text-align:center;',
    '  box-shadow:0 4px 16px rgba(90,80,220,.45);transition:transform .18s;}',
    '.orb:hover{transform:scale(1.1) rotate(8deg);}',
    '.orb.breathe{animation:zapOrbBreath 3.8s ease-in-out infinite;}',
    '@keyframes zapOrbBreath{0%,100%{box-shadow:0 4px 16px rgba(90,80,220,.45);}',
    '  50%{box-shadow:0 0 22px 5px var(--zap-glow,#b57cff),0 4px 16px rgba(90,80,220,.45);}}',
    '.panel{position:fixed;z-index:2147483300;width:344px;max-height:78vh;overflow:auto;border-radius:16px;',
    '  background:rgba(18,20,28,.9);backdrop-filter:blur(22px) saturate(1.7);-webkit-backdrop-filter:blur(22px) saturate(1.7);',
    '  color:#e8ecf4;font-size:13px;box-shadow:0 18px 50px rgba(0,0,0,.5),inset 0 1px 0 rgba(255,255,255,.1);',
    '  border:1px solid rgba(255,255,255,.16);padding:14px 16px 18px;}',
    '.panel.hide{display:none;}',
    '.panel h3{margin:14px 0 8px;font-size:13px;color:#b7c2ff;font-weight:600;letter-spacing:.5px;}',
    '.panel h3:first-child{margin-top:0;}',
    '.phead{display:flex;align-items:center;justify-content:space-between;margin:0 0 6px;padding-bottom:8px;border-bottom:1px solid rgba(255,255,255,.1);}',
    '.ptitle{font-size:14px;font-weight:700;color:#e8ecf4;letter-spacing:.5px;}',
    '.xbtn{background:rgba(255,255,255,.08);border:1px solid rgba(255,255,255,.16);color:#c6cede;width:24px;height:24px;border-radius:8px;cursor:pointer;font-size:12px;line-height:1;padding:0;}',
    '.xbtn:hover{background:rgba(255,255,255,.2);color:#fff;}',
    '.row{display:flex;align-items:center;justify-content:space-between;gap:8px;margin:7px 0;}',
    '.row label{flex:1;color:#c6cede;}',
    'select,input[type=text]{background:rgba(255,255,255,.08);color:#e8ecf4;border:1px solid rgba(255,255,255,.16);',
    '  border-radius:8px;padding:4px 8px;font-size:12px;max-width:190px;outline:none;}',
    'input[type=range]{width:150px;accent-color:#8fa5ff;}',
    'input[type=checkbox]{accent-color:#8fa5ff;}',
    '.swatches{display:grid;grid-template-columns:repeat(6,1fr);gap:7px;margin:6px 0;}',
    '.sw{height:26px;border-radius:8px;border:2px solid transparent;cursor:pointer;position:relative;}',
    '.sw.on{border-color:#fff;box-shadow:0 0 0 2px rgba(140,160,255,.6);}',
    '.sw .lb{position:absolute;bottom:-17px;left:0;right:0;text-align:center;font-size:9px;color:#98a2b8;white-space:nowrap;}',
    '.swwrap{padding-bottom:16px;}',
    '.btn{background:rgba(255,255,255,.1);border:1px solid rgba(255,255,255,.18);color:#e8ecf4;border-radius:8px;',
    '  padding:4px 10px;font-size:12px;cursor:pointer;}',
    '.btn:hover{background:rgba(255,255,255,.18);}',
    '.btn.warn{color:#ffb4a8;}',
    '.preset-grid{display:grid;grid-template-columns:repeat(6,1fr);gap:7px;margin:6px 0 20px;}',
    '.tips{color:#8b94a7;font-size:11px;line-height:1.6;margin-top:4px;}',
    '.toast{position:fixed;z-index:2147483400;left:50%;bottom:64px;transform:translateX(-50%);background:rgba(20,22,30,.9);',
    '  color:#dfe6f3;padding:8px 16px;border-radius:10px;font-size:12px;border:1px solid rgba(255,255,255,.15);opacity:0;transition:opacity .25s;}',
    '.toast.show{opacity:1;}'
  ].join('');

  function h(tag, attrs, children) {
    var el = document.createElement(tag);
    if (attrs) Object.keys(attrs).forEach(function (k) {
      if (k === 'style') el.style.cssText = attrs[k];
      else if (k === 'text') el.textContent = attrs[k];
      else if (k.slice(0, 2) === 'on') el.addEventListener(k.slice(2), attrs[k]);
      else el.setAttribute(k, attrs[k]);
    });
    (children || []).forEach(function (c) { if (c) el.appendChild(c); });
    return el;
  }

  function loadPos() {
    try { return JSON.parse(localStorage.getItem(LS_POS_KEY)) || null; } catch (e) { return null; }
  }
  function savePos(p) { try { localStorage.setItem(LS_POS_KEY, JSON.stringify(p)); } catch (e) {} }

  function makeDraggable(el, key) {
    var pos = loadPos() || {};
    if (pos[key]) { el.style.left = pos[key].x + 'px'; el.style.top = pos[key].y + 'px'; el.style.right = 'auto'; el.style.bottom = 'auto'; }
    el.addEventListener('pointerdown', function (ev) {
      if (ev.button !== 0) return;
      var startX = ev.clientX, startY = ev.clientY;
      var r = el.getBoundingClientRect();
      var ox = startX - r.left, oy = startY - r.top;
      var moved = false;
      function onMove(e) {
        if (Math.abs(e.clientX - startX) + Math.abs(e.clientY - startY) > 3) moved = true;
        if (!moved) return;
        el.style.left = Math.max(4, Math.min(window.innerWidth - 40, e.clientX - ox)) + 'px';
        el.style.top = Math.max(4, Math.min(window.innerHeight - 40, e.clientY - oy)) + 'px';
        el.style.right = 'auto'; el.style.bottom = 'auto';
      }
      function onUp(e) {
        document.removeEventListener('pointermove', onMove);
        document.removeEventListener('pointerup', onUp);
        if (moved) {
          var p = loadPos() || {};
          p[key] = { x: parseInt(el.style.left, 10), y: parseInt(el.style.top, 10) };
          savePos(p);
          ev.stopPropagation();
        }
      }
      document.addEventListener('pointermove', onMove);
      document.addEventListener('pointerup', onUp);
    });
  }

  function buildUI() {
    ui.host = document.createElement('div');
    ui.host.id = 'zcode-90sOldschool-ui';
    ui.root = ui.host.attachShadow({ mode: 'open' });
    var style = document.createElement('style');
    style.textContent = PANEL_CSS;
    ui.root.appendChild(style);

    // —— 指标条 ——
    ui.chip = h('div', { class: 'chip', style: 'right:18px;bottom:18px;' });
    var grip = h('span', { class: 'grip', text: '⠿', title: '拖动调整位置' });
    makeDraggable(ui.chip, 'chip');
    ui.chip.appendChild(grip);
    ui.root.appendChild(ui.chip);

    // —— 悬浮球 ——
    ui.orb = h('button', { class: 'orb', style: 'right:18px;bottom:64px;', title: '外观设置 (Alt+Z)', text: '🎨' });
    makeDraggable(ui.orb, 'orb');
    ui.orb.addEventListener('click', function (e) {
      // 拖动后不触发点击：用 detail 判断不可靠，简单用移动阈值已在 makeDraggable stopPropagation
      togglePanel();
    });
    ui.root.appendChild(ui.orb);
    syncBreath();   // applyCSS 先于 buildUI，悬浮球建好后补一次呼吸态同步

    // —— 控制面板 ——
    ui.panel = h('div', { class: 'panel hide', style: 'right:18px;bottom:112px;' });
    ui.root.appendChild(ui.panel);
    document.body.appendChild(ui.host);
    // 面板按标准浮层行为收起：点击面板外任意处（含客户端原生菜单/对话框）关闭、Esc 关闭。
    // 用捕获阶段监听且不拦截事件，客户端自身的点击照常生效。
    document.addEventListener('pointerdown', function (ev) {
      if (!panelOpen()) return;
      if (ev.target && ui.host.contains(ev.target)) return;
      closePanel();
    }, true);
    document.addEventListener('keydown', function (ev) {
      if (ev.key === 'Escape' && panelOpen()) closePanel();
    });
    renderPanel();
    updateMetricsChip();
  }

  function panelOpen() { return !!(ui.panel && !ui.panel.classList.contains('hide')); }
  function closePanel() { if (ui.panel) ui.panel.classList.add('hide'); }
  function togglePanel() { ui.panel.classList.toggle('hide'); }

  function row(labelText, control) {
    return h('div', { class: 'row' }, [h('label', { text: labelText }), control]);
  }
  function slider(min, max, val, oninput) {
    var s = h('input', { type: 'range', min: min, max: max, value: val });
    s.addEventListener('input', function () { oninput(+s.value); });
    return s;
  }
  function checkbox(val, onchange) {
    var c = h('input', { type: 'checkbox' });
    c.checked = !!val;
    c.addEventListener('change', function () { onchange(c.checked); });
    return c;
  }
  function select(options, val, onchange) {
    var s = h('select');
    options.forEach(function (o) {
      var opt = h('option', { value: o.value, text: o.label });
      s.appendChild(opt);
    });
    s.value = val;
    s.addEventListener('change', function () { onchange(s.value); });
    return s;
  }

  function renderPanel() {
    ui.panel.innerHTML = '';
    var P = ui.panel;

    P.appendChild(h('div', { class: 'phead' }, [
      h('span', { class: 'ptitle', text: '🎨 外观设置' }),
      h('button', { class: 'xbtn', text: '✕', title: '关闭（Esc / 点击面板外也可）', onclick: closePanel })
    ]));

    P.appendChild(h('h3', { text: '🎨 外观主题' }));
    P.appendChild(row('启用外观增强', checkbox(cfg.enabled, function (v) { cfg.enabled = v; refresh(); })));
    P.appendChild(row('暗色主题（强制深色）', checkbox(cfg.forceDark, function (v) { cfg.forceDark = v; refresh(); })));
    var swWrap = h('div', { class: 'swatches swwrap' });
    Object.keys(THEMES).forEach(function (k) {
      var t = THEMES[k];
      var color = t.accent || 'linear-gradient(135deg,#666,#999)';
      var sw = h('button', {
        class: 'sw' + (cfg.theme === k ? ' on' : ''),
        style: 'background:' + color + ';',
        title: t.label
      }, [h('span', { class: 'lb', text: t.label })]);
      sw.addEventListener('click', function () { cfg.theme = k; refresh(); });
      swWrap.appendChild(sw);
    });
    P.appendChild(swWrap);
    P.appendChild(row('染色强度', slider(0, 100, cfg.themeIntensity, function (v) { cfg.themeIntensity = v; refresh(); })));
    P.appendChild(row('深度染色（连背景）', checkbox(cfg.themeDeep, function (v) { cfg.themeDeep = v; refresh(); })));
    P.appendChild(row('呼吸灯（随主题色柔光呼吸）', checkbox(cfg.breath.enabled, function (v) { cfg.breath.enabled = v; refresh(); renderPanel(); })));
    if (cfg.breath.enabled) {
      P.appendChild(row('呼吸亮度', slider(5, 100, cfg.breath.strength, function (v) { cfg.breath.strength = v; refresh(); })));
      P.appendChild(row('呼吸节奏', select([
        { value: 'slow', label: '舒缓 5.6s' },
        { value: 'medium', label: '均匀 3.8s' },
        { value: 'fast', label: '轻快 2.4s' }
      ], cfg.breath.speed, function (v) { cfg.breath.speed = v; refresh(); })));
      P.appendChild(h('div', {
        text: '呼吸效果：整屏柔光 + 悬浮球发光（不再给控件套描边框）。',
        style: 'opacity:.6;font-size:11px;margin:2px 0 4px;'
      }));
      if (cfg.theme === 'default') {
        P.appendChild(h('div', { text: '当前是「默认」主题无主题色，呼吸灯需先选一套配色', style: 'opacity:.6;font-size:11px;margin:2px 0 4px;' }));
      }
    }

    P.appendChild(h('h3', { text: '🖍 文字颜色' }));
    P.appendChild(row('启用文字颜色调整', checkbox(cfg.textColor.enabled, function (v) { cfg.textColor.enabled = v; refresh(); })));
    P.appendChild(row('自动适配（按背景明暗）', checkbox(cfg.textColor.auto, function (v) {
      cfg.textColor.auto = v;
      if (v) cfg.textColor.enabled = true;   // 勾自动适配即视为启用，避免「开了没反应」
      refresh(); renderPanel();
    })));
    P.appendChild(h('div', {
      text: '输入框内的文字保持客户端默认颜色，不参与此处调整。',
      style: 'opacity:.6;font-size:11px;margin:2px 0 4px;'
    }));
    if (cfg.textColor.auto) {
      var ac = autoTextColors();
      P.appendChild(h('div', {
        text: '判定：界面背景 ' + ac.bgHex + ' → 文字 ' + ac.ui + '（对比 ' + ac.contrast + ':1）· 正文 ' +
          ac.chat + '（' + ac.chatContrast + ':1）',
        style: 'opacity:.7;font-size:11px;margin:2px 0 4px;'
      }));
      var recalc = h('button', { class: 'btn', text: '重新判定一次' });
      recalc.addEventListener('click', function () {
        refresh(); renderPanel(); toast('已按当前背景重新判定');
      });
      P.appendChild(row('文字颜色重算', recalc));
    } else {
      var uiColor = h('input', { type: 'color', value: cfg.textColor.ui || '#e8e8e8', style: 'width:44px;height:26px;padding:0;border:none;background:none;cursor:pointer;' });
      uiColor.addEventListener('change', function () { cfg.textColor.ui = uiColor.value; refresh(); });
      P.appendChild(row('界面文字（全局）', uiColor));
      var chatColor = h('input', { type: 'color', value: cfg.textColor.chat || '#e8e8e8', style: 'width:44px;height:26px;padding:0;border:none;background:none;cursor:pointer;' });
      chatColor.addEventListener('change', function () { cfg.textColor.chat = chatColor.value; refresh(); });
      P.appendChild(row('聊天正文（覆盖全局）', chatColor));
    }

    P.appendChild(h('h3', { text: '🛡 可读性遮罩（L1-L4）' }));
    P.appendChild(row('场景组合', select([
      { value: 'off', label: '关闭' },
      { value: 'hero', label: '全屏大图：L1 0.3 + L2 底部渐变 + L4' },
      { value: 'nav', label: '导航栏：L3 毛玻璃 + L4' },
      { value: 'card', label: '内容卡片：L3 毛玻璃白卡' },
      { value: 'badge', label: '浮动徽章：L3 pill + L4' },
      { value: 'free', label: '任意位置文字：L4 + 亮度采样 + L1 0.2' }
    ], cfg.readability.scene || 'off', function (v) {
      applyReadScene(v); refresh(); renderPanel();
    })));
    if (cfg.readability.scene !== 'off') {
      P.appendChild(row('L1 全局压暗', checkbox(cfg.readability.l1.enabled, function (v) {
        cfg.readability.l1.enabled = v; refresh(); renderPanel();
      })));
      if (cfg.readability.l1.enabled) {
        P.appendChild(row('L1 压暗强度', slider(5, 70, cfg.readability.l1.opacity, function (v) {
          cfg.readability.l1.opacity = v; refresh();
        })));
      }
      P.appendChild(row('L2 局部渐变', checkbox(cfg.readability.l2.enabled, function (v) {
        cfg.readability.l2.enabled = v; refresh(); renderPanel();
      })));
      if (cfg.readability.l2.enabled) {
        P.appendChild(row('L2 位置', select([
          { value: 'bottom', label: '底部（文字在下）' },
          { value: 'top', label: '顶部' },
          { value: 'both', label: '上下都要' }
        ], cfg.readability.l2.edge, function (v) { cfg.readability.l2.edge = v; refresh(); })));
        P.appendChild(row('L2 最深', slider(10, 95, cfg.readability.l2.strength, function (v) {
          cfg.readability.l2.strength = v; refresh();
        })));
        P.appendChild(row('L2 覆盖比例(%)', slider(10, 100, cfg.readability.l2.size, function (v) {
          cfg.readability.l2.size = v; refresh();
        })));
      }
      P.appendChild(row('L3 毛玻璃容器', checkbox(cfg.readability.l3.enabled, function (v) {
        cfg.readability.l3.enabled = v; refresh(); renderPanel();
      })));
      if (cfg.readability.l3.enabled) {
        P.appendChild(row('L3 模糊(px)', slider(2, 40, cfg.readability.l3.strength, function (v) {
          cfg.readability.l3.strength = v; refresh();
        })));
        P.appendChild(row('L3 饱和(%)', slider(100, 220, cfg.readability.l3.saturate, function (v) {
          cfg.readability.l3.saturate = v; refresh();
        })));
      }
      P.appendChild(row('L4 文字光晕', checkbox(cfg.readability.l4.enabled, function (v) {
        cfg.readability.l4.enabled = v; refresh(); renderPanel();
      })));
      if (cfg.readability.l4.enabled) {
        P.appendChild(row('L4 阴影预设', select([
          { value: '0 1px 2px rgba(0,0,0,.6), 0 2px 8px rgba(0,0,0,.4)', label: '标准轮廓光' },
          { value: '0 1px 3px rgba(0,0,0,.85), 0 0 12px rgba(0,0,0,.55)', label: '重阴影（复杂纹理）' },
          { value: '0 0 8px rgba(255,255,255,.8), 0 1px 2px rgba(0,0,0,.55)', label: '白描边（暗底）' }
        ], cfg.readability.l4.shadow, function (v) { cfg.readability.l4.shadow = v; refresh(); })));
        if (cfg.readability.scene !== 'free') {
          P.appendChild(row('L4 白字', checkbox(cfg.readability.l4.white, function (v) {
            cfg.readability.l4.white = v; refresh();
          })));
        }
      }
      P.appendChild(h('div', {
        text: 'L1 兜底压暗，L2 只在文字区加深，L3 把纹理虚化，L4 1px 轮廓光。free 场景会按文字区域采样背景亮度自动切黑白字。',
        style: 'opacity:.6;font-size:11px;margin:2px 0 6px;'
      }));
    }

    P.appendChild(h('h3', { text: '🖼 背景图' }));
    P.appendChild(row('启用背景', checkbox(cfg.background.enabled, function (v) {
      cfg.background.enabled = v; refresh(); renderPanel();   // 开/关背景都重新判定文字色
    })));
    var pg = h('div', { class: 'preset-grid' });
    Object.keys(BG_PRESETS).forEach(function (k) {
      var b = h('button', {
        class: 'sw' + (cfg.background.kind === 'preset' && cfg.background.preset === k ? ' on' : ''),
        style: 'background:' + BG_PRESETS[k].css + ';'
      }, [h('span', { class: 'lb', text: BG_PRESETS[k].label })]);
      b.addEventListener('click', function () {
        cfg.background.kind = 'preset'; cfg.background.preset = k; cfg.background.enabled = true;
        refresh();            // 内含 applyCSS → 自动文字颜色按新背景重新判定
        renderPanel();
      });
      pg.appendChild(b);
    });
    P.appendChild(pg);
    var pickBtn = h('button', { class: 'btn', text: bgImageDataUrl ? '更换自定义图片…' : '选择自定义图片…' });
    var fileInput = h('input', { type: 'file', accept: 'image/*', style: 'display:none' });
    fileInput.addEventListener('change', function () {
      var f = fileInput.files && fileInput.files[0];
      if (!f) return;
      Promise.all([
        downscaleImage(f, 1920, 0.82),
        downscaleImage(f, 240, 0.66)      // 缩略图（画廊用，避免载入大图）
      ]).then(function (rs) {
        var dataUrl = rs[0], thumb = rs[1];
        return bgGalleryAdd({ name: (f.name || '图片').slice(0, 28), dataUrl: dataUrl, thumb: thumb });
      }).then(function (id) {
        cfg.background.kind = 'image';
        cfg.background.imageDataId = id;
        cfg.background.enabled = true;
        bgImageDataUrl = bgGalleryFull(id) || null;
        sampleBgImage();
        refresh(); renderPanel();
        toast('已加入我的方案');
      }).catch(function (e) { toast('图片读取失败：' + (e && e.message || e)); });
    });
    pickBtn.addEventListener('click', function () { fileInput.click(); });
    P.appendChild(row('添加自定义图片', pickBtn));
    // 「我的方案」：用过的图片自动入库，点缩略图切换，✕ 删除
    var gal = h('div', { class: 'preset-grid', style: 'grid-template-columns:repeat(4,1fr);' });
    if (!bgGallery.length) {
      P.appendChild(h('div', { text: '添加过的图片会自动保存成「我的方案」，下次一键切换', style: 'opacity:.55;font-size:11px;margin:2px 0 4px;' }));
    } else {
      bgGallery.forEach(function (g) {
        var item = h('div', { style: 'position:relative;' });
        var b = h('button', {
          class: 'sw' + (cfg.background.kind === 'image' && cfg.background.imageDataId === g.id ? ' on' : ''),
          style: 'background:url("' + String(g.thumb || '').replace(/"/g, '%22') + '") center/cover no-repeat;',
          title: g.name
        });
        b.addEventListener('click', function () {
          bgGalleryLoad(g.id).then(function () {
            cfg.background.kind = 'image';
            cfg.background.imageDataId = g.id;
            cfg.background.enabled = true;
            sampleBgImage();
            refresh(); renderPanel();
          });
        });
        var x = h('button', {
          class: 'xbtn', text: '✕', title: '从我的方案中删除',
          style: 'position:absolute;right:-4px;top:-4px;width:16px;height:16px;font-size:9px;line-height:1;'
        });
        x.addEventListener('click', function (e) {
          if (e && e.stopPropagation) e.stopPropagation();
          bgGalleryRemove(g.id);
          if (cfg.background.imageDataId === g.id) {
            cfg.background.kind = 'preset'; cfg.background.preset = 'none';
            cfg.background.imageDataId = null; cfg.background.enabled = false;
            bgImageDataUrl = null; bgImageAvg = null;
          }
          refresh(); renderPanel();
        });
        item.appendChild(b); item.appendChild(x);
        gal.appendChild(item);
      });
      P.appendChild(row('我的方案', gal));
    }
    var delBtn = h('button', { class: 'btn', text: '清除当前背景图' });
    delBtn.addEventListener('click', function () {
      var cur = cfg.background.imageDataId;
      cfg.background.kind = 'preset';
      cfg.background.preset = 'none';
      cfg.background.imageDataId = null;
      cfg.background.enabled = false;
      bgImageDataUrl = null;
      bgImageAvg = null;
      if (cur && cur !== 'bg-image') bgGalleryRemove(cur);   // 只清当前，方案库其它图保留
      refresh(); renderPanel();
      toast('已清除当前背景图');
    });
    P.appendChild(row('清除当前', delBtn));
    P.appendChild(fileInput);
    P.appendChild(row('显示不透明度', slider(10, 100, cfg.background.opacity, function (v) {
      cfg.background.opacity = v; refresh(); renderPanel();   // 透明度影响可见底色 → 文字色随之重算
    })));
    P.appendChild(row('压暗（护读性）', slider(0, 80, cfg.background.dim, function (v) {
      cfg.background.dim = v; refresh(); renderPanel();
    })));
    P.appendChild(row('铺满方式', select([{ value: 'cover', label: '铺满裁切' }, { value: 'contain', label: '完整显示' }], cfg.background.fit, function (v) { cfg.background.fit = v; refresh(); })));

    P.appendChild(h('h3', { text: '🫧 玻璃效果' }));
    P.appendChild(row('模式', select([
      { value: 'none', label: '关闭' }, { value: 'frost', label: '毛玻璃' }, { value: 'jelly', label: '果冻玻璃' }
    ], cfg.glass.mode, function (v) { cfg.glass.mode = v; refresh(); })));
    P.appendChild(row('模糊强度', slider(0, 100, cfg.glass.strength, function (v) { cfg.glass.strength = v; refresh(); })));

    P.appendChild(h('h3', { text: '🌧 天气动效' }));
    P.appendChild(row('下雨', checkbox(cfg.effects.rain, function (v) { cfg.effects.rain = v; refresh(); })));
    P.appendChild(row('雨量', slider(5, 100, cfg.effects.rainDensity, function (v) { cfg.effects.rainDensity = v; initDrops(); refresh(); })));
    P.appendChild(row('风力（左右）', slider(-100, 100, cfg.effects.wind, function (v) { cfg.effects.wind = v; refresh(); })));
    P.appendChild(row('闪电', checkbox(cfg.effects.thunder, function (v) { cfg.effects.thunder = v; })));
    P.appendChild(row('下雪', checkbox(cfg.effects.snow, function (v) { cfg.effects.snow = v; refresh(); })));
    P.appendChild(row('雪量', slider(5, 100, cfg.effects.snowDensity, function (v) { cfg.effects.snowDensity = v; initFlakes(); refresh(); })));
    P.appendChild(row('星光闪烁', checkbox(cfg.effects.stars, function (v) { cfg.effects.stars = v; refresh(); })));
    P.appendChild(row('星光密度', slider(5, 100, cfg.effects.starDensity, function (v) { cfg.effects.starDensity = v; initStars(); refresh(); })));
    if (cfg.effects.stars) {
      P.appendChild(row('偶发流星', checkbox(cfg.effects.meteor, function (v) { cfg.effects.meteor = v; refresh(); })));
    }
    P.appendChild(row('风吹落叶', checkbox(cfg.effects.leaf, function (v) { cfg.effects.leaf = v; refresh(); })));
    P.appendChild(row('叶量', slider(5, 100, cfg.effects.leafDensity, function (v) { cfg.effects.leafDensity = v; initLeafs(); refresh(); })));
    P.appendChild(row('发送按钮霓虹灯', checkbox(cfg.effects.neonSend, function (v) { cfg.effects.neonSend = v; refresh(); })));
    P.appendChild(row('打字火星子（光标处崩星）', checkbox(cfg.effects.sparks, function (v) {
      cfg.effects.sparks = v; refresh(); renderPanel();
    })));
    if (cfg.effects.sparks) {
      P.appendChild(row('火星子密度', slider(5, 100, cfg.effects.sparkDensity, function (v) {
        cfg.effects.sparkDensity = v;
      })));
    }
    P.appendChild(row('联动本地天气（联网）', checkbox(cfg.weather.link, function (v) { cfg.weather.link = v; weatherStartStop(); refresh(); renderPanel(); })));
    if (cfg.weather.link) {
      P.appendChild(h('div', {
        text: '按当前定位取 open-meteo 实况自动切换雨/雪/风/夜星（仅传经纬度，每 30 分钟刷新，需定位权限；失败时保持手动设置）' +
          (weather.note ? ' · 上次失败：' + weather.note : ''),
        style: 'opacity:.6;font-size:11px;margin:2px 0 4px;'
      }));
    }

    P.appendChild(h('h3', { text: '🖋 字体' }));
    var fontOptions = [{ value: 'system', label: '默认（系统）' }].concat(
      Object.keys(FONT_STACKS).filter(function (k) { return k !== 'system'; }).map(function (k) { return { value: k, label: FONT_STACKS[k].label }; })
    ).concat(customFonts.map(function (f) { return { value: 'zap:' + f.name, label: '⭐ ' + f.name }; }));
    P.appendChild(row('界面字体', select(fontOptions, cfg.font.ui, function (v) { cfg.font.ui = v; refresh(); })));
    P.appendChild(row('聊天正文字体', select(fontOptions, cfg.font.chat, function (v) { cfg.font.chat = v; refresh(); })));
    P.appendChild(row('代码等宽字体', select(fontOptions, cfg.font.mono, function (v) { cfg.font.mono = v; refresh(); })));
    P.appendChild(row('界面字号', slider(85, 125, cfg.font.size, function (v) { cfg.font.size = v; refresh(); })));
    P.appendChild(row('输入框字号', select([
      { value: 'auto', label: '跟随界面' }, { value: 's', label: '小 13px' }, { value: 'm', label: '中 15px' }, { value: 'l', label: '大 17px' }
    ], cfg.font.inputSize || 'auto', function (v) { cfg.font.inputSize = v; refresh(); })));
    P.appendChild(row('点代码框放大 / 双击代码·文字块放大 / 双击输入框放大编辑', checkbox(cfg.zoom.enabled, function (v) { cfg.zoom.enabled = v; save(); })));
    P.appendChild(h('h3', { text: '⌨ 输入光标' }));
    P.appendChild(row('光标样式', select([
      { value: 'native', label: '系统光标（可改色）' },
      { value: 'custom', label: '自绘光标（可改形状）' }
    ], cfg.caretFx.mode || 'native', function (v) { cfg.caretFx.mode = v; refresh(); renderPanel(); })));
    if (cfg.caretFx.mode === 'custom') {
      P.appendChild(row('形状', select([
        { value: 'bar', label: '竖线' },
        { value: 'block', label: '方块' },
        { value: 'underline', label: '下划线' }
      ], cfg.caretFx.shape || 'bar', function (v) { cfg.caretFx.shape = v; refresh(); })));
      P.appendChild(row('粗细', slider(1, 6, cfg.caretFx.width || 2, function (v) { cfg.caretFx.width = v; refresh(); })));
      P.appendChild(row('闪烁', select([
        { value: 'normal', label: '正常（1.06s）' },
        { value: 'slow', label: '慢（1.6s）' },
        { value: 'fast', label: '快（0.7s）' },
        { value: 'off', label: '不闪' }
      ], cfg.caretFx.blink || 'normal', function (v) { cfg.caretFx.blink = v; refresh(); })));
    }
    P.appendChild(row('光标颜色', select([
      { value: 'theme', label: '跟随主题色' },
      { value: 'custom', label: '自定义…' },
      { value: 'off', label: '默认（不改）' }
    ], (cfg.caretFx.color === 'theme' || cfg.caretFx.color === 'off') ? cfg.caretFx.color : 'custom',
      function (v) {
        if (v === 'custom') {
          cfg.caretFx.color = (cfg.caretFx.color && cfg.caretFx.color !== 'theme' && cfg.caretFx.color !== 'off')
            ? cfg.caretFx.color : '#7dd3fc';
        } else cfg.caretFx.color = v;
        refresh(); renderPanel();
      })));
    if (cfg.caretFx.color !== 'theme' && cfg.caretFx.color !== 'off') {
      var cc = h('input', { type: 'color', value: cfg.caretFx.color || '#7dd3fc',
        style: 'width:44px;height:26px;padding:0;border:none;background:none;cursor:pointer;' });
      cc.addEventListener('change', function () { cfg.caretFx.color = cc.value; refresh(); });
      P.appendChild(row('自定义光标色', cc));
    }
    P.appendChild(row('（附加）鼠标指针形状', select([
      { value: 'default', label: '默认箭头' },
      { value: 'pointer', label: '手型' },
      { value: 'crosshair', label: '十字准星' },
      { value: 'move', label: '移动' },
      { value: 'zoom-in', label: '放大镜' },
      { value: 'help', label: '帮助' },
      { value: 'not-allowed', label: '禁止' }
    ], cfg.caretFx.cursor || 'default', function (v) { cfg.caretFx.cursor = v; refresh(); })));
    P.appendChild(row('输入区按钮行透明无边框（与输入框统一）', checkbox(cfg.composerFlat.enabled, function (v) { cfg.composerFlat.enabled = v; refresh(); })));
    P.appendChild(row('发送按键', select([
      { value: 'enter', label: 'Enter 发送（默认）' },
      { value: 'space', label: '空格发送（Shift+空格 输入空格）' }
    ], cfg.chat.sendKey || 'enter', function (v) { cfg.chat.sendKey = v; refresh(); })));
    P.appendChild(row('输入框独立底色', checkbox(cfg.composerBg.enabled, function (v) {
      cfg.composerBg.enabled = v; refresh(); renderPanel();
    })));
    if (cfg.composerBg.enabled) {
      var cbg = h('input', { type: 'color', value: cfg.composerBg.color || '#1b1d24', style: 'width:44px;height:26px;padding:0;border:none;background:none;cursor:pointer;' });
      cbg.addEventListener('change', function () { cfg.composerBg.color = cbg.value; refresh(); renderPanel(); });
      P.appendChild(row('输入框底色', cbg));
      P.appendChild(row('输入框不透明度', slider(0, 100, cfg.composerBg.opacity, function (v) {
        cfg.composerBg.opacity = v; refresh(); renderPanel();
      })));
    }
    P.appendChild(row('正文行距', slider(100, 200, cfg.font.lineHeight, function (v) { cfg.font.lineHeight = v; refresh(); })));
    P.appendChild(row('界面圆角', slider(50, 150, cfg.font.radius, function (v) { cfg.font.radius = v; refresh(); })));
    var fontBtn = h('button', { class: 'btn', text: '安装字体文件（.ttf/.otf）…' });
    var fontInput = h('input', { type: 'file', accept: '.ttf,.otf,.woff,.woff2', style: 'display:none' });
    fontInput.addEventListener('change', function () {
      var f = fontInput.files && fontInput.files[0];
      if (!f) return;
      var reader = new FileReader();
      reader.onload = function () {
        var name = f.name.replace(/\.(ttf|otf|woff2?|TTF|OTF|WOFF2?)$/, '');
        var format = /\.otf$/i.test(f.name) ? 'opentype' : (/\.woff2?$/i.test(f.name) ? 'woff' : 'truetype');
        idbSet('font:' + name, { name: name, format: format, dataUrl: reader.result }).then(function () {
          return loadCustomFonts();
        }).then(function () {
          renderPanel();
          toast('字体已安装：' + name + '（可在字体下拉中选择）');
        }).catch(function (e) { toast('字体保存失败：' + (e && e.message || e)); });
      };
      reader.onerror = function () { toast('字体读取失败'); };
      reader.readAsDataURL(f);
    });
    fontBtn.addEventListener('click', function () { fontInput.click(); });
    P.appendChild(row('自定义字体', fontBtn));
    P.appendChild(fontInput);
    if (customFonts.length) {
      var del = h('button', { class: 'btn warn', text: '删除全部自定义字体' });
      del.addEventListener('click', function () {
        Promise.all(customFonts.map(function (f) { return idbDel('font:' + f.name); }))
          .then(loadCustomFonts).then(function () { renderPanel(); refresh(); toast('已删除'); });
      });
      P.appendChild(row('已装 ' + customFonts.length + ' 个', del));
    }
    P.appendChild(h('div', { class: 'tips', text: '「主席书法」推荐放毛体字体文件（如 方正毛体.ttf）：安装后该选项自动优先使用；未安装时回退华文行楷/楷体。' }));

    P.appendChild(h('h3', { text: '📊 指标与余额' }));
    P.appendChild(row('显示模型速度条', checkbox(cfg.metrics.showBar, function (v) { cfg.metrics.showBar = v; updateMetricsChip(); save(); })));
    P.appendChild(row('余额模式', select([
      { value: 'auto', label: '自动抓取（实验）' }, { value: 'manual', label: '手动填写' }, { value: 'off', label: '关闭' }
    ], cfg.metrics.balanceMode, function (v) { cfg.metrics.balanceMode = v; updateMetricsChip(); save(); })));
    var balInput = h('input', { type: 'text', placeholder: '如：余额 ¥12.30 · 剩余 86%', value: cfg.metrics.balanceManual, style: 'max-width:170px' });
    balInput.addEventListener('change', function () { cfg.metrics.balanceManual = balInput.value; updateMetricsChip(); save(); });
    P.appendChild(row('手动余额文本', balInput));
    P.appendChild(h('div', { class: 'tips', text: '自动抓取：打开客户端「用量/套餐」页即可（页面文字变化后约 1 秒更新）；若该页为内嵌网页或始终抓不到，请用手动模式。' }));
    // 速度明细：会话总速度 + 逐任务速度（最近 12 轮）；内容随轮次动态刷新
    var speedBox = h('div', { class: 'row', style: 'display:block;' });
    ui.speedHead = h('div', { style: 'font-size:12px;margin:2px 0 4px;opacity:.9;' });
    ui.speedList = h('div', { style: 'max-height:132px;overflow:auto;font-size:11px;line-height:1.7;opacity:.85;' });
    speedBox.appendChild(ui.speedHead);
    speedBox.appendChild(ui.speedList);
    P.appendChild(h('div', { class: 'row', style: 'display:block;' }, [
      h('label', { text: '速度明细（逐任务）' }), speedBox
    ]));
    // 统计源诊断（v0.1.17）：显示事件流/DOM 估算状态与已收到的帧/事件计数
    var dg = tpsDisplay();
    var modeTxt = dg.mode === 'stream' ? '事件流（真实 usage）'
      : (dg.mode === 'dom' ? 'DOM 估算（未接管事件流）' : '未连接（等下一轮/DOM 兜底未启用）');
    ui.diagBox = h('div', { style: 'font-size:11px;opacity:.75;line-height:1.7;' });
    var diagBox = ui.diagBox;
    var resetBtn = h('button', { class: 'btn', text: '重置统计' });
    resetBtn.addEventListener('click', function () {
      tps.sess.out = 0; tps.sess.in = 0; tps.sess.cache = 0; tps.sess.turns = 0;
      tps.sess.decodeMs = 0; tps.sess.decOut = 0; tps.sess.list = [];
      tps.last.tps = 0; tps.last.ttft = 0; tps.last.out = 0;
      updateMetricsChip(); renderPanel();
      toast('统计已重置');
    });
    P.appendChild(h('div', { class: 'row', style: 'display:block;' }, [
      h('label', { text: '统计源诊断' }), diagBox, h('div', { style: 'margin-top:6px;' }, [resetBtn])
    ]));
    renderSpeedList();
    renderDiag();

    P.appendChild(h('h3', { text: '🍿 趣味：火星文' }));
    P.appendChild(row('火星文显示模式', checkbox(cfg.fun.martian, function (v) { cfg.fun.martian = v; refresh(); })));
    P.appendChild(row('我的消息也火星文', checkbox(cfg.fun.mine, function (v) { cfg.fun.mine = v; refresh(); })));
    P.appendChild(row('助手回复火星文', checkbox(cfg.fun.assistant, function (v) { cfg.fun.assistant = v; refresh(); })));
    P.appendChild(row('界面文字也火星文（侧边栏/菜单等）', checkbox(cfg.fun.chrome, function (v) { cfg.fun.chrome = v; refresh(); })));
    P.appendChild(row('符号浓度（ゞ〃彡☆﹏）', slider(0, 100, cfg.fun.decor == null ? 60 : cfg.fun.decor, function (v) {
      cfg.fun.decor = v; refresh();
    })));
    P.appendChild(h('div', {
      class: 'tips',
      text: '只改显示层：真正发给模型、消息存储与导出的都是原文；复制火星文选区时剪贴板自动还原为原文；代码块与输入框不受影响；「界面文字」覆盖侧边栏/菜单/按钮等 chrome 文本（数字与英文不受映射影响）；「符号浓度」控制 ゞ〃彡☆﹏ 这类装饰符号的密度（0=只用同形字）。关闭开关立即全量还原。'
    }));

    P.appendChild(h('h3', { text: '⚙ 其他' }));
    P.appendChild(row('Alt+Z 唤出面板', checkbox(cfg.hotkey, function (v) { cfg.hotkey = v; save(); })));
    var exportBtn = h('button', { class: 'btn', text: '导出配置' });
    exportBtn.addEventListener('click', exportConfig);
    var importBtn = h('button', { class: 'btn', text: '导入配置' });
    importBtn.addEventListener('click', importConfig);
    P.appendChild(row('配置备份', h('span', {}, [exportBtn, importBtn])));
    P.appendChild(h('div', {
      class: 'tips',
      text: 'zcode-90sOldschool v' + VERSION + ' · 完全本地运行、零网络请求 · TPS/Token 为估算值 · 面板可点外部或按 Esc 关闭 · 还原客户端请运行插件目录下的 还原外观.cmd'
    }));
  }

  function toast(msg) {
    var t = h('div', { class: 'toast', text: msg });
    ui.root.appendChild(t);
    requestAnimationFrame(function () { t.classList.add('show'); });
    setTimeout(function () {
      t.classList.remove('show');
      setTimeout(function () { t.remove(); }, 300);
    }, 2600);
  }

  function exportConfig() {
    try {
      var text = JSON.stringify(cfg, null, 2);
      var box = h('textarea', { style: 'position:fixed;left:-9999px;top:0;' });
      box.value = text;
      ui.root.appendChild(box);
      box.select();
      document.execCommand('copy');
      box.remove();
      toast('配置已复制到剪贴板（JSON）');
    } catch (e) { toast('导出失败'); }
  }
  function importConfig() {
    var box = h('textarea', { placeholder: '粘贴配置 JSON 后点确定', style: 'width:100%;height:90px;margin-top:6px;background:rgba(255,255,255,.08);color:#e8ecf4;border:1px solid rgba(255,255,255,.2);border-radius:8px;font-size:11px;padding:6px;' });
    var ok = h('button', { class: 'btn', text: '确定导入', style: 'margin-top:6px;' });
    ok.addEventListener('click', function () {
      try {
        cfg = deepMerge(DEFAULTS, JSON.parse(box.value));
        refresh();
        renderPanel();
        toast('配置已导入');
      } catch (e) { toast('JSON 解析失败'); }
    });
    ui.panel.appendChild(h('div', {}, [box, ok]));
  }

  function renderDiag() {
    if (!ui.diagBox) return;
    var dg = tpsDisplay();
    var modeTxt = dg.mode === 'stream' ? '事件流（真实 usage）'
      : (dg.mode === 'dom' ? 'DOM 估算（未接管事件流）' : '未连接');
    ui.diagBox.innerHTML = '';
    ui.diagBox.appendChild(h('div', { text: '统计源：' + modeTxt }));
    ui.diagBox.appendChild(h('div', { text: '帧 ' + dg.diag.frames + ' · 行事件 ' + dg.diag.rows +
      ' · usage ' + dg.diag.usage + ' · chunk ' + dg.diag.chunks + ' · 未识别帧 ' + dg.diag.otherFrames }));
    ui.diagBox.appendChild(h('div', { text: '握手 ' + dg.handoffSeen + ' 次 · 最后帧 ' +
      (dg.diag.lastFrameAt ? Math.round((Date.now() - dg.diag.lastFrameAt) / 1000) + 's 前' : '无') +
      (dg.diag.lastFrameKeys ? ' · 字段 ' + dg.diag.lastFrameKeys : '') }));
  }
  function renderSpeedList() {
    if (!ui.speedHead || !ui.speedList) return;
    var st = tpsDisplay();
    ui.speedHead.textContent = mt('总速度 ') +
      (st.sessAvg > 0 ? st.sessAvg.toFixed(1) + ' tok/s' + mt('（' + st.sessTurns + ' 轮加权）') : mt('暂无数据'));
    ui.speedList.innerHTML = '';
    if (!st.list || !st.list.length) {
      ui.speedList.appendChild(h('div', { text: mt('还没有完成的轮次'), style: 'font-size:11px;opacity:.5;' }));
      return;
    }
    st.list.slice(0, 12).forEach(function (it) {
      var line = (it.est ? '~' : '') + (it.tps > 0 ? it.tps.toFixed(1) : '—') + ' tok/s · ' +
        (it.out || 0) + ' tok · ' + mt('首字 ') + Math.round((it.ttft || 0) * 1000) + 'ms · ' + mt(it.label || '');
      ui.speedList.appendChild(h('div', { text: line, title: mt('解码 ') + Math.round((it.decodeMs || 0) / 100) / 10 + 's' }));
    });
  }

  function updateMetricsChip() {
    if (!ui.chip) return;
    try { updateMetricsChipInner(); } catch (e) { warn('指标条刷新失败', e); }
  }
  function updateMetricsChipInner() {
    renderSpeedList();
    renderDiag();
    var show = cfg.metrics.showBar;
    ui.chip.classList.toggle('hide', !show);
    if (!show) return;
    ui.chip.innerHTML = '';
    ui.chip.appendChild(h('span', { class: 'grip', text: '⠿' }));
    var parts = [];
    var st = tpsDisplay();
    if (st.live && st.tps > 0) {
      parts.push(h('b', { text: st.tps.toFixed(1) + ' tok/s' }));
      // 本轮均速（自首块累计，含生成中的实时摊薄）
      if (st.liveElapsed > 1 && st.liveOut > 0) {
        parts.push(h('span', { text: mt(' (均 ') + (st.liveOut / st.liveElapsed).toFixed(1) + ')', style: 'opacity:.7' }));
      }
      if (st.out) parts.push(h('span', { text: ' · out ' + fmtTok(st.out), style: 'opacity:.75' }));
    } else if (st.lastTps > 0) {
      parts.push(h('span', { text: mt('上次 ') + st.lastTps.toFixed(1) + ' tok/s · ' + mt('首字 ') + Math.round(st.lastTtft * 1000) + 'ms · out ' + fmtTok(st.lastOut) }));
    } else {
      var waitTxt = st.mode === 'none'
        ? mt('等待对话…（未接管事件流）')
        : mt('等待对话…');
      parts.push(h('span', {
        text: waitTxt, style: 'opacity:.6',
        title: st.mode === 'none' ? '未收到客户端 ServicePort 端口（可能启动时错过握手）；已启用 DOM 估算兜底或等待下一轮' : '已接管事件流'
      }));
    }
    if (st.sessOut > 0) {
      parts.push(h('span', { class: 'sep', text: '|' }));
      var sessTxt = mt('会话 ') + st.sessTurns + mt(' 轮 · 出 ') + fmtTok(st.sessOut) +
        (st.sessIn > 0 ? mt(' · 入 ') + fmtTok(st.sessIn) : '');
      parts.push(h('span', { text: (st.est ? '~ ' : '') + sessTxt,
        title: st.est ? 'DOM 估算口径（未接管事件流），数值带 ~' : '客户端事件流真实 token 计数' }));
    }
    // 总速度（会话加权均：Σ有效轮 out ÷ Σ解码秒），与「瞬时/上次」并列
    if (st.sessAvg > 0) {
      parts.push(h('span', { class: 'sep', text: '|' }));
      parts.push(h('span', {
        text: mt('总速 ') + st.sessAvg.toFixed(1) + ' tok/s',
        title: '会话总速度：只统计有可靠解码时长的轮次（Σ输出 token ÷ Σ解码秒），不含工具等待',
        style: 'opacity:.9'
      }));
    }
    var bal = balanceText();
    if (bal) {
      parts.push(h('span', { class: 'sep', text: '|' }));
      parts.push(h('span', { class: 'bal', text: bal, title: '余额显示（实验性）' }));
    }
    parts.forEach(function (p) { ui.chip.appendChild(p); });
  }
  function fmtTok(n) {
    if (n >= 1000000) return (n / 1000000).toFixed(1) + 'M';
    if (n >= 1000) return (n / 1000).toFixed(1) + 'k';
    return String(n);
  }
  /* 指标条等自绘 UI 的火星文化：UI 在 shadow DOM 内不会被 walker 扫到，需主动转换 */
  function mt(s) {
    s = String(s == null ? '' : s);
    return (cfg.fun && cfg.fun.martian) ? martianize(s) : s;
  }
  function balanceText() {
    var m = cfg.metrics;
    if (!m.showBalance) return '';
    if (m.balanceMode === 'off') return '';
    if (m.balanceMode === 'manual') return m.balanceManual || '';
    if (balance.text) {
      var ago = balance.updated ? ' · ' + timeAgo(balance.updated) : '';
      return '💳 ' + balance.text + ago;
    }
    return '💳 余额：打开客户端「用量」页自动抓取';
  }
  function timeAgo(ts) {
    var s = Math.round((Date.now() - ts) / 1000);
    if (s < 90) return '刚刚';
    if (s < 3600) return Math.round(s / 60) + '分钟前';
    return Math.round(s / 3600) + '小时前';
  }
  setInterval(function () { if (cfg.metrics.showBar) updateMetricsChip(); }, 700);

  /* 自定义背景图缩放入库（避免 localStorage/IDB 膨胀） */
  function downscaleImage(file, maxSide, quality) {
    return new Promise(function (resolve, reject) {
      var reader = new FileReader();
      reader.onerror = function () { reject(new Error('read error')); };
      reader.onload = function () {
        var img = new Image();
        img.onerror = function () { reject(new Error('decode error')); };
        img.onload = function () {
          try {
            var k = Math.min(1, maxSide / Math.max(img.width, img.height));
            var c = document.createElement('canvas');
            c.width = Math.round(img.width * k); c.height = Math.round(img.height * k);
            c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
            resolve(c.toDataURL('image/jpeg', quality));
          } catch (e) { reject(e); }
        };
        img.src = reader.result;
      };
      reader.readAsDataURL(file);
    });
  }

  function loadCustomFonts() {
    return idbKeys().then(function (keys) {
      var loads = keys.filter(function (k) { return typeof k === 'string' && k.indexOf('font:') === 0; })
        .map(function (k) { return idbGet(k).then(function (v) { return v; }); });
      return Promise.all(loads);
    }).then(function (arr) {
      customFonts = arr.filter(Boolean);
    }).catch(function (e) { warn('自定义字体加载失败', e); customFonts = []; });
  }
  function loadBgImage() {
    if (!cfg.background || cfg.background.kind !== 'image' || !cfg.background.imageDataId) return Promise.resolve();
    var id = cfg.background.imageDataId;
    var p = id === 'bg-image' ? idbGet('bg-image') : (idbGet('bgimg-' + id).then(function (v) {
      return v || idbGet('bg-image');   // 兼容旧版单一存图键
    }));
    return p.then(function (v) {
      bgImageDataUrl = v && v.dataUrl || null;
      if (bgImageDataUrl) sampleBgImage();
      if (!bgImageDataUrl) { cfg.background.kind = 'preset'; }
    }).catch(function () { cfg.background.kind = 'preset'; });
  }
  /* 「我的方案」图库：索引存 Idb（含缩略图），全图按 bgimg-<id> 单条存 */
  function loadBgGallery() {
    return idbGet('bg-gallery').then(function (v) {
      bgGallery = Array.isArray(v) ? v : [];
      bgGallery.forEach(function (g) { if (g.dataUrl) bgGalleryData.set(g.id, g.dataUrl); });
      // 老版本只存过 bg-image：迁移成第一条方案
      if (!bgGallery.length) {
        return idbGet('bg-image').then(function (legacy) {
          if (!legacy || !legacy.dataUrl) return;
          return bgGalleryAdd({ name: '历史图片', dataUrl: legacy.dataUrl, thumb: legacy.dataUrl, id: 'bg-image' }).then(function () {
            if (!cfg.background.imageDataId) cfg.background.imageDataId = 'bg-image';
          });
        });
      }
    }).catch(function () { bgGallery = []; });
  }
  function bgGalleryAdd(rec) {
    var id = rec.id || ('img' + Date.now());
    var entry = { id: id, name: rec.name || '图片', at: Date.now(), thumb: rec.thumb || rec.dataUrl };
    bgGallery = bgGallery.filter(function (g) { return g.id !== id; });
    bgGallery.unshift(entry);
    while (bgGallery.length > 12) {   // 上限 12 张，最旧的连全图一起清
      var old = bgGallery.pop();
      try { idbDel('bgimg-' + old.id); } catch (e) { /* 已在别处删除 */ }
      bgGalleryData.delete(old.id);
    }
    bgGalleryData.set(id, rec.dataUrl);
    var write = id === 'bg-image' ? Promise.resolve() : idbSet('bgimg-' + id, { dataUrl: rec.dataUrl });
    return write.then(function () { return idbSet('bg-gallery', bgGallery); }).then(function () { return id; });
  }
  function bgGalleryFull(id) {
    if (bgGalleryData.has(id)) return bgGalleryData.get(id);
    var g = bgGallery.filter(function (x) { return x.id === id; })[0];
    return g ? g.thumb : null;   // 未取全图前退回缩略图（首帧不空白）
  }
  function bgGalleryLoad(id) {
    if (bgGalleryData.has(id)) {
      bgImageDataUrl = bgGalleryData.get(id);
      return Promise.resolve(bgImageDataUrl);
    }
    var p = id === 'bg-image' ? idbGet('bg-image') : idbGet('bgimg-' + id);
    return p.then(function (v) {
      bgImageDataUrl = (v && v.dataUrl) || null;
      if (bgImageDataUrl) bgGalleryData.set(id, bgImageDataUrl);
      return bgImageDataUrl;
    }).catch(function () { bgImageDataUrl = null; return null; });
  }
  function bgGalleryRemove(id) {
    bgGallery = bgGallery.filter(function (g) { return g.id !== id; });
    bgGalleryData.delete(id);
    try { idbDel('bgimg-' + id); } catch (e) { /* 忽略 */ }
    return idbSet('bg-gallery', bgGallery).catch(function () { /* 落盘失败不影响本次会话 */ });
  }

  /* ==================================================================
   * 总刷新 & 启动
   * ================================================================== */
  var saveTimer = 0;
  function save() {
    clearTimeout(saveTimer);
    saveTimer = setTimeout(function () { saveConfig(cfg); }, 300);
  }
  var lastMartianKey = '';
  /* 发送按钮标记（霓虹灯用）：按文案/aria/title/位置识别，React 重渲染后自动补标 */
  function isSendButton(btn) {
    var hay = (btn.className && typeof btn.className === 'string' ? btn.className : '') + ' ' +
      (btn.getAttribute('aria-label') || '') + ' ' + (btn.getAttribute('title') || '') + ' ' +
      (btn.getAttribute('data-testid') || '') + ' ' + (btn.textContent || '').slice(0, 12);
    if (/send|submit|发送|提交/i.test(hay)) return true;
    // composer/输入区里的最后一个按钮（发送键常在右下角尾部）
    var wrap = btn.closest('[class*="composer" i],[class*="input-box" i],[class*="chat-input" i],[class*="prompt" i]');
    if (wrap) {
      // 输入区内其后不再有其它按钮的按钮 = 尾部发送键（不依赖 querySelectorAll）
      var sib = btn.nextElementSibling;
      while (sib) {
        if (sib.tagName === 'BUTTON' || (sib.querySelector && sib.querySelector('button'))) return false;
        sib = sib.nextElementSibling;
      }
      return true;
    }
    return false;
  }
  var sendTagTimer = 0;
  function tagSendButtons() {
    var on = !!(cfg.enabled && cfg.effects && cfg.effects.neonSend);
    var all = document.querySelectorAll('.zcode-ap-send');
    for (var i = 0; i < all.length; i++) {
      if (!on || !isSendButton(all[i])) all[i].classList.remove('zcode-ap-send');
    }
    if (!on) return;
    var btns = document.querySelectorAll('button');
    for (var j = 0; j < btns.length; j++) {
      var b = btns[j];
      if (b.closest && b.closest('#zcode-90sOldschool-ui')) continue;
      if (isSendButton(b)) b.classList.add('zcode-ap-send');
    }
  }
  function sendTagStart() {
    if (sendTagTimer) clearInterval(sendTagTimer);
    tagSendButtons();
    sendTagTimer = setInterval(function () { tagSendButtons(); tagComposerCard(); }, 1500);   // 轻量轮询，覆盖 React 重渲染
    tagComposerCard();
    tagFloatingPopovers();
    // 浮层出现得快、消失也快：单独用 600ms 轮询（只扫带菜单特征的元素）
    setInterval(tagFloatingPopovers, 600);
  }

  function refresh() {
    applyCSS();
    fxApply();
    updateMetricsChip();
    save();
    if (cfg.effects && cfg.effects.neonSend) tagSendButtons();
    // 火星文只在开关/方向/覆盖范围变化时重算，避免滑杆等操作反复全量遍历
    var mk = (cfg.fun.martian ? '1' : '0') + (cfg.fun.mine ? '1' : '0') + (cfg.fun.assistant ? '1' : '0') +
      (cfg.fun.chrome ? '1' : '0') + '|' + (cfg.fun.decor == null ? 60 : cfg.fun.decor);
    if (mk !== lastMartianKey) {
      lastMartianKey = mk;
      martianRefresh();
    }
  }

  function start() {
    try {
      if (!document.body) {
        document.addEventListener('DOMContentLoaded', start, { once: true });
        return;
      }
      captureTokens();
      ensureBgLayer();
      ensureReadabilityLayers();
      loadCustomFonts()
        .then(loadBgGallery)
        .then(loadBgImage)
        .then(function () {
          applyCSS();
          buildUI();
          fxApply();
          save();   // 启动即落盘一次合并后的配置，便于导出与后续迁移
          martianStart();
          lastMartianKey = (cfg.fun.martian ? '1' : '0') + (cfg.fun.mine ? '1' : '0') + (cfg.fun.assistant ? '1' : '0');
          tpsObserverStart();
          balanceObserverStart();
          weatherStartStop();
          sendTagStart();
          zoomStart();
          sendKeyStart();
          sparksStart();
          caretFxStart();
          menuTagStart();
          // 主题明暗切换时重新快照 token：先清掉我们注入的覆盖再取值，
          // 否则会把「半透明混合值」当原始值，来回切换越叠越透。
          // v0.1.9 修复启动卡死：本回调会摘 html 上我们的类、applyCSS 又加回去，
          // 类属性真变更会再次触发本观察器——微任务级自旋、主线程永不 yield
          // （客户端启动改一次 html 类即触发）。双重防护：150ms 去抖 + 重入闩
          // （处理期间与其自身产生的记录全部忽略，setTimeout 宏任务后才解锁，
          // 而自身记录的微任务投递先于宏任务，恰好被闩挡住）。
          var themeSnapBusy = false, themeSnapTimer = 0;
          var themeSnapRun = function () {
            if (themeSnapBusy) return;
            themeSnapBusy = true;
            try {
              if (styleEl) styleEl.textContent = '';
              htmlEl.classList.remove(PREFIX, 'zcode-ap-bg', 'zcode-ap-glass');
              captureTokens();
            } catch (e) { /* 取不到就用旧快照 */ }
            try { applyCSS(); } catch (e2) { /* 重建失败保持旧值 */ }
            setTimeout(function () { themeSnapBusy = false; }, 0);
          };
          new MutationObserver(function () {
            if (themeSnapBusy) return;
            clearTimeout(themeSnapTimer);
            themeSnapTimer = setTimeout(themeSnapRun, 150);
          }).observe(htmlEl, { attributes: true, attributeFilter: ['class'] });
          // 快捷键
          document.addEventListener('keydown', function (ev) {
            if (!cfg.hotkey) return;
            if (ev.altKey && !ev.ctrlKey && !ev.shiftKey && (ev.key === 'z' || ev.key === 'Z')) {
              if (ev.target && /INPUT|TEXTAREA/.test(ev.target.tagName)) return;
              togglePanel();
              ev.preventDefault();
            }
          });
          log('v' + VERSION, '已启动', cfg.enabled ? '(启用)' : '(停用)');
        })
        .catch(function (e) { warn('启动失败', e); });
    } catch (e) { warn('致命异常（已吞掉，不影响客户端）', e); }
  }

  start();
})();
