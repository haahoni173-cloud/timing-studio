'use strict';
// Acceptance tests for menus, per-signal locks, clipboard and user preferences.
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE_PATH || 'playwright');
const { createServer } = require('../scripts/serve.cjs');
const M = require('../public/model.js'), R = require('../public/render.js');
const OUT = path.resolve(__dirname, '../output');
async function main() {
  await fs.mkdir(OUT, { recursive: true });
  const server = createServer(); await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  let browser, page;
  try {
    browser = await chromium.launch({ headless: true, ...(process.env.PLAYWRIGHT_EXECUTABLE_PATH ? { executablePath: process.env.PLAYWRIGHT_EXECUTABLE_PATH } : {}) });
    const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, permissions: ['clipboard-read','clipboard-write'] });
    page = await context.newPage(); const errors = [];
    page.on('pageerror', error => errors.push(error.message)); page.on('dialog', dialog => dialog.accept());
    await page.goto(`http://127.0.0.1:${server.address().port}`); await page.locator('#diagram [data-edge-signal]').first().waitFor();
    const book = () => page.evaluate(() => JSON.parse(localStorage.getItem('timing-studio.workbook.v2')));
    const doc = async () => { const b = await book(); M.validateWorkbook(b); return b.sheets.find(s => s.id === b.activeSheetId).document; };
    async function open(menu, id) { await page.locator('#' + menu + ' summary').click(); await page.locator('#' + id).click(); }
    async function section(title, state = true) {
      const node = page.locator(`details[data-section="${title}"]`);
      if (await node.evaluate(n => n.open) !== state) { await node.locator('summary').click(); await page.waitForTimeout(30); }
    }
    async function change(id, value) { await page.locator('#' + id).fill(String(value)); await page.locator('#' + id).press('Tab'); }
    async function settings(values, submit = true) {
      await open('setting-menu','open-diagram');
      for (const [id, value] of Object.entries(values)) { if (id === 'grid-step') await page.locator('#' + id).selectOption(String(value)); else await page.locator('#' + id).fill(String(value)); }
      await page.locator('#row-height').dispatchEvent('change');
      await page.locator(submit ? '#diagram-form [type="submit"]' : '#diagram-form [data-close]').last().click();
    }
    async function coord(time, row, d, absoluteY) {
      const box = await page.locator('#diagram').boundingBox(), l = R.layout(d);
      return { x: box.x + (l.x + time * l.px) / l.width * box.width, y: box.y + (absoluteY ?? (l.rows[row].y + l.rows[row].height / 2)) / l.height * box.height };
    }
    async function drag(from, to) { await page.mouse.move(from.x,from.y); await page.mouse.down(); await page.mouse.move(to.x,to.y,{ steps: 10 }); await page.mouse.up(); }
    async function language(value) { await open('setting-menu','open-language'); await page.locator('#language').selectOption(value); await page.locator('#language-form [type="submit"]').click(); }
    assert.equal(await page.locator('#properties-panel #duration, #properties-panel #export-background').count(), 0);
    assert.equal(await page.locator('#move-up,#move-down,#duplicate-signal,#delete-object,#delete-edges').count(), 0);
    assert.equal(await page.locator('.top-toolbar [data-tool="1"],.top-toolbar [data-tool="select"]').count(), 0);
    await page.locator('#file-menu summary').click(); await page.locator('#edit-menu summary').click(); assert.equal(await page.locator('#file-menu').evaluate(n => n.open), false);
    await page.locator('#edit-menu summary').press('ArrowDown'); assert.equal(await page.locator('#edit-menu').evaluate(n => n.contains(document.activeElement)), true);
    await page.keyboard.press('Escape'); assert.equal(await page.locator('#edit-menu').evaluate(n => n.open), false);
    console.log('PASS: compact menus, keyboard navigation and simplified properties');

    await page.locator('#add-sheet').click(); await page.locator('.sheet-tab').nth(0).click();
    await change('line-width',4); await section('個別列高與鎖定'); await change('signal-row-height',28); await page.locator('#lock-width').check(); await page.locator('#lock-row-height').check();
    await settings({ duration: 24, 'time-unit': 'us', 'grid-step': .5, 'row-height': 40, 'wave-height': 24, 'global-width': 3 });
    let b = await book(), d = await doc(); const sourceId = d.signals[0].id;
    for (const sheet of b.sheets) { assert.equal(sheet.document.duration,24); assert.equal(sheet.document.rowHeight,40); assert.equal(sheet.document.unit,'us'); }
    assert.equal(d.signals[0].style.width,4); assert.equal(d.signals[0].rowHeight,28); assert.equal(d.signals[1].style.width,3); assert.equal(b.sheets[1].document.signals[0].style.width,3);
    assert.equal(R.layout(d).rows[1].y,110); const prior = await book(); await settings({ 'row-height': 64, 'global-width': 6 },false); assert.deepEqual(await book(),prior);
    await page.locator('#undo').click(); b = await book(); assert.equal(b.sheets[1].document.duration,16); await page.locator('#redo').click(); assert.deepEqual(await book(),prior);
    await page.locator('#add-signal').click(); assert.equal((await doc()).signals.at(-1).style.width,3); await page.keyboard.press('Delete'); assert.equal((await doc()).signals.length,5);
    console.log('PASS: every-sheet settings, separate row/width locks, cancel and atomic undo');

    await page.locator('.signal-item').nth(0).click(); await page.locator('#signal-trigger').selectOption('both'); await page.locator('#diagram').focus(); await page.keyboard.press('v');
    d = await doc(); const before = await coord(1,0,d); await page.mouse.click(before.x,before.y); await page.locator('#edge-trigger').selectOption('on');
    await page.keyboard.down('Alt'); await drag(await coord(1,0,d),await coord(1.5,0,d)); await page.keyboard.up('Alt'); d = await doc(); assert.equal(d.signals[0].edges[1].t,1.5);
    const arrow = await page.locator('#diagram [data-trigger="falling"]').first().getAttribute('d'); assert.ok(arrow.includes('L' + (R.layout(d).x + 1.5 * R.layout(d).px) + ' ')); assert.ok(!arrow.includes('V'));
    await page.locator('#diagram').focus(); await page.keyboard.press('t'); const textPoint = await coord(2,1,d); await page.mouse.click(textPoint.x,textPoint.y); await change('annotation-text','Row note');
    d = await doc(); await drag(await coord(2,1,d,R.annotationY(d,d.annotations.at(-1)) - 4), await coord(2,2,d,R.rowY(d,2) + 10)); assert.equal((await doc()).annotations.at(-1).y,2);
    console.log('PASS: integrated arrowheads and editing/annotations with mixed row heights');

    await page.locator('.signal-item').nth(0).click(); await page.keyboard.press('Control+c');
    const copied = JSON.parse(await page.evaluate(() => navigator.clipboard.readText())); assert.equal(copied.format,'timing-studio.signal');
    await page.keyboard.press('Control+v'); await page.waitForFunction(() => document.querySelectorAll('.signal-item').length === 6);
    d = await doc(); assert.equal(d.signals[1].name,'CLK_copy'); assert.notEqual(d.signals[1].id,sourceId); assert.equal(d.signals[1].rowHeight,28); assert.equal(d.signals[1].style.width,4); assert.equal(d.signals[1].edges[1].trigger,'on'); assert.equal(d.annotations.at(-1).y,3);
    await page.keyboard.press('Delete'); assert.equal((await doc()).signals.length,5); assert.equal((await doc()).annotations.at(-1).y,2);
    await page.locator('#undo').click(); assert.equal((await doc()).signals.length,6); await page.locator('#redo').click(); assert.equal((await doc()).signals.length,5);
    await page.locator('.sheet-tab').nth(1).click(); await page.keyboard.press('Control+v'); await page.waitForFunction(() => document.querySelectorAll('.signal-item').length === 2);
    d = await doc(); assert.equal(d.signals[1].name,'CLK_copy'); assert.equal(d.signals[1].widthLocked,true); assert.equal(d.signals[1].rowHeightLocked,true);
    await page.locator('#signal-name').focus(); await page.locator('#signal-name').selectText(); await page.keyboard.press('Control+c'); await page.keyboard.press('Control+v'); assert.equal((await doc()).signals.length,2);
    await page.locator('#diagram').focus(); await page.locator('#zoom-in').click(); await page.keyboard.press('f'); const fitted = await page.locator('#zoom-label').textContent(); await page.locator('#zoom-in').click(); await page.locator('#fit').click(); assert.equal(await page.locator('#zoom-label').textContent(),fitted);
    console.log('PASS: real signal clipboard, cross-sheet paste, delete/undo, typing protection and F');

    await open('setting-menu','open-shortcuts'); await page.locator('[data-shortcut="high"]').focus(); await page.keyboard.press('l'); await page.locator('#shortcuts-form [type="submit"]').click(); assert.equal(await page.locator('#shortcuts-dialog').isVisible(),true); assert.ok((await page.locator('#shortcut-error').textContent()).includes('重複'));
    await page.locator('[data-shortcut="high"]').focus(); await page.keyboard.press('Control+w'); await page.locator('#shortcuts-form [type="submit"]').click(); assert.equal(await page.locator('#shortcuts-dialog').isVisible(),true);
    for (const [command,key] of [['high','j'],['fit','g'],['properties','p']]) { await page.locator(`[data-shortcut="${command}"]`).focus(); await page.keyboard.press(key); }
    await page.locator('#shortcuts-form [type="submit"]').click(); await page.locator('#diagram').focus(); await page.keyboard.press('l'); await page.keyboard.press('h'); assert.equal(await page.locator('#diagram').getAttribute('data-tool'),'0'); await page.keyboard.press('j'); assert.equal(await page.locator('#diagram').getAttribute('data-tool'),'1');
    await page.keyboard.press('p'); assert.equal(await page.locator('#properties-panel').isVisible(),false); await page.keyboard.press('p'); assert.equal(await page.locator('#properties-panel').isVisible(),true);
    await page.locator('#zoom-in').click(); await page.keyboard.press('g'); assert.equal(await page.locator('#zoom-label').textContent(),fitted);
    await section('快速建立波形',false); await page.reload(); await page.locator('#diagram [data-edge-signal]').first().waitFor(); await page.locator('#diagram').focus(); await page.keyboard.press('j'); assert.equal(await page.locator('#diagram').getAttribute('data-tool'),'1'); assert.equal(await page.locator('#properties-key').textContent(),'P'); assert.equal(await page.locator('details[data-section="快速建立波形"]').evaluate(n => n.open),false);
    await open('setting-menu','open-shortcuts'); await page.locator('#reset-shortcuts').click(); await page.locator('#shortcuts-form [type="submit"]').click(); assert.equal(await page.locator('#properties-key').textContent(),'Q');
    console.log('PASS: shortcut conflicts/reserved keys, custom actions, recovery and reset');

    await change('signal-name','訊號名稱'); await page.locator('#manage-sheets').click(); await page.locator('#sheet-name').fill('屬性'); await page.locator('#sheets-form [type="submit"]').click(); const unchangedDoc = await doc();
    await language('en'); assert.deepEqual(await doc(),unchangedDoc); assert.equal(await page.locator('.signals-panel h2').textContent(),'Signals'); assert.ok((await page.locator('.signal-name').allTextContents()).includes('訊號名稱')); assert.ok((await page.locator('.sheet-tab').allTextContents()).includes('屬性'));
    await open('setting-menu','open-diagram'); assert.equal(await page.locator('#diagram-dialog h2').textContent(),'Diagram'); assert.ok((await page.locator('#diagram-form').textContent()).includes('Global line width')); await page.locator('#diagram-form [data-close]').last().click();
    await page.reload(); await page.locator('#diagram').waitFor(); assert.equal(await page.locator('html').getAttribute('lang'),'en'); assert.equal(await page.locator('.signals-panel h2').textContent(),'Signals');
    console.log('PASS: English/Chinese switching without translating user data and language recovery');

    const importFile = path.join(OUT,'v3-import.timing.json'); await fs.writeFile(importFile,JSON.stringify(M.blank())); const current = await book();
    await open('file-menu','open-project'); await page.locator('#import-mode').selectOption('append'); await page.locator('#import-file').setInputFiles(importFile); await page.locator('#import-form [type="submit"]').click(); await page.locator('#import-dialog').waitFor({state:'hidden'});
    b = await book(); assert.equal(b.sheets.length,3); assert.deepEqual(b.sheets[0],current.sheets[0]); assert.notEqual(b.sheets[2].id,b.sheets[0].id); await page.locator('#undo').click(); assert.deepEqual(await book(),current);
    const badFile = path.join(OUT,'v3-invalid.timing.json'); await fs.writeFile(badFile,JSON.stringify({version:2,sheets:[]})); await open('file-menu','open-project'); await page.locator('#import-file').setInputFiles(badFile); await page.locator('#import-form [type="submit"]').click(); await page.waitForFunction(() => document.querySelector('#import-error').textContent.includes('Invalid')); assert.equal(await page.locator('#import-dialog').isVisible(),true); assert.deepEqual(await book(),current); await page.locator('#import-form [data-close]').last().click();
    await page.locator('.sheet-tab').nth(0).click(); d = await doc();
    await open('file-menu','open-export'); await page.locator('#export-format').selectOption('png'); await page.locator('#export-background').selectOption('transparent');
    let pending = page.waitForEvent('download'); await page.locator('#export-download').click(); const pngPath = path.join(OUT,'v3-diagram.png'); await (await pending).saveAs(pngPath); const png = await fs.readFile(pngPath), size = R.rasterSize(d,3); assert.equal(png.readUInt32BE(20),size.height);
    await page.locator('#export-format').selectOption('svg'); assert.equal(await page.locator('#export-scale').isEnabled(),false); pending = page.waitForEvent('download'); await page.locator('#export-download').click(); const svgPath = path.join(OUT,'v3-diagram.svg'); await (await pending).saveAs(svgPath); assert.ok((await fs.readFile(svgPath,'utf8')).includes('data-trigger="falling"'));
    await page.locator('#export-format').selectOption('project'); assert.equal(await page.locator('#image-options').isVisible(),false); pending = page.waitForEvent('download'); await page.locator('#export-download').click(); const projectPath = path.join(OUT,'v3-workbook.timing.json'); await (await pending).saveAs(projectPath); assert.deepEqual(JSON.parse(await fs.readFile(projectPath,'utf8')),await book()); await page.locator('#export-dialog [data-close]').click();
    console.log('PASS: import append/error isolation and modal PNG/SVG/whole-project exports');

    await page.locator('.signal-item').nth(0).click(); await section('個別列高與鎖定'); await page.locator('#fit').click(); await page.locator('#toast').waitFor({state:'hidden'}); await page.screenshot({path:path.join(OUT,'editor-v3-en.png'),fullPage:true});
    await language('zh'); await page.screenshot({path:path.join(OUT,'editor-v3.png'),fullPage:true});
    await page.setViewportSize({width:390,height:844}); await page.locator('#fit').click(); assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth),false); await page.screenshot({path:path.join(OUT,'editor-v3-mobile.png'),fullPage:true});
    assert.deepEqual(errors,[]); console.log('PASS: desktop/mobile layout and no runtime errors'); await context.close();
  } catch (error) { if (page) await page.screenshot({path:path.join(OUT,'interface-failure.png'),fullPage:true}).catch(() => {}); throw error; }
  finally { if (browser) await browser.close(); await new Promise(resolve => server.close(resolve)); }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
