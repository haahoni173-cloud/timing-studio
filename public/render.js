(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(require('./model.js'));
  else root.TimingRender = factory(root.TimingModel);
})(typeof globalThis !== 'undefined' ? globalThis : this, function (M) {
  'use strict';
  const escape = value => String(value).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' })[c]);
  const BASE_X = 172, PX = 48, TOP = 82;
  const dash = style => style.dash === 'dashed' ? '7 5' : style.dash === 'dotted' ? '1 4' : '';
  function estimateLabel(text) { return [...text].reduce((sum, c) => sum + (/[^\x00-\x7f]/.test(c) ? 18 : /[WM]/.test(c) ? 18 : /[A-Z]/.test(c) ? 13 : /[mw]/.test(c) ? 15 : /[il .]/.test(c) ? 6 : 10), 0); }
  function layout(doc) {
    const x = Math.max(BASE_X, ...doc.signals.map(s => estimateLabel(s.name) + 52));
    const right = Math.max(44, estimateLabel(doc.unit) + 20);
    let y = TOP;
    const rows = doc.signals.map(s => { const height = s.rowHeight ?? doc.rowHeight, row = { y, height }; y += height; return row; });
    return { x, px: PX, top: TOP, rows, dimensionY: 24, referenceY: 80, width: x + doc.duration * PX + right, height: y + (rows.length ? 0 : doc.rowHeight) + 24 };
  }
  function rowAt(doc, y) { if (y < TOP) return -1; const rows = layout(doc).rows; const index = rows.findIndex(r => y >= r.y && y < r.y + r.height); return index < 0 ? rows.length : index; }
  const rowY = (doc, index) => layout(doc).rows[index]?.y ?? TOP;
  const level = (v, y, height, amplitude = height * .4) => y + height / 2 + (v === '1' ? -amplitude / 2 : v === '0' ? amplitude / 2 : 0);
  const annotationY = (doc, a) => a.kind === 'dimension' ? (a.y === 0 ? 24 : rowY(doc, a.y - 1) - 4) : rowY(doc, a.y) + 14;
  function dimensionLabel(doc, a) {
    const label = (a.showLabel ?? true) ? a.text : '';
    const time = (a.showTime ?? !a.text) ? `${M.round(a.t2 - a.t1)} ${doc.unit}` : '';
    return label && time ? `${label} (${time})` : label || time;
  }
  const txt = (x, y, value, attrs = '') => `<text x="${x}" y="${y}" ${attrs}>${escape(value)}</text>`;
  function content(doc, options = {}) {
    const { editing = false, grid = false, selectedId = null, edges = [], zoom = 1, background = 'white' } = options;
    const l = layout(doc), X = l.x, end = X + PX * doc.duration;
    const parts = [`<title>${escape(doc.title)}</title><desc>數位 Timing Diagram，${doc.signals.length} 個訊號，時間長度 ${doc.duration} ${escape(doc.unit)}。</desc>`];
    const objects = [...doc.signals, ...doc.annotations];
    parts.push('<defs>');
    objects.forEach((o, i) => parts.push(`<marker id="arrow-${i}" markerWidth="7" markerHeight="7" refX="6" refY="3.5" orient="auto-start-reverse" markerUnits="strokeWidth"><path d="M0 0L7 3.5L0 7" fill="none" stroke="${o.style.color}" stroke-width="1"/></marker>`));
    parts.push('</defs>');
    if (background === 'white') parts.push(`<rect width="${l.width}" height="${l.height}" fill="#fff"/>`);
    parts.push(`<g font-family="${escape(M.FONT)}" fill="#263744">`);
    parts.push(txt(26, 64, 'SIGNAL', 'font-size="12" fill="#80909a" letter-spacing="1.5"'));
    parts.push(txt(end + 10, 64, doc.unit, 'font-size="13" fill="#70808b"'));
    parts.push(`<path d="M${X} 72H${end}" stroke="#a7b4bc" fill="none" stroke-width="1"/>`);
    // Bound grid density while retaining the chosen snapping precision in the editor.
    let gridStep = doc.step;
    while (doc.duration / gridStep > 512) gridStep *= 2;
    const majorStep = Math.max(gridStep, 2 ** Math.ceil(Math.log2(1.4 / gridStep)) * gridStep);
    for (let t = 0; t <= doc.duration + .00001; t += gridStep) {
      const time = M.round(t), x = X + PX * time;
      const major = Math.abs(time / majorStep - Math.round(time / majorStep)) < .001;
      if (grid) parts.push(`<path d="M${x} 73V${l.height - 16}" stroke="${major ? '#e4eaed' : '#f0f3f5'}" stroke-width="1"/>`);
      if (major || time === doc.duration) {
        parts.push(`<path d="M${x} 69V75" stroke="#a7b4bc" stroke-width="1"/>`);
        parts.push(txt(x, 61, time, 'text-anchor="middle" font-size="13" fill="#70808b"'));
      }
    }
    if (Math.abs(doc.duration / majorStep - Math.round(doc.duration / majorStep)) > .001) parts.push(txt(end, 61, doc.duration, 'text-anchor="middle" font-size="13" fill="#70808b"'));
    doc.signals.forEach((s, index) => {
      const { y, height } = l.rows[index];
      const amplitude = Math.min(doc.waveformHeight ?? height * .4, height - 8);
      const mid = level('Z', y, height, amplitude), hi = level('1', y, height, amplitude), lo = level('0', y, height, amplitude);
      const markerIndex = index;
      if (editing) {
        if (s.id === selectedId || edges.some(e => e.signalId === s.id)) parts.push(`<rect x="12" y="${y + 3}" width="${l.width - 24}" height="${height - 4}" rx="4" fill="#f3f8f7"/>`);
        parts.push(`<rect data-row-id="${escape(s.id)}" x="16" y="${y}" width="${l.width - 32}" height="${height}" fill="transparent"/>`);
      }
      parts.push(txt(26, mid + 5, s.name, `font-size="17" fill="${s.style.color}"${editing ? ` data-label-id="${escape(s.id)}"` : ''}`));
      if (grid) parts.push(`<path d="M${X} ${lo}H${end}" stroke="#edf1f3" stroke-width="1"/>`);
      s.edges.forEach((e, i) => {
        const x1 = X + e.t * PX, x2 = X + (s.edges[i + 1]?.t ?? doc.duration) * PX;
        const ye = level(e.v, y, height, amplitude);
        const marker = `${i === 0 && s.style.startArrow ? ` marker-start="url(#arrow-${markerIndex})"` : ''}${i === s.edges.length - 1 && s.style.endArrow ? ` marker-end="url(#arrow-${markerIndex})"` : ''}`;
        const attributes = `fill="none" stroke="${s.style.color}" stroke-width="${s.style.width}" stroke-linecap="round" stroke-linejoin="round"`;
        if (e.v === 'X') {
          parts.push(`<rect x="${x1}" y="${hi}" width="${x2 - x1}" height="${lo - hi}" fill="${s.style.color}" fill-opacity="0.07"/>`);
          let zig = '';
          for (let x = x1; x < x2; x += 16) { const xe = Math.min(x + 16, x2); zig += `M${x} ${hi}L${xe} ${lo}M${x} ${lo}L${xe} ${hi}`; }
          parts.push(`<path d="${zig}" stroke="${s.style.color}" stroke-opacity="0.38" stroke-width="0.7" fill="none"/>`);
          parts.push(`<path d="M${x1} ${hi}H${x2}M${x1} ${lo}H${x2}" ${attributes} stroke-dasharray="${dash(s.style)}"/>`);
          if (x2 - x1 >= 26) parts.push(txt((x1 + x2) / 2, mid + 5, 'X', `font-size="15" text-anchor="middle" fill="${s.style.color}"`));
        } else {
          parts.push(`<path d="M${x1} ${ye}H${x2}" ${attributes} stroke-dasharray="${e.v === 'Z' ? '5 4' : dash(s.style)}"${marker}/>`);
          if (e.v === 'Z' && x2 - x1 >= 26) parts.push(txt((x1 + x2) / 2, mid - 6, 'Z', `font-size="13" text-anchor="middle" fill="${s.style.color}"`));
        }
        if (i > 0) {
          const prev = s.edges[i - 1].v;
          const previousY = level(prev, y, height, amplitude);
          if (prev === 'X' || e.v === 'X') parts.push(`<path d="M${x1} ${hi}V${lo}" ${attributes} stroke-dasharray="${dash(s.style)}"/>`);
          else parts.push(`<path d="M${x1} ${previousY}V${ye}" ${attributes} stroke-dasharray="${dash(s.style)}"/>`);
          const direction = M.triggerDirection(s, i);
          if (direction) {
            const half = Math.min(4, amplitude * .3), neck = direction === 'rising' ? mid + half : mid - half;
            parts.push(`<path data-trigger="${direction}" d="M${x1 - half} ${neck}L${x1} ${mid}L${x1 + half} ${neck}" stroke="${s.style.color}" stroke-width="${Math.max(1.2, s.style.width)}" stroke-linecap="round" stroke-linejoin="round" fill="none" pointer-events="none"/>`);
          }
          if (editing) {
            const chosen = edges.some(e2 => e2.signalId === s.id && e2.index === i);
            if (chosen) parts.push(`<path d="M${x1} ${hi - 7}V${lo + 7}" stroke="#186d67" stroke-width="1" stroke-dasharray="3 3"/><circle cx="${x1}" cy="${mid}" r="4.5" fill="#fff" stroke="#186d67" stroke-width="2"/>`);
            const hitTop = Math.max(y + 1, hi - 7), hitBottom = Math.min(y + height - 1, lo + 7);
            parts.push(`<rect class="edge-hit" data-edge-signal="${escape(s.id)}" data-edge-index="${i}" x="${x1 - 7 / zoom}" y="${hitTop}" width="${14 / zoom}" height="${hitBottom - hitTop}" fill="transparent"/>`);
          }
        }
      });
    });
    if (doc.signals.length === 0) parts.push(txt(X, TOP + 44, '新增訊號開始繪製', 'font-size="18" fill="#80909a"'));
    doc.annotations.forEach((a, index) => {
      const x1 = X + a.t1 * PX, x2 = X + a.t2 * PX;
      const markerIndex = doc.signals.length + index;
      const attrs = `fill="none" stroke="${a.style.color}" stroke-width="${a.style.width}" stroke-dasharray="${dash(a.style)}"`;
      const markers = `${a.style.startArrow ? ` marker-start="url(#arrow-${markerIndex})"` : ''}${a.style.endArrow ? ` marker-end="url(#arrow-${markerIndex})"` : ''}`;
      const chosen = editing && a.id === selectedId;
      if (a.kind === 'reference') {
        parts.push(`<path d="M${x1} 77V${l.height - 16}" ${attrs}${markers} pointer-events="none"/>`);
        parts.push(txt(x1 + 5, 54, a.text, `font-size="14" fill="${a.style.color}"`));
        if (editing) parts.push(`<circle class="annotation-hit" data-annotation="${escape(a.id)}" cx="${x1}" cy="80" r="${5 / zoom}" fill="${chosen ? '#fff' : a.style.color}" stroke="${a.style.color}" stroke-width="1.5"/><rect class="annotation-hit" data-annotation="${escape(a.id)}" x="${x1 - 6}" y="38" width="${Math.max(30, a.text.length * 14)}" height="21" fill="transparent"/>`);
      } else if (a.kind === 'dimension') {
        const y = annotationY(doc, a), label = dimensionLabel(doc, a);
        parts.push(`<path d="M${x1} ${y - 5}V${y + 8}M${x2} ${y - 5}V${y + 8}" stroke="${a.style.color}" stroke-width="1" stroke-opacity=".5"/>`);
        parts.push(`<path d="M${x1} ${y}H${x2}" ${attrs}${markers}/>`);
        if (label) parts.push(txt((x1 + x2) / 2, y - 10, label, `text-anchor="middle" font-size="15" fill="${a.style.color}"`));
        if (editing) {
          parts.push(`<rect class="annotation-hit" data-annotation="${escape(a.id)}" x="${x1}" y="${y - (label ? 24 : 7)}" width="${x2 - x1}" height="${label ? 31 : 14}" fill="transparent"/>`);
          if (chosen) [x1, x2].forEach((x, endpoint) => parts.push(`<circle class="annotation-end" data-annotation="${escape(a.id)}" data-endpoint="${endpoint + 1}" cx="${x}" cy="${y}" r="${6 / zoom}" fill="#fff" stroke="${a.style.color}" stroke-width="1.5"/>`));
        }
      } else {
        const y = annotationY(doc, a);
        parts.push(txt(x1, y, a.text, `font-size="16" fill="${a.style.color}"`));
        if (editing) parts.push(`<rect class="annotation-hit" data-annotation="${escape(a.id)}" x="${x1 - 3}" y="${y - 20}" width="${Math.max(40, a.text.length * 16)}" height="24" fill="transparent"/>`);
      }
      if (chosen && a.kind === 'text') parts.push(`<circle class="annotation-hit" data-annotation="${escape(a.id)}" cx="${x1}" cy="${annotationY(doc, a)}" r="4" fill="#fff" stroke="${a.style.color}" stroke-width="2"/>`);
    });
    parts.push('</g>');
    return parts.join('');
  }
  function svg(doc, options = {}) {
    const l = layout(doc);
    return `<svg xmlns="http://www.w3.org/2000/svg" width="${l.width}" height="${l.height}" viewBox="0 0 ${l.width} ${l.height}">${content(doc, options)}</svg>`;
  }
  function rasterSize(doc, requestedScale) {
    const l = layout(doc);
    const scale = Math.min(requestedScale, 16384 / l.width, 16384 / l.height, Math.sqrt(32000000 / (l.width * l.height)));
    return { width: Math.max(1, Math.floor(l.width * scale)), height: Math.max(1, Math.floor(l.height * scale)), scale };
  }
  return { escape, layout, content, svg, level, rasterSize, annotationY, dimensionLabel, rowAt, rowY };
});
