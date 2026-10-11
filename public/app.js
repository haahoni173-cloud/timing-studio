/* Timing Studio — all document edits and exports stay in this browser. */
(() => {
  'use strict';
  const M = window.TimingModel, R = window.TimingRender;
  const $ = id => document.getElementById(id);
  const STORAGE = 'timing-studio.workbook.v2', LEGACY_STORAGE = 'timing-studio.document.v1', UI_STORAGE = 'timing-studio.ui.v2';
  const DEFAULT_KEYS = { select: 'V', toggle: 'B', high: 'H', low: 'L', unknown: 'X', highz: 'Z', reference: 'R', dimension: 'D', text: 'T', properties: 'Q', fit: 'F', copy: 'Ctrl+C', paste: 'Ctrl+V', delete: 'Delete', undo: 'Ctrl+Z', redo: 'Ctrl+Shift+Z', save: 'Ctrl+S' };
  const COMMAND_LABELS = { select: '選取', toggle: '切換電位', high: '高電位', low: '低電位', unknown: '未知狀態', highz: '高阻抗', reference: '參考線', dimension: '時間箭頭', text: '文字', properties: '屬性', fit: '符合畫布', copy: '複製訊號', paste: '貼上訊號', delete: '刪除選取', undo: '復原', redo: '重做', save: '儲存圖檔' };
  const TOOL_COMMANDS = { select: 'select', toggle: 'toggle', high: '1', low: '0', unknown: 'X', highz: 'Z', reference: 'reference', dimension: 'dimension', text: 'text' };
  let book = M.workbook(), doc, selectedId = null, selectedEdges = [], tool = 'select', zoom = 1;
  let ui = { leftWidth: 200, rightWidth: 264, collapsed: false, views: Object.create(null), sections: {}, language: 'zh', keys: { ...DEFAULT_KEYS } };
  let signalClipboard = null;
  let undoStack = [], redoStack = [], drag = null, editingClockId = null, toastTimer, fallbackBlob = null;
  let recovered = false, storageAvailable = true;
  try {
    const saved = localStorage.getItem(STORAGE) || localStorage.getItem(LEGACY_STORAGE);
    if (saved) { book = M.validateWorkbook(JSON.parse(saved)); recovered = true; }
    const savedUI = JSON.parse(localStorage.getItem(UI_STORAGE) || 'null');
    if (savedUI) ui = { leftWidth: Number.isFinite(savedUI.leftWidth) ? Math.max(120, Math.min(420, savedUI.leftWidth)) : 200, rightWidth: Number.isFinite(savedUI.rightWidth) ? Math.max(200, Math.min(480, savedUI.rightWidth)) : 264, collapsed: savedUI.collapsed === true, views: Object.assign(Object.create(null), savedUI.views && typeof savedUI.views === 'object' ? savedUI.views : {}) };
    ui.sections = savedUI?.sections && typeof savedUI.sections === 'object' ? savedUI.sections : {};
    ui.language = savedUI?.language === 'en' ? 'en' : 'zh';
    ui.keys = validKeys(savedUI?.keys) ? savedUI.keys : { ...DEFAULT_KEYS };
  }
  catch { storageAvailable = false; }
  doc = book.sheets.find(s => s.id === book.activeSheetId).document;
  selectedId = doc.signals[0]?.id || null;
  const diagram = $('diagram');
  const target = () => doc.signals.find(s => s.id === selectedId) || doc.annotations.find(a => a.id === selectedId);
  const getSignal = id => doc.signals.find(s => s.id === id);
  const esc = R.escape;
  function toast(message, error = false) {
    clearTimeout(toastTimer); $('toast').textContent = window.TimingI18n.text(message, ui.language); $('toast').classList.toggle('error-toast', error); $('toast').hidden = false;
    toastTimer = setTimeout(() => { $('toast').hidden = true; }, error ? 6500 : 3500);
  }
  const activeSheet = () => book.sheets.find(s => s.id === book.activeSheetId);
  function syncBook() { activeSheet().document = doc; }
  function bookSnapshot() { syncBook(); return M.clone(book); }
  function persistUI() { try { localStorage.setItem(UI_STORAGE, JSON.stringify(ui)); } catch {} }
  function persist() {
    syncBook();
    try { localStorage.setItem(STORAGE, JSON.stringify(book)); storageAvailable = true; }
    catch { storageAvailable = false; }
    $('save-status').textContent = storageAvailable ? '已儲存於此瀏覽器' : '請儲存圖檔備份';
  }
  function recordHistory(before) { undoStack.push(before); if (undoStack.length > 80) undoStack.shift(); redoStack = []; }
  function commit(before) {
    if (JSON.stringify(before) !== JSON.stringify(doc)) {
      const previousBook = bookSnapshot(); previousBook.sheets.find(s => s.id === book.activeSheetId).document = before;
      recordHistory(previousBook); persist();
    }
    sanitizeSelection(); render();
  }
  function edit(fn) { const before = M.clone(doc); fn(); commit(before); }
  function editBook(fn) {
    const before = bookSnapshot(); fn(); doc = activeSheet().document;
    if (JSON.stringify(before) !== JSON.stringify(book)) { recordHistory(before); persist(); }
    selectedEdges = []; sanitizeSelection(); render();
  }
  function sanitizeSelection() {
    if (!target()) selectedId = null;
    selectedEdges = selectedEdges.filter(e => getSignal(e.signalId)?.edges[e.index] && e.index > 0);
  }
  function select(id, edges = []) { selectedId = id; selectedEdges = edges; render(); }
  function renderDiagram() {
    const l = R.layout(doc);
    diagram.setAttribute('viewBox', `0 0 ${l.width} ${l.height}`);
    diagram.setAttribute('width', l.width * zoom); diagram.setAttribute('height', l.height * zoom);
    diagram.dataset.tool = tool;
    diagram.innerHTML = R.content(doc, { editing: true, grid: $('show-grid').checked, selectedId, edges: selectedEdges, zoom });
    $('zoom-label').textContent = `${Math.round(zoom * 100)}%`;
  }
  function render() {
    $('signal-count').textContent = doc.signals.length;
    $('signal-list').innerHTML = doc.signals.length ? doc.signals.map((s, i) => `<button draggable="true" class="signal-item${s.id === selectedId ? ' active' : ''}" data-id="${esc(s.id)}" aria-pressed="${s.id === selectedId}" title="拖曳調整訊號順序"><span class="signal-grip" aria-hidden="true">⋮⋮</span><span class="signal-color" style="background:${s.style.color}"></span><span class="signal-name">${esc(s.name)}</span><span class="signal-index">${String(i + 1).padStart(2, '0')}</span></button>`).join('') : '<p class="signal-empty">按「新增訊號」開始繪製。</p>';
    $('document-title').value = book.title;
    $('undo').disabled = !undoStack.length; $('redo').disabled = !redoStack.length;
    $('add-signal').disabled = doc.signals.length >= 64; $('add-clock').disabled = doc.signals.length >= 64;
    $('document-info').textContent = `${activeSheet().name} · ${doc.signals.length} ${ui.language === 'en' ? 'signals' : '個訊號'} · ${doc.duration} ${doc.unit}`;
    $('sheet-tabs').innerHTML = book.sheets.map(s => `<button class="sheet-tab${s.id === book.activeSheetId ? ' active' : ''}" data-sheet="${esc(s.id)}" role="tab" aria-selected="${s.id === book.activeSheetId}" tabindex="${s.id === book.activeSheetId ? 0 : -1}" title="雙擊可命名與管理活頁">${esc(s.name)}</button>`).join('');
    $('add-sheet').disabled = book.sheets.length >= 32;
    const item = target();
    $('selection-status').textContent = selectedEdges.length ? (ui.language === 'en' ? `${selectedEdges.length} edges selected` : `已選取 ${selectedEdges.length} 個切換邊緣`) : item ? `${ui.language === 'en' ? 'Selected: ' : '已選取 '}${item.name || item.text || (ui.language === 'en' ? 'Annotation' : '標註')}` : (ui.language === 'en' ? 'Ready' : '就緒');
    renderInspector(); renderDiagram();
    translateUI();
  }
  function setSelectValue(element, value) {
    if (![...element.options].some(o => o.value === String(value))) element.add(new Option(value, value));
    element.value = value;
  }
  function styleFields(s) {
    return `<section class="property-section"><h3>線條樣式</h3><label>顏色</label><div class="color-field"><input id="line-color" type="color" value="${s.color}" aria-label="線條顏色"><span class="color-value">${s.color.toUpperCase()}</span><div class="swatches">${['#263744','#186d67','#b27423','#526fa0'].map(c => `<button data-color="${c}" style="background:${c}" aria-label="顏色 ${c}"></button>`).join('')}</div></div><div class="field-pair"><label>粗細 (px)<input id="line-width" type="number" value="${s.width}" min="0.5" max="8" step="0.5"></label><label>線條<select id="line-dash"><option value="solid"${s.dash === 'solid' ? ' selected' : ''}>實線</option><option value="dashed"${s.dash === 'dashed' ? ' selected' : ''}>虛線</option><option value="dotted"${s.dash === 'dotted' ? ' selected' : ''}>點線</option></select></label></div><div class="arrow-checks"><label><input id="start-arrow" type="checkbox"${s.startArrow ? ' checked' : ''}> 起點箭頭</label><label><input id="end-arrow" type="checkbox"${s.endArrow ? ' checked' : ''}> 終點箭頭</label></div></section>`;
  }
  function renderInspector() {
    const item = target();
    if (!item) { $('inspector').innerHTML = '<div class="empty-inspector">選取訊號或標註，<br>即可設定名稱與線條樣式。</div>'; return; }
    const isSignal = 'edges' in item;
    let html = '';
    if (isSignal) {
      html += `<section class="property-section"><h3>訊號設定</h3><label>訊號名稱<input id="signal-name" maxlength="80" value="${esc(item.name)}"></label><label>整條訊號觸發箭頭<select id="signal-trigger">${[['none','不顯示'],['rising','↑ Pos · 上升沿'],['falling','↓ Neg · 下降沿'],['both','↑↓ 上升與下降沿']].map(([v,label]) => `<option value="${v}"${item.trigger === v ? ' selected' : ''}>${label}</option>`).join('')}</select></label>`;
      if (selectedEdges.length) {
        html += `<div class="selection-info">${ui.language === 'en' ? `${selectedEdges.length} edges; move with arrow keys.` : `已選 ${selectedEdges.length} 個邊緣；方向鍵可平移。`}</div><label>${selectedEdges.length === 1 ? '切換時間' : '對齊到時間'}<input id="edge-time" type="number" step="any" min="0" max="${doc.duration}" value="${getSignal(selectedEdges[0].signalId).edges[selectedEdges[0].index].t}"></label><button id="align-edges" class="wide-button">${selectedEdges.length === 1 ? '套用時間' : '對齊選取邊緣'}</button>`;
      }
      if (selectedEdges.length) {
        const edge = getSignal(selectedEdges[0].signalId).edges[selectedEdges[0].index];
        html += `<label>選取邊緣的觸發箭頭<select id="edge-trigger">${[['inherit','依整條設定'],['on','顯示此邊緣箭頭'],['off','隱藏此邊緣箭頭']].map(([v,label]) => `<option value="${v}"${(edge.trigger ?? 'inherit') === v ? ' selected' : ''}>${label}</option>`).join('')}</select></label><p class="fine-print">0 → 1 顯示 ↑；1 → 0 顯示 ↓。<br>X／Z 邊界不顯示觸發箭頭。</p>`;
      }
      html += `</section>${styleFields(item.style)}<section class="property-section"><h3>個別列高與鎖定</h3><label>訊號列高 (px)<input id="signal-row-height" type="number" min="24" max="128" step="1" value="${item.rowHeight ?? doc.rowHeight}"></label><label class="check-field"><input id="lock-width" type="checkbox"${item.widthLocked ? ' checked' : ''}> 鎖定粗細</label><label class="check-field"><input id="lock-row-height" type="checkbox"${item.rowHeightLocked ? ' checked' : ''}> 鎖定列高</label></section><section class="property-section"><h3>快速建立波形</h3><label>波形序列<textarea id="wave-pattern" maxlength="1024" placeholder="例如 001110001100">${esc(patternPreview(item))}</textarea></label><p class="fine-print">${ui.language === 'en' ? `One character per grid (${doc.step} ${esc(doc.unit)}).` : `每個字元為一格（${doc.step} ${esc(doc.unit)}）。`}<br>支援 0、1、X、Z。</p><button id="apply-pattern" class="wide-button">套用波形序列</button><button id="replace-clock" class="wide-button">將此訊號設為時脈</button></section>`;
    } else {
      const label = { reference: '參考線', dimension: '時間箭頭', text: '文字標註' }[item.kind];
      const lanes = Array.from({ length: item.kind === 'dimension' ? doc.signals.length + 1 : Math.max(1, doc.signals.length) }, (_, i) => `<option value="${i}"${item.y === i ? ' selected' : ''}>${item.kind === 'dimension' ? i === 0 ? '時間軸上方' : `第 ${i} 列上方` : `第 ${i + 1} 列`}</option>`).join('');
      html += `<section class="property-section"><h3>${label}</h3><label>標註文字<input id="annotation-text" maxlength="160" value="${esc(item.text)}"${item.kind === 'dimension' && !item.showLabel ? ' disabled' : ''}></label>${item.kind === 'dimension' ? `<label class="check-field"><input id="dimension-show-label" type="checkbox"${item.showLabel ? ' checked' : ''}> 顯示標註文字</label><label class="check-field"><input id="dimension-show-time" type="checkbox"${item.showTime ? ' checked' : ''}> 顯示時間差</label>` : ''}<div class="field-pair"><label>${item.kind === 'dimension' ? '起點時間' : '時間位置'}<input id="annotation-t1" type="number" min="0" max="${doc.duration}" step="any" value="${item.t1}"></label>${item.kind === 'dimension' ? `<label>終點時間<input id="annotation-t2" type="number" min="0" max="${doc.duration}" step="any" value="${item.t2}"></label>` : ''}</div>${item.kind !== 'reference' ? `<label>垂直位置<select id="annotation-lane">${lanes}</select></label>` : ''}<button id="delete-object" class="wide-button danger">刪除標註</button></section>${styleFields(item.style)}`;
    }
    html = html.replace(/<section class="property-section"><h3>(.*?)<\/h3>/g, (_, title) => `<details class="property-section" data-section="${esc(title)}"${(Object.hasOwn(ui.sections, title) ? ui.sections[title] : title !== '快速建立波形' && title !== '個別列高與鎖定') ? ' open' : ''}><summary>${title}</summary><div class="section-body">`).replace(/<\/section>/g, '</div></details>');
    html = html.replace(/<button id="delete-object"[^>]*>.*?<\/button>/g, '');
    $('inspector').innerHTML = html;
    $('inspector').querySelectorAll('details').forEach(section => { section.ontoggle = () => { if (!section.isConnected) return; ui.sections[section.dataset.section] = section.open; persistUI(); }; });
    if ($('delete-object')) $('delete-object').onclick = deleteObject;
    if (isSignal) {
      $('signal-name').onchange = e => edit(() => { item.name = e.target.value.trim() || 'SIGNAL'; });
      $('signal-trigger').onchange = e => edit(() => {
        const ids = selectedEdges.length ? [...new Set(selectedEdges.map(e => e.signalId))] : [item.id];
        doc.signals.filter(s => ids.includes(s.id)).forEach(s => { s.trigger = e.target.value; });
      });
      if ($('edge-trigger')) $('edge-trigger').onchange = e => edit(() => selectedEdges.forEach(edge => { getSignal(edge.signalId).edges[edge.index].trigger = e.target.value; }));
      $('signal-row-height').onchange = e => { const n = Number(e.target.value); if (!Number.isInteger(n) || n < 24 || n > 128) return renderInspector(); edit(() => { item.rowHeight = n; }); };
      $('lock-width').onchange = e => edit(() => { item.widthLocked = e.target.checked; });
      $('lock-row-height').onchange = e => edit(() => { item.rowHeightLocked = e.target.checked; if (item.rowHeightLocked) item.rowHeight = item.rowHeight ?? doc.rowHeight; });
      $('apply-pattern').onclick = () => {
        try { const next = M.pattern($('wave-pattern').value, doc.step, doc.duration); edit(() => { item.edges = next; selectedEdges = []; }); }
        catch (error) { toast(error.message, true); }
      };
      $('replace-clock').onclick = () => openClock(item.id);
      if (selectedEdges.length) $('align-edges').onclick = alignEdges;
    } else {
      $('annotation-text').onchange = e => edit(() => { item.text = e.target.value; });
      if (item.kind === 'dimension') {
        $('dimension-show-label').onchange = e => edit(() => { item.showLabel = e.target.checked; });
        $('dimension-show-time').onchange = e => edit(() => { item.showTime = e.target.checked; });
      }
      for (const field of ['t1', 't2']) if ($('annotation-' + field)) $('annotation-' + field).onchange = e => {
        const n = Number(e.target.value);
        if (!e.target.value || !Number.isFinite(n) || n < 0 || n > doc.duration || (item.kind === 'dimension' && (field === 't1' ? n >= item.t2 : n <= item.t1))) { toast('請輸入時間軸內的有效位置；箭頭終點需晚於起點。', true); renderInspector(); return; }
        edit(() => { item[field] = M.round(n); if (item.kind !== 'dimension') item.t2 = item.t1; });
      };
      if ($('annotation-lane')) $('annotation-lane').onchange = e => edit(() => { item.y = Number(e.target.value); });
    }
    $('line-color').onchange = e => applyStyle('color', e.target.value);
    $('line-width').onchange = e => { const n = Number(e.target.value); if (n >= .5 && n <= 8) applyStyle('width', n); else renderInspector(); };
    $('line-dash').onchange = e => applyStyle('dash', e.target.value);
    $('start-arrow').onchange = e => applyStyle('startArrow', e.target.checked);
    $('end-arrow').onchange = e => applyStyle('endArrow', e.target.checked);
    $('inspector').querySelectorAll('[data-color]').forEach(b => { b.onclick = () => applyStyle('color', b.dataset.color); });
    translateUI();
  }
  function patternPreview(s) {
    const count = Math.ceil(doc.duration / doc.step);
    if (count > 128 || s.edges.some(e => Math.abs(e.t / doc.step - Math.round(e.t / doc.step)) > .0001)) return '';
    return Array.from({ length: count }, (_, i) => M.stateAt(s.edges, M.round(i * doc.step))).join('');
  }
  function applyStyle(key, value) {
    edit(() => {
      const ids = selectedEdges.length ? [...new Set(selectedEdges.map(e => e.signalId))] : [selectedId];
      [...doc.signals, ...doc.annotations].filter(s => ids.includes(s.id)).forEach(s => { s.style[key] = value; });
    });
  }
  function reorder(delta) {
    edit(() => { const i = doc.signals.findIndex(s => s.id === selectedId); if (i + delta >= 0 && i + delta < doc.signals.length) doc = M.reorderSignal(doc, selectedId, i + (delta > 0 ? 2 : -1)); });
  }
  function deleteObject() {
    if (!target()) return;
    edit(() => {
      const oldIds = doc.signals.map(s => s.id);
      doc.signals = doc.signals.filter(s => s.id !== selectedId); doc.annotations = doc.annotations.filter(a => a.id !== selectedId);
      M.remapAnnotations(doc, oldIds);
      selectedId = doc.signals[0]?.id || null; selectedEdges = [];
    });
  }
  function deleteEdges() {
    edit(() => {
      doc.signals.forEach(s => { const indexes = selectedEdges.filter(e => e.signalId === s.id).map(e => e.index); s.edges = M.normalize(s.edges.filter((_, i) => !indexes.includes(i)), doc.duration); });
      selectedEdges = [];
    });
  }
  function alignEdges() {
    const time = M.round(Number($('edge-time').value)), seen = new Set();
    if (!$('edge-time').value || !Number.isFinite(time) || time <= 0 || time >= doc.duration) return toast('切換時間需大於 0 且小於時間長度。', true);
    for (const e of selectedEdges) {
      if (seen.has(e.signalId)) return toast('同一訊號的多個切換邊緣不能重疊；請每個訊號選一個邊緣。', true);
      seen.add(e.signalId);
      const s = getSignal(e.signalId);
      if (time <= s.edges[e.index - 1].t || time >= (s.edges[e.index + 1]?.t ?? doc.duration)) return toast('對齊位置會超過相鄰邊緣，請選擇其他時間。', true);
    }
    edit(() => selectedEdges.forEach(e => { getSignal(e.signalId).edges[e.index].t = M.round(time); }));
  }
  function setTool(next) {
    tool = next;
    $('active-tool').textContent = window.TimingI18n.text(COMMAND_LABELS[Object.keys(TOOL_COMMANDS).find(k => TOOL_COMMANDS[k] === next)] || '選取', ui.language);
    document.querySelectorAll('[data-tool]').forEach(b => { if (b.tagName === 'BUTTON') { b.classList.toggle('active', b.dataset.tool === tool); b.setAttribute('aria-pressed', String(b.dataset.tool === tool)); } });
    $('tool-hint').textContent = ({ select: '拖曳切換邊緣調整時間；Shift 點選可多選。', toggle: '點擊格子切換高低電位。', '1': '拖曳格子繪製高電位。', '0': '拖曳格子繪製低電位。', X: '拖曳格子繪製未知狀態。', Z: '拖曳格子繪製高阻抗。', reference: '點擊時間位置建立垂直參考線。', dimension: '拖曳起點與終點，建立時間箭頭。', text: '點擊波形位置加入文字，再從右側編輯。' })[tool];
    renderDiagram();
    translateUI();
  }
  function point(event) {
    const rect = diagram.getBoundingClientRect(), l = R.layout(doc);
    const x = (event.clientX - rect.left) / rect.width * l.width, y = (event.clientY - rect.top) / rect.height * l.height;
    return { x, y, t: Math.max(0, Math.min(doc.duration, (x - l.x) / l.px)), row: R.rowAt(doc, y) };
  }
  function snapTime(t, event, baseDoc = doc) {
    let time = M.round(t);
    if ($('snap').checked && !event.altKey) {
      time = M.round(Math.round(t / baseDoc.step) * baseDoc.step);
      const l = R.layout(baseDoc);
      let bestDistance = Math.min(6 / (l.px * zoom), baseDoc.step * .2);
      for (const s of baseDoc.signals) for (const e of s.edges) {
        if (selectedEdges.some(sel => sel.signalId === s.id && s.edges[sel.index] === e)) continue;
        const d = Math.abs(e.t - t); if (d < bestDistance) { bestDistance = d; time = e.t; }
      }
    }
    return Math.max(0, Math.min(baseDoc.duration, time));
  }
  function paint(s, time, value) {
    const start = M.round(Math.floor((time + .000001) / doc.step) * doc.step);
    if (start >= doc.duration) return;
    s.edges = M.setRange(s.edges, start, Math.min(doc.duration, start + doc.step), value, doc.duration);
  }
  diagram.addEventListener('pointerdown', event => {
    if (event.button !== 0 || drag) return;
    const p = point(event), node = event.target.closest('[data-edge-signal],[data-annotation],[data-label-id]');
    const isInside = p.x >= R.layout(doc).x && p.x <= R.layout(doc).x + doc.duration * R.layout(doc).px;
    const before = M.clone(doc);
    if (tool === 'select') {
      if (node?.dataset.edgeSignal) {
        const edge = { signalId: node.dataset.edgeSignal, index: Number(node.dataset.edgeIndex) };
        const chosen = selectedEdges.some(e => e.signalId === edge.signalId && e.index === edge.index);
        if (event.shiftKey) selectedEdges = chosen ? selectedEdges.filter(e => !(e.signalId === edge.signalId && e.index === edge.index)) : [...selectedEdges, edge];
        else if (!chosen) selectedEdges = [edge];
        selectedId = edge.signalId;
        if (!event.shiftKey || !chosen) drag = { type: 'edge', before, start: p, anchor: edge, startTime: getSignal(edge.signalId).edges[edge.index].t };
        render();
      } else if (node?.dataset.annotation) {
        selectedId = node.dataset.annotation; selectedEdges = [];
        drag = { type: 'annotation', before, start: p, id: selectedId, endpoint: Number(node.dataset.endpoint) || null };
        render();
      } else {
        const s = node?.dataset.labelId ? getSignal(node.dataset.labelId) : doc.signals[p.row];
        select(s?.id || null);
      }
    } else if (tool === 'reference' || tool === 'text') {
      if (!isInside || doc.annotations.length >= 128) return;
      const t = snapTime(p.t, event), kind = tool;
      const a = { id: M.uid(), kind, t1: t, t2: t, y: Math.max(0, Math.min(doc.signals.length - 1, p.row)), text: kind === 'text' ? '標註文字' : '', style: { ...M.defaultStyle('#526fa0'), width: 1.5, dash: kind === 'reference' ? 'dashed' : 'solid' } };
      doc.annotations.push(a); selectedId = a.id; selectedEdges = []; commit(before); setTool('select');
      if (kind === 'text') setProperties(false);
      setTimeout(() => $('annotation-text')?.focus(), 0);
    } else if (tool === 'dimension') {
      if (!isInside || doc.annotations.length >= 128) return;
      drag = { type: 'dimension', before, start: p, t1: snapTime(p.t, event), current: snapTime(p.t, event), y: p.y < R.layout(doc).top ? 0 : Math.max(1, Math.min(doc.signals.length, p.row + 1)) };
      selectedEdges = [];
    } else {
      const s = doc.signals[p.row];
      if (!s || !isInside || p.t >= doc.duration) return;
      selectedId = s.id; selectedEdges = [];
      const value = tool === 'toggle' ? (M.stateAt(s.edges, p.t) === '1' ? '0' : '1') : tool;
      paint(s, p.t, value);
      drag = { type: 'paint', before, start: p, signalId: s.id, value, lastTime: p.t, toggle: tool === 'toggle' };
      renderDiagram();
    }
    if (drag) { diagram.setPointerCapture(event.pointerId); event.preventDefault(); }
  });
  diagram.addEventListener('pointermove', event => {
    const p = point(event);
    $('cursor-time').textContent = `${M.round(p.t)} ${doc.unit}`;
    if (!drag) return;
    if (drag.type === 'edge') {
      const requested = snapTime(drag.startTime + p.t - drag.start.t, event, drag.before);
      doc = M.moveEdges(drag.before, selectedEdges, requested - drag.startTime);
    } else if (drag.type === 'annotation') {
      doc = M.clone(drag.before); const a = doc.annotations.find(a => a.id === drag.id), original = drag.before.annotations.find(a => a.id === drag.id);
      if (drag.endpoint) {
        const t = snapTime(p.t, event, drag.before);
        if (drag.endpoint === 1) a.t1 = Math.min(t, a.t2 - .0001);
        else a.t2 = Math.max(t, a.t1 + .0001);
        a.t1 = M.round(a.t1); a.t2 = M.round(a.t2);
      } else {
        const delta = snapTime(original.t1 + p.t - drag.start.t, event, drag.before) - original.t1;
        const limited = Math.max(-original.t1, Math.min(doc.duration - original.t2, delta));
        a.t1 = M.round(original.t1 + limited); a.t2 = M.round(original.t2 + limited);
        if (a.kind !== 'reference') a.y = Math.max(0, Math.min(a.kind === 'dimension' ? doc.signals.length : Math.max(0, doc.signals.length - 1), original.y + p.row - drag.start.row));
      }
    } else if (drag.type === 'paint') {
      if (!drag.toggle) {
        const s = getSignal(drag.signalId), start = Math.min(drag.lastTime, p.t), end = Math.max(drag.lastTime, p.t);
        for (let t = Math.floor(start / doc.step) * doc.step; t <= end + .000001; t += doc.step) paint(s, Math.min(t, doc.duration), drag.value);
        drag.lastTime = p.t;
      }
    } else if (drag.type === 'dimension') drag.current = snapTime(p.t, event);
    renderDiagram();
    if (drag.type === 'dimension') {
      const l = R.layout(doc), x1 = l.x + drag.t1 * l.px, x2 = l.x + drag.current * l.px, y = R.annotationY(doc, { kind: 'dimension', y: drag.y });
      diagram.insertAdjacentHTML('beforeend', `<path d="M${x1} ${y}H${x2}" stroke="#186d67" stroke-width="2" stroke-dasharray="4 3" fill="none"/>`);
    }
  });
  function endDrag(event, cancelled = false) {
    if (!drag) return;
    const active = drag; drag = null;
    if (cancelled) doc = active.before;
    else if (active.type === 'dimension') {
      const start = Math.min(active.t1, active.current), end = Math.max(active.t1, active.current);
      if (end - start >= .0001) {
        const a = { id: M.uid(), kind: 'dimension', t1: start, t2: end, y: active.y, text: '', showLabel: true, showTime: true, style: { ...M.defaultStyle('#186d67'), width: 1.5, startArrow: true, endArrow: true } };
        doc.annotations.push(a); selectedId = a.id; selectedEdges = []; tool = 'select'; setTool(tool);
      }
    }
    if (event?.pointerId !== undefined && diagram.hasPointerCapture(event.pointerId)) diagram.releasePointerCapture(event.pointerId);
    commit(active.before);
  }
  diagram.addEventListener('pointerup', e => endDrag(e));
  diagram.addEventListener('pointercancel', e => endDrag(e, true));
  diagram.addEventListener('lostpointercapture', e => { if (drag) endDrag(e, true); });
  diagram.addEventListener('pointerleave', () => { if (!drag) $('cursor-time').textContent = `— ${doc.unit}`; });
  function openClock(id = null) {
    editingClockId = id; const form = $('clock-form'); form.reset(); $('clock-error').textContent = '';
    form.elements.name.value = id ? getSignal(id).name : 'CLK'; form.elements.phase.max = doc.duration - .0001;
    $('clock-dialog').showModal(); form.elements.name.focus();
  }
  $('clock-form').onsubmit = event => {
    event.preventDefault(); const f = event.currentTarget.elements;
    try {
      const edges = M.clock(doc.duration, Number(f.period.value), Number(f.duty.value), Number(f.phase.value), f.initial.value);
      if (!editingClockId && doc.signals.length >= 64) throw new Error('最多可建立 64 個訊號。');
      edit(() => {
        if (editingClockId) { const s = getSignal(editingClockId); s.name = f.name.value.trim() || 'CLK'; s.edges = edges; selectedId = s.id; }
        else { const s = M.signal(f.name.value.trim() || 'CLK', edges, '#186d67'); s.style.width = book.diagram.width; doc.signals.push(s); selectedId = s.id; }
        selectedEdges = [];
      });
      $('clock-dialog').close(); toast('時脈已產生。');
    } catch (error) { $('clock-error').textContent = error.message; }
  };
  $('signal-list').onclick = event => { const button = event.target.closest('[data-id]'); if (button) select(button.dataset.id); };
  document.querySelectorAll('button[data-tool]').forEach(b => { b.onclick = () => setTool(b.dataset.tool); });
  $('add-signal').onclick = () => edit(() => { const s = M.signal('SIGNAL_' + (doc.signals.length + 1)); s.style.width = book.diagram.width; doc.signals.push(s); selectedId = s.id; selectedEdges = []; });
  $('add-clock').onclick = () => openClock();
  $('document-title').onchange = e => editBook(() => { book.title = e.target.value.trim() || '未命名時序圖'; });
  function setRowHeight(value) {
    const n = Math.round(Number(value));
    if (!Number.isFinite(n) || n < 24 || n > 128) return;
    $('row-height').value = n; $('row-height-slider').value = n;
    $('wave-height').max = Math.min(64, n - 8); $('wave-height').value = Math.min(Number($('wave-height').value), n - 8);
  }
  $('row-height').onchange = e => setRowHeight(e.target.value);
  $('row-height-slider').onchange = e => setRowHeight(e.target.value);
  $('row-height-slider').oninput = e => { $('row-height').value = e.target.value; };
  document.querySelectorAll('[data-density]').forEach(b => { b.onclick = () => setRowHeight(b.dataset.density); });
  $('open-diagram').onclick = () => {
    const c = book.diagram; $('duration').value = c.duration; $('time-unit').value = c.unit; setSelectValue($('grid-step'), c.step);
    $('row-height').value = c.rowHeight; $('row-height-slider').value = c.rowHeight; $('wave-height').value = c.waveformHeight; $('wave-height').max = Math.min(64, c.rowHeight - 8); $('global-width').value = c.width;
    $('diagram-error').textContent = ''; $('diagram-dialog').showModal();
  };
  $('diagram-form').onsubmit = event => {
    event.preventDefault();
    try {
      const config = M.validateDiagram({ duration: M.round(Number($('duration').value)), unit: $('time-unit').value.trim() || 'ns', step: Number($('grid-step').value), rowHeight: Number($('row-height').value), waveformHeight: Number($('wave-height').value), width: Number($('global-width').value) });
      if (book.sheets.some(s => s.document.duration > config.duration) && !confirm(window.TimingI18n.text('縮短時間軸會裁掉超出的波形與標註，可用復原恢復。是否套用？', ui.language))) return;
      editBook(() => { book = M.applyDiagram(book, config); }); $('diagram-dialog').close(); toast('已套用所有活頁；鎖定設定保留。');
    } catch (error) { $('diagram-error').textContent = window.TimingI18n.text(error.message, ui.language); }
  };
  $('show-grid').onchange = renderDiagram;
  let draggedSignalId = null;
  function clearDropIndicators() { $('signal-list').querySelectorAll('.drop-before,.drop-after').forEach(b => b.classList.remove('drop-before', 'drop-after')); }
  function dropSlot(event) {
    const row = event.target.closest('.signal-item');
    if (!row) return { index: doc.signals.length, row: $('signal-list').lastElementChild, after: true };
    const rect = row.getBoundingClientRect(), after = event.clientY >= rect.top + rect.height / 2;
    return { index: doc.signals.findIndex(s => s.id === row.dataset.id) + (after ? 1 : 0), row, after };
  }
  $('signal-list').addEventListener('dragstart', event => {
    const row = event.target.closest('.signal-item'); if (!row || drag) { event.preventDefault(); return; }
    draggedSignalId = row.dataset.id; event.dataTransfer.effectAllowed = 'move'; event.dataTransfer.setData('text/plain', draggedSignalId); row.classList.add('dragging');
  });
  $('signal-list').addEventListener('dragover', event => {
    if (!draggedSignalId) return; event.preventDefault(); event.dataTransfer.dropEffect = 'move';
    clearDropIndicators(); const slot = dropSlot(event); slot.row?.classList.add(slot.after ? 'drop-after' : 'drop-before');
    const rect = $('signal-list').getBoundingClientRect();
    if (event.clientY < rect.top + 24) $('signal-list').scrollTop -= 10;
    else if (event.clientY > rect.bottom - 24) $('signal-list').scrollTop += 10;
  });
  $('signal-list').addEventListener('drop', event => {
    if (!draggedSignalId) return; event.preventDefault(); const id = draggedSignalId, slot = dropSlot(event); draggedSignalId = null;
    edit(() => { doc = M.reorderSignal(doc, id, slot.index); selectedId = id; selectedEdges = []; });
  });
  $('signal-list').addEventListener('dragend', () => { draggedSignalId = null; clearDropIndicators(); $('signal-list').querySelector('.dragging')?.classList.remove('dragging'); });
  function rememberView() {
    ui.views[book.activeSheetId] = { zoom, left: $('canvas-scroll').scrollLeft, top: $('canvas-scroll').scrollTop }; persistUI();
  }
  let viewSaveTimer;
  $('canvas-scroll').addEventListener('scroll', () => { clearTimeout(viewSaveTimer); viewSaveTimer = setTimeout(rememberView, 120); });
  window.addEventListener('pagehide', rememberView);
  function restoreView() {
    const view = Object.hasOwn(ui.views, book.activeSheetId) ? ui.views[book.activeSheetId] : null;
    if (view && Number.isFinite(view.zoom)) { zoom = Math.max(.25, Math.min(2, view.zoom)); renderDiagram(); $('canvas-scroll').scrollLeft = Number(view.left) || 0; $('canvas-scroll').scrollTop = Number(view.top) || 0; }
    else { $('canvas-scroll').scrollLeft = 0; $('canvas-scroll').scrollTop = 0; fit(); }
  }
  function switchSheet(id) {
    if (id === book.activeSheetId || !book.sheets.some(s => s.id === id)) return;
    if (drag) endDrag(null, true); rememberView(); syncBook(); book.activeSheetId = id; doc = activeSheet().document;
    selectedId = doc.signals[0]?.id || null; selectedEdges = []; persist(); render(); restoreView();
    [...$('sheet-tabs').children].find(b => b.dataset.sheet === id)?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
  }
  function newSheetName() { let n = 1; while (book.sheets.some(s => s.name === `活頁${n}`)) n++; return `活頁${n}`; }
  function emptySheet() { const name = newSheetName(), document = M.blank(); document.title = name; Object.assign(document, book.diagram); delete document.width; document.signals.forEach(s => { s.style.width = book.diagram.width; }); return M.sheet(document, name); }
  $('add-sheet').onclick = () => {
    if (book.sheets.length >= 32) return toast('最多可建立 32 個活頁。', true);
    rememberView(); editBook(() => { const next = emptySheet(); book.sheets.push(next); book.activeSheetId = next.id; selectedId = next.document.signals[0]?.id || null; }); restoreView();
  };
  $('sheet-tabs').onclick = event => { const tab = event.target.closest('[data-sheet]'); if (tab) switchSheet(tab.dataset.sheet); };
  $('sheet-tabs').ondblclick = event => { const tab = event.target.closest('[data-sheet]'); if (tab) { switchSheet(tab.dataset.sheet); openSheets(); $('sheet-name').select(); } };
  $('sheet-tabs').onkeydown = event => {
    if (!['ArrowLeft','ArrowRight','Home','End'].includes(event.key)) return;
    event.preventDefault(); event.stopPropagation(); const index = book.sheets.findIndex(s => s.id === book.activeSheetId);
    const next = event.key === 'Home' ? 0 : event.key === 'End' ? book.sheets.length - 1 : (index + (event.key === 'ArrowLeft' ? -1 : 1) + book.sheets.length) % book.sheets.length;
    switchSheet(book.sheets[next].id); $('sheet-tabs').querySelector('[aria-selected="true"]').focus();
  };
  function openSheets() { $('sheet-name').value = activeSheet().name; $('sheet-count').value = book.sheets.length; $('delete-sheet').disabled = book.sheets.length === 1; $('duplicate-sheet').disabled = book.sheets.length === 32; $('sheets-dialog').showModal(); }
  $('manage-sheets').onclick = openSheets;
  $('sheets-form').onsubmit = event => {
    event.preventDefault(); const count = Number($('sheet-count').value), name = $('sheet-name').value.trim();
    if (!Number.isInteger(count) || count < 1 || count > 32 || !name) return;
    if (count < book.sheets.length && !confirm(ui.language === 'en' ? `Reduce to ${count} sheets and remove ${book.sheets.length - count} trailing sheets? Undo can restore them.` : `減少到 ${count} 個活頁會刪除末端 ${book.sheets.length - count} 頁。可以用復原恢復，是否繼續？`)) return;
    rememberView(); editBook(() => {
      activeSheet().name = name; activeSheet().document.title = name;
      while (book.sheets.length < count) book.sheets.push(emptySheet());
      book.sheets = book.sheets.slice(0, count);
      if (!book.sheets.some(s => s.id === book.activeSheetId)) book.activeSheetId = book.sheets.at(-1).id;
    }); $('sheets-dialog').close(); restoreView();
  };
  $('duplicate-sheet').onclick = () => {
    if (book.sheets.length >= 32) return; rememberView();
    editBook(() => { const next = M.duplicateSheet(activeSheet()), index = book.sheets.indexOf(activeSheet()); book.sheets.splice(index + 1, 0, next); book.activeSheetId = next.id; selectedId = next.document.signals[0]?.id || null; });
    $('sheets-dialog').close(); restoreView();
  };
  $('delete-sheet').onclick = () => {
    if (book.sheets.length === 1 || !confirm(ui.language === 'en' ? `Delete "${activeSheet().name}"? Undo can restore it.` : `刪除「${activeSheet().name}」？可以用復原恢復。`)) return;
    rememberView(); editBook(() => { const index = book.sheets.indexOf(activeSheet()); book.sheets.splice(index, 1); book.activeSheetId = book.sheets[Math.min(index, book.sheets.length - 1)].id; });
    $('sheets-dialog').close(); restoreView();
  };
  function applyPanelLayout() {
    const width = $('workspace').clientWidth;
    let left = ui.leftWidth, right = ui.rightWidth;
    if (innerWidth > 920) { right = Math.min(right, Math.max(200, width - 120 - 292)); left = Math.min(left, Math.max(120, width - (ui.collapsed ? 0 : right) - 292)); }
    $('workspace').style.setProperty('--left-size', `${left}px`); $('workspace').style.setProperty('--right-size', `${right}px`);
    $('workspace').classList.toggle('properties-collapsed', ui.collapsed); $('properties-panel').hidden = ui.collapsed; $('right-resizer').hidden = ui.collapsed;
    $('toggle-properties').textContent = ui.collapsed ? '⇐' : '⇒'; $('toggle-properties').setAttribute('aria-expanded', String(!ui.collapsed));
    $('toggle-properties').setAttribute('aria-label', window.TimingI18n.text(ui.collapsed ? '展開屬性' : '收合屬性', ui.language));
    $('left-resizer').setAttribute('aria-valuenow', Math.round(left)); $('right-resizer').setAttribute('aria-valuenow', Math.round(right));
  }
  function setProperties(collapsed) { ui.collapsed = collapsed; applyPanelLayout(); persistUI(); }
  $('toggle-properties').onclick = () => setProperties(!ui.collapsed); $('collapse-properties').onclick = () => setProperties(true);
  function setPanelWidth(side, value) {
    const width = $('workspace').clientWidth, other = side === 'left' ? (ui.collapsed ? 0 : $('properties-panel').getBoundingClientRect().width) : document.querySelector('.signals-panel').getBoundingClientRect().width;
    const min = side === 'left' ? 120 : 200, max = Math.min(side === 'left' ? 420 : 480, Math.max(min, width - other - 292));
    ui[side + 'Width'] = Math.max(min, Math.min(max, value)); applyPanelLayout();
  }
  for (const side of ['left','right']) {
    const handle = $(side + '-resizer'); let resize = null;
    handle.onpointerdown = event => {
      if (event.button !== 0 || drag || innerWidth <= 920) return;
      const panel = side === 'left' ? document.querySelector('.signals-panel') : $('properties-panel');
      resize = { x: event.clientX, width: panel.getBoundingClientRect().width }; handle.setPointerCapture(event.pointerId); handle.classList.add('resizing'); document.body.classList.add('resizing'); event.preventDefault();
    };
    handle.onpointermove = event => { if (resize) setPanelWidth(side, resize.width + (event.clientX - resize.x) * (side === 'left' ? 1 : -1)); };
    function finishResize() { resize = null; handle.classList.remove('resizing'); document.body.classList.remove('resizing'); persistUI(); }
    handle.onpointerup = finishResize; handle.onpointercancel = finishResize; handle.onlostpointercapture = finishResize;
    handle.onkeydown = event => { if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') { event.preventDefault(); event.stopPropagation(); setPanelWidth(side, ui[side + 'Width'] + (event.key === 'ArrowRight' ? 16 : -16) * (side === 'left' ? 1 : -1)); persistUI(); } };
  }
  window.addEventListener('resize', applyPanelLayout);
  function undo() {
    if (!undoStack.length || drag) return; rememberView(); redoStack.push(bookSnapshot()); book = undoStack.pop(); doc = activeSheet().document; selectedEdges = []; sanitizeSelection(); persist(); render(); restoreView();
  }
  function redo() {
    if (!redoStack.length || drag) return; rememberView(); undoStack.push(bookSnapshot()); book = redoStack.pop(); doc = activeSheet().document; selectedEdges = []; sanitizeSelection(); persist(); render(); restoreView();
  }
  $('undo').onclick = undo; $('redo').onclick = redo;
  function changeZoom(n) { zoom = Math.max(.25, Math.min(2, n)); renderDiagram(); rememberView(); }
  function fit() {
    const viewport = $('canvas-scroll'), l = R.layout(doc), style = getComputedStyle(viewport);
    const availableWidth = viewport.clientWidth - parseFloat(style.paddingLeft) - parseFloat(style.paddingRight);
    const availableHeight = viewport.clientHeight - parseFloat(style.paddingTop) - parseFloat(style.paddingBottom);
    changeZoom(Math.min(availableWidth / l.width, availableHeight / l.height));
  }
  $('zoom-out').onclick = () => changeZoom(zoom - .1); $('zoom-in').onclick = () => changeZoom(zoom + .1); $('fit').onclick = fit;
  $('help-button').onclick = () => $('help-dialog').showModal();
  document.querySelectorAll('[data-close]').forEach(b => { b.onclick = () => b.closest('dialog').close(); });
  function replaceProject(next) {
    rememberView(); editBook(() => { book = next; selectedId = activeSheet().document.signals[0]?.id || null; }); restoreView();
  }
  $('new-project').onclick = () => { if (confirm(window.TimingI18n.text('建立新的活頁圖檔？目前整份圖檔可用「復原」恢復；也可以先儲存。', ui.language))) replaceProject(M.workbook(M.blank())); };
  $('load-example').onclick = () => { if (confirm(window.TimingI18n.text('載入範例並取代目前活頁？其他活頁保留，也可以用「復原」恢復。', ui.language))) { edit(() => { doc = M.validate(M.example()); selectedId = doc.signals[0]?.id || null; selectedEdges = []; }); fit(); } };
  function filename(extension) { const title = extension === '.timing.json' ? book.title : book.title + '_' + activeSheet().name; return (title.replace(/[<>:"/\\|?*\x00-\x1f]/g, '_').slice(0, 90) || 'timing-diagram') + extension; }
  function download(blob, name) {
    const url = URL.createObjectURL(blob), a = document.createElement('a'); a.href = url; a.download = name; document.body.append(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(url), 30000);
  }
  function saveProject() { download(new Blob([JSON.stringify(bookSnapshot(), null, 2)], { type: 'application/json' }), filename('.timing.json')); toast(`已下載整份圖檔，包含 ${book.sheets.length} 個活頁。`); }
  $('save-project').onclick = saveProject;
  $('open-project').onclick = () => { $('import-form').reset(); $('import-error').textContent = ''; $('import-dialog').showModal(); };
  async function importProject(file, mode) {
    if (file.size > 16 * 1024 * 1024) throw new Error('圖檔不可超過 16 MB。');
    const next = M.validateWorkbook(JSON.parse(await file.text()));
    if (mode === 'append') {
      if (book.sheets.length + next.sheets.length > 32) throw new Error('最多可建立 32 個活頁。');
      rememberView(); editBook(() => { const pages = next.sheets.map(page => { const copy = M.duplicateSheet(page); copy.name = page.name; return copy; }); book.sheets.push(...pages); book.activeSheetId = pages[0].id; }); restoreView();
    } else replaceProject(next);
    toast('圖檔已開啟。');
  }
  $('import-form').onsubmit = async event => {
    event.preventDefault(); const file = $('import-file').files[0]; if (!file) return;
    try { await importProject(file, $('import-mode').value); $('import-dialog').close(); }
    catch (error) { $('import-error').textContent = window.TimingI18n.text(error instanceof SyntaxError ? '此檔案不是有效的 Timing Studio JSON 圖檔。' : error.message, ui.language); }
  };
  $('file-input').onchange = async event => {
    const file = event.target.files[0]; if (!file) return;
    try {
      await importProject(file, 'replace');
    } catch (error) { toast(error instanceof SyntaxError ? '此檔案不是有效的 Timing Studio JSON 圖檔。' : error.message, true); }
    event.target.value = '';
  };
  function exportOptions() { return { background: $('export-background').value, grid: $('export-grid').checked }; }
  $('open-export').onclick = () => { $('export-dialog').showModal(); };
  $('export-format').onchange = () => {
    const format = $('export-format').value; $('image-options').hidden = format === 'project'; $('export-copy').hidden = format === 'project'; $('export-scale').disabled = format === 'svg';
  };
  $('export-download').onclick = () => {
    const handlers = { png: () => $('download-png').onclick(), svg: () => $('download-svg').onclick(), project: saveProject };
    handlers[$('export-format').value]();
  };
  $('export-copy').onclick = () => $('copy-image').onclick();
  async function pngBlob(snapshot = M.clone(doc), options = exportOptions(), requestedScale = Number($('export-scale').value)) {
    await document.fonts.ready;
    const source = R.svg(snapshot, options), url = URL.createObjectURL(new Blob([source], { type: 'image/svg+xml;charset=utf-8' }));
    try {
      const image = new Image(); image.src = url; await image.decode();
      const size = R.rasterSize(snapshot, requestedScale), canvas = document.createElement('canvas'); canvas.width = size.width; canvas.height = size.height;
      const ctx = canvas.getContext('2d'); if (!ctx) throw new Error('無法建立圖片畫布。');
      ctx.drawImage(image, 0, 0, size.width, size.height);
      return await new Promise((resolve, reject) => canvas.toBlob(blob => blob ? resolve(blob) : reject(new Error('圖片輸出失敗。')), 'image/png'));
    } finally { URL.revokeObjectURL(url); }
  }
  $('download-svg').onclick = () => { download(new Blob([R.svg(doc, exportOptions())], { type: 'image/svg+xml;charset=utf-8' }), filename('.svg')); toast('SVG 向量圖已下載。'); };
  $('download-png').onclick = async () => {
    try { const name = filename('.png'); download(await pngBlob(), name); toast('PNG 圖片已下載。'); }
    catch (error) { toast(error.message, true); }
  };
  $('copy-image').onclick = async () => {
    const button = $('copy-image'); button.disabled = true; $('export-copy').disabled = true; button.textContent = window.TimingI18n.text('正在準備圖片…', ui.language);
    const png = pngBlob(); png.catch(() => {});
    try {
      if (!window.isSecureContext || !navigator.clipboard?.write || !window.ClipboardItem) throw new Error('此環境未提供圖片剪貼簿');
      // Pass the promise synchronously to retain the user gesture, including Safari.
      await navigator.clipboard.write([new ClipboardItem({ 'image/png': png })]);
      toast('已複製圖片，請到 PowerPoint 按 Ctrl+V 貼上。');
    } catch {
      try { fallbackBlob = await png; $('copy-dialog').showModal(); }
      catch (error) { toast(error.message, true); }
    } finally { button.disabled = false; $('export-copy').disabled = false; button.textContent = window.TimingI18n.text('複製圖片至 PPT', ui.language); }
  };
  $('fallback-png').onclick = () => { if (fallbackBlob) download(fallbackBlob, filename('.png')); $('copy-dialog').close(); };
  const typingNow = () => /INPUT|TEXTAREA|SELECT/.test(document.activeElement?.tagName) || document.activeElement?.isContentEditable;
  const shortcutsBlocked = () => typingNow() || document.querySelector('dialog[open]') || drag;
  function eventKey(event) {
    if (['Control','Meta','Shift','Alt'].includes(event.key)) return '';
    const key = event.key.length === 1 ? event.key.toUpperCase() : event.key;
    return [(event.ctrlKey || event.metaKey) && 'Ctrl', event.altKey && 'Alt', event.shiftKey && 'Shift', key].filter(Boolean).join('+');
  }
  function validKeys(keys) {
    const reserved = new Set(['Escape','Backspace','Enter','Tab','Space','ArrowLeft','ArrowRight','ArrowUp','ArrowDown','Ctrl+W','Ctrl+T','Ctrl+N','Ctrl+L','Ctrl+R','Ctrl+Shift+T','Ctrl+Shift+N','Ctrl+Tab','Alt+F4','F5','F11','F12']);
    if (!keys || typeof keys !== 'object') return false;
    const values = Object.keys(DEFAULT_KEYS).map(command => keys[command]);
    return values.every(k => typeof k === 'string' && /^(Ctrl\+)?(Alt\+)?(Shift\+)?([A-Z0-9]|Delete|F[1-9]|F10)$/.test(k) && !reserved.has(k)) && new Set(values).size === values.length;
  }
  function translateUI() {
    window.TimingI18n.apply(document.body, ui.language); document.documentElement.lang = ui.language === 'en' ? 'en' : 'zh-Hant';
    $('properties-key').textContent = ui.keys.properties;
    $('active-tool').textContent = window.TimingI18n.text(COMMAND_LABELS[Object.keys(TOOL_COMMANDS).find(k => TOOL_COMMANDS[k] === tool)], ui.language);
    document.querySelectorAll('[data-command]').forEach(button => {
      const command = button.dataset.command, label = window.TimingI18n.text(COMMAND_LABELS[command], ui.language);
      if (button.querySelector('kbd')) button.querySelector('kbd').textContent = ui.keys[command];
      button.title = `${label} (${ui.keys[command]})`; button.setAttribute('aria-label', button.title);
    });
    for (const id of ['toggle-properties','collapse-properties']) $(id).title = `${window.TimingI18n.text('屬性', ui.language)} (${ui.keys.properties})`;
    $('shortcut-help').textContent = Object.entries(ui.keys).map(([command, key]) => `${key}: ${window.TimingI18n.text(COMMAND_LABELS[command], ui.language)}`).join(' · ');
    document.querySelector('.panel-bottom p').textContent = ui.language === 'en' ? `Drag ⋮⋮ to reorder. Properties: ${ui.keys.properties}` : `拖動 ⋮⋮ 排序訊號；${ui.keys.properties} 開啟／收合屬性`;
  }
  function closeMenus() { document.querySelectorAll('.app-menu[open]').forEach(menu => { menu.open = false; }); }
  document.querySelectorAll('.app-menu').forEach(menu => {
    menu.querySelector('summary').onclick = () => { document.querySelectorAll('.app-menu').forEach(other => { if (other !== menu) other.open = false; }); };
    menu.querySelector('.menu-popup').addEventListener('click', event => { if (event.target.closest('button')) closeMenus(); });
    menu.onkeydown = event => {
      const buttons = [...menu.querySelectorAll('button:not(:disabled)')];
      if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); closeMenus(); menu.querySelector('summary').focus(); }
      else if (['ArrowDown','ArrowUp'].includes(event.key)) { event.preventDefault(); event.stopPropagation(); menu.open = true; const i = buttons.indexOf(document.activeElement); buttons[(i + (event.key === 'ArrowDown' ? 1 : -1) + buttons.length) % buttons.length]?.focus(); }
    };
  });
  document.addEventListener('pointerdown', event => { if (!event.target.closest('.app-menu')) closeMenus(); });
  function selectedSignalPayload() {
    const item = target(); if (!item?.edges) return null;
    return { format: 'timing-studio.signal', duration: doc.duration, signal: M.clone(item) };
  }
  function parseSignalPayload(text) {
    try {
      const payload = JSON.parse(text);
      if (payload?.format !== 'timing-studio.signal') return null;
      const probe = M.blank(); probe.duration = payload.duration; probe.step = Math.min(probe.step, probe.duration); probe.signals = [payload.signal];
      return { ...payload, signal: M.validate(probe).signals[0] };
    } catch { return null; }
  }
  function pastePayload(payload) {
    if (!payload) return toast('請先複製 Timing Studio 訊號。', true);
    try { const result = M.pasteSignal(doc, payload.signal, selectedId); edit(() => { doc = result.document; selectedId = result.signalId; selectedEdges = []; }); toast('已貼上訊號。'); }
    catch (error) { toast(error.message, true); }
  }
  function copySignal() {
    const payload = selectedSignalPayload(); if (!payload) return toast('請先選取整條訊號。', true);
    signalClipboard = payload; Promise.resolve(navigator.clipboard?.writeText?.(JSON.stringify(payload))).catch(() => {}); toast('已複製訊號。');
  }
  async function pasteSignal() {
    let payload = signalClipboard;
    try { const text = await navigator.clipboard?.readText?.(); if (text) payload = parseSignalPayload(text); } catch {}
    pastePayload(payload);
  }
  document.addEventListener('copy', event => {
    if (shortcutsBlocked() || ui.keys.copy !== 'Ctrl+C') return;
    const payload = selectedSignalPayload(); if (!payload || !event.clipboardData) return;
    event.preventDefault(); signalClipboard = payload; event.clipboardData.setData('text/plain', JSON.stringify(payload)); toast('已複製訊號。');
  });
  document.addEventListener('paste', event => {
    if (shortcutsBlocked() || ui.keys.paste !== 'Ctrl+V') return;
    event.preventDefault(); const text = event.clipboardData?.getData('text/plain'); pastePayload(text ? parseSignalPayload(text) : signalClipboard);
  });
  function runCommand(command) {
    if (TOOL_COMMANDS[command]) return setTool(TOOL_COMMANDS[command]);
    ({ properties: () => setProperties(!ui.collapsed), fit, copy: copySignal, paste: pasteSignal, delete: () => selectedEdges.length ? deleteEdges() : deleteObject(), undo, redo, save: saveProject })[command]?.();
  }
  document.querySelectorAll('.menu-popup [data-command]').forEach(button => { button.onclick = () => runCommand(button.dataset.command); });
  let draftKeys;
  function renderShortcutFields() {
    $('shortcut-list').innerHTML = Object.keys(DEFAULT_KEYS).map(command => `<label class="shortcut-row"><span>${window.TimingI18n.text(COMMAND_LABELS[command], ui.language)}</span><input data-shortcut="${command}" aria-label="${esc(window.TimingI18n.text(COMMAND_LABELS[command], ui.language))}" value="${esc(draftKeys[command])}" readonly></label>`).join('');
    $('shortcut-list').querySelectorAll('input').forEach(input => { input.onkeydown = event => { if (event.key === 'Tab') return; event.preventDefault(); event.stopPropagation(); const key = eventKey(event); if (key) { draftKeys[input.dataset.shortcut] = key; input.value = key; } }; });
  }
  $('open-shortcuts').onclick = () => { draftKeys = { ...ui.keys }; $('shortcut-error').textContent = ''; renderShortcutFields(); $('shortcuts-dialog').showModal(); };
  $('reset-shortcuts').onclick = () => { draftKeys = { ...DEFAULT_KEYS }; $('shortcut-error').textContent = ''; renderShortcutFields(); };
  $('shortcuts-form').onsubmit = event => {
    event.preventDefault();
    if (!validKeys(draftKeys)) { $('shortcut-error').textContent = window.TimingI18n.text('快捷鍵重複、無效或由瀏覽器保留，請選擇其他組合。', ui.language); return; }
    ui.keys = { ...draftKeys }; persistUI(); translateUI(); $('shortcuts-dialog').close();
  };
  $('open-language').onclick = () => { $('language').value = ui.language; $('language-dialog').showModal(); };
  $('language-form').onsubmit = event => { event.preventDefault(); ui.language = $('language').value; persistUI(); $('language-dialog').close(); render(); applyPanelLayout(); translateUI(); };
  document.addEventListener('keydown', event => {
    const key = eventKey(event), command = Object.keys(ui.keys).find(c => ui.keys[c] === key);
    if (event.isComposing || event.repeat) return;
    if (drag) { if (event.key === 'Escape') { event.preventDefault(); endDrag(null, true); setTool('select'); } return; }
    if (document.querySelector('dialog[open]')) { if (command === 'save') event.preventDefault(); return; }
    if (typingNow() && command !== 'save') return;
    if (command) {
      if ((command === 'copy' && key === 'Ctrl+C') || (command === 'paste' && key === 'Ctrl+V')) return;
      event.preventDefault(); closeMenus(); runCommand(command);
    } else if ((event.key === 'ArrowLeft' || event.key === 'ArrowRight') && selectedEdges.length && !event.ctrlKey && !event.metaKey) {
      event.preventDefault(); edit(() => { doc = M.moveEdges(doc, selectedEdges, (event.key === 'ArrowLeft' ? -1 : 1) * (event.altKey ? .1 : doc.step)); });
    } else if (event.key === 'Escape') { closeMenus(); selectedEdges = []; setTool('select'); render(); }
  });
  // Progressive enhancement: browsers with WebMCP can safely operate the same editor.
  const modelContext = document.modelContext || navigator.modelContext;
  if (modelContext?.registerTool) {
    try {
      Promise.resolve(modelContext.registerTool({ name: 'get_timing_diagram', description: '讀取目前 Timing Studio 的可編輯數位時序圖。', annotations: { readOnlyHint: true, untrustedContentHint: true }, inputSchema: { type: 'object', properties: {}, additionalProperties: false }, execute: async () => ({ content: [{ type: 'text', text: JSON.stringify(doc) }] }) })).catch(() => {});
      Promise.resolve(modelContext.registerTool({ name: 'add_digital_signal', description: '加入數位訊號，以 0、1、X、Z 字串表示波形，每個字元占一個格線間隔。', annotations: { readOnlyHint: false, untrustedContentHint: true }, inputSchema: { type: 'object', properties: { name: { type: 'string', maxLength: 80 }, pattern: { type: 'string', maxLength: 1024 } }, required: ['name','pattern'], additionalProperties: false }, execute: async ({ name, pattern }) => {
        if (drag) throw new Error('請先完成目前的拖曳操作。');
        if (typeof name !== 'string' || name.length > 80 || doc.signals.length >= 64) throw new Error('訊號名稱或數量不符合限制。');
        const s = M.signal(name || 'SIGNAL', M.pattern(pattern, doc.step, doc.duration));
        edit(() => { doc.signals.push(s); selectedId = s.id; selectedEdges = []; });
        return { content: [{ type: 'text', text: JSON.stringify(s) }] };
      } })).catch(() => {});
    } catch { /* WebMCP is optional; editing works without it. */ }
  }
  applyPanelLayout(); render(); persist(); requestAnimationFrame(restoreView);
  if (recovered) toast('已還原此瀏覽器上次編輯的時序圖。');
})();
