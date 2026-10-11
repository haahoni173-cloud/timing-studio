'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const M = require('../public/model.js');
const R = require('../public/render.js');
test('painting preserves the original waveform outside the painted interval', () => {
  const original = [{ t: 0, v: '0' }, { t: 3, v: '1' }, { t: 6, v: '0' }];
  const result = M.setRange(original, 4, 5, 'X', 8);
  assert.deepEqual([0, 3, 4, 5, 6, 7].map(t => M.stateAt(result, t)), ['0','1','X','1','0','0']);
  assert.deepEqual(original, [{ t: 0, v: '0' }, { t: 3, v: '1' }, { t: 6, v: '0' }]);
});
test('painting the final cell and painting consecutive cells avoids duplicate edges', () => {
  let edges = M.setRange([{ t: 0, v: '0' }], 3, 4, '1', 4);
  edges = M.setRange(edges, 2, 3, '1', 4);
  assert.deepEqual(edges, [{ t: 0, v: '0' }, { t: 2, v: '1' }]);
});
test('clock phase and duty produce the requested pulse duration', () => {
  const edges = M.clock(12, 4, 25, 2);
  assert.deepEqual(edges, [{ t: 0, v: '0' }, { t: 2, v: '1' }, { t: 3, v: '0' }, { t: 6, v: '1' }, { t: 7, v: '0' }, { t: 10, v: '1' }, { t: 11, v: '0' }]);
  assert.throws(() => M.clock(16, 0, 50));
  assert.throws(() => M.clock(16, 2, 100));
});
test('high idle clocks retain the high-level duty ratio', () => {
  assert.deepEqual(M.clock(8, 4, 25, 0, '1'), [{ t: 0, v: '0' }, { t: 3, v: '1' }, { t: 4, v: '0' }, { t: 7, v: '1' }]);
});
test('pattern values include unknown and high impedance and retain the final level', () => {
  const edges = M.pattern('0 1 X Z', .5, 4);
  assert.deepEqual([0, .5, 1, 1.5, 3].map(t => M.stateAt(edges, t)), ['0','1','X','Z','Z']);
  assert.throws(() => M.pattern('invalid', 1, 16));
});
test('multi-signal movement keeps alignment and stops the whole group at the closest neighbor', () => {
  const d = M.blank();
  d.signals = [M.signal('A', [{ t: 0, v: '0' }, { t: 3, v: '1' }, { t: 6, v: '0' }]), M.signal('B', [{ t: 0, v: '0' }, { t: 3, v: '1' }, { t: 5, v: '0' }])];
  const selection = d.signals.map(s => ({ signalId: s.id, index: 1 }));
  const shifted = M.moveEdges(d, selection, 4);
  assert.equal(shifted.signals[0].edges[1].t, shifted.signals[1].edges[1].t);
  assert.ok(shifted.signals[1].edges[1].t < 5);
  assert.equal(d.signals[0].edges[1].t, 3);
  M.validate(shifted);
});
test('adjacent selected edges move as a group without being blocked by each other', () => {
  const d = M.blank(); d.signals[0].edges = [{ t: 0, v: '0' }, { t: 3, v: '1' }, { t: 4, v: '0' }];
  const shifted = M.moveEdges(d, [1,2].map(index => ({ signalId: d.signals[0].id, index })), 2);
  assert.deepEqual(shifted.signals[0].edges.map(e => e.t), [0,5,6]);
});
test('shrinking the time axis keeps a valid waveform and removes collapsed dimensions', () => {
  const d = M.example(); const smaller = M.resizeDocument(d, 5);
  assert.ok(smaller.signals.every(s => s.edges.every(e => e.t < 5)));
  assert.ok(smaller.annotations.every(a => a.kind !== 'dimension' || a.t1 < a.t2));
  M.validate(smaller);
});
test('imports whitelist fields, reject unsafe styles, duplicate IDs and invalid edges', () => {
  const valid = M.example(); valid.extra = 'ignored'; assert.equal(M.validate(valid).extra, undefined);
  for (const corrupt of [d => { d.signals[0].style.color = 'url(https://example.com)'; }, d => { d.signals[1].id = d.signals[0].id; }, d => { d.signals[0].edges[1].t = -1; }, d => { d.duration = Infinity; }, d => { d.annotations[1].t2 = d.annotations[1].t1; }]) {
    const copy = M.clone(M.example()); corrupt(copy); assert.throws(() => M.validate(copy));
  }
});
test('exports escape user text and omit editing handles and selection backgrounds', () => {
  const d = M.example(); d.title = '<script>alert("x")</script>'; d.signals[0].name = 'CLK & <test>';
  const svg = R.svg(d);
  assert.ok(svg.includes('&lt;script&gt;')); assert.ok(svg.includes('CLK &amp; &lt;test&gt;'));
  assert.ok(!svg.includes('<script>')); assert.ok(!svg.includes('data-edge-signal')); assert.ok(!svg.includes('edge-hit'));
  assert.ok(svg.includes('Times New Roman')); assert.ok(svg.includes('DFKai-SB'));
});
test('large documents stay within the PNG pixel and dimension budget', () => {
  const d = M.blank(); d.duration = 256; d.signals = Array.from({ length: 64 }, (_, i) => M.signal('S' + i)); d.rowHeight = 128;
  const size = R.rasterSize(d, 4);
  assert.ok(size.width <= 16384 && size.height <= 16384 && size.width * size.height <= 32000000);
});
test('long signal names expand the label column consistently for editing and export', () => {
  const d = M.blank(), original = R.layout(d); d.signals[0].name = '這是一個很長的訊號名稱 LONG_SIGNAL_NAME';
  assert.ok(R.layout(d).x > original.x);
  assert.ok(R.svg(d).includes(d.signals[0].name));
});
test('old single-page files upgrade to workbooks without changing their waveforms', () => {
  const old = M.example(), upgraded = M.validateWorkbook(old);
  assert.equal(upgraded.version, 2); assert.equal(upgraded.sheets.length, 1);
  assert.deepEqual(upgraded.sheets[0].document.signals[1].edges, old.signals[1].edges);
  assert.equal(upgraded.sheets[0].document.annotations[1].showLabel, true);
  assert.equal(upgraded.sheets[0].document.annotations[1].showTime, false);
  assert.deepEqual(M.validateWorkbook(JSON.parse(JSON.stringify(upgraded))), upgraded);
});
test('workbook validation rejects invalid pages and duplicate page IDs', () => {
  const book = M.workbook(); book.sheets.push(M.duplicateSheet(book.sheets[0]));
  assert.notEqual(book.sheets[0].document.signals[0].id, book.sheets[1].document.signals[0].id);
  M.validateWorkbook(book);
  const duplicate = M.clone(book); duplicate.sheets[1].id = duplicate.sheets[0].id; assert.throws(() => M.validateWorkbook(duplicate));
  const invalid = M.clone(book); invalid.sheets[1].document.rowHeight = 23; assert.throws(() => M.validateWorkbook(invalid));
  const oversized = M.clone(book); oversized.sheets = Array.from({ length: 33 }, () => M.sheet(M.blank())); assert.throws(() => M.validateWorkbook(oversized));
});
test('row sorting keeps row annotations attached to their signal and leaves global arrows in place', () => {
  const d = M.example();
  d.annotations.push({ id: M.uid(), kind: 'text', t1: 4, t2: 4, y: 4, text: 'ACK note', style: M.defaultStyle() });
  d.annotations.push({ id: M.uid(), kind: 'dimension', t1: 4, t2: 6, y: 5, text: 'ACK delay', style: M.defaultStyle() });
  const moved = M.reorderSignal(d, d.signals[4].id, 0);
  assert.equal(moved.signals[0].name, 'ACK'); assert.equal(moved.annotations.at(-2).y, 0); assert.equal(moved.annotations.at(-1).y, 1);
  assert.equal(moved.annotations[1].y, 0); M.validate(moved);
});
test('individual trigger overrides take precedence and survive time edits and neighboring painting', () => {
  const d = M.blank(); d.signals[0] = M.signal('S', [{ t: 0, v: '0' }, { t: 3, v: '1', trigger: 'off' }, { t: 6, v: '0', trigger: 'on' }]);
  const s = d.signals[0]; s.trigger = 'rising';
  assert.equal(M.triggerDirection(s, 1), null); assert.equal(M.triggerDirection(s, 2), 'falling');
  const moved = M.moveEdges(d, [{ signalId: s.id, index: 2 }], 1); assert.equal(moved.signals[0].edges[2].trigger, 'on');
  const painted = M.setRange(s.edges, 5, 6, 'X', d.duration); assert.equal(painted.find(e => e.t === 6).trigger, 'on');
  s.edges[1].trigger = 'inherit'; assert.equal(M.triggerDirection(s, 1), 'rising');
  s.trigger = 'both'; assert.ok(R.svg(d).includes('data-trigger="falling"')); M.validate(d);
});
test('compact waveforms fit their row and export labels have independent visibility', () => {
  const d = M.validate(M.example()); d.rowHeight = 24; d.waveformHeight = 16; M.validate(d);
  assert.ok(R.level('1', 0, 24, 16) >= 0 && R.level('0', 0, 24, 16) <= 24);
  assert.ok(!new RegExp('<text[^>]*>' + d.title).test(R.svg(d)));
  const a = d.annotations[1]; a.showLabel = true; a.showTime = true;
  assert.equal(R.dimensionLabel(d, a), 't_delay (2 ns)');
  a.showLabel = false; assert.equal(R.dimensionLabel(d, a), '2 ns');
  a.showTime = false; assert.equal(R.dimensionLabel(d, a), '');
});
test('removing rows preserves global references and keeps saved documents valid', () => {
  const d = M.validate(M.example()), ids = d.signals.map(s => s.id);
  d.annotations[0].y = 4; d.signals = d.signals.slice(0, 1); M.remapAnnotations(d, ids);
  assert.ok(d.annotations.some(a => a.kind === 'reference')); assert.equal(d.annotations[0].y, 0);
  M.validate(d);
});
test('global Diagram settings apply to all sheets while preserving independent signal locks', () => {
  const book = M.workbook(); book.sheets.push(M.duplicateSheet(book.sheets[0]));
  const locked = book.sheets[0].document.signals[0]; locked.style.width = 6; locked.widthLocked = true; locked.rowHeight = 28; locked.rowHeightLocked = true;
  const other = book.sheets[1].document.signals[1]; other.rowHeight = 100;
  const settings = { duration: 12, unit: 'us', step: .5, rowHeight: 40, waveformHeight: 24, width: 3 };
  const next = M.applyDiagram(book, settings);
  assert.deepEqual(next.diagram, settings);
  for (const page of next.sheets) { assert.equal(page.document.duration, 12); assert.equal(page.document.rowHeight, 40); assert.equal(page.document.unit, 'us'); }
  assert.equal(next.sheets[0].document.signals[0].style.width, 6); assert.equal(next.sheets[0].document.signals[0].rowHeight, 28);
  assert.equal(next.sheets[1].document.signals[0].style.width, 3); assert.equal(next.sheets[1].document.signals[1].rowHeight, undefined);
  assert.equal(book.sheets[1].document.duration, 16); M.validateWorkbook(next);
  const unlocked = M.clone(next); unlocked.sheets[0].document.signals[0].widthLocked = false; unlocked.sheets[0].document.signals[0].rowHeightLocked = false;
  const reapplied = M.applyDiagram(unlocked, settings); assert.equal(reapplied.sheets[0].document.signals[0].style.width, 3); assert.equal(reapplied.sheets[0].document.signals[0].rowHeight, undefined);
});
test('mixed row heights share consistent hit testing, annotations and SVG geometry', () => {
  const d = M.validate(M.example()); d.signals[0].rowHeight = 24; d.signals[1].rowHeight = 100;
  const l = R.layout(d); assert.deepEqual(l.rows.slice(0, 3), [{ y: 82, height: 24 }, { y: 106, height: 100 }, { y: 206, height: 80 }]);
  assert.equal(l.height, 470); assert.equal(R.rowAt(d, 105), 0); assert.equal(R.rowAt(d, 106), 1); assert.equal(R.rowAt(d, 999), 5);
  assert.equal(R.annotationY(d, { kind: 'text', y: 2 }), 220); assert.equal(R.annotationY(d, { kind: 'dimension', y: 3 }), 202);
  d.annotations.push({ id: M.uid(), kind: 'text', t1: 1, t2: 1, y: 2, text: 'Note', style: M.defaultStyle() });
  assert.ok(R.svg(d).includes('y="220"')); M.validate(d);
});
test('signal clipboard creates fresh IDs, preserves style and locks, clips edges and remaps attached notes', () => {
  const original = M.validate(M.example()), source = original.signals[0]; source.rowHeight = 28; source.rowHeightLocked = true; source.widthLocked = true; source.trigger = 'both'; source.edges[1].trigger = 'off';
  const dest = M.validate(M.blank()); dest.duration = 8; dest.annotations.push({ id: M.uid(), kind: 'text', t1: 2, t2: 2, y: 0, text: 'Note', style: M.defaultStyle() });
  const pasted = M.pasteSignal(dest, source, dest.signals[0].id), copy = pasted.document.signals[1];
  assert.notEqual(copy.id, source.id); assert.equal(copy.id, pasted.signalId); assert.equal(copy.trigger, 'both'); assert.equal(copy.edges[1].trigger, 'off'); assert.equal(copy.rowHeight, 28); assert.equal(copy.widthLocked, true);
  assert.ok(copy.edges.every(e => e.t < 8)); assert.equal(pasted.document.annotations.length, 1); assert.equal(pasted.document.annotations[0].y, 0); assert.equal(dest.signals.length, 1);
  const full = M.blank(); full.signals = Array.from({ length: 64 }, () => M.signal('S')); assert.throws(() => M.pasteSignal(full, source));
});
test('imports reject malformed locks, local row heights and global Diagram settings', () => {
  for (const mutate of [s => { s.rowHeight = 23; }, s => { s.widthLocked = 'yes'; }, s => { s.rowHeightLocked = 1; }]) { const d = M.example(); mutate(d.signals[0]); assert.throws(() => M.validate(d)); }
  const book = M.workbook(); book.diagram.width = 0; assert.throws(() => M.validateWorkbook(book));
  assert.throws(() => M.validateDiagram({ width: 2 }));
  const d = M.validate(M.example()); d.signals[0].trigger = 'both'; const svg = R.svg(d);
  const x = R.layout(d).x + d.signals[0].edges[1].t * R.layout(d).px;
  const path = svg.match(/data-trigger="falling" d="([^"]+)"/)[1]; assert.ok(path.includes('L' + x + ' ')); assert.ok(!path.includes('V'));
});
