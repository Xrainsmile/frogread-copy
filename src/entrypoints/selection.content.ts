import { defineContentScript } from 'wxt/utils/define-content-script';
import '../modules/page-translator/styles.css';
import { initSelectionToolbar } from '../modules/selection/toolbar';

export default defineContentScript({
  matches: ['*://*/*'],
  runAt: 'document_idle',
  main() {
    if (document.documentElement.dataset.rfSelection) return;
    document.documentElement.dataset.rfSelection = '1';
    initSelectionToolbar();
  },
});
