import { defineContentScript } from 'wxt/utils/define-content-script';
import { InputTranslationController } from '../modules/input-translation/engine';

export default defineContentScript({
  matches: ['<all_urls>'],
  runAt: 'document_idle',
  main(ctx) {
    const controller = new InputTranslationController();
    controller.init();
    ctx.onInvalidated(() => controller.destroy());
  },
});
