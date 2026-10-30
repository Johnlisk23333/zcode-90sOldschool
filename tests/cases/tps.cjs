/* v012-smoke.cjs — v0.1.12：TPS 总速度/逐轮明细、chip 火星文、输入框字号、上下文条选择器、放大层 */
'use strict';
const path = require('path');
const ENGINE = path.resolve(__dirname, '..', '..', 'scripts', 'zcode-90sOldschool.js');

/* ---------- 假 DOM 桩（对齐引擎 h()/classList/setAttribute 联动） ---------- */
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
    __handlers: {}, _innerHTML: '', textContent: '',
    style: { cssText: '' },
    get innerHTML() { return this._innerHTML; },
    set innerHTML(v) { this._innerHTML = String(v); if (v === '') this.children.length = 0; },
    addEventListener(t, fn) { (this.__handlers[t] = this.__handlers[t] || []).push(fn); },
    removeEventListener() {},
    fire(t, ev) { (this.__handlers[t] || []).forEach(fn => fn.call(this, ev)); },
    setAttribute(k, v) {
      this.attributes[k] = String(v);
      if (k === 'class' && this.classList) this.classList._reset(v);
    },
    getAttribute(k) { return this.attributes[k] === undefined ? null : this.attributes[k]; },
    appendChild(c) { this.children.push(c); return c; },
    remove() {},
    closest: () => null,
    getBoundingClientRect: () => ({ left: 0, top: 0, width: 10, height: 10 }),
    attachShadow() { const sh = makeEl('#shadow'); this.shadowRoot = sh; return sh; },
    querySelector: () => null,
    getContext: () => new Proxy({}, { get: () => () => undefined }),
    select() {}, click() {}
  };
  el.classList = makeClassList(el);
  el.__syncClass = () => { el.attributes['class'] = el.classList.toString(); };
  return el;
}
const htmlEl = makeEl('html'), bodyEl = makeEl('body'), headEl = makeEl('head');
Object.defineProperty(bodyEl, 'firstChild', { get() { return bodyEl.children[0] || null; } });
Object.defineProperty(headEl, 'firstChild', { get() { return headEl.children[0] || null; } });
const insertBefore = function (node, ref) {
  const i = ref ? this.children.indexOf(ref) : -1;
  if (i < 0) this.children.push(node); else this.children.splice(i, 0, node);
  return node;
};
bodyEl.insertBefore = insertBefore.bind(bodyEl);
headEl.insertBefore = insertBefore.bind(headEl);
const winListeners = {}, docListeners = {};
globalThis.window = globalThis;
globalThis.NodeFilter = { SHOW_TEXT: 4 };
globalThis.document = {
  documentElement: htmlEl, body: bodyEl, head: headEl, hidden: false,
  createElement: makeEl,
  createTextNode: t => ({ nodeType: 3, textContent: t }),
  addEventListener: (t, fn) => { (docListeners[t] = docListeners[t] || []).push(fn); },
  removeEventListener: () => {},
  querySelector: () => null,
  querySelectorAll: () => [],
  createTreeWalker: (root) => {
    const out = [];
    (function walk(n) { for (const c of n.children || []) { if (c.nodeType === 3) out.push(c); else walk(c); } })(root);
    let i = 0;
    return { nextNode() { return i < out.length ? out[i++] : null; } };
  },
  execCommand: () => true
};
globalThis.addEventListener = (t, fn) => { (winListeners[t] = winListeners[t] || []).push(fn); };
globalThis.removeEventListener = () => {};
globalThis.matchMedia = () => ({ matches: false });
globalThis.getComputedStyle = () => ({ getPropertyValue: () => '' });
const storage = new Map();
globalThis.localStorage = {
  getItem: k => (storage.has(k) ? storage.get(k) : null),
  setItem: (k, v) => storage.set(k, String(v)),
  removeItem: k => storage.delete(k)
};
globalThis.indexedDB = undefined;
globalThis.MutationObserver = class { observe() {} disconnect() {} };
globalThis.requestAnimationFrame = () => 0;
globalThis.cancelAnimationFrame = () => {};
globalThis.innerWidth = 1280; globalThis.innerHeight = 800; globalThis.devicePixelRatio = 1.25;
globalThis.Image = class { set src(v) { if (this.onload) this.onload(); } };
globalThis.FileReader = class { readAsDataURL() { if (this.onerror) this.onerror(new Error('stub')); } };
Object.defineProperty(globalThis, 'top', { value: globalThis });

/* ---------- 加载引擎 ---------- */
require(ENGINE);

/* ---------- 工具 ---------- */
const sleep = ms => new Promise(r => setTimeout(r, ms));
function elText(el) {
  let s = typeof el.textContent === 'string' ? el.textContent : '';
  (el.children || []).forEach(c => { s += elText(c); });
  return s;
}
function findChip() {
  const host = bodyEl.children.find(c => c.id === 'zcode-90sOldschool-ui');
  if (!host || !host.shadowRoot) return null;
  const scan = (el) => {
    if ((el.attributes['class'] || '').split(/\s+/).includes('chip')) return el;
    for (const c of (el.children || [])) { const r = scan(c); if (r) return r; }
    return null;
  };
  for (const c of host.shadowRoot.children) { const r = scan(c); if (r) return r; }
  return null;
}
function chipText() { const c = findChip(); return c ? elText(c) : ''; }
function liveTpsFromChip() {
  const m = chipText().match(/(\d+(?:\.\d+)?) tok\/s/);
  return m ? parseFloat(m[1]) : NaN;
}
let pass = 0, fail = 0;
function findDeep(el, pred) {
  if (!el) return null;
  if (pred(el)) return el;
  for (const c of (el.children || [])) { const r = findDeep(c, pred); if (r) return r; }
  return null;
}
function assert(name, cond, extra) {
  if (cond) { pass++; console.log('PASS', name); }
  else { fail++; console.log('FAIL', name, extra === undefined ? '' : '→ ' + extra); }
}

/* ---------- ServicePort 事件桩 ---------- */
const port = {
  started: 0, handlers: [],
  addEventListener(t, fn) { this.handlers.push(fn); },
  start() { this.started++; },
  fire(data) { this.handlers.forEach(fn => fn({ data })); }
};
function fireHandoff() {
  (winListeners['message'] || []).forEach(fn =>
    fn({ data: { type: 'zcode:service-port' }, ports: [port] }));
}
const rowFrame = events => JSON.stringify({ frame: { payload: { events } } });
const evFrame = events => JSON.stringify({ version: 1, events });

(async () => {
  await sleep(300);   // 引擎 start() 完成、UI 建好
  fireHandoff();

  /* 1. 端口接管：绝不 port.start()（会吃掉客户端 Initialize 握手卡启动） */
  assert('port hooked without start()', port.started === 0 && port.handlers.length > 0,
    'started=' + port.started);

  /* 2. 历史重放（旧轮次 turnHeader 已完结 + assistantText 全文）不计入会话 */
  port.fire(rowFrame([
    { op: 'row.appended', row: { id: 'old1', kind: 'turnHeader', turnId: 'old1', state: 'completedSuccess', startedAt: '2026-10-28T08:00:00.000Z', activeMs: 9000 } },
    { op: 'row.appended', row: { id: 'old1a', kind: 'assistantText', turnId: 'old1', assistantResponseId: 'oldm', createdAt: '2026-10-28T08:00:01.000Z', text: '历史内容'.repeat(50) } }
  ]));
  assert('history replay not counted into session', !/会话 \d+ 轮/.test(chipText()),
    'chip=' + chipText());

  /* 3. 新一轮：turnHeader running + stream.chunk 心跳 + usage 增量 → 4s 窗口差分 */
  const T0 = Date.now(), iso = d => new Date(d).toISOString();
  port.fire(rowFrame([{ op: 'row.appended', row: { id: 't2', kind: 'turnHeader', turnId: 't2', state: 'running', startedAt: iso(T0), sourceCommandId: 'sc2' } }]));
  port.fire(evFrame([{ event: 'stream.chunk', type: 'stream.chunk', occurredAt: iso(T0), sourceCommandId: 'sc2', assistantMessageId: 'm2' }]));   // win=[(0,0)]
  port.fire(evFrame([{ event: 'usage.delta', type: 'usage.delta', occurredAt: iso(T0), sourceCommandId: 'sc2', outputTokens: 30, inputTokens: 1200, cacheReadTokens: 900 }]));
  await sleep(1200);
  port.fire(evFrame([{ event: 'stream.chunk', type: 'stream.chunk', occurredAt: iso(Date.now()), sourceCommandId: 'sc2' }]));   // win 采样 (≈1.2s, 30)
  port.fire(evFrame([{ event: 'usage.delta', type: 'usage.delta', occurredAt: iso(Date.now()), sourceCommandId: 'sc2', outputTokens: 150 }]));
  await sleep(1200);
  port.fire(evFrame([{ event: 'stream.chunk', type: 'stream.chunk', occurredAt: iso(Date.now()), sourceCommandId: 'sc2' }]));   // win 采样 (≈2.4s, 150)
  await sleep(850);   // 等 700ms 刷新间隔重渲染（stream.chunk 本身不触发渲染）
  const steady = liveTpsFromChip();
  assert('steady-state tps ≈ 150tok/2.4s ≈ 62 (got ' + steady + ')',
    isFinite(steady) && steady > 30 && steady < 120, 'chip=' + chipText());

  /* 4. 收尾：turnHeader completedSuccess + activeMs → out/decode */
  port.fire(rowFrame([{ op: 'row.upserted', row: { id: 't2', kind: 'turnHeader', turnId: 't2', state: 'completedSuccess', endedAt: iso(Date.now()), activeMs: 5000 } }]));
  const fin = chipText();
  assert('ended stats: 上次 30.0 tok/s (out150/5s)', /上次 30\.0 tok\/s/.test(fin), 'chip=' + fin);
  assert('ended stats: out 150 shown', /out 150/.test(fin), 'chip=' + fin);
  assert('session counted once: 会话 1 轮 · 出 150', /会话 1 轮 · 出 150/.test(fin), 'chip=' + fin);
  assert('session input shown: 入 1200', /入 1\.2k/.test(fin), 'chip=' + fin);

  /* 5. 单帧大块突发（回归：旧实现同一场景显示 14558 tok/s） */
  port.fire(rowFrame([
    { op: 'row.appended', row: { id: 't3', kind: 'turnHeader', turnId: 't3', state: 'running', startedAt: iso(Date.now()), sourceCommandId: 'sc3' } },
    { op: 'row.appended', row: { id: 't3a', kind: 'assistantText', turnId: 't3', assistantResponseId: 'm3', createdAt: iso(Date.now()), text: '' } }
  ]));
  port.fire(evFrame([{ event: 'stream.chunk', type: 'stream.chunk', occurredAt: iso(Date.now()), sourceCommandId: 'sc3' }]));
  // ArrayBuffer 路径：3000 个 CJK 字符一次性 append（真实场景=批量补发/重放）
  const burst = rowFrame([{ op: 'row.delta', row: { id: 't3a', turnId: 't3', path: 'text', append: '爆'.repeat(3000) } }]);
  port.fire(new TextEncoder().encode(burst).buffer);
  await sleep(1250);
  port.fire(evFrame([{ event: 'stream.chunk', type: 'stream.chunk', occurredAt: iso(Date.now()), sourceCommandId: 'sc3' }]));
  await sleep(850);
  const burstTps = liveTpsFromChip();
  assert('burst capped at ≤3500 & finite (got ' + burstTps + ')',
    isFinite(burstTps) && burstTps <= 3500, 'chip=' + chipText());

  /* 6. assistantText 全文 upsert 覆盖式（不重复累计） */
  port.fire(rowFrame([{ op: 'row.upserted', row: { id: 't3a', kind: 'assistantText', turnId: 't3', assistantResponseId: 'm3', text: '爆'.repeat(3000) + '完' } }]));
  await sleep(1100);
  port.fire(evFrame([{ event: 'stream.chunk', type: 'stream.chunk', occurredAt: iso(Date.now()), sourceCommandId: 'sc3' }]));
  await sleep(850);
  const upTps = liveTpsFromChip();
  assert('upsert full-text overwrite keeps tps bounded (got ' + upTps + ')',
    isFinite(upTps) && upTps <= 3500, 'chip=' + chipText());

  /* ---- v0.1.12 新增断言 ---- */
  // 1) 总速度：t2 = 150tok/5s=30；再跑一轮 t4 = 400tok/4s=100 → 加权 (150+400)/(5+4)s ≈ 61.1
  port.fire(rowFrame([
    { op: 'row.appended', row: { id: 't4', kind: 'turnHeader', turnId: 't4', state: 'running', startedAt: iso(Date.now()), sourceCommandId: 'sc4' } },
    { op: 'row.appended', row: { id: 't4u', kind: 'userInput', turnId: 't4', sourceCommandId: 'sc4', text: '帮我优化一下导出性能' } },
    { op: 'row.appended', row: { id: 't4a', kind: 'assistantText', turnId: 't4', assistantResponseId: 'm4', createdAt: iso(Date.now()), text: '' } }
  ]));
  port.fire(evFrame([{ event: 'stream.chunk', type: 'stream.chunk', occurredAt: iso(Date.now()), sourceCommandId: 'sc4' }]));
  port.fire(evFrame([{ event: 'usage.delta', type: 'usage.delta', occurredAt: iso(Date.now()), sourceCommandId: 'sc4', outputTokens: 400, inputTokens: 800 }]));
  port.fire(rowFrame([{ op: 'row.upserted', row: { id: 't4', kind: 'turnHeader', turnId: 't4', state: 'completedSuccess', endedAt: iso(Date.now()), activeMs: 4000 } }]));
  const st2 = chipText();
  const mAvg = st2.match(/(\d+\.\d) tok\/s/);
  assert('session avg tps ≈ 61.1 (got ' + (mAvg && mAvg[1]) + ')', /总速 61\.1 tok\/s/.test(st2), 'chip=' + st2);
  await sleep(900);   // 等 700ms chip 周期把面板明细刷新出来
  const host0 = bodyEl.children.find(c => c.id === 'zcode-90sOldschool-ui');
  const panel0 = host0 && host0.shadowRoot ? findDeep(host0.shadowRoot, e => (e.attributes['class'] || '').split(/\s+/).includes('panel')) : null;
  const panelTxt = panel0 ? elText(panel0) : '';
  assert('per-task list shows task label', panelTxt.indexOf('帮我优化一下导出性能') >= 0, panelTxt.slice(0, 120));
  assert('per-task list shows both turns (100.0 & 30.0)', panelTxt.indexOf('100.0 tok/s') >= 0 && panelTxt.indexOf('30.0 tok/s') >= 0, panelTxt.slice(0, 160));

  // 2) chip 火星文：开 martian 后 chip 文案应含火星字（如 总→总 不在表，用「会话」→火星）
  const rowsAll = []; (function collect(e) {
    if (!e) return;
    if ((e.attributes['class'] || '').split(/\s+/).includes('row')) rowsAll.push(e);
    (e.children || []).forEach(collect);
  })(panel0);
  const rowM = rowsAll.find(r => elText(r).indexOf('火星文显示模式') >= 0);
  const cbM = rowM ? findDeep(rowM, e => e.tagName === 'INPUT' && e.attributes['type'] === 'checkbox') : null;
  assert('martian checkbox found', !!cbM);
  if (cbM) {
    cbM.checked = true;
    cbM.fire('change');
    await sleep(900);
    const chipM = chipText();
    assert('chip labels martianized when martian on', chipM.indexOf('会话') < 0 && chipM.indexOf('上次') < 0 && chipM.indexOf('总速') < 0,
      'chip=' + chipM.slice(0, 80));
    assert('chip numbers/units kept readable', /tok\/s/.test(chipM));
  }

  console.log(fail === 0 ? 'SMOKE_OK ' + pass + '/' + (pass + fail) : 'SMOKE_FAIL ' + fail + ' failed');
  process.exit(fail === 0 ? 0 : 1);
})().catch(e => { console.error('TPS_SMOKE_CRASH', e); process.exit(2); });
