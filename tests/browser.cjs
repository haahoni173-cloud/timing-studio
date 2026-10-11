'use strict';
// Optional browser acceptance tests. See README for Playwright setup.
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE_PATH || 'playwright');
const { createServer } = require('../scripts/serve.cjs');
const R = require('../public/render.js');
const M = require('../public/model.js');
const OUT = path.resolve(__dirname, '../output');
async function main() {
  await fs.mkdir(OUT, { recursive: true });
  const server = createServer(); await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  let browser;
  try {
    browser = await chromium.launch({ headless: true, ...(process.env.PLAYWRIGHT_EXECUTABLE_PATH ? { executablePath: process.env.PLAYWRIGHT_EXECUTABLE_PATH } : {}) });
    const origin = `http://127.0.0.1:${server.address().port}`;
    const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, permissions: ['clipboard-read','clipboard-write'] });
    const page = await context.newPage(), errors = [];
    page.on('pageerror', error => errors.push(error.message)); page.on('dialog', dialog => dialog.accept());
    await page.goto(origin); await page.locator('#diagram [data-edge-signal]').first().waitFor();
    let downloadCount = 0;
    async function downloaded(button, suffix) {
      let closeExport = false;
      if (button === '#save-project') { await page.locator('#file-menu summary').click(); }
      if (['#download-png','#download-svg'].includes(button)) {
        await page.locator('#file-menu summary').click(); await page.locator('#open-export').click();
        await page.locator('#export-format').selectOption(button === '#download-png' ? 'png' : 'svg'); button = '#export-download'; closeExport = true;
      }
      const pending = page.waitForEvent('download'); await page.locator(button).click();
      const download = await pending, file = path.join(OUT, `test-${++downloadCount}${suffix}`);
      await download.saveAs(file); if (closeExport) await page.locator('#export-dialog [data-close]').click(); return file;
    }
    async function workbookSnapshot() { return page.evaluate(() => JSON.parse(localStorage.getItem('timing-studio.workbook.v2'))); }
    async function chooseTool(tool) { if (['select','toggle','1','0','X','Z'].includes(tool)) await page.locator('#edit-menu summary').click(); await page.locator(`button[data-tool="${tool}"]`).click(); }
    async function diagramSettings(values) {
      await page.locator('#setting-menu summary').click(); await page.locator('#open-diagram').click();
      for (const [id, value] of Object.entries(values)) { if (id === 'grid-step') await page.locator('#' + id).selectOption(String(value)); else await page.locator('#' + id).fill(String(value)); }
      await page.locator('#row-height').dispatchEvent('change'); await page.locator('#diagram-form button[type="submit"]').click();
    }
    async function snapshot() { const book = await workbookSnapshot(); M.validateWorkbook(book); return book.sheets.find(s => s.id === book.activeSheetId).document; }
    async function coordinates(time, row, document, absoluteY) {
      const box = await page.locator('#diagram').boundingBox(), l = R.layout(document);
      const y = absoluteY === undefined ? l.rows[row].y + l.rows[row].height * .45 : absoluteY;
      return { x: box.x + (l.x + time * l.px) / l.width * box.width, y: box.y + y / l.height * box.height };
    }
    async function at(time, row, document, absoluteY) { const p = await coordinates(time, row, document, absoluteY); await page.mouse.click(p.x, p.y); }
    async function drag(from, to) { await page.mouse.move(from.x, from.y); await page.mouse.down(); await page.mouse.move(to.x, to.y, { steps: 12 }); await page.mouse.up(); }
    let d = await snapshot(); assert.equal(d.signals.length, 5); M.validate(d);
    await chooseTool('toggle'); await at(2.5, 3, d);
    d = await snapshot(); assert.equal(M.stateAt(d.signals[3].edges, 2.5), '1'); assert.equal(M.stateAt(d.signals[3].edges, 3.5), '0');
    await page.locator('#undo').click(); d = await snapshot(); assert.equal(M.stateAt(d.signals[3].edges, 2.5), '0');
    await page.locator('#redo').click(); d = await snapshot(); assert.equal(M.stateAt(d.signals[3].edges, 2.5), '1');
    console.log('PASS: cell editing, undo and redo');
    await chooseTool('select');
    await drag(await coordinates(5, 2, d), await coordinates(6, 2, d));
    d = await snapshot(); assert.equal(d.signals[2].edges[1].t, 6);
    await at(3, 1, d); await page.keyboard.down('Shift'); await at(6, 2, d); await page.keyboard.up('Shift');
    assert.ok((await page.locator('#selection-status').textContent()).includes('2'));
    await page.locator('#edge-time').fill('7'); await page.locator('#align-edges').click();
    d = await snapshot(); assert.equal(d.signals[1].edges[1].t, 7); assert.equal(d.signals[2].edges[1].t, 7);
    await page.keyboard.press('ArrowRight'); d = await snapshot(); assert.equal(d.signals[1].edges[1].t, 8); assert.equal(d.signals[2].edges[1].t, 8);
    console.log('PASS: edge dragging, multiple selection, alignment and group movement');
    await chooseTool('1');
    await drag(await coordinates(.2, 4, d), await coordinates(2.7, 4, d));
    d = await snapshot(); assert.equal(M.stateAt(d.signals[4].edges, 0), '1'); assert.equal(M.stateAt(d.signals[4].edges, 2.5), '1'); assert.equal(M.stateAt(d.signals[4].edges, 3.5), '0');
    await page.locator('details[data-section="快速建立波形"] summary').click(); await page.locator('#wave-pattern').fill('00XXZZ1100000000'); await page.locator('#apply-pattern').click();
    d = await snapshot(); assert.equal(M.stateAt(d.signals[4].edges, 2.5), 'X'); assert.equal(M.stateAt(d.signals[4].edges, 4.5), 'Z');
    console.log('PASS: drag painting and X/Z pattern entry');
    await page.locator('#add-clock').click(); await page.locator('#clock-form [name="name"]').fill('TEST_CLK');
    await page.locator('#clock-form [name="period"]').fill('4'); await page.locator('#clock-form [name="duty"]').fill('25'); await page.locator('#clock-form [name="phase"]').fill('2');
    await page.locator('#clock-form button[type="submit"]').click(); d = await snapshot(); assert.equal(d.signals.length, 6); assert.equal(d.signals[5].edges[1].t, 2); assert.equal(d.signals[5].edges[2].t, 3);
    console.log('PASS: clock generation with duty and phase');
    await page.locator('button[data-tool="dimension"]').click();
    await drag(await coordinates(9, 0, d, R.layout(d).dimensionY), await coordinates(12, 0, d, R.layout(d).dimensionY));
    d = await snapshot(); const dimension = d.annotations.at(-1); assert.equal(dimension.kind, 'dimension'); assert.equal(dimension.t1, 9); assert.equal(dimension.t2, 12);
    await page.locator('#annotation-text').fill('t_response'); await page.locator('#annotation-text').press('Tab');
    await page.locator('#line-width').fill('3'); await page.locator('#line-width').press('Tab'); await page.locator('#line-dash').selectOption('dashed');
    await page.locator('#line-color').fill('#526fa0'); await page.locator('#line-color').dispatchEvent('change');
    d = await snapshot(); assert.equal(d.annotations.at(-1).style.width, 3); assert.equal(d.annotations.at(-1).style.dash, 'dashed'); assert.equal(d.annotations.at(-1).text, 't_response');
    await chooseTool('select');
    await drag(await coordinates(12, 0, d, R.layout(d).dimensionY), await coordinates(13, 0, d, R.layout(d).dimensionY));
    d = await snapshot(); assert.equal(d.annotations.at(-1).t2, 13);
    await drag(await coordinates(10.5, 0, d, R.layout(d).dimensionY), await coordinates(11.5, 0, d, R.layout(d).dimensionY));
    d = await snapshot(); assert.equal(d.annotations.at(-1).t1, 10); assert.equal(d.annotations.at(-1).t2, 14);
    await page.locator('button[data-tool="reference"]').click(); await at(10, 0, d); d = await snapshot(); assert.equal(d.annotations.at(-1).kind, 'reference'); assert.equal(d.annotations.at(-1).t1, 10);
    await drag(await coordinates(10, 0, d, R.layout(d).referenceY), await coordinates(11, 0, d, R.layout(d).referenceY));
    d = await snapshot(); assert.equal(d.annotations.at(-1).t1, 11);
    await page.locator('button[data-tool="text"]').click(); await at(11, 1, d); await page.locator('#annotation-text').fill('啟動模式 Timing'); await page.locator('#annotation-text').press('Tab');
    d = await snapshot(); assert.equal(d.annotations.at(-1).text, '啟動模式 Timing');
    await drag(await coordinates(11.2, 1, d, R.layout(d).top + d.rowHeight + 8), await coordinates(12.2, 2, d, R.layout(d).top + d.rowHeight * 2 + 8));
    d = await snapshot(); assert.equal(d.annotations.at(-1).t1, 12); assert.equal(d.annotations.at(-1).y, 2);
    console.log('PASS: dimension, reference, text and line styling');
    const svgPath = await downloaded('#download-svg', '.svg'), svg = await fs.readFile(svgPath, 'utf8');
    assert.ok(!svg.includes('edge-hit')); assert.ok(svg.includes('啟動模式 Timing'));
    assert.equal(await page.evaluate(xml => new DOMParser().parseFromString(xml, 'image/svg+xml').querySelectorAll('parsererror').length, svg), 0);
    await page.locator('#file-menu summary').click(); await page.locator('#open-export').click(); await page.locator('#export-background').selectOption('transparent'); await page.locator('#export-dialog [data-close]').click();
    const pngPath = await downloaded('#download-png', '.png'), png = await fs.readFile(pngPath), expectedSize = R.rasterSize(d, 3);
    assert.equal(png.readUInt32BE(16), expectedSize.width); assert.equal(png.readUInt32BE(20), expectedSize.height);
    const alpha = await page.evaluate(async data => { const img = new Image(); img.src = data; await img.decode(); const c = document.createElement('canvas'); c.width = 1; c.height = 1; const ctx = c.getContext('2d'); ctx.drawImage(img, 0, 0); return ctx.getImageData(0, 0, 1, 1).data[3]; }, 'data:image/png;base64,' + png.toString('base64'));
    assert.equal(alpha, 0);
    await page.locator('#copy-image').click(); await page.waitForFunction(() => document.getElementById('toast').textContent.includes('已複製圖片'));
    const clipboard = await page.evaluate(async () => { const items = await navigator.clipboard.read(); const item = items.find(i => i.types.includes('image/png')); if (!item) return []; return [...new Uint8Array(await (await item.getType('image/png')).arrayBuffer()).slice(0, 8)]; });
    assert.deepEqual(clipboard, [137,80,78,71,13,10,26,10]);
    console.log('PASS: valid SVG, high resolution transparent PNG and actual PNG clipboard round-trip');
    const savedPath = await downloaded('#save-project', '.timing.json');
    await page.locator('#file-menu summary').click(); await page.locator('#new-project').click(); await page.locator('#file-input').setInputFiles(savedPath); await page.waitForFunction(() => document.getElementById('document-title').value === '數位介面啟動時序');
    assert.deepEqual(await snapshot(), d);
    const invalid = M.clone(d); invalid.signals[0].style.color = 'red;bad'; const invalidPath = path.join(OUT, 'invalid.json'); await fs.writeFile(invalidPath, JSON.stringify(invalid));
    await page.locator('#file-input').setInputFiles(invalidPath); await page.waitForFunction(() => document.getElementById('toast').textContent.includes('格式'));
    assert.deepEqual(await snapshot(), d);
    await page.reload(); await page.locator('#diagram [data-edge-signal]').first().waitFor(); assert.deepEqual(await snapshot(), d);
    console.log('PASS: project file round-trip, invalid file rejection and reload recovery');
    const denied = await context.newPage();
    await denied.addInitScript(() => Object.defineProperty(navigator, 'clipboard', { value: { write: () => Promise.reject(new DOMException('Denied for test', 'NotAllowedError')) }, configurable: true }));
    await denied.goto(origin); await denied.locator('#copy-image').click(); await denied.locator('#copy-dialog').waitFor({ state: 'visible' });
    assert.equal(await denied.locator('#copy-image').isEnabled(), true);
    const fallbackDownload = denied.waitForEvent('download'); await denied.locator('#fallback-png').click();
    await (await fallbackDownload).saveAs(path.join(OUT, 'clipboard-fallback.png')); await denied.close();
    console.log('PASS: denied clipboard offers a working PNG download');
    await page.locator('#load-example').click(); await page.locator('#fit').click(); await chooseTool('select');
    d = await snapshot();
    await page.locator('#diagram').focus(); await page.keyboard.press('t'); await at(2, 4, d);
    await page.locator('#annotation-text').fill('ACK note'); await page.locator('#annotation-text').press('Tab');
    const originalNames = d.signals.map(s => s.name);
    await page.locator('.signal-item').nth(4).dragTo(page.locator('.signal-item').nth(0), { targetPosition: { x: 20, y: 4 } });
    d = await snapshot(); assert.equal(d.signals[0].name, 'ACK'); assert.equal(d.annotations.at(-1).y, 0);
    assert.deepEqual(await page.locator('#diagram text[data-label-id]').allTextContents(), d.signals.map(s => s.name));
    await page.locator('#undo').click(); d = await snapshot(); assert.deepEqual(d.signals.map(s => s.name), originalNames); assert.equal(d.annotations.at(-1).y, 4);
    await page.locator('#redo').click(); d = await snapshot(); assert.equal(d.signals[0].name, 'ACK');
    console.log('PASS: native signal drag sorting, attached annotations and undo');
    for (const [key, expected] of [['h','1'],['l','0'],['x','X'],['z','Z'],['t','text']]) {
      await page.locator('#diagram').focus(); await page.keyboard.press(key);
      assert.equal(await page.locator('#diagram').getAttribute('data-tool'), expected);
    }
    await page.locator('.signal-item').filter({ hasText: 'ACK' }).click();
    await page.locator('#signal-name').fill(''); await page.locator('#signal-name').pressSequentially('HLXZTQ');
    assert.equal(await page.locator('#diagram').getAttribute('data-tool'), 'text');
    await page.locator('#signal-name').fill('ACK'); await page.locator('#signal-name').press('Tab');
    await page.locator('#diagram').focus(); await page.keyboard.press('v');
    const beforeCollapse = await page.locator('#canvas-scroll').boundingBox(); await page.keyboard.press('q');
    assert.equal(await page.locator('#properties-panel').isVisible(), false);
    assert.ok((await page.locator('#canvas-scroll').boundingBox()).width > beforeCollapse.width + 200);
    await page.locator('.signal-item').filter({ hasText: 'CLK' }).click(); assert.equal(await page.locator('#properties-panel').isVisible(), false);
    await page.keyboard.press('q'); assert.equal(await page.locator('#properties-panel').isVisible(), true);
    console.log('PASS: H/L/X/Z/T shortcuts, typing protection and Q properties toggle');
    let handle = await page.locator('#left-resizer').boundingBox();
    await drag({ x: handle.x + handle.width / 2, y: handle.y + 100 }, { x: handle.x + handle.width / 2 + 60, y: handle.y + 100 });
    handle = await page.locator('#right-resizer').boundingBox();
    await drag({ x: handle.x + handle.width / 2, y: handle.y + 100 }, { x: handle.x + handle.width / 2 - 50, y: handle.y + 100 });
    assert.ok((await page.locator('.signals-panel').boundingBox()).width >= 259);
    assert.ok((await page.locator('#properties-panel').boundingBox()).width >= 313);
    await diagramSettings({ 'row-height': 24 });
    d = await snapshot(); assert.equal(d.rowHeight, 24); assert.ok(d.waveformHeight <= 16);
    await diagramSettings({ 'wave-height': 12 });
    d = await snapshot(); assert.equal(d.waveformHeight, 12);
    await page.locator('#setting-menu summary').click(); await page.locator('#open-diagram').click(); await page.locator('#row-height-slider').focus(); await page.locator('#row-height-slider').press('Home');
    for (let i = 0; i < 16; i++) await page.locator('#row-height-slider').press('ArrowRight');
    await page.locator('#wave-height').fill('20'); await page.locator('#diagram-form button[type="submit"]').click();
    d = await snapshot(); assert.equal(d.rowHeight, 40); assert.equal(d.waveformHeight, 20);
    console.log('PASS: both panel resize handles, 24px rows, slider and independent waveform height');
    await page.locator('.signal-item').filter({ hasText: 'CLK' }).click(); await page.locator('#signal-trigger').selectOption('both');
    d = await snapshot(); let clockRow = d.signals.findIndex(s => s.name === 'CLK'), count = d.signals[clockRow].edges.length - 1;
    assert.equal(await page.locator('#diagram [data-trigger]').count(), count);
    await at(1, clockRow, d); await page.locator('#edge-trigger').selectOption('off');
    assert.equal(await page.locator('#diagram [data-trigger]').count(), count - 1);
    d = await snapshot(); await page.keyboard.down('Alt'); await drag(await coordinates(1, clockRow, d), await coordinates(1.5, clockRow, d)); await page.keyboard.up('Alt');
    d = await snapshot(); assert.equal(d.signals[clockRow].edges[1].t, 1.5); assert.equal(d.signals[clockRow].edges[1].trigger, 'off');
    await page.locator('#signal-trigger').selectOption('none'); await page.locator('#edge-trigger').selectOption('on');
    assert.equal(await page.locator('#diagram [data-trigger="falling"]').count(), 1);
    await page.locator('#signal-trigger').selectOption('both'); await page.locator('#edge-trigger').selectOption('off');
    console.log('PASS: whole-signal trigger arrows, individual override and drag persistence');
    d = await snapshot(); await at(6, 0, d, R.layout(d).dimensionY);
    await page.locator('#dimension-show-time').check();
    assert.ok((await page.locator('#diagram').textContent()).includes('t_delay (2 ns)'));
    await page.locator('#dimension-show-label').uncheck();
    assert.ok(!(await page.locator('#diagram').textContent()).includes('t_delay'));
    await page.locator('#dimension-show-time').uncheck();
    d = await snapshot(); assert.equal(R.dimensionLabel(d, d.annotations[1]), ''); assert.equal(d.annotations[1].text, 't_delay');
    await page.locator('#dimension-show-label').check(); await page.locator('#dimension-show-time').check();
    assert.equal(await page.locator('.document-bar').count(), 0);
    assert.equal(await page.locator('#diagram text').filter({ hasText: /^數位介面啟動時序$/ }).count(), 0);
    assert.ok((await page.locator('#canvas-scroll').boundingBox()).height > 750);
    console.log('PASS: independent arrow label/time visibility and expanded title-free canvas');
    await page.locator('#add-sheet').click(); await page.locator('#signal-name').fill('NEW_SIGNAL'); await page.locator('#signal-name').press('Tab');
    await diagramSettings({ duration: 8 });
    let all = await workbookSnapshot(); assert.equal(all.sheets.length, 2); assert.equal(all.sheets[1].document.duration, 8); assert.equal(all.sheets[0].document.duration, 8);
    await page.locator('.sheet-tab').nth(0).click(); d = await snapshot(); assert.equal(d.signals.length, 5); assert.equal(d.rowHeight, 40);
    await page.locator('#manage-sheets').click(); await page.locator('#sheet-name').fill('啟動時序'); await page.locator('#sheet-count').fill('3'); await page.locator('#sheets-form button[type="submit"]').click();
    all = await workbookSnapshot(); assert.equal(all.sheets.length, 3); assert.equal(all.sheets[0].name, '啟動時序');
    await page.locator('#manage-sheets').click(); await page.locator('#duplicate-sheet').click();
    all = await workbookSnapshot(); assert.equal(all.sheets.length, 4); assert.equal(all.sheets[1].name, '啟動時序 副本');
    await page.locator('#signal-name').fill('ACK_COPY'); await page.locator('#signal-name').press('Tab');
    all = await workbookSnapshot(); assert.equal(all.sheets[0].document.signals[0].name, 'ACK'); assert.equal(all.sheets[1].document.signals[0].name, 'ACK_COPY');
    await page.locator('#manage-sheets').click(); await page.locator('#delete-sheet').click(); all = await workbookSnapshot(); assert.equal(all.sheets.length, 3);
    await page.locator('#undo').click(); all = await workbookSnapshot(); assert.equal(all.sheets.length, 4); assert.equal(all.sheets[1].document.signals[0].name, 'ACK_COPY');
    await page.locator('#redo').click();
    await page.locator('#manage-sheets').click(); await page.locator('#sheet-count').fill('2'); await page.locator('#sheets-form button[type="submit"]').click(); all = await workbookSnapshot(); assert.equal(all.sheets.length, 2);
    await page.locator('#undo').click(); all = await workbookSnapshot(); assert.equal(all.sheets.length, 3); await page.locator('#redo').click();
    const fullBook = await workbookSnapshot(), fullBookFile = await downloaded('#save-project', '.timing.json');
    await page.locator('#file-menu summary').click(); await page.locator('#new-project').click(); await page.locator('#file-input').setInputFiles(fullBookFile); await page.waitForFunction(() => document.querySelectorAll('.sheet-tab').length === 2);
    assert.deepEqual(await workbookSnapshot(), fullBook);
    await page.reload(); await page.locator('.sheet-tab').nth(1).waitFor(); assert.deepEqual(await workbookSnapshot(), fullBook);
    assert.ok((await page.locator('.signals-panel').boundingBox()).width >= 259); assert.ok((await page.locator('#properties-panel').boundingBox()).width >= 313);
    await page.locator('#collapse-properties').click(); await page.reload(); await page.locator('#diagram').waitFor(); assert.equal(await page.locator('#properties-panel').isVisible(), false); await page.locator('#toggle-properties').click();
    while ((await page.locator('#zoom-label').textContent()) !== '200%') await page.locator('#zoom-in').click();
    await page.locator('#canvas-scroll').evaluate(e => { e.scrollLeft = 100; });
    await page.waitForFunction(() => { const book = JSON.parse(localStorage.getItem('timing-studio.workbook.v2')), ui = JSON.parse(localStorage.getItem('timing-studio.ui.v2')); return ui.views[book.activeSheetId]?.left === 100; });
    await page.reload(); await page.locator('.sheet-tab').nth(1).waitFor(); assert.equal(await page.locator('#canvas-scroll').evaluate(e => e.scrollLeft), 100);
    console.log('PASS: sheet creation/count/rename/copy/delete, structural undo, whole-book files and preference recovery');
    const legacyContext = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
    const legacyPage = await legacyContext.newPage(); legacyPage.on('pageerror', error => errors.push(error.message));
    const legacyDoc = M.resizeDocument(M.example(), 12); legacyDoc.title = '舊圖測試'; const legacyJSON = JSON.stringify(legacyDoc);
    await legacyPage.addInitScript(value => { if (location.protocol === 'http:') localStorage.setItem('timing-studio.document.v1', value); }, legacyJSON);
    await legacyPage.goto(origin); await legacyPage.locator('#diagram [data-edge-signal]').first().waitFor();
    assert.equal(await legacyPage.locator('#document-title').inputValue(), '舊圖測試'); await legacyPage.locator('#setting-menu summary').click(); await legacyPage.locator('#open-diagram').click(); assert.equal(await legacyPage.locator('#duration').inputValue(), '12');
    assert.equal(await legacyPage.evaluate(() => JSON.parse(localStorage.getItem('timing-studio.workbook.v2')).sheets.length), 1);
    assert.equal(await legacyPage.evaluate(() => localStorage.getItem('timing-studio.document.v1')), legacyJSON); await legacyContext.close();
    console.log('PASS: legacy autosave migration retains the original backup');
    await page.locator('.sheet-tab').nth(0).click(); await page.locator('.signal-item').filter({ hasText: 'CLK' }).click(); await page.locator('#fit').click();
    await page.locator('#properties-panel').evaluate(e => { e.scrollTop = 0; });
    await page.locator('#toast').waitFor({ state: 'hidden' });
    await page.screenshot({ path: path.join(OUT, 'editor-desktop.png'), fullPage: true });
    const examplePng = await downloaded('#download-png', '.png'); await fs.copyFile(examplePng, path.join(OUT, 'digital-startup.png'));
    await page.setViewportSize({ width: 390, height: 844 }); await page.locator('#fit').click();
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
    await page.screenshot({ path: path.join(OUT, 'editor-mobile.png'), fullPage: true });
    // Direct file opening is a supported fallback for offline editing/export.
    const filePage = await context.newPage(); filePage.on('pageerror', error => errors.push(error.message));
    await filePage.goto(require('node:url').pathToFileURL(path.resolve(__dirname, '../public/index.html')).href); await filePage.locator('#diagram [data-edge-signal]').first().waitFor();
    assert.equal(await filePage.locator('#signal-list button').count(), 5);
    await filePage.locator('#file-menu summary').click(); await filePage.locator('#open-export').click(); const singlePng = filePage.waitForEvent('download'); await filePage.locator('#export-download').click();
    await (await singlePng).saveAs(path.join(OUT, 'digital-startup-original.png'));
    assert.deepEqual(errors, []);
    console.log('PASS: desktop/mobile layout, offline file opening and no runtime errors');
    await context.close();
  } finally { if (browser) await browser.close(); await new Promise(resolve => server.close(resolve)); }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
