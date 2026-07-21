import { defineContentScript } from 'wxt/utils/define-content-script';
import '../modules/page-translator/styles.css';
import { PageTranslator } from '../modules/page-translator/manager';
import { initPdfContent } from '../modules/pdf/content';
import { isPdfPage } from '../modules/utils/dom';

export default defineContentScript({
  matches: ['*://*/*'],
  runAt: 'document_idle',
  main() {
    if (isPdfPage()) {
      initPdfContent();
    } else {
      const translator = new PageTranslator();
      translator.init();
    }
  },
});
