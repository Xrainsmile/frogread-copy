import { defineContentScript } from 'wxt/utils/define-content-script';
import { SubtitlesController } from '../modules/subtitles/controller';
import '../modules/subtitles/subtitles.css';

export default defineContentScript({
  matches: ['https://www.youtube.com/*', 'https://m.youtube.com/*'],
  // Run after the page settles so the player element is present.
  runAt: 'document_idle',
  main(ctx) {
    const controller = new SubtitlesController();
    void controller.init();
    ctx.onInvalidated(() => controller.destroy());
  },
});
