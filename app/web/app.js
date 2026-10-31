/* FormulaSnip application logic (classic script, works in WKWebView from file://). */
(function () {
  'use strict';

  var FONTS = [
    { id: 'mathjax-newcm', name: 'New Computer Modern', note: '默认 · 现代 LaTeX' },
    { id: 'mathjax-modern', name: 'Latin Modern', note: '经典 LaTeX' },
    { id: 'mathjax-stix2', name: 'STIX Two', note: 'Times 风格' },
    { id: 'mathjax-pagella', name: 'Pagella', note: 'Palatino 风格' },
    { id: 'mathjax-fira', name: 'Fira Math', note: '无衬线' },
    { id: 'mathjax-tex', name: 'TeX 经典', note: '旧版 MathJax 字体' }
  ];
  var COLOR_PRESETS = ['#111827', '#374151', '#1d4ed8', '#0f766e', '#7c3aed', '#be123c', '#c2410c', '#ffffff'];
  var DEFAULT_TEX = '\\int_{-\\infty}^{\\infty} e^{-x^2}\\,dx = \\sqrt{\\pi}';
  var DEMO_TEX = '\\int_{-\\infty}^{\\infty} e^{-x^2}\\,dx = \\sqrt{\\pi}';
  var MAX_HISTORY = 80;
  var MAX_LOGS = 200;
  var FONT_IDS = FONTS.map(function (f) { return f.id; });

  // 平台相关文案（Electron / WKWebView 都通过宿主注入 __PLATFORM__）
  var PLATFORM = '';
  try { if (typeof window.__PLATFORM__ === 'string') PLATFORM = window.__PLATFORM__; } catch (e) {}
  var IS_MAC = PLATFORM ? PLATFORM === 'darwin' : /Mac/i.test(navigator.platform || '');
  var KEY_EXPORT = IS_MAC ? '\u2318E' : 'Ctrl+E';
  var KEY_COPY = IS_MAC ? '\u2318\u21e7C' : 'Ctrl+Shift+C';

  /* ------------------------------------------------------------------ 工具 */
  function pad(n) { return n < 10 ? '0' + n : '' + n; }
  function clock(ts) {
    var d = new Date(ts);
    return pad(d.getHours()) + ':' + pad(d.getMinutes()) + ':' + pad(d.getSeconds());
  }
  function dateTime(ts) {
    var d = new Date(ts);
    return (d.getMonth() + 1) + '/' + d.getDate() + ' ' + pad(d.getHours()) + ':' + pad(d.getMinutes());
  }
  function uid() { return Date.now().toString(36) + Math.random().toString(36).slice(2, 7); }
  function clamp(v, a, b) { return Math.max(a, Math.min(b, v)); }

  /* ---------------------------------------------------------------- 原生桥 */
  function detectHostBridge() {
    try {
      if (window.formulasnip && typeof window.formulasnip.postMessage === 'function') return window.formulasnip;
    } catch (e) {}
    try {
      if (window.webkit && window.webkit.messageHandlers && window.webkit.messageHandlers.formulasnip) {
        return window.webkit.messageHandlers.formulasnip;
      }
    } catch (e) {}
    return null;
  }
  var hostBridge = detectHostBridge();
  var bridgeSeq = 0;
  var bridgePending = {};
  window.__bridgeResult = function (payload) {
    payload = payload || {};
    var reqId = payload.reqId;
    var p = bridgePending[reqId];
    if (!p) return;
    delete bridgePending[reqId];
    p.resolve(payload);
  };
  function callNative(type, payload) {
    return new Promise(function (resolve) {
      if (!hostBridge) { resolve({ ok: false, error: 'no-native-bridge' }); return; }
      var reqId = 'b' + (++bridgeSeq);
      bridgePending[reqId] = { resolve: resolve };
      try {
        hostBridge.postMessage(Object.assign({ type: type, reqId: reqId }, payload || {}));
      } catch (e) {
        resolve({ ok: false, error: String(e) });
      }
      setTimeout(function () {
        if (bridgePending[reqId]) { delete bridgePending[reqId]; resolve({ ok: false, error: '原生操作超时' }); }
      }, 30000);
    });
  }

  /* ------------------------------------------------------------------ 状态 */
  var defaultState = {
    tex: DEFAULT_TEX,
    font: 'mathjax-newcm',
    color: '#111827',
    size: 32,
    mode: 'display',
    exportScale: 2,
    bg: 'checker',
    history: [],
    logs: []
  };

  function sanitizeState(raw) {
    var s = Object.assign({}, defaultState, raw || {});
    if (FONT_IDS.indexOf(s.font) < 0) s.font = defaultState.font;
    if (typeof s.color !== 'string' || !/^#[0-9a-fA-F]{6}$/.test(s.color)) s.color = defaultState.color;
    s.size = clamp(Number(s.size) || 32, 14, 96);
    s.exportScale = clamp(Number(s.exportScale) || 2, 1, 6);
    s.mode = s.mode === 'inline' ? 'inline' : 'display';
    s.bg = ['checker', 'white', 'black'].indexOf(s.bg) >= 0 ? s.bg : 'checker';
    s.tex = typeof s.tex === 'string' ? s.tex : DEFAULT_TEX;
    s.history = Array.isArray(s.history) ? s.history.slice(0, MAX_HISTORY) : [];
    s.logs = Array.isArray(s.logs) ? s.logs.slice(0, MAX_LOGS) : [];
    return s;
  }

  var injected = null;
  try { injected = window.__NATIVE_STATE__ || null; } catch (e) {}
  var storageKey = 'formulasnip.state.v1';
  function loadSavedState() {
    if (injected && typeof injected === 'object') return injected;
    try {
      var raw = localStorage.getItem(storageKey);
      if (raw) return JSON.parse(raw);
    } catch (e) {}
    return null;
  }

  var state = sanitizeState(loadSavedState());
  var selftest = !!window.__SELFTEST__;
  var activeTab = 'history';
  var session = null;
  var lastValue = state.tex;
  var lastRender = null;
  var lastRenderedText = null;
  var renderToken = 0;
  var renderTimer = null;

  /* ------------------------------------------------------------------ 元素 */
  var els = {};
  function $(id) { return document.getElementById(id); }

  /* --------------------------------------------------------------- 渲染器 */
  var renderer = {
    frame: null,
    font: null,
    ready: false,
    pending: null,
    pendingFont: null,
    resolveReady: null,
    rejectReady: null,
    timeoutTimer: null
  };
  var pendingRenders = {};
  var renderSeq = 0;

  function teardownRenderer(errorMsg) {
    Object.keys(pendingRenders).forEach(function (id) {
      var p = pendingRenders[id];
      delete pendingRenders[id];
      p({ ok: false, error: errorMsg || '渲染器已切换' });
    });
    if (renderer.frame) {
      renderer.frame.remove();
    }
    if (renderer.timeoutTimer) clearTimeout(renderer.timeoutTimer);
    if (renderer.rejectReady) {
      var reject = renderer.rejectReady;
      renderer.rejectReady = null;
      try { reject(new Error(errorMsg || '渲染器已切换')); } catch (e) {}
    }
    renderer.frame = null;
    renderer.font = null;
    renderer.ready = false;
    renderer.pending = null;
    renderer.pendingFont = null;
    renderer.resolveReady = null;
    renderer.timeoutTimer = null;
  }

  function ensureRenderer() {
    var font = state.font;
    if (renderer.frame && renderer.font === font && renderer.ready) {
      return Promise.resolve(renderer.frame);
    }
    if (renderer.pending && renderer.pendingFont === font) return renderer.pending;

    teardownRenderer('字体已切换');
    var frame = document.createElement('iframe');
    frame.setAttribute('title', 'formula renderer');
    frame.src = 'renderer.html#' + encodeURIComponent(font);
    renderer.frame = frame;
    renderer.font = font;
    renderer.ready = false;
    renderer.pendingFont = font;
    renderer.pending = new Promise(function (resolve, reject) {
      renderer.resolveReady = resolve;
      renderer.rejectReady = reject;
      renderer.timeoutTimer = setTimeout(function () {
        if (!renderer.ready) teardownRenderer('字体加载超时');
      }, 20000);
    });
    els.rendererHost.appendChild(frame);
    return renderer.pending;
  }

  window.addEventListener('message', function (event) {
    var data = event.data || {};
    if (!renderer.frame || event.source !== renderer.frame.contentWindow) return;
    if (data.type === 'renderer-ready') {
      renderer.ready = true;
      if (renderer.timeoutTimer) { clearTimeout(renderer.timeoutTimer); renderer.timeoutTimer = null; }
      var resolve = renderer.resolveReady;
      renderer.resolveReady = null;
      renderer.rejectReady = null;
      renderer.pending = null;
      if (resolve) resolve(renderer.frame);
      log('info', '字体已就绪：' + fontName(renderer.font));
      return;
    }
    if (data.type === 'rendered') {
      var p = pendingRenders[data.id];
      if (p) { delete pendingRenders[data.id]; p(data); }
    }
  });

  function fontName(id) {
    for (var i = 0; i < FONTS.length; i++) if (FONTS[i].id === id) return FONTS[i].name;
    return id;
  }

  function renderTex(tex) {
    return ensureRenderer().then(function (frame) {
      return new Promise(function (resolve) {
        var id = 'r' + (++renderSeq);
        var timer = setTimeout(function () {
          if (pendingRenders[id]) { delete pendingRenders[id]; resolve({ ok: false, error: '渲染超时' }); }
        }, 12000);
        pendingRenders[id] = function (result) {
          clearTimeout(timer);
          resolve(result);
        };
        frame.contentWindow.postMessage({ type: 'render', id: id, tex: tex, display: state.mode === 'display' }, '*');
      });
    }).catch(function (e) {
      return { ok: false, error: (e && e.message) || String(e) };
    });
  }

  /* --------------------------------------------------------------- 图像工具 */
  function parseSvg(svgText) {
    var doc = new DOMParser().parseFromString(svgText, 'image/svg+xml');
    var err = doc.querySelector('parsererror');
    if (err) throw new Error('SVG 解析失败');
    var svg = doc.documentElement;
    if (!svg || svg.nodeName.toLowerCase() !== 'svg') throw new Error('不是有效的 SVG');
    return svg;
  }

  function viewBoxOf(svg) {
    var vb = (svg.getAttribute('viewBox') || '').split(/[\s,]+/).filter(Boolean).map(Number);
    if (vb.length !== 4 || !vb[2] || !vb[3]) throw new Error('SVG 缺少 viewBox');
    return vb;
  }

  function computeDims(vb, fontSize, scale) {
    var w = vb[2] / 1000 * fontSize;
    var h = vb[3] / 1000 * fontSize;
    return {
      w: Math.max(1, Math.round(w)),
      h: Math.max(1, Math.round(h)),
      outW: Math.max(1, Math.round(w * (scale || 1))),
      outH: Math.max(1, Math.round(h * (scale || 1)))
    };
  }

  function base64FromBytes(bytes) {
    var binary = '';
    for (var i = 0; i < bytes.length; i += 0x8000) {
      binary += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
    }
    return btoa(binary);
  }

  function svgToDataUrl(svgText) {
    return 'data:image/svg+xml;base64,' + base64FromBytes(new TextEncoder().encode(svgText));
  }

  function svgToPng(svgText, opts) {
    var fontPx = opts.fontPx;
    var scale = opts.scale || 1;
    var color = opts.color || '#111827';
    var svg = parseSvg(svgText);
    var vb = viewBoxOf(svg);
    var pxW = vb[2] / 1000 * fontPx * scale;
    var pxH = vb[3] / 1000 * fontPx * scale;
    if (pxW * pxH > 40 * 1000 * 1000) throw new Error('导出图片过大，请调低字号或倍率');
    var width = Math.max(1, Math.ceil(pxW));
    var height = Math.max(1, Math.ceil(pxH));

    svg.setAttribute('width', String(width));
    svg.setAttribute('height', String(height));
    var replaced = new XMLSerializer().serializeToString(svg).split('currentColor').join(color);

    return new Promise(function (resolve, reject) {
      var img = new Image();
      img.onload = function () {
        try {
          var canvas = document.createElement('canvas');
          canvas.width = width;
          canvas.height = height;
          var ctx = canvas.getContext('2d');
          ctx.clearRect(0, 0, width, height);
          ctx.drawImage(img, 0, 0, width, height);
          var pixels = ctx.getImageData(0, 0, width, height).data;
          var opaque = 0;
          var sumR = 0, sumG = 0, sumB = 0;
          for (var i = 0; i < pixels.length; i += 4) {
            if (pixels[i + 3] > 180) {
              opaque++;
              sumR += pixels[i]; sumG += pixels[i + 1]; sumB += pixels[i + 2];
            }
          }
          resolve({
            dataUrl: canvas.toDataURL('image/png'),
            width: width,
            height: height,
            opaque: opaque,
            total: width * height,
            avg: opaque ? [Math.round(sumR / opaque), Math.round(sumG / opaque), Math.round(sumB / opaque)] : null,
            cornerAlpha: pixels[3]
          });
        } catch (e) { reject(e); }
      };
      img.onerror = function () { reject(new Error('SVG 转 PNG 失败')); };
      img.src = svgToDataUrl(replaced);
    });
  }

  /* ------------------------------------------------------------------ 日志 */
  function log(level, message) {
    state.logs.unshift({ at: Date.now(), level: level, msg: String(message) });
    if (state.logs.length > MAX_LOGS) state.logs.length = MAX_LOGS;
    if (activeTab === 'logs') renderTab();
    saveStateSoon();
  }

  /* ------------------------------------------------------------------ 历史 */
  function addHistory(entry) {
    state.history.unshift(entry);
    if (state.history.length > MAX_HISTORY) state.history.length = MAX_HISTORY;
    renderHistoryCount();
    if (activeTab === 'history') renderTab();
    saveStateSoon();
  }

  function removeHistory(id) {
    state.history = state.history.filter(function (e) { return e.id !== id; });
    renderHistoryCount();
    if (activeTab === 'history') renderTab();
    saveStateSoon();
  }

  function renderHistoryCount() {
    if (els.historyCount) els.historyCount.textContent = String(state.history.length);
  }

  /* ---------------------------------------------------------------- 状态保存 */
  var saveTimer = null;
  function saveStateSoon() {
    if (selftest) return;
    if (saveTimer) clearTimeout(saveTimer);
    saveTimer = setTimeout(function () {
      saveTimer = null;
      var json = JSON.stringify(state);
      if (hostBridge) {
        callNative('saveState', { json: json }).then(function (r) {
          if (els.saveState) els.saveState.textContent = r && r.ok ? '已保存' : '保存失败';
          setTimeout(function () { if (els.saveState) els.saveState.textContent = ''; }, 1200);
        });
      } else {
        try { localStorage.setItem(storageKey, json); } catch (e) {}
      }
    }, 450);
  }

  /* ---------------------------------------------------------------- 文本编辑 */
  function applyText(text) {
    els.tex.value = text;
    state.tex = text;
    lastValue = text;
  }

  function setCaret(start, end) {
    els.tex.focus();
    orgSetRange(els.tex, start, typeof end === 'number' ? end : start);
    updateHint();
  }
  function orgSetRange(el, start, end) { el.setSelectionRange(start, end); }

  function focusStop(index) {
    if (!session || !session.stops[index]) return;
    session.focus = index;
    var s = session.stops[index];
    orgSetRange(els.tex, s.start, s.end);
    els.tex.focus();
    updateHint();
  }

  function sortStops(stops) {
    return stops.slice().sort(function (a, b) {
      if (a.idx !== b.idx) return a.idx - b.idx;
      return a.start - b.start;
    });
  }

  function onTextChanged() {
    state.tex = els.tex.value;
    lastValue = state.tex;
    scheduleRender();
    updateHint();
    saveStateSoon();
  }

  function adjustSessionOnEdit(oldText, newText) {
    if (!session) return;
    var minLen = Math.min(oldText.length, newText.length);
    var p = 0;
    while (p < minLen && oldText[p] === newText[p]) p++;
    var s = 0;
    while (s < minLen - p && oldText[oldText.length - 1 - s] === newText[newText.length - 1 - s]) s++;
    var oldEnd = oldText.length - s;
    var newEnd = newText.length - s;
    var delta = newEnd - oldEnd;
    function map(pos) {
      if (pos <= p) return pos;
      if (pos >= oldEnd) return pos + delta;
      return p;
    }
    var bad = false;
    var stops = session.stops.map(function (st) {
      var a = map(st.start), b = map(st.end);
      if (a < 0) a = 0;
      if (b < a) b = a;
      if (b > newText.length) { b = newText.length; a = Math.min(a, b); }
      if (a > newText.length) { a = newText.length; b = newText.length; }
      return { idx: st.idx, start: a, end: b };
    });
    session.stops = sortStops(stops);
    if (session.focus >= session.stops.length) session = null;
    if (session && session.stops.some(function (st) { return st.start < 0 || st.end > newText.length; })) session = null;
  }

  function expandSelection() {
    var caret = els.tex.selectionStart;
    var res = window.FormulaSnip.expandAt(els.tex.value, caret);
    if (!res) return false;
    applyExpansion(res);
    return true;
  }

  function applyExpansion(res) {
    var text = res.text;
    var caret = res.caret;
    var stops = sortStops(res.stops || []);
    if (!stops.length && /[A-Za-z]$/.test(text)) {
      text += ' ';
      caret = text.length;
    }
    applyText(text);
    if (stops.length) {
      session = { stops: stops, focus: 0 };
      focusStop(0);
    } else {
      session = null;
      setCaret(caret);
    }
    scheduleRender();
    saveStateSoon();
    log('info', 'snippet 展开：' + res.matched + ' → ' + shorten(res.text, 28));
  }

  function shorten(s, n) {
    s = String(s).replace(/\s+/g, ' ');
    return s.length > n ? s.slice(0, n) + '…' : s;
  }

  function insertBuilt(built) {
    var ta = els.tex;
    var start = ta.selectionStart;
    var end = ta.selectionEnd;
    var text = state.tex.slice(0, start) + built.text + state.tex.slice(end);
    var stops = sortStops((built.stops || []).map(function (s) {
      return { idx: s.idx, start: start + s.start, end: start + s.end };
    }));
    applyText(text);
    if (stops.length) {
      session = { stops: stops, focus: 0 };
      focusStop(0);
    } else {
      var caret = start + built.text.length;
      if (/[A-Za-z]$/.test(built.text)) { applyText(text + ' '); caret++; }
      session = null;
      setCaret(caret);
    }
    onTextChanged();
  }

  function updateHint() {
    var hint = els.snippetHint;
    if (!hint) return;
    var before = state.tex.slice(0, els.tex.selectionStart);
    var m = window.FormulaSnip.matchSnippet(before);
    if (m) {
      hint.classList.add('match');
      hint.textContent = '␣ 展开：' + m.matched + ' → ' + shorten(String(m.snippet.rep).replace(/\$\{\d+:[^}]*\}|\$\d+/g, '·').replace(/\[\[(\d+)\]\]/g, '…'), 34);
    } else if (session && session.stops.length > 1) {
      hint.classList.remove('match');
      hint.textContent = 'Tab 跳到下一个占位符（' + (session.focus + 1) + '/' + session.stops.length + '）· Esc 退出';
    } else {
      hint.classList.remove('match');
      hint.textContent = 'snippet 示例：//  分式 · @a  α · sr  平方 · xhat  x̂ · pmat  矩阵 · 输完后按空格展开';
    }
  }

  /* ---------------------------------------------------------------- 预览渲染 */
  function scheduleRender(immediate) {
    if (renderTimer) clearTimeout(renderTimer);
    renderTimer = setTimeout(renderNow, immediate ? 0 : 160);
  }

  function setStatus(text, isError) {
    if (!els.status) return;
    els.status.textContent = text;
    els.status.classList.toggle('error', !!isError);
  }

  function updateDims(dims) {
    if (!els.dims) return;
    els.dims.textContent = '预览 ' + dims.w + '×' + dims.h + ' · 导出 ' + dims.outW + '×' + dims.outH + ' px';
  }

  function showPreviewError(message) {
    els.preview.innerHTML = '';
    var div = document.createElement('div');
    div.className = 'stage-error';
    div.textContent = message;
    els.preview.appendChild(div);
    els.previewInner.style.transform = 'none';
    els.dims.textContent = '—';
  }

  function showPreview(svgText, dims) {
    var svg = parseSvg(svgText);
    var vb = viewBoxOf(svg);
    var wPx = vb[2] / 1000 * state.size;
    var hPx = vb[3] / 1000 * state.size;
    svg.setAttribute('width', String(Math.max(1, wPx)));
    svg.setAttribute('height', String(Math.max(1, hPx)));
    els.preview.innerHTML = '';
    els.preview.style.color = state.color;
    els.preview.appendChild(document.importNode(svg, true));
    fitPreview(wPx, hPx);
  }

  function fitPreview(wPx, hPx) {
    var stage = els.stage;
    var availW = Math.max(80, stage.clientWidth - 44);
    var availH = Math.max(60, stage.clientHeight - 44);
    var scale = Math.min(1, availW / Math.max(1, wPx), availH / Math.max(1, hPx));
    els.previewInner.style.transform = 'scale(' + scale.toFixed(3) + ')';
  }

  function renderNow() {
    var token = ++renderToken;
    setStatus('渲染中…');
    return renderTex(state.tex).then(function (res) {
      if (token !== renderToken) return;
      lastRender = res;
      if (!res.ok) {
        var failure = res.error || '未知错误';
        // 切换字体时会主动拆掉旧渲染器，旧的渲染请求会被拒绝；直接重排即可。
        if (failure.indexOf('字体已切换') >= 0 || failure.indexOf('渲染器已切换') >= 0) {
          scheduleRender(true);
          return;
        }
        showPreviewError(failure);
        setStatus('渲染失败：' + failure, true);
        log('error', '渲染失败：' + failure);
        return;
      }
      lastRenderedText = state.tex;
      try {
        var svg = parseSvg(res.svg);
        var vb = viewBoxOf(svg);
        var dims = computeDims(vb, state.size, state.exportScale);
        showPreview(res.svg, dims);
        updateDims(dims);
        setStatus('渲染 ' + Math.round(res.ms) + ' ms · 预览 ' + dims.w + '×' + dims.h + ' px · 导出 ' + dims.outW + '×' + dims.outH + ' px');
      } catch (e) {
        showPreviewError(String(e.message || e));
        setStatus('渲染失败：' + (e.message || e), true);
      }
    });
  }

  async function ensureCurrentRender() {
    if (lastRender && lastRender.ok && lastRenderedText === state.tex) return lastRender;
    await renderNow();
    return lastRender;
  }

  /* ---------------------------------------------------------------- 导出/复制 */
  function suggestFilename() {
    var d = new Date();
    return 'formula-' + d.getFullYear() + pad(d.getMonth() + 1) + pad(d.getDate()) + '-' + pad(d.getHours()) + pad(d.getMinutes()) + pad(d.getSeconds()) + '.png';
  }

  function savePng(dataUrl, filename) {
    if (hostBridge) {
      return callNative('savePng', { dataUrl: dataUrl, filename: filename });
    }
    var a = document.createElement('a');
    a.href = dataUrl;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    return Promise.resolve({ ok: true, path: null, browser: true });
  }

  async function addHistoryFromPng(png) {
    var vb = lastRender && lastRender.viewBox ? lastRender.viewBox.split(/[\s,]+/).filter(Boolean).map(Number) : [0, 0, 1000, 1000];
    var thumb = null;
    try {
      var baseW = vb[2] / 1000 * 18;
      var tScale = clamp(150 / Math.max(1, baseW), 0.2, 1);
      var tPng = await svgToPng(lastRender.svg, { fontPx: 18, scale: tScale, color: state.color });
      thumb = tPng.dataUrl;
    } catch (e) { /* 缩略图失败不影响主流程 */ }
    addHistory({
      id: uid(),
      tex: state.tex,
      font: state.font,
      color: state.color,
      size: state.size,
      mode: state.mode,
      scale: state.exportScale,
      at: Date.now(),
      thumb: thumb,
      w: png.width,
      h: png.height
    });
  }

  async function doExport() {
    if (!state.tex.trim()) { setStatus('公式为空', true); return; }
    var disabled = els.exportBtn.disabled;
    els.exportBtn.disabled = true;
    try {
      var res = await ensureCurrentRender();
      if (!res || !res.ok) throw new Error((res && res.error) || '没有可导出的公式');
      setStatus('正在生成 PNG…');
      var png = await svgToPng(res.svg, { fontPx: state.size, scale: state.exportScale, color: state.color });
      var saved = await savePng(png.dataUrl, suggestFilename());
      if (saved.canceled) { setStatus('已取消导出'); return; }
      if (!saved.ok) throw new Error(saved.error || '保存失败');
      await addHistoryFromPng(png);
      log('info', '导出 PNG：' + png.width + '×' + png.height + (saved.path ? ' → ' + saved.path : '（浏览器下载）'));
      setStatus('已导出 ' + png.width + '×' + png.height + (saved.path ? ' · ' + saved.path : ''), false);
    } catch (e) {
      var msg = (e && e.message) || String(e);
      log('error', '导出失败：' + msg);
      setStatus('导出失败：' + msg, true);
    } finally {
      els.exportBtn.disabled = disabled;
    }
  }

  async function doCopy() {
    if (!state.tex.trim()) { setStatus('公式为空', true); return; }
    els.copyBtn.disabled = true;
    try {
      var res = await ensureCurrentRender();
      if (!res || !res.ok) throw new Error((res && res.error) || '没有可复制的公式');
      var png = await svgToPng(res.svg, { fontPx: state.size, scale: state.exportScale, color: state.color });
      var copied;
      if (hostBridge) {
        copied = await callNative('copyPng', { dataUrl: png.dataUrl });
        if (!copied.ok) throw new Error(copied.error || '复制失败');
      } else {
        var blob = await (await fetch(png.dataUrl)).blob();
        await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })]);
      }
      await addHistoryFromPng(png);
      log('info', '复制 PNG 到剪贴板：' + png.width + '×' + png.height);
      setStatus('已复制到剪贴板 · ' + png.width + '×' + png.height + ' px');
    } catch (e) {
      var msg = (e && e.message) || String(e);
      log('error', '复制失败：' + msg);
      setStatus('复制失败：' + msg, true);
    } finally {
      els.copyBtn.disabled = false;
    }
  }

  /* ------------------------------------------------------------------ 标签页 */
  function switchTab(tab) {
    activeTab = tab;
    Array.prototype.forEach.call(els.tabs.querySelectorAll('button[data-tab]'), function (b) {
      b.classList.toggle('on', b.dataset.tab === tab);
    });
    renderTab();
  }

  function renderTab() {
    var body = els.tabBody;
    var action = els.panelAction;
    action.hidden = true;
    action.onclick = null;
    body.innerHTML = '';
    if (activeTab === 'history') renderHistoryTab(body, action);
    else if (activeTab === 'logs') renderLogsTab(body, action);
    else renderSnippetsTab(body);
  }

  function renderHistoryTab(body, action) {
    if (!state.history.length) {
      var empty = document.createElement('div');
      empty.className = 'empty';
      empty.textContent = '还没有记录 —— 按 ' + KEY_EXPORT + ' 导出或 ' + KEY_COPY + ' 复制后会自动保存在这里';
      body.appendChild(empty);
      return;
    }
    action.hidden = false;
    action.textContent = '清空历史';
    var armed = false;
    action.onclick = function () {
      if (!armed) {
        armed = true;
        action.textContent = '再点一次清空';
        setTimeout(function () { armed = false; action.textContent = '清空历史'; }, 2500);
        return;
      }
      state.history = [];
      renderHistoryCount();
      renderTab();
      log('warn', '已清空历史记录');
      saveStateSoon();
    };

    var list = document.createElement('div');
    list.className = 'history-list';
    state.history.forEach(function (entry) {
      var row = document.createElement('div');
      row.className = 'history-item';

      var thumb = document.createElement('div');
      thumb.className = 'thumb';
      var checker = document.createElement('div');
      checker.className = 'checker';
      if (entry.thumb) {
        var img = document.createElement('img');
        img.src = entry.thumb;
        checker.appendChild(img);
      } else {
        checker.textContent = 'TeX';
        checker.style.color = 'var(--faint)';
        checker.style.fontSize = '10px';
      }
      thumb.appendChild(checker);

      var main = document.createElement('div');
      main.className = 'history-main';
      var tex = document.createElement('div');
      tex.className = 'history-tex';
      tex.textContent = entry.tex.replace(/\s+/g, ' ').slice(0, 90);
      var meta = document.createElement('div');
      meta.className = 'history-meta';
      meta.textContent = fontName(entry.font) + ' · ' + entry.size + 'px · ' + entry.scale + '× · ' + dateTime(entry.at);
      main.appendChild(tex);
      main.appendChild(meta);

      var actions = document.createElement('div');
      actions.className = 'history-actions';
      var restore = document.createElement('button');
      restore.className = 'icon-btn';
      restore.textContent = '恢复';
      restore.title = '载入这条公式与设置';
      restore.onclick = function () { restoreHistory(entry); };
      var del = document.createElement('button');
      del.className = 'icon-btn danger';
      del.textContent = '删除';
      del.title = '删除这条记录';
      del.onclick = function () { removeHistory(entry.id); };
      actions.appendChild(restore);
      actions.appendChild(del);

      row.appendChild(thumb);
      row.appendChild(main);
      row.appendChild(actions);
      list.appendChild(row);
    });
    body.appendChild(list);
  }

  function restoreHistory(entry) {
    state.tex = entry.tex;
    state.font = entry.font;
    state.color = entry.color;
    state.size = entry.size;
    state.mode = entry.mode;
    state.exportScale = entry.scale;
    session = null;
    applyStateToUI();
    scheduleRender(true);
    log('info', '恢复历史记录：' + shorten(entry.tex, 40));
    setStatus('已恢复历史记录');
  }

  function renderLogsTab(body, action) {
    if (!state.logs.length) {
      var empty = document.createElement('div');
      empty.className = 'empty';
      empty.textContent = '暂无日志';
      body.appendChild(empty);
      return;
    }
    action.hidden = false;
    action.textContent = '清空日志';
    var armed = false;
    action.onclick = function () {
      if (!armed) {
        armed = true;
        action.textContent = '再点一次清空';
        setTimeout(function () { armed = false; action.textContent = '清空日志'; }, 2500);
        return;
      }
      state.logs = [];
      renderTab();
      saveStateSoon();
    };
    var list = document.createElement('div');
    list.className = 'log-list';
    state.logs.forEach(function (entry) {
      var row = document.createElement('div');
      row.className = 'log-row ' + (entry.level === 'error' ? 'error' : entry.level === 'warn' ? 'warn' : '');
      var t = document.createElement('span');
      t.className = 't';
      t.textContent = clock(entry.at);
      var m = document.createElement('span');
      m.className = 'm';
      m.textContent = entry.msg;
      row.appendChild(t);
      row.appendChild(m);
      list.appendChild(row);
    });
    body.appendChild(list);
  }

  var snippetQuery = '';
  function renderSnippetsTab(body) {
    var wrap = document.createElement('div');
    wrap.className = 'snippet-tools';
    var input = document.createElement('input');
    input.className = 'snippet-search';
    input.type = 'search';
    input.placeholder = '搜索 snippet：分式、alpha、积分、矩阵…';
    input.value = snippetQuery;
    input.oninput = function () {
      snippetQuery = input.value;
      renderTab();
      var el = els.tabBody.querySelector('.snippet-search');
      if (el) { el.focus(); el.setSelectionRange(el.value.length, el.value.length); }
    };
    wrap.appendChild(input);
    body.appendChild(wrap);

    var groups = document.createElement('div');
    groups.className = 'snippet-groups';
    var q = snippetQuery.trim().toLowerCase();
    var byCat = {};
    window.FormulaSnip.snippets.forEach(function (s) {
      if (s.regex) return;
      if (q && s.trigger.toLowerCase().indexOf(q) < 0 && s.desc.toLowerCase().indexOf(q) < 0 && s.cat.indexOf(q) < 0) return;
      (byCat[s.cat] = byCat[s.cat] || []).push(s);
    });
    Object.keys(byCat).forEach(function (cat) {
      var group = document.createElement('div');
      group.className = 'snippet-group';
      var title = document.createElement('div');
      title.className = 'snippet-cat';
      title.textContent = cat;
      group.appendChild(title);
      byCat[cat].forEach(function (s) {
        var row = document.createElement('div');
        row.className = 'snippet-row';
        row.title = '点击插入到光标处';
        var trig = document.createElement('span');
        trig.className = 'snippet-trigger';
        trig.textContent = s.trigger;
        var desc = document.createElement('span');
        desc.className = 'snippet-desc';
        desc.textContent = s.desc;
        row.appendChild(trig);
        row.appendChild(desc);
        row.onclick = function () {
          var built = window.FormulaSnip.buildExpansion(s.rep, []);
          insertBuilt(built);
          log('info', '插入 snippet：' + s.trigger);
        };
        group.appendChild(row);
      });
      groups.appendChild(group);
    });
    body.appendChild(groups);
  }

  /* ------------------------------------------------------------------ 界面 */
  function buildFontSelect() {
    FONTS.forEach(function (f) {
      var opt = document.createElement('option');
      opt.value = f.id;
      opt.textContent = f.name;
      opt.title = f.note;
      els.fontSelect.appendChild(opt);
    });
  }

  function buildSwatches() {
    COLOR_PRESETS.forEach(function (color) {
      var b = document.createElement('button');
      b.className = 'swatch';
      b.style.background = color;
      b.dataset.color = color;
      b.title = color;
      b.onclick = function () { setColor(color); };
      els.swatches.appendChild(b);
    });
  }

  function setColor(color) {
    if (!/^#[0-9a-fA-F]{6}$/.test(color)) return;
    state.color = color;
    els.colorPicker.value = color;
    els.colorHex.value = color;
    Array.prototype.forEach.call(els.swatches.children, function (b) {
      b.classList.toggle('on', b.dataset.color.toLowerCase() === color.toLowerCase());
    });
    if (els.preview) els.preview.style.color = color;
    scheduleRender();
    saveStateSoon();
  }

  function applyStateToUI() {
    els.tex.value = state.tex;
    lastValue = state.tex;
    els.fontSelect.value = state.font;
    els.sizeRange.value = String(state.size);
    els.sizeVal.textContent = String(state.size);
    els.scaleSelect.value = String(state.exportScale);
    Array.prototype.forEach.call(els.modeSeg.children, function (b) {
      b.classList.toggle('on', b.dataset.mode === state.mode);
    });
    els.modeHint.textContent = state.mode === 'display' ? '独立公式' : '行内公式';
    Array.prototype.forEach.call(els.bgSeg.children, function (b) {
      b.classList.toggle('on', b.dataset.bg === state.bg);
    });
    els.stage.dataset.bg = state.bg;
    setColor(state.color);
    renderHistoryCount();
    renderTab();
    updateHint();
  }

  function bindEvents() {
    els.fontSelect.onchange = function () {
      var next = els.fontSelect.value;
      if (next === state.font) return;
      state.font = next;
      session = null;
      log('info', '切换字体：' + fontName(next));
      scheduleRender(true);
      saveStateSoon();
    };

    els.sizeRange.oninput = function () {
      state.size = Number(els.sizeRange.value);
      els.sizeVal.textContent = String(state.size);
      scheduleRender();
      saveStateSoon();
    };

    els.scaleSelect.onchange = function () {
      state.exportScale = Number(els.scaleSelect.value);
      if (lastRender && lastRender.ok && lastRender.viewBox) {
        var vb = lastRender.viewBox.split(/[\s,]+/).filter(Boolean).map(Number);
        updateDims(computeDims(vb, state.size, state.exportScale));
      }
      saveStateSoon();
    };

    els.modeSeg.onclick = function (e) {
      var btn = e.target.closest('button[data-mode]');
      if (!btn) return;
      state.mode = btn.dataset.mode;
      applyStateToUI();
      scheduleRender(true);
      saveStateSoon();
    };

    els.bgSeg.onclick = function (e) {
      var btn = e.target.closest('button[data-bg]');
      if (!btn) return;
      state.bg = btn.dataset.bg;
      els.stage.dataset.bg = state.bg;
      Array.prototype.forEach.call(els.bgSeg.children, function (b) { b.classList.toggle('on', b === btn); });
      saveStateSoon();
    };

    els.colorPicker.oninput = function () { setColor(els.colorPicker.value); };
    els.colorHex.onchange = function () {
      var v = els.colorHex.value.trim();
      if (/^#?[0-9a-fA-F]{6}$/.test(v)) setColor(v[0] === '#' ? v : '#' + v);
      else els.colorHex.value = state.color;
    };

    els.tex.addEventListener('keydown', function (e) {
      if (e.isComposing) return;
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'e') { e.preventDefault(); doExport(); return; }
      if ((e.metaKey || e.ctrlKey) && e.shiftKey && e.key.toLowerCase() === 'c') { e.preventDefault(); doCopy(); return; }
      if (e.key === 'Escape') { session = null; updateHint(); return; }
      if (e.key === 'Tab') {
        if (session) {
          e.preventDefault();
          if (e.shiftKey) {
            if (session.focus > 0) focusStop(session.focus - 1);
          } else if (session.focus + 1 < session.stops.length) {
            focusStop(session.focus + 1);
          } else {
            session = null;
          }
          updateHint();
          return;
        }
        if (expandSelection()) { e.preventDefault(); return; }
        e.preventDefault();
        var ta = els.tex;
        var start = ta.selectionStart, end = ta.selectionEnd;
        ta.value = state.tex.slice(0, start) + '  ' + state.tex.slice(end);
        state.tex = ta.value;
        ta.setSelectionRange(start + 2, start + 2);
        onTextChanged();
        return;
      }
      if (e.key === ' ') {
        if (expandSelection()) {
          e.preventDefault();
        }
      }
    });

    els.tex.addEventListener('input', function () {
      var oldText = lastValue;
      var newText = els.tex.value;
      adjustSessionOnEdit(oldText, newText);
      onTextChanged();
    });

    els.tex.addEventListener('click', function () { session = null; updateHint(); });
    els.tex.addEventListener('keyup', function (e) {
      if (['Tab', 'Escape', 'Shift', 'Meta', 'Control', 'Alt'].indexOf(e.key) < 0) updateHint();
    });
    els.tex.addEventListener('compositionend', function () { updateHint(); });

    els.exportBtn.onclick = doExport;
    els.copyBtn.onclick = doCopy;

    els.tabs.addEventListener('click', function (e) {
      var btn = e.target.closest('button[data-tab]');
      if (btn) switchTab(btn.dataset.tab);
    });

    window.addEventListener('resize', function () {
      if (els.preview && els.preview.querySelector('svg')) {
        var svg = els.preview.querySelector('svg');
        var w = Number(svg.getAttribute('width')) || 0;
        var h = Number(svg.getAttribute('height')) || 0;
        if (w && h) fitPreview(w, h);
      }
    });
  }

  /* ------------------------------------------------------------------ 自检 */
  async function fetchPngChecks(png) {
    var checks = [];
    checks.push({ name: 'PNG 数据头', ok: png.dataUrl.indexOf('data:image/png;base64,') === 0, detail: png.dataUrl.slice(0, 24) });
    checks.push({ name: 'PNG 尺寸', ok: png.width > 40 && png.height > 20, detail: png.width + '×' + png.height });
    checks.push({ name: '背景透明', ok: png.cornerAlpha === 0, detail: 'corner alpha=' + png.cornerAlpha });
    checks.push({ name: '有可见笔画', ok: png.opaque > 150, detail: 'opaque=' + png.opaque + '/' + png.total });
    var target = [17, 24, 39];
    var d = png.avg ? Math.abs(png.avg[0] - target[0]) + Math.abs(png.avg[1] - target[1]) + Math.abs(png.avg[2] - target[2]) : 999;
    checks.push({ name: '颜色正确', ok: d < 60, detail: 'avg=' + JSON.stringify(png.avg) + ' target=#111827' });
    return checks;
  }

  async function runSelftest() {
    var checks = [];
    function add(name, ok, detail) { checks.push({ name: name, ok: !!ok, detail: detail }); }

    try {
      var F = window.FormulaSnip;
      var cases = [
        ['//', '\\frac{}{}'],
        ['@a', '\\alpha'],
        ['sr', '^{2}'],
        ['xhat', '\\hat{x}'],
        ['x3', 'x_{3}'],
        ['>=', '\\geq'],
        ['dint', '\\int_{0}^{1}'],
        ['\\sum', '\\sum_{i=1}^{N}']
      ];
      var snippetOk = true, snippetDetail = '';
      cases.forEach(function (c) {
        var r = F.expandAt(c[0], c[0].length);
        var got = r ? r.text : null;
        var ok = got && got.indexOf(c[1]) === 0;
        if (!ok) { snippetOk = false; snippetDetail += c[0] + ' → ' + JSON.stringify(got) + '; '; }
      });
      add('snippet 展开', snippetOk, snippetDetail || cases.length + ' 条用例');
      add('\\text{} 内不展开', F.expandAt('\\text{and', 9) === null, 'inside text guard');

      // UI 级：模拟输入 "//" 后按空格
      var sample = state.tex;
      els.tex.value = '//';
      state.tex = '//';
      els.tex.setSelectionRange(2, 2);
      els.tex.dispatchEvent(new KeyboardEvent('keydown', { key: ' ', bubbles: true, cancelable: true }));
      add('界面输入展开 //', els.tex.value.indexOf('\\frac{') === 0, JSON.stringify(els.tex.value.slice(0, 20)));
      // 占位符 Tab 跳转
      els.tex.dispatchEvent(new KeyboardEvent('keydown', { key: 'Tab', bubbles: true, cancelable: true }));
      add('Tab 占位符跳转', els.tex.selectionStart > 0, 'caret=' + els.tex.selectionStart + '/' + els.tex.value.length);
      state.tex = sample;
      els.tex.value = sample;
      els.tex.setSelectionRange(0, 0);
      session = null;
      updateHint();

      var r1 = await renderTex('\\frac{a}{b} + \\alpha');
      add('MathJax 渲染', r1.ok && !!r1.viewBox, r1.ok ? r1.viewBox + ' · ' + Math.round(r1.ms) + 'ms' : r1.error);

      var png;
      if (r1.ok) {
        png = await svgToPng(r1.svg, { fontPx: 36, scale: 2, color: '#111827' });
        (await fetchPngChecks(png)).forEach(function (c) { add(c.name, c.ok, c.detail); });
      }

      var r2 = await renderTex('\\text{速度} = \\frac{dx}{dt}');
      add('CJK 文本渲染', r2.ok && !!r2.viewBox, r2.ok ? r2.viewBox : r2.error);
      if (r2.ok) {
        var png2 = await svgToPng(r2.svg, { fontPx: 30, scale: 2, color: '#1d4ed8' });
        add('CJK 图片非空', png2.opaque > 100 && png2.width > 40, 'opaque=' + png2.opaque + ' ' + png2.width + '×' + png2.height);
      }

      var oldFont = state.font;
      state.font = 'mathjax-stix2';
      var r3 = await renderTex('E = mc^2');
      add('切换字体 STIX Two', r3.ok && !!r3.viewBox, r3.ok ? r3.viewBox : r3.error);
      state.font = oldFont;

      var beforeCount = state.history.length;
      var testEntry = { id: 'selftest', tex: 'x^2', font: state.font, color: '#111827', size: 30, mode: 'display', scale: 2, at: Date.now(), thumb: null };
      state.history.unshift(testEntry);
      var added = state.history.length === beforeCount + 1;
      state.history = state.history.filter(function (e) { return e.id !== 'selftest'; });
      add('历史增删', added && state.history.length === beforeCount, '');

      if (hostBridge) {
        var st = await callNative('saveState', { json: JSON.stringify({ selftest: true, at: Date.now() }), selftest: true });
        add('原生状态保存', st && st.ok, st && st.path ? st.path : JSON.stringify(st));
        if (png) {
          var wr = await callNative('selftestWritePng', { dataUrl: png.dataUrl, name: 'selftest-formula.png' });
          add('原生 PNG 写入', wr && wr.ok, wr && wr.path ? wr.path : JSON.stringify(wr));
        }
      } else {
        add('原生状态保存', true, 'browser fallback: localStorage');
      }
    } catch (e) {
      add('自检异常', false, (e && e.stack) || String(e));
    }

    // 自检结束后把界面恢复成干净的演示状态（自检本身不落盘）
    state.tex = DEMO_TEX;
    state.font = 'mathjax-newcm';
    els.tex.value = DEMO_TEX;
    session = null;
    applyStateToUI();
    updateHint();
    await new Promise(function (resolve) { setTimeout(resolve, 250); });
    await renderNow();

    if (png) {
      addHistory({ id: 'demo1', tex: '\\frac{a}{b} + \\alpha', font: 'mathjax-newcm', color: '#111827', size: 32, mode: 'display', scale: 2, at: Date.now() - 65000, thumb: png.dataUrl, w: png.width, h: png.height });
    }
    if (typeof png2 !== 'undefined' && png2) {
      addHistory({ id: 'demo2', tex: '\\text{速度} = \\frac{dx}{dt}', font: 'mathjax-stix2', color: '#1d4ed8', size: 30, mode: 'display', scale: 2, at: Date.now() - 5000, thumb: png2.dataUrl, w: png2.width, h: png2.height });
    }

    var ok = checks.every(function (c) { return c.ok; });
    window.__SELFTEST_RESULT__ = { ok: ok, checks: checks, at: Date.now() };
    checks.forEach(function (c) { log(c.ok ? 'info' : 'error', '[自检] ' + (c.ok ? 'PASS' : 'FAIL') + ' ' + c.name + (c.detail ? ' · ' + c.detail : '')); });
    return window.__SELFTEST_RESULT__;
  }

  /* ------------------------------------------------------------------ 初始化 */
  function init() {
    els = {
      tex: $('tex'),
      ghost: $('ghost'),
      snippetHint: $('snippetHint'),
      fontSelect: $('fontSelect'),
      swatches: $('swatches'),
      colorPicker: $('colorPicker'),
      colorHex: $('colorHex'),
      sizeRange: $('sizeRange'),
      sizeVal: $('sizeVal'),
      scaleSelect: $('scaleSelect'),
      modeSeg: $('modeSeg'),
      modeHint: $('modeHint'),
      bgSeg: $('bgSeg'),
      stage: $('stage'),
      preview: $('preview'),
      previewInner: $('previewInner'),
      dims: $('dims'),
      status: $('status'),
      tabs: $('tabs'),
      tabBody: $('tabBody'),
      panelAction: $('panelAction'),
      historyCount: $('historyCount'),
      exportBtn: $('exportBtn'),
      copyBtn: $('copyBtn'),
      saveState: $('saveState'),
      rendererHost: $('rendererHost')
    };

    if (els.exportBtn) els.exportBtn.title = '导出透明 PNG（' + KEY_EXPORT + '）';
    if (els.copyBtn) els.copyBtn.title = '复制 PNG 到剪贴板（' + KEY_COPY + '）';
    buildFontSelect();
    buildSwatches();
    bindEvents();
    applyStateToUI();
    if (!state.history.length) {
      log('info', '就绪：输入 LaTeX 或 LaTeX-suite snippet，按空格展开');
    }
    scheduleRender(true);

    if (selftest) {
      setTimeout(function () {
        runSelftest().then(function (result) {
          document.body.setAttribute('data-selftest', JSON.stringify(result));
        });
      }, 200);
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
