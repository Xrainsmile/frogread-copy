// Registers custom browser context-menu (right-click) items when enabled in
// config: translate the current page, and translate / read-aloud / run a custom
// action on the selected text. Clicking a selection item forwards the text to
// the active tab's selection content script, which drives the toolbar.

import { getConfig, onConfigChanged } from '../config/storage';
import type { AppConfig } from '../config/types';

const PAGE_ITEM = 'readflow-page-translate';
const SELECT_TRANSLATE = 'readflow-selection-translate';
const SELECT_READ = 'readflow-selection-read';
const CUSTOM_PREFIX = 'readflow-custom::';

let clickListenerBound = false;
let rebuildScheduled = false;

function sendToTab(tabId: number, frameId: number | undefined, msg: unknown): void {
  if (frameId !== undefined) {
    chrome.tabs.sendMessage(tabId, msg, { frameId }, () => {});
  } else {
    chrome.tabs.sendMessage(tabId, msg, () => {});
  }
}

/** Build the menu tree from the current config. No-op if disabled. */
async function rebuild(config: AppConfig): Promise<void> {
  if (!chrome.contextMenus) return;
  if (!config.contextMenu.enabled) {
    chrome.contextMenus.removeAll(() => {});
    return;
  }

  await chrome.contextMenus.removeAll(() => {});

  chrome.contextMenus.create({
    id: PAGE_ITEM,
    title: '翻译此页面',
    contexts: ['page'],
  });

  chrome.contextMenus.create({
    id: SELECT_TRANSLATE,
    title: '翻译选中文字',
    contexts: ['selection'],
  });

  chrome.contextMenus.create({
    id: SELECT_READ,
    title: '朗读选中文字',
    contexts: ['selection'],
  });

  const customActions = config.customActions.filter((a) => a.enabled);
  if (customActions.length > 0) {
    for (const action of customActions) {
      chrome.contextMenus.create({
        id: CUSTOM_PREFIX + action.id,
        title: action.name,
        contexts: ['selection'],
      });
    }
  }
}

function bindClickListener(): void {
  if (clickListenerBound || !chrome.contextMenus) return;
  clickListenerBound = true;

  chrome.contextMenus.onClicked.addListener((info, tab) => {
    if (!tab?.id) return;
    const frameId = info.frameId;
    const text = info.selectionText ?? '';

    switch (info.menuItemId) {
      case PAGE_ITEM:
        // Toggle translation of the page in the tab that was right-clicked.
        chrome.tabs.sendMessage(tab.id, { type: 'toggle-translate' }).catch(() => {});
        break;

      case SELECT_TRANSLATE:
        sendToTab(tab.id, frameId, { type: 'context-selection-translate', text });
        break;

      case SELECT_READ:
        sendToTab(tab.id, frameId, { type: 'context-selection-read', text });
        break;

      default: {
        if (typeof info.menuItemId === 'string' && info.menuItemId.startsWith(CUSTOM_PREFIX)) {
          const actionId = info.menuItemId.slice(CUSTOM_PREFIX.length);
          sendToTab(tab.id, frameId, {
            type: 'context-selection-custom',
            text,
            actionId,
          });
        }
      }
    }
  });
}

/**
 * Initialise the context menu: build it from current config, keep it in sync
 * when the config changes, and bind the click handler once.
 */
export async function initContextMenu(): Promise<void> {
  if (!chrome.contextMenus) return;
  bindClickListener();

  const config = await getConfig();
  await rebuild(config);

  onConfigChanged((cfg: AppConfig) => {
    if (rebuildScheduled) return;
    rebuildScheduled = true;
    // Coalesce rapid config writes (e.g. drag persistence) into one rebuild.
    setTimeout(() => {
      rebuildScheduled = false;
      rebuild(cfg);
    }, 300);
  });
}
