/* UI-only translation: signal names, sheet names and diagram annotations are user data. */
(() => {
  'use strict';
  const pairs = {
    '已儲存': 'Saved', '已儲存於此瀏覽器': 'Saved in this browser', '請儲存圖檔備份': 'Save a project backup',
    '主選單': 'Main menu', '快速操作': 'Quick actions', '新增圖檔': 'New project', 'Import · 匯入': 'Import', 'Export · 匯出': 'Export',
    '儲存圖檔': 'Save project', '操作說明': 'Help', '收合屬性': 'Collapse properties', '展開屬性': 'Show properties',
    '複製圖片至 PPT': 'Copy image to PPT', '正在準備圖片…': 'Preparing image…', '繪圖工具': 'Drawing tools',
    '選取': 'Select', '切換電位': 'Toggle level', '高電位 H': 'High H', '低電位 L': 'Low L', '未知 X': 'Unknown X', '高阻抗 Z': 'High impedance Z',
    '高電位': 'High level', '低電位': 'Low level', '未知狀態': 'Unknown state', '高阻抗': 'High impedance',
    '參考線': 'Reference line', '時間箭頭': 'Time dimension', '文字': 'Text', '文字標註': 'Text annotation', '復原': 'Undo', '重做': 'Redo',
    '吸附': 'Snap', '格線': 'Grid', '縮小': 'Zoom out', '放大': 'Zoom in', '符合畫布': 'Fit canvas',
    '訊號': 'Signals', '訊號列表': 'Signal list', '＋ 新增訊號': '+ Add signal', '新增時脈': 'Add clock',
    '載入範例到此活頁': 'Load example into this sheet', '拖動 ⋮⋮ 排序訊號': 'Drag ⋮⋮ to reorder signals', '點選訊號後按 Q 開啟屬性': 'Select a signal to show its properties',
    '調整訊號欄寬度': 'Resize signal panel', '調整屬性欄寬度': 'Resize properties panel', '時序圖畫布': 'Timing diagram canvas',
    '可編輯的數位時序圖': 'Editable digital timing diagram', '活頁': 'Sheets', '新增活頁': 'Add sheet', '活頁設定': 'Sheet settings',
    '活頁數、命名、複製與刪除': 'Sheet count, names, duplication and deletion', '屬性': 'Properties', '屬性設定': 'Properties',
    'Diagram · 圖形配置': 'Diagram', '設定套用所有活頁；已鎖定的個別粗細與列高保留。': 'Apply to every sheet. Locked signal widths and row heights are preserved.',
    '時間長度': 'Duration', '單位': 'Unit', '格線間隔': 'Grid interval', '訊號列高 (px)': 'Row height (px)', '波形高度 (px)': 'Waveform height (px)',
    '調整訊號列高': 'Adjust row height', '極緊湊': 'Dense', '緊湊': 'Compact', '標準': 'Standard', '全域波形粗細 (px)': 'Global line width (px)',
    '取消': 'Cancel', '套用': 'Apply', '套用所有活頁': 'Apply to all sheets', '關閉': 'Close', '匯入方式': 'Import mode',
    '取代整份圖檔': 'Replace project', '加入為新活頁': 'Append as new sheets', '圖檔': 'Project file', '匯入': 'Import',
    '支援 .timing.json，包含舊版單頁圖檔。圖片請使用匯出功能。': 'Supports .timing.json, including legacy single-sheet files. Use Export for images.',
    '格式': 'Format', 'PNG／SVG／剪貼簿輸出目前活頁；圖檔包含所有活頁。': 'PNG, SVG and image clipboard export the current sheet. Project files include every sheet.',
    '背景': 'Background', '解析度': 'Resolution', '白色': 'White', '透明': 'Transparent', '圖片保留格線': 'Include grid',
    '中文字：標楷體 · 英文字：Times New Roman': 'Chinese: DFKai-SB · English: Times New Roman', '複製圖片': 'Copy image', '下載': 'Download',
    '快捷鍵': 'Keyboard shortcuts', '點選欄位後按下按鍵組合。文字輸入時保留一般編輯操作。': 'Focus a field and press a key combination. Text inputs keep normal editing shortcuts.',
    '恢復預設': 'Restore defaults', '語言': 'Language', '介面語言': 'Interface language', '繁體中文': 'Traditional Chinese',
    '複製訊號': 'Copy signal', '貼上訊號': 'Paste signal', '刪除選取': 'Delete selection', '訊號設定': 'Signal', '訊號名稱': 'Signal name',
    '整條訊號觸發箭頭': 'Signal trigger arrows', '不顯示': 'None', '↑ Pos · 上升沿': '↑ Positive · Rising', '↓ Neg · 下降沿': '↓ Negative · Falling',
    '↑↓ 上升與下降沿': '↑↓ Both edges', '切換時間': 'Transition time', '對齊到時間': 'Align to time', '套用時間': 'Apply time', '對齊選取邊緣': 'Align selected edges',
    '選取邊緣的觸發箭頭': 'Selected edge arrow', '依整條設定': 'Follow signal', '顯示此邊緣箭頭': 'Show arrow', '隱藏此邊緣箭頭': 'Hide arrow',
    '0 → 1 顯示 ↑；1 → 0 顯示 ↓。': '0 → 1: upward; 1 → 0: downward.', 'X／Z 邊界不顯示觸發箭頭。': 'No trigger arrows at X/Z boundaries.',
    '線條樣式': 'Line style', '顏色': 'Color', '線條顏色': 'Line color', '粗細 (px)': 'Width (px)', '線條': 'Line', '實線': 'Solid', '虛線': 'Dashed', '點線': 'Dotted',
    '起點箭頭': 'Start arrow', '終點箭頭': 'End arrow', '個別列高與鎖定': 'Row height and locks', '鎖定粗細': 'Lock width', '鎖定列高': 'Lock row height',
    '快速建立波形': 'Waveform generator', '波形序列': 'Wave pattern', '例如 001110001100': 'Example: 001110001100', '支援 0、1、X、Z。': 'Supports 0, 1, X, Z.',
    '套用波形序列': 'Apply pattern', '將此訊號設為時脈': 'Generate clock for this signal', '標註文字': 'Label', '顯示標註文字': 'Show label', '顯示時間差': 'Show time difference',
    '起點時間': 'Start time', '終點時間': 'End time', '時間位置': 'Time', '垂直位置': 'Row', '時間軸上方': 'Above time axis',
    '選取訊號或標註，': 'Select a signal or annotation', '即可設定名稱與線條樣式。': 'to edit its properties.', '按「新增訊號」開始繪製。': 'Choose Add signal to start drawing.',
    '目前活頁名稱': 'Current sheet name', '活頁數量 (1–32)': 'Sheet count (1–32)', '複製目前活頁': 'Duplicate current sheet', '刪除目前活頁': 'Delete current sheet',
    '新增空白活頁會接在末端；減少數量會刪除末端活頁，可用復原恢復。': 'New blank sheets are appended. Reducing the count removes trailing sheets; Undo can restore them.',
    '產生時脈': 'Generate clock', '時脈會自動延伸至時間軸末端。': 'The clock extends to the end of the time axis.', '週期': 'Period', '占空比 (%)': 'Duty cycle (%)',
    '起始時間': 'Start time', '閒置電位': 'Idle level', '圖片已準備好': 'Image ready', '下載 PNG': 'Download PNG',
    '目前瀏覽器未允許複製圖片。可以先下載 PNG，再將圖片拖進 PowerPoint。': 'The browser did not allow image copying. Download the PNG and insert it into PowerPoint.',
    '拖曳切換邊緣調整時間；Shift 點選可多選。': 'Drag transitions to adjust time; Shift-click to select multiple edges.',
    '點擊格子切換高低電位。': 'Click a cell to toggle its level.', '拖曳格子繪製高電位。': 'Drag across cells to draw high levels.',
    '拖曳格子繪製低電位。': 'Drag across cells to draw low levels.', '拖曳格子繪製未知狀態。': 'Drag across cells to draw unknown states.',
    '拖曳格子繪製高阻抗。': 'Drag across cells to draw high impedance.', '點擊時間位置建立垂直參考線。': 'Click to place a reference line.',
    '拖曳起點與終點，建立時間箭頭。': 'Drag between two times to create a dimension.', '點擊波形位置加入文字，再從右側編輯。': 'Click to add text, then edit it in Properties.',
    '已還原此瀏覽器上次編輯的時序圖。': 'Restored your last project in this browser.', '已貼上訊號。': 'Signal pasted.', '已複製訊號。': 'Signal copied.',
    '請先選取整條訊號。': 'Select a signal first.', '請先複製 Timing Studio 訊號。': 'Copy a Timing Studio signal first.',
    '已套用所有活頁；鎖定設定保留。': 'Applied to all sheets. Locked settings were preserved.', '圖檔已開啟。': 'Project imported.',
    'PNG 圖片已下載。': 'PNG downloaded.', 'SVG 向量圖已下載。': 'SVG downloaded.', '已複製圖片，請到 PowerPoint 按 Ctrl+V 貼上。': 'Image copied. Press Ctrl+V in PowerPoint.',
    '最多可建立 64 個訊號。': 'A sheet can contain up to 64 signals.', '最多可建立 32 個活頁。': 'A project can contain up to 32 sheets.', '圖檔不可超過 16 MB。': 'Project files must not exceed 16 MB.',
    '此檔案不是有效的 Timing Studio JSON 圖檔。': 'This is not a valid Timing Studio JSON project.', '圖檔格式或數值不正確，原本的圖仍保留。': 'Invalid project format or values. Your project is unchanged.',
    '活頁圖檔格式不正確，原本的圖仍保留。': 'Invalid workbook format. Your project is unchanged.', '波形粗細需介於 0.5 與 8 px。': 'Line width must be between 0.5 and 8 px.',
    '快捷鍵重複、無效或由瀏覽器保留，請選擇其他組合。': 'A shortcut is duplicate, invalid or reserved by the browser. Choose another combination.',
    '縮短時間軸會裁掉超出的波形與標註，可用復原恢復。是否套用？': 'Shortening the time axis trims waveforms and annotations. Undo can restore them. Apply?',
    '請檢查週期、占空比與起始時間。': 'Check the period, duty cycle and start time.', '時脈太密，請增加週期。': 'The clock is too dense. Increase its period.', '時脈已產生。': 'Clock generated.',
    '波形序列只能包含 0、1、X、Z，間隔需至少為 0.05。': 'Patterns must contain only 0, 1, X, Z with an interval of at least 0.05.',
    '切換時間需大於 0 且小於時間長度。': 'Transition time must be inside the time axis.', '同一訊號的多個切換邊緣不能重疊；請每個訊號選一個邊緣。': 'Select only one edge per signal when aligning to a single time.',
    '對齊位置會超過相鄰邊緣，請選擇其他時間。': 'Alignment would cross a neighboring edge. Choose another time.', '請輸入時間軸內的有效位置；箭頭終點需晚於起點。': 'Use a valid time. The end must be later than the start.',
    '建立新的活頁圖檔？目前整份圖檔可用「復原」恢復；也可以先儲存。': 'Create a new project? You can restore the current project with Undo or save it first.',
    '載入範例並取代目前活頁？其他活頁保留，也可以用「復原」恢復。': 'Replace the current sheet with the example? Other sheets are preserved. Undo can restore this sheet.',
    '雙擊可命名與管理活頁': 'Double-click to rename or manage sheets', '拖曳調整訊號順序': 'Drag to reorder signals', '整份圖檔名稱': 'Project name',
    '繪製 Timing Diagram': 'Drawing timing diagrams', '新增訊號或時脈': 'Add signals or clocks', '編輯高低電位': 'Edit digital levels', '拖曳與對齊': 'Drag and align', '加入報告標註': 'Add annotations', '複製到 PowerPoint': 'Copy to PowerPoint',
    '左側新增一般訊號；時脈可指定週期、占空比與起始時間。': 'Add signals in the left panel. Clocks support period, duty cycle and start time.',
    '「切換」會翻轉點選格子的電位；H、L、X、Z 可連續拖曳塗畫多個格子。右側也可輸入 00111000 這類波形序列。': 'Choose tools in Edit. H/L/X/Z paint levels across cells; the waveform generator accepts patterns such as 00111000.',
    '使用「選取」拖曳切換邊緣。Shift 點選邊緣可多選，一起拖曳或用方向鍵平移。右側可把不同訊號的選取邊緣對齊到指定時間。Alt 拖曳暫時關閉吸附。': 'Use Select to drag edges. Shift-click selects multiple edges for moving or alignment. Hold Alt while dragging to disable snapping.',
    '參考線：點一下，拖動頂端圓點或標籤調整位置。時間箭頭：拖出範圍。文字：點選位置後，在右側編輯文字。選取標註可拖曳位置；箭頭兩端可分別拖曳。': 'Reference: click to place and drag its header handle. Dimension: drag a time range. Text: click to place and edit in Properties. Annotation positions and dimension endpoints are draggable.',
    '按「複製圖片至 PPT」，再到 PowerPoint 按 Ctrl+V。也可下載 PNG 或 SVG。圖片不含編輯控制點。': 'Choose Copy image to PPT, then press Ctrl+V in PowerPoint. Export also offers PNG and SVG without editing handles.'
  };
  const reverse = Object.fromEntries(Object.entries(pairs).map(([zh, en]) => [en, zh]));
  function text(value, language) {
    if (typeof value !== 'string') return value || '';
    const zh = reverse[value] ?? value;
    if (language !== 'en') return zh;
    if (pairs[zh]) return pairs[zh];
    if (/^第 \d+ 列上方$/.test(zh)) return 'Above row ' + zh.match(/\d+/)[0];
    if (/^第 \d+ 列$/.test(zh)) return 'Row ' + zh.match(/\d+/)[0];
    if (/^已下載整份圖檔，包含 \d+ 個活頁。$/.test(zh)) return `Project downloaded (${zh.match(/\d+/)[0]} sheets).`;
    return value;
  }
  const originals = new WeakMap();
  const ignored = 'svg,script,style,textarea,input,.signal-name,.sheet-tab,#document-info,#selection-status,#shortcut-list,.color-value';
  function apply(root, language) {
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    let node;
    while ((node = walker.nextNode())) {
      if (!node.parentElement || node.parentElement.closest(ignored)) continue;
      const raw = node.nodeValue, key = raw.trim(); if (!key) continue;
      const previous = originals.get(node);
      const source = previous && (key === previous.zh || key === previous.en) ? previous.zh : reverse[key] ?? key;
      const translated = text(source, language);
      originals.set(node, { zh: source, en: text(source, 'en') });
      node.nodeValue = raw.replace(key, translated);
    }
    root.querySelectorAll('[title],[aria-label],[placeholder]').forEach(element => {
      if (element.closest('svg') || element.classList.contains('sheet-tab')) return;
      for (const attr of ['title','aria-label','placeholder']) if (element.hasAttribute(attr)) element.setAttribute(attr, text(element.getAttribute(attr), language));
    });
  }
  window.TimingI18n = { text, apply };
})();
