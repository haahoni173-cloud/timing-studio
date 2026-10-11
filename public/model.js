(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.TimingModel = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';
  const STATES = ['0', '1', 'X', 'Z'];
  const FONT = '"Times New Roman", "DFKai-SB", "標楷體", "BiauKai", serif';
  const round = n => Math.round(n * 10000) / 10000;
  const clone = value => JSON.parse(JSON.stringify(value));
  const uid = () => 'id-' + (globalThis.crypto?.randomUUID?.() || Math.random().toString(36).slice(2));
  const defaultStyle = (color = '#263744') => ({ color, width: 2, dash: 'solid', startArrow: false, endArrow: false });
  function signal(name, edges = [{ t: 0, v: '0' }], color) {
    return { id: uid(), name, edges, trigger: 'none', style: defaultStyle(color), widthLocked: false, rowHeightLocked: false };
  }
  function normalize(edges, duration) {
    const sorted = edges.filter(e => Number.isFinite(e.t) && e.t >= 0 && e.t < duration && STATES.includes(e.v))
      .map(e => ({ t: round(e.t), v: e.v, ...(e.trigger !== undefined ? { trigger: e.trigger } : {}) })).filter(e => e.t < duration).sort((a, b) => a.t - b.t);
    const result = [];
    for (const edge of sorted) {
      if (result.length && result.at(-1).t === edge.t) result[result.length - 1] = edge;
      else result.push(edge);
    }
    if (!result.length || result[0].t !== 0) result.unshift({ t: 0, v: '0' });
    return result.filter((e, i) => i === 0 || e.v !== result[i - 1].v);
  }
  function stateAt(edges, time) {
    let value = edges[0].v;
    for (const edge of edges) { if (edge.t > time) break; value = edge.v; }
    return value;
  }
  function setRange(edges, start, end, value, duration) {
    start = round(Math.max(0, Math.min(duration, start)));
    end = round(Math.max(start, Math.min(duration, end)));
    if (end <= start || !STATES.includes(value)) return clone(edges);
    const after = stateAt(edges, end);
    const next = edges.filter(e => e.t < start || e.t >= end);
    const originalStart = edges.find(e => e.t === start && e.v === value);
    next.push({ ...originalStart, t: start, v: value });
    if (end < duration) next.push({ ...edges.find(e => e.t === end), t: end, v: after });
    return normalize(next, duration);
  }
  function clock(duration, period, duty = 50, phase = 0, initial = '0') {
    if (![duration, period, duty, phase].every(Number.isFinite) || duration < 1 || duration > 256 || period < .1 || period > 512 || duty <= 0 || duty >= 100 || phase < 0 || phase >= duration || !['0','1'].includes(initial)) throw new Error('請檢查週期、占空比與起始時間。');
    const edges = [{ t: 0, v: initial }];
    const active = initial === '0' ? '1' : '0';
    const pulse = period * (initial === '0' ? duty / 100 : 1 - duty / 100);
    for (let t = phase; t < duration; t += period) {
      edges.push({ t: round(t), v: active });
      if (t + pulse < duration) edges.push({ t: round(t + pulse), v: initial });
      if (edges.length > 2048) throw new Error('時脈太密，請增加週期。');
    }
    return normalize(edges, duration);
  }
  function pattern(text, step, duration) {
    const values = text.toUpperCase().replace(/[\s,|]/g, '');
    if (!/^[01XZ]+$/.test(values) || values.length > 1024 || !Number.isFinite(step) || step < .05) throw new Error('波形序列只能包含 0、1、X、Z，間隔需至少為 0.05。');
    return normalize([...values].map((v, i) => ({ t: round(i * step), v })), duration);
  }
  function example() {
    return { version: 1, title: '數位介面啟動時序', duration: 16, unit: 'ns', step: 1, rowHeight: 80,
      signals: [
        signal('CLK', clock(16, 2, 50, 0), '#186d67'),
        signal('RESET_n', [{ t: 0, v: '0' }, { t: 3, v: '1' }]),
        signal('ENABLE', [{ t: 0, v: '0' }, { t: 5, v: '1' }, { t: 13, v: '0' }]),
        signal('DATA_VALID', [{ t: 0, v: '0' }, { t: 7, v: '1' }, { t: 9, v: '0' }, { t: 11, v: '1' }, { t: 13, v: '0' }], '#b27423'),
        signal('ACK', [{ t: 0, v: '0' }, { t: 8, v: '1' }, { t: 10, v: '0' }, { t: 12, v: '1' }, { t: 14, v: '0' }])
      ], annotations: [
        { id: uid(), kind: 'reference', t1: 3, t2: 3, y: 0, text: '解除重置', style: { ...defaultStyle('#9d6550'), width: 1, dash: 'dashed' } },
        { id: uid(), kind: 'dimension', t1: 5, t2: 7, y: 0, text: 't_delay', style: { ...defaultStyle('#186d67'), width: 1.5, startArrow: true, endArrow: true } }
      ] };
  }
  function blank() { return { version: 1, title: '未命名時序圖', duration: 16, unit: 'ns', step: 1, rowHeight: 80, signals: [signal('SIGNAL_1')], annotations: [] }; }
  function validate(input) {
    const fail = () => { throw new Error('圖檔格式或數值不正確，原本的圖仍保留。'); };
    const number = (n, min, max) => typeof n === 'number' && Number.isFinite(n) && n >= min && n <= max;
    const text = (s, length) => typeof s === 'string' && s.length <= length;
    if (!input || input.version !== 1 || !text(input.title, 120) || !text(input.unit, 12) || !number(input.duration, 1, 256) || !number(input.step, .05, input.duration) || !number(input.rowHeight, 24, 128) || !Array.isArray(input.signals) || input.signals.length > 64 || !Array.isArray(input.annotations) || input.annotations.length > 128) fail();
    const waveformHeight = input.waveformHeight ?? Math.min(round(input.rowHeight * .4), input.rowHeight - 8);
    if (!number(waveformHeight, 8, Math.min(64, input.rowHeight - 8))) fail();
    const ids = new Set();
    function id(value) { if (!text(value, 80) || !value || ids.has(value)) fail(); ids.add(value); return value; }
    function style(s) {
      if (!s || !/^#[a-f\d]{6}$/i.test(s.color) || !number(s.width, .5, 8) || !['solid','dashed','dotted'].includes(s.dash) || typeof s.startArrow !== 'boolean' || typeof s.endArrow !== 'boolean') fail();
      return { color: s.color, width: s.width, dash: s.dash, startArrow: s.startArrow, endArrow: s.endArrow };
    }
    return { version: 1, title: input.title, unit: input.unit, duration: input.duration, step: input.step, rowHeight: input.rowHeight, waveformHeight,
      signals: input.signals.map(s => {
        if (!s || !text(s.name, 80) || !Array.isArray(s.edges) || !s.edges.length || s.edges.length > 2048) fail();
        let last = -1;
        for (const e of s.edges) { if (!number(e.t, 0, input.duration) || e.t >= input.duration || e.t <= last || !STATES.includes(e.v) || (e.trigger !== undefined && !['inherit','on','off'].includes(e.trigger))) fail(); last = e.t; }
        if (s.edges[0].t !== 0) fail();
        if (s.trigger !== undefined && !['none','rising','falling','both'].includes(s.trigger)) fail();
        if (s.rowHeight != null && !number(s.rowHeight, 24, 128)) fail();
        if ([s.widthLocked, s.rowHeightLocked].some(v => v !== undefined && typeof v !== 'boolean')) fail();
        return { id: id(s.id), name: s.name, edges: normalize(s.edges, input.duration), trigger: s.trigger ?? 'none', style: style(s.style),
          ...(s.rowHeight != null ? { rowHeight: s.rowHeight } : {}), widthLocked: s.widthLocked ?? false, rowHeightLocked: s.rowHeightLocked ?? false };
      }),
      annotations: input.annotations.map(a => {
        if (!a || !['reference','dimension','text'].includes(a.kind) || !number(a.t1, 0, input.duration) || !number(a.t2, 0, input.duration) || !number(a.y, 0, a.kind === 'dimension' ? input.signals.length : Math.max(0, input.signals.length - 1)) || !Number.isInteger(a.y) || !text(a.text, 160) || (a.kind === 'dimension' && a.t1 >= a.t2)) fail();
        if (a.kind === 'dimension' && [a.showLabel, a.showTime].some(v => v !== undefined && typeof v !== 'boolean')) fail();
        return { id: id(a.id), kind: a.kind, t1: a.t1, t2: a.t2, y: a.y, text: a.text, style: style(a.style), ...(a.kind === 'dimension' ? { showLabel: a.showLabel ?? true, showTime: a.showTime ?? !a.text } : {}) };
      }) };
  }
  function resizeDocument(doc, duration) {
    const next = clone(doc);
    next.duration = duration;
    next.step = Math.min(next.step, duration);
    next.signals.forEach(s => { s.edges = normalize(s.edges, duration); });
    next.annotations.forEach(a => { a.t1 = Math.min(a.t1, duration); a.t2 = Math.min(a.t2, duration); });
    next.annotations = next.annotations.filter(a => a.kind !== 'dimension' || a.t2 > a.t1);
    return next;
  }
  // Group movement uses one common delta, preserving alignment and edge order.
  function moveEdges(doc, selection, requestedDelta) {
    const next = clone(doc), selected = new Map();
    selection.forEach(({ signalId, index }) => { if (!selected.has(signalId)) selected.set(signalId, new Set()); selected.get(signalId).add(index); });
    let minDelta = -Infinity, maxDelta = Infinity;
    const gap = .0001;
    for (const s of next.signals) {
      const indexes = selected.get(s.id);
      if (!indexes) continue;
      for (const i of indexes) {
        if (i === 0 || !s.edges[i]) continue;
        let before = i - 1, after = i + 1;
        while (indexes.has(before)) before--;
        while (indexes.has(after)) after++;
        minDelta = Math.max(minDelta, (s.edges[before]?.t ?? 0) + gap - s.edges[i].t);
        maxDelta = Math.min(maxDelta, (s.edges[after]?.t ?? next.duration) - gap - s.edges[i].t);
      }
    }
    const delta = round(Math.max(minDelta, Math.min(maxDelta, requestedDelta)));
    for (const s of next.signals) for (const i of selected.get(s.id) || []) if (i > 0 && s.edges[i]) s.edges[i].t = round(s.edges[i].t + delta);
    return next;
  }
  function triggerDirection(s, index) {
    const e = s.edges[index], previous = s.edges[index - 1];
    if (!e || !previous) return null;
    const direction = previous.v === '0' && e.v === '1' ? 'rising' : previous.v === '1' && e.v === '0' ? 'falling' : null;
    if (!direction || e.trigger === 'off') return null;
    return e.trigger === 'on' || s.trigger === 'both' || s.trigger === direction ? direction : null;
  }
  function reorderSignal(doc, signalId, insertionIndex) {
    const next = clone(doc), oldIds = next.signals.map(s => s.id), from = oldIds.indexOf(signalId);
    if (from < 0) return next;
    let to = Math.max(0, Math.min(next.signals.length, insertionIndex));
    if (to > from) to--;
    const [moving] = next.signals.splice(from, 1); next.signals.splice(to, 0, moving);
    remapAnnotations(next, oldIds);
    return next;
  }
  function remapAnnotations(doc, oldIds) {
    const newIds = doc.signals.map(s => s.id);
    doc.annotations = doc.annotations.filter(a => {
      if (a.kind === 'reference') a.y = 0;
      else if (a.kind === 'text') { const row = newIds.indexOf(oldIds[a.y]); if (row < 0) return false; a.y = row; }
      else if (a.kind === 'dimension' && a.y > 0) { const row = newIds.indexOf(oldIds[a.y - 1]); if (row < 0) return false; a.y = row + 1; }
      return true;
    });
  }
  function sheet(document, name = '活頁1') { return { id: uid(), name, document: validate(document) }; }
  function workbook(document = example()) {
    const first = sheet(document);
    return { version: 2, title: document.title, activeSheetId: first.id, sheets: [first], diagram: diagramDefaults(first.document) };
  }
  function diagramDefaults(document) {
    return { duration: document.duration, unit: document.unit, step: document.step, rowHeight: document.rowHeight,
      waveformHeight: document.waveformHeight ?? Math.min(64, document.rowHeight * .4, document.rowHeight - 8), width: 2 };
  }
  function validateDiagram(settings) {
    const probe = { ...blank(), duration: settings?.duration, unit: settings?.unit, step: settings?.step, rowHeight: settings?.rowHeight, waveformHeight: settings?.waveformHeight };
    validate(probe);
    if (!Number.isFinite(settings.width) || settings.width < .5 || settings.width > 8 || !Number.isFinite(settings.waveformHeight)) throw new Error('波形粗細需介於 0.5 與 8 px。');
    return { duration: settings.duration, unit: settings.unit, step: settings.step, rowHeight: settings.rowHeight, waveformHeight: settings.waveformHeight, width: settings.width };
  }
  function applyDiagram(input, settings) {
    const next = validateWorkbook(input), config = validateDiagram(settings);
    next.diagram = config;
    next.sheets.forEach(page => {
      const previousHeight = page.document.rowHeight;
      const d = resizeDocument(page.document, config.duration);
      Object.assign(d, { unit: config.unit, step: config.step, rowHeight: config.rowHeight, waveformHeight: config.waveformHeight });
      d.signals.forEach(s => {
        if (!s.widthLocked) s.style.width = config.width;
        if (s.rowHeightLocked) s.rowHeight = s.rowHeight ?? previousHeight;
        else delete s.rowHeight;
      });
      page.document = validate(d);
    });
    return next;
  }
  function pasteSignal(doc, source, afterId) {
    const next = clone(doc);
    if (next.signals.length >= 64) throw new Error('最多可建立 64 個訊號。');
    const copy = clone(source); copy.id = uid(); copy.name = (copy.name + '_copy').slice(0, 80);
    copy.edges = normalize(copy.edges, next.duration);
    const index = next.signals.findIndex(s => s.id === afterId), oldIds = next.signals.map(s => s.id);
    next.signals.splice(index < 0 ? next.signals.length : index + 1, 0, copy); remapAnnotations(next, oldIds);
    return { document: validate(next), signalId: copy.id };
  }
  function validateWorkbook(input) {
    if (input?.version === 1) return workbook(validate(input));
    const fail = () => { throw new Error('活頁圖檔格式不正確，原本的圖仍保留。'); };
    if (!input || input.version !== 2 || typeof input.title !== 'string' || input.title.length > 120 || !Array.isArray(input.sheets) || input.sheets.length < 1 || input.sheets.length > 32) fail();
    const ids = new Set();
    const sheets = input.sheets.map(s => {
      if (!s || typeof s.id !== 'string' || !s.id || s.id.length > 80 || ids.has(s.id) || typeof s.name !== 'string' || !s.name.trim() || s.name.length > 50) fail();
      ids.add(s.id); return { id: s.id, name: s.name, document: validate(s.document) };
    });
    if (!ids.has(input.activeSheetId)) fail();
    return { version: 2, title: input.title, activeSheetId: input.activeSheetId, sheets, diagram: validateDiagram(input.diagram ?? diagramDefaults(sheets[0].document)) };
  }
  function duplicateSheet(original) {
    const document = clone(original.document);
    document.signals.forEach(s => { s.id = uid(); }); document.annotations.forEach(a => { a.id = uid(); });
    const name = (original.name + ' 副本').slice(0, 50); document.title = name;
    return sheet(document, name);
  }
  return { STATES, FONT, round, clone, uid, defaultStyle, signal, normalize, stateAt, setRange, clock, pattern, example, blank, validate, resizeDocument, moveEdges, triggerDirection, reorderSignal, remapAnnotations, sheet, workbook, validateWorkbook, duplicateSheet, diagramDefaults, validateDiagram, applyDiagram, pasteSignal };
});
