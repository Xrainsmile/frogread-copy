import { defineContentScript } from 'wxt/utils/define-content-script';
import '../modules/page-translator/styles.css';
import { initSelectionToolbar, runContextAction } from '../modules/selection/toolbar';
import type { BackgroundToContent } from '../modules/messaging';

export default defineContentScript({
  matches: ['*://*/*'],
  runAt: 'document_idle',
  main() {
    if (document.documentElement.dataset.rfSelection) return;
    document.documentElement.dataset.rfSelection = '1';
    initSelectionToolbar();

    // 右键菜单（背景注入）把选中文字转交工具条处理
    chrome.runtime.onMessage.addListener((msg: any) => {
      const m = msg as BackgroundToContent;
      if (m.type === 'context-selection-translate') {
        runContextAction(m.text, 'translate');
      } else if (m.type === 'context-selection-read') {
        runContextAction(m.text, 'read');
      } else if (m.type === 'context-selection-custom') {
        runContextAction(m.text, 'custom', m.actionId);
      }
    });
  },
});
