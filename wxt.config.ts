import { defineConfig } from "wxt";

// ReadFlow v2 — WXT-based rebuild, architecture inspired by read-frog.
export default defineConfig({
  srcDir: "src",
  entrypointsDir: "entrypoints",
  outDir: "dist",
  imports: false,
  modules: ["@wxt-dev/module-react"],
  manifestVersion: 3,
  manifest: ({ mode, browser }) => ({
    name: "ReadFlow",
    description:
      "一键翻译网页，原文译文对照阅读。支持 38 种语言、混元/太极/DeepSeek/GLM 等多模型，⌥T 快捷翻译，划词翻译。",
    permissions: [
      "storage",
      "activeTab",
      "scripting",
      "tabs",
      "alarms",
      "contextMenus",
    ],
    host_permissions: ["<all_urls>"],
    action: {
      default_popup: "popup.html",
      default_icon: {
        "16": "icon16.png",
        "32": "icon32.png",
        "48": "icon48.png",
        "128": "icon128.png",
      },
    },
    icons: {
      "16": "icon16.png",
      "32": "icon32.png",
      "48": "icon48.png",
      "128": "icon128.png",
    },
    commands: {
      "toggle-translate": {
        suggested_key: {
          default: "Alt+Shift+T",
          mac: "Option+T",
        },
        description: "Toggle translation",
      },
    },
    web_accessible_resources: [
      {
        resources: ["lib/pdf.min.js", "lib/pdf.worker.min.js", "icons/*.png"],
        matches: ["<all_urls>"],
      },
    ],
    ...(mode === "development" &&
      (browser === "chrome" || browser === "edge") && {
        // Fixed extension ID for development convenience.
        key: undefined,
      }),
  }),
  dev: {
    server: { port: 3333, strictPort: false },
  },
  hooks: {
    // WXT auto-generates options_ui with open_in_tab: false when detecting
    // options.html entry. Force override to open in a dedicated tab.
    "build:manifestGenerated": (_wxt, manifest) => {
      const m = manifest as Record<string, unknown>;
      if (m.options_ui && typeof m.options_ui === 'object') {
        (m.options_ui as Record<string, unknown>).open_in_tab = true;
      }
    },
  },
});
