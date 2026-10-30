/* v027-smoke.cjs — v0.1.10 六功能冒烟
 * 呼吸控件发光 CSS/html 类、文字颜色两路、无背景短路、星光+落叶真帧、天气联动开关不崩。 */
'use strict';
const path = require('path');
const ENGINE = path.resolve(__dirname, '..', '..', 'scripts', 'zcode-90sOldschool.js');

/* ---------- 假 DOM（含父子链 + 可用的 closest 子集 + TreeWalker） ---------- */
function selMatch(el, one) {
  one = one.trim();
  if (!one) return false;
  // 只实现火星文模块用到的选择器形态
  let m;
  if ((m = one.match(/^#([\w-]+)$/))) return el.attributes['id'] === m[1];
  if ((m = one.match(/^\.([\w-]+)$/))) return (el.attributes['class'] || '').split(/\s+/).includes(m[1]);
  if ((m = one.match(/^\[class\*="([^"]+)"( i)?\]$/))) {
    const hay = (el.attributes['class'] || '').toLowerCase();
    return hay.includes(m[2] ? m[1].toLowerCase() : m[1]);
  }
  if ((m = one.match(/^\[([\w-]+)="([^"]*)"\]$/))) return el.attributes[m[1]] === m[2];
  if ((m = one.match(/^\[contenteditable="([^"]*)"\]$/))) return el.attributes['contenteditable'] !== undefined && el.attributes['contenteditable'] === m[1];
  if ((m = one.match(/^\[data-role="([^"]+)"\]$/))) return el.attributes['data-role'] === m[1];
  if (/^[a-zA-Z][\w-]*$/.test(one)) return el.tagName === one.toUpperCase();
  return false;
}
function closestMatch(el, selector) {
  let cur = el;
  while (cur && cur.nodeType === 1) {
    const parts = selector.split(',');
    for (const p of parts) if (selMatch(cur, p)) return cur;
    cur = cur.__parent || null;
  }
  return null;
}
function makeClassList(owner) {
  const set = new Set();
  const cl = {
    add: (...cs) => { cs.forEach(c => set.add(c)); owner.__syncClass(); },
    remove: (...cs) => { cs.forEach(c => set.delete(c)); owner.__syncClass(); },
    contains: c => set.has(c),
    toggle: (c, force) => {
      const on = force === undefined ? !set.has(c) : !!force;
      on ? set.add(c) : set.delete(c); owner.__syncClass(); return on;
    },
    toString: () => Array.from(set).join(' '),
    _reset: v => { set.clear(); String(v).split(/\s+/).filter(Boolean).forEach(c => set.add(c)); }
  };
  return cl;
}
function makeEl(tag) {
  const el = {
    tagName: String(tag).toUpperCase(), nodeType: 1, children: [], attributes: {},
    __handlers: {}, _innerHTML: '', textContent: '', checked: false, isConnected: true,
    __parent: null,
    style: { cssText: '', _props: {}, setProperty(k, v) { this._props[k] = v; }, getPropertyValue(k) { return this._props[k]; } },
    get innerHTML() { return this._innerHTML; },
    set innerHTML(v) { this._innerHTML = String(v); if (v === '') this.children.length = 0; },
    addEventListener(t, fn) { (this.__handlers[t] = this.__handlers[t] || []).push(fn); },
    removeEventListener() {},
    fire(t, ev) { (this.__handlers[t] || []).forEach(fn => fn.call(this, ev)); },
    click() { this.fire('click', { type: 'click', target: this }); },
    setAttribute(k, v) {
      this.attributes[k] = String(v);
      if (k === 'class' && this.classList) this.classList._reset(v);
    },
    getAttribute(k) { return this.attributes[k] === undefined ? null : this.attributes[k]; },
    appendChild(c) { c.__parent = this; this.children.push(c); return c; },
    remove() {},
    closest(selector) { return closestMatch(this, selector); },
    getBoundingClientRect: () => ({ left: 0, top: 0, width: 10, height: 10 }),
    attachShadow() { const sh = makeEl('#shadow'); sh.__parent = this; this.shadowRoot = sh; return sh; },
    querySelector: () => null,
    querySelectorAll(sel) {
      const parts = String(sel).split(',').map(x => x.trim()).filter(Boolean);
      const out = [];
      (function walk(n) {
        for (const c of n.children || []) {
          if (c.nodeType !== 1) continue;
          if (parts.some(p2 => selMatch(c, p2))) out.push(c);
          walk(c);
        }
      })(this);
      return out;
    },
    getContext: () => ({ setTransform() {}, clearRect() {}, beginPath() {}, arc() {}, fill() {}, stroke() {}, moveTo() {}, lineTo() {}, fillRect() {}, createLinearGradient() { return { addColorStop() {} }; }, save() {}, restore() {}, translate() {}, rotate() {}, ellipse() {} })
  };
  el.classList = makeClassList(el);
  el.__syncClass = () => { el.attributes['class'] = el.classList.toString(); };
  return el;
}
function textNode(parent, text) {
  const tn = { nodeType: 3, nodeValue: text, __parent: parent,
    get parentElement() { return this.__parent; }, get parentNode() { return this.__parent; } };
  parent.children.push(tn);
  return tn;
}
function collectText(root, out) {
  for (const c of root.children || []) {
    if (c.nodeType === 3) out.push(c);
    else collectText(c, out);
  }
  return out;
}
const htmlEl = makeEl('html'), bodyEl = makeEl('body'), headEl = makeEl('head');
htmlEl.appendChild(bodyEl); htmlEl.appendChild(headEl);
Object.defineProperty(bodyEl, 'firstChild', { get() { return bodyEl.children[0] || null; } });
Object.defineProperty(headEl, 'firstChild', { get() { return headEl.children[0] || null; } });
const insertBefore = function (node, ref) {
  node.__parent = this;
  const i = ref ? this.children.indexOf(ref) : -1;
  if (i < 0) this.children.push(node); else this.children.splice(i, 0, node);
  return node;
};
bodyEl.insertBefore = insertBefore.bind(bodyEl);
headEl.insertBefore = insertBefore.bind(headEl);
const docListeners = {};
globalThis.window = globalThis;
globalThis.NodeFilter = { SHOW_TEXT: 4 };
globalThis.document = {
  documentElement: htmlEl, body: bodyEl, head: headEl, hidden: false,
  createElement: makeEl,
  createTextNode: t => ({ nodeType: 3, nodeValue: t }),
  createTreeWalker: (root) => {
    const list = root.nodeType === 1 ? collectText(root, []) : (root.nodeType === 3 ? [root] : []);
    let i = 0;
    return { nextNode() { return i < list.length ? list[i++] : null; } };
  },
  querySelectorAll: (sel) => {
    const parts = String(sel).split(',').map(x => x.trim()).filter(Boolean);
    const out = [];
    (function walk(n) {
      for (const c of n.children || []) {
        if (c.nodeType !== 1) continue;
        if (parts.some(p2 => selMatch(c, p2))) out.push(c);
        walk(c);
      }
    })(bodyEl);
    return out;
  },
  addEventListener: (t, fn) => { (docListeners[t] = docListeners[t] || []).push(fn); }, removeEventListener: () => {},
  querySelector: () => null, execCommand: () => true
};
globalThis.addEventListener = () => {};
globalThis.removeEventListener = () => {};
globalThis.matchMedia = () => ({ matches: false });
globalThis.getComputedStyle = () => ({ getPropertyValue: () => '' });
const storage = new Map();
globalThis.localStorage = {
  getItem: k => (storage.has(k) ? storage.get(k) : null),
  setItem: (k, v) => storage.set(k, String(v)),
  removeItem: k => storage.delete(k)
};
storage.set('zcode-appearance-config-v1', JSON.stringify({
  enabled: true, theme: 'sakura', themeIntensity: 70,
  breath: { enabled: true, strength: 60, speed: 'fast' },
  textColor: { enabled: true, auto: false, ui: '#ff8800', chat: '#00ffcc' },
  background: { enabled: true, kind: 'preset', preset: 'none' },
  effects: { stars: true, starDensity: 60, meteor: true, leaf: true, leafDensity: 50, neonSend: false, sparks: true, sparkDensity: 80 },
  chat: { sendKey: 'space' },
  composerBg: { enabled: true, color: '#1b1d24', opacity: 60 },
  readability: {
    scene: 'hero',
    l1: { enabled: true, opacity: 30 },
    l2: { enabled: true, edge: 'bottom', strength: 65, size: 55 },
    l3: { enabled: false, strength: 20, saturate: 150, tint: 'rgba(255,255,255,0.15)' },
    l4: { enabled: true, white: true, shadow: '0 1px 2px rgba(0,0,0,.6), 0 2px 8px rgba(0,0,0,.4)' }
  },
  caretFx: { mode: 'custom', color: '#ff00aa', shape: 'block', width: 4, blink: 'fast', cursor: 'crosshair' },
  weather: { link: true }
}));
globalThis.indexedDB = undefined;
globalThis.MutationObserver = class { observe() {} disconnect() {} };
let rafCb = null;
globalThis.__rafQ = [];
globalThis.requestAnimationFrame = cb => { globalThis.__rafQ.push(cb); return globalThis.__rafQ.length; };
globalThis.cancelAnimationFrame = () => {};
globalThis.innerWidth = 1280; globalThis.innerHeight = 800; globalThis.devicePixelRatio = 1.25;
globalThis.Image = class { set src(v) { if (this.onload) this.onload(); } };
globalThis.FileReader = class { readAsDataURL() { if (this.onerror) this.onerror(new Error('stub')); } };
Object.defineProperty(globalThis, 'top', { value: globalThis });

require(ENGINE);

let pass = 0, fail = 0;
function assert(name, cond, extra) {
  if (cond) { pass++; console.log('PASS', name); }
  else { fail++; console.log('FAIL', name, extra === undefined ? '' : '→ ' + extra); }
}
function findDeep(el, pred) {
  if (pred(el)) return el;
  for (const c of (el.children || [])) { const r = findDeep(c, pred); if (r) return r; }
  return null;
}
function elText(el) {
  let s = typeof el.textContent === 'string' ? el.textContent : '';
  (el.children || []).forEach(c => { s += elText(c); });
  return s;
}

setTimeout(() => {
  try {
    const style = headEl.children.find(c => c.id === 'zcode-90sOldschool-style');
    const css = style ? style.textContent : '';
    const host = bodyEl.children.find(c => c.id === 'zcode-90sOldschool-ui');
    const panel = host && host.shadowRoot ? findDeep(host.shadowRoot, e => (e.attributes['class'] || '').split(/\s+/).includes('panel')) : null;
    const canvas = bodyEl.children.find(c => c.id === 'zcode-ap-fx');

    /* 1. 呼吸灯控件发光 */
    assert('breath overlay css present', /#zcode-ap-breath\{[^}]*soft-light/.test(css));
    assert('no control outline breathing (v0.1.13)', css.indexOf('zapUIBreath') < 0 && css.indexOf('outline:2px') < 0);
    assert('html has zcode-ap-breathe class', htmlEl.classList.contains('zcode-ap-breathe'));

    /* 2. 文字颜色两路 */
    assert('textColor ui global rule', / \*\{color:#ff8800!important;\}/.test(css), css.slice(css.indexOf('*{color'), css.indexOf('*{color') + 40));
    assert('textColor chat prose rule', /\.prose\{color:#00ffcc!important;\}/.test(css));

    /* 3. 无背景短路：启用但 preset=none → 不注入背景规则 */
    assert('background none short-circuit (no bg rule)', css.indexOf('#zcode-ap-bg{') < 0);

    /* 4. 星光+落叶：canvas 显示 + 真帧不崩（ctx 已扩展 ellipse/save/restore/translate/rotate） */
    assert('fx canvas visible for stars+leaf', !!canvas && canvas.style.display !== 'none');
    let frameErr = null;
    try {
      for (let i = 0; i < 240; i++) { if (rafCb) { const cb = rafCb; rafCb = null; cb(performance.now() + 16 * (i + 2)); } }
    } catch (e) { frameErr = e; }
    assert('240 frames stars+leaf without crash', frameErr === null, frameErr && frameErr.message);

    /* 5. 天气联动开关在面板中存在且能勾选（navigator 缺失走 catch，不崩） */
    const rowsAll = []; (function collect(e) {
      if ((e.attributes['class'] || '').split(/\s+/).includes('row')) rowsAll.push(e);
      (e.children || []).forEach(collect);
    })(panel);
    const rowW = rowsAll.find(r => elText(r).indexOf('联动本地天气') >= 0) || null;
    const cbW = rowW ? findDeep(rowW, e => e.tagName === 'INPUT' && e.attributes['type'] === 'checkbox') : null;
    assert('weather link checkbox in panel', !!cbW);
    if (cbW) {
      cbW.checked = false;
      cbW.fire('change');   // weatherStartStop 停止路径
    }

    /* 6. 清除自定义图片按钮存在 */
    assert('clear-image button in panel', elText(panel).indexOf('清除当前') >= 0);

    /* v0.1.23 新背景：浅绿 / 豆绿 */
    const swLabels = [];
    (function collectSw(e) {
      (e.children || []).forEach(function (c) {
        if ((c.attributes['class'] || '').split(/\s+/).includes('sw')) swLabels.push(elText(c));
        collectSw(c);
      });
    })(panel);
    assert('preset 浅绿 exists', swLabels.indexOf('浅绿') >= 0, swLabels.join('/').slice(0, 120));
    assert('preset 豆绿 exists', swLabels.indexOf('豆绿') >= 0, swLabels.join('/').slice(0, 120));

    const swLight = findDeep(panel, function (e) {
      return (e.attributes['class'] || '').split(/\s+/).includes('sw') && elText(e) === '浅绿';
    });
    if (swLight && swLight.__handlers.click) swLight.fire('click');
    const cssLight = style.textContent;
    assert('light-green gradient applied', cssLight.indexOf('#eefaf2') >= 0 && cssLight.indexOf('#a3dcbb') >= 0,
      (cssLight.match(/#zcode-ap-bg\{[^}]*\}/) || [''])[0].slice(0, 90));
    assert('light-green layer is gradient not image', /#zcode-ap-bg\{[^}]*linear-gradient/.test(cssLight));

    const swBean = findDeep(panel, function (e) {
      return (e.attributes['class'] || '').split(/\s+/).includes('sw') && elText(e) === '豆绿';
    });
    if (swBean && swBean.__handlers.click) swBean.fire('click');
    const cssBean = style.textContent;
    assert('bean-green gradient applied', cssBean.indexOf('#f0f4da') >= 0 && cssBean.indexOf('#adc17b') >= 0,
      (cssBean.match(/#zcode-ap-bg\{[^}]*\}/) || [''])[0].slice(0, 90));
    assert('bean-green layer differs from light-green', cssBean !== cssLight);

    /* ---- v0.1.24 ---- */
    // 1) 光标样式 CSS
    assert('native caret color path replaced by custom (transparent)', /caret-color:transparent!important/.test(css), (css.match(/caret-color:[^;]*;/) || [''])[0]);
    assert('cursor shape applied but inputs excluded',
      /cursor:crosshair!important/.test(css) && /:not\(input\):not\(textarea\)/.test(css));
    assert('panel has 发送按键 / 光标样式 rows',
      elText(panel).indexOf('发送按键') >= 0 && elText(panel).indexOf('光标样式') >= 0 && elText(panel).indexOf('鼠标指针形状') >= 0);

    // 2) 空格发送：在 composer 里按空格 → 触发发送按钮 click，且 preventDefault
    const cw = makeEl('div'); cw.setAttribute('class', 'composer-wrap');
    let sent = 0;
    const sendBtn = makeEl('button'); sendBtn.setAttribute('class', 'send-btn');
    sendBtn.addEventListener('click', () => { sent++; });
    const taX = makeEl('textarea'); taX.value = 'abc';
    cw.appendChild(taX); cw.appendChild(sendBtn);
    bodyEl.appendChild(cw);
    let prevented = false;
    (docListeners['keydown'] || []).forEach(fn => fn({
      key: ' ', shiftKey: false, ctrlKey: false, altKey: false, metaKey: false, isComposing: false,
      target: taX, preventDefault() { prevented = true; }, stopPropagation() {}
    }));
    assert('space key triggers send button', sent === 1, 'sent=' + sent);
    assert('space key preventDefault', prevented);

    // Shift+空格 不应发送
    sent = 0; prevented = false;
    (docListeners['keydown'] || []).forEach(fn => fn({
      key: ' ', shiftKey: true, ctrlKey: false, altKey: false, metaKey: false, isComposing: false,
      target: taX, preventDefault() { prevented = true; }, stopPropagation() {}
    }));
    assert('shift+space does not send', sent === 0 && !prevented, 'sent=' + sent);

    // 3) 火星子：input 事件 → 生成粒子与画布
    (docListeners['input'] || []).forEach(fn => fn({ target: taX, type: 'input' }));
    const sc = bodyEl.children.find(c => c.id === 'zcode-ap-sparks');
    assert('spark canvas created', !!sc, 'canvas=' + !!sc);
    assert('spark canvas is overlay only', !!sc && sc.style.pointerEvents === 'none');

    /* ---- v0.1.25 自绘输入光标 ---- */
    globalThis.document.activeElement = taX;
    (docListeners['selectionchange'] || []).forEach(fn => fn({ type: 'selectionchange' }));
    (function drain(n) {
      for (let i = 0; i < n; i++) {
        const q = globalThis.__rafQ.splice(0, globalThis.__rafQ.length);
        q.forEach(cb => { try { cb(performance.now()); } catch (e) {} });
      }
    })(3);
    assert('custom mode hides native caret', /caret-color:transparent!important/.test(css), (css.match(/caret-color:[^;]*;/) || [''])[0]);
    assert('caret box css has blink keyframes', /#zcode-ap-caret\{[^}]*zapCaretBlink/.test(css) && /@keyframes zapCaretBlink/.test(css));
    assert('caret box created and visible', (function () {
      const b = bodyEl.children.find(c => c.id === 'zcode-ap-caret');
      return !!b && b.style.display === 'block';
    })(), 'box=' + !!bodyEl.children.find(c => c.id === 'zcode-ap-caret'));
    assert('caret box uses configured color', (function () {
      const b = bodyEl.children.find(c => c.id === 'zcode-ap-caret');
      return !!b && String(b.style.background).indexOf('#ff00aa') >= 0;
    })());
    assert('caret box block shape & width', (function () {
      const b = bodyEl.children.find(c => c.id === 'zcode-ap-caret');
      return !!b && b.style.width === '0.55em';
    })());

    /* ---- v0.1.25 圆角卡片：输入框底色只画在带圆角的那层 ---- */
    const rounded = makeEl('div');
    rounded.setAttribute('class', 'composer-card');
    rounded._radius = '16px';
    Object.defineProperty(rounded, 'getBoundingClientRect', { value: () => ({ left: 0, top: 0, width: 300, height: 60 }) });
    const innerTa = makeEl('textarea'); innerTa.value = 'x';
    rounded.appendChild(innerTa);
    bodyEl.appendChild(rounded);
    // 让 getComputedStyle 对该节点返回圆角
    const prevGCS = globalThis.getComputedStyle;
    globalThis.getComputedStyle = (el) => {
      if (el === rounded) return { borderTopLeftRadius: '16px', getPropertyValue: () => '' };
      if (el === popMenu) {
        return { position: 'fixed', zIndex: '1000', borderTopLeftRadius: '12px', getPropertyValue: () => '' };
      }
      return prevGCS ? prevGCS(el) : { getPropertyValue: () => '' };
    };
    /* ---- v0.1.27 浮层菜单 ---- */
    const popMenu = makeEl('div');
    popMenu.setAttribute('class', 'dropdown-panel');
    popMenu.setAttribute('role', 'menu');
    const popItem = makeEl('div'); popItem.setAttribute('role', 'menuitem');
    const popItemText = textNode(popItem, '深度思考');
    popMenu.appendChild(popItem);
    Object.defineProperty(popMenu, 'getBoundingClientRect', {
      value: () => ({ left: 100, top: 100, width: 220, height: 160 })
    });
    bodyEl.appendChild(popMenu);

    /* ---- v0.1.26 可读性遮罩 ---- */
    const rCss = () => style.textContent;
    assert('L1 dim layer exists with 0.30', /#zcode-ap-dim\{[^}]*rgba\(0,0,0,0\.30\)/.test(rCss()), (rCss().match(/#zcode-ap-dim\{[^}]*\}/) || [''])[0]);
    assert('L1 dim element created', !!bodyEl.children.find(c => c.id === 'zcode-ap-dim'));
    assert('L2 scrim is bottom-up gradient to transparent',
      /#zcode-ap-scrim\{[^}]*linear-gradient\(to top,rgba\(0,0,0,0\.650\)/.test(rCss()) && /transparent 55%/.test(rCss()),
      (rCss().match(/#zcode-ap-scrim\{[^}]*\}/) || [''])[0].slice(0, 130));
    assert('L2 scrim element created', !!bodyEl.children.find(c => c.id === 'zcode-ap-scrim'));
    assert('hero scene has no L3 backdrop-filter (popover blur is separate)', !/backdrop-filter:blur\(20px\) saturate\(1\.50\)/.test(rCss()));
    assert('L4 text-shadow applied to prose',
      /text-shadow:0 1px 2px rgba\(0,0,0,\.6\), 0 2px 8px rgba\(0,0,0,\.4\)!important/.test(rCss()) &&
      /\.prose/.test(rCss()),
      (rCss().match(/[^{}]*\.prose[^{}]*\{[^}]*text-shadow[^}]*\}/) || [''])[0].slice(0, 140));
    assert('L4 white text applied', /\.prose\{color:#fff!important;\}/.test(rCss()));

    // 切到 nav 场景：L3 毛玻璃 + L4，L1/L2 关闭
    const rowScene = (function () {
      const rows = []; (function walk(e) {
        if ((e.attributes['class'] || '').split(/\s+/).includes('row')) rows.push(e);
        (e.children || []).forEach(walk);
      })(panel);
      return rows.find(r => elText(r).indexOf('场景组合') >= 0) || null;
    })();
    const selScene = rowScene ? findDeep(rowScene, e => e.tagName === 'SELECT') : null;
    assert('scene select in panel', !!selScene);
    if (selScene) { selScene.value = 'nav'; selScene.fire('change'); }
    setTimeout(() => {
      const c2 = rCss();
      assert('nav scene applies L3 backdrop blur', /backdrop-filter:blur\(20px\) saturate\(1\.50\)/.test(c2), (c2.match(/backdrop-filter:[^;]*;/) || [''])[0]);
      assert('nav scene removes L1 dim rule', c2.indexOf('#zcode-ap-dim{') < 0);
      assert('nav scene removes L2 scrim rule', c2.indexOf('#zcode-ap-scrim{') < 0);
      assert('nav scene keeps L4 shadow', /text-shadow:0 1px 2px rgba\(0,0,0,\.6\)/.test(c2));

      // 切到 badge 场景：L3 深色 pill
      if (selScene) { selScene.value = 'badge'; selScene.fire('change'); }
      setTimeout(() => {
        const c3 = rCss();
        assert('badge scene uses dark pill tint', /background-color:rgba\(0,0,0,0\.45\)!important/.test(c3), (c3.match(/background-color:rgba\(0,0,0,[^;]*;/) || [''])[0]);
        assert('badge scene blur 14px', /blur\(14px\)/.test(c3));

        // free 场景：采样后自动黑白字（深色背景 -> #fff）
        if (selScene) { selScene.value = 'free'; selScene.fire('change'); }
        setTimeout(() => {
          const c4 = rCss();
          assert('free scene keeps L1 at 0.20', /rgba\(0,0,0,0\.20\)/.test(c4), (c4.match(/#zcode-ap-dim\{[^}]*\}/) || [''])[0]);
          assert('free scene picks a black or white prose color', /\.prose\{color:(#fff|#0b0d12)!important;\}/.test(c4),
            (c4.match(/\.prose\{color:[^}]*\}/) || [''])[0]);

          // 关掉场景 → 所有规则消失
          if (selScene) { selScene.value = 'off'; selScene.fire('change'); }
          setTimeout(() => {
            const c5 = rCss();
            assert('off scene removes all readability rules',
              c5.indexOf('#zcode-ap-dim{') < 0 && c5.indexOf('#zcode-ap-scrim{') < 0 && c5.indexOf('text-shadow:0 1px 2px') < 0);
            /* ---- v0.1.27 浮层 ---- */
            setTimeout(() => {
              const c6 = style.textContent;
              assert('floating menu tagged .zcode-ap-pop', popMenu.classList.contains('zcode-ap-pop'),
                'cls=' + popMenu.attributes['class']);
              assert('popover bg tinted with theme accent',
                /\.zcode-ap-pop\{[^}]*background-color:color-mix\(in oklab,#f472b6 \d+%/.test(c6),
                (c6.match(/\.zcode-ap-pop\{[^}]*\}/) || [''])[0].slice(0, 120));
              assert('popover uses backdrop blur', /\.zcode-ap-pop\{[^}]*backdrop-filter:blur\(16px\)/.test(c6));
              assert('popover overflow opened for submenu', /\.zcode-ap-pop\{overflow:visible!important;\}/.test(c6));
              assert('popover text color overridden', /\.zcode-ap-pop,html[^{]*\.zcode-ap-pop \*\{color:#[0-9a-f]{6}!important;\}/.test(c6),
                (c6.match(/[^{}]*\.zcode-ap-pop \*\{color:[^}]*\}/) || [''])[0].slice(0, 120));
              assert('popover inputs keep default color', /\.zcode-ap-pop input[^{]*\{color:var\(--color-foreground,canvastext\)!important;\}/.test(c6));

              console.log(fail === 0 ? 'SMOKE_OK ' + pass + '/' + (pass + fail) : 'SMOKE_FAIL ' + fail + ' failed');
              process.exit(fail === 0 ? 0 : 1);
            }, 800);
            // 最终汇总在浮层断言后打印，这里不再重复
          }, 120);
        }, 120);
      }, 120);
    }, 120);
  } catch (e) {
    console.error('V010_SMOKE_CRASH', e);
    process.exit(2);
  }
}, 600);
