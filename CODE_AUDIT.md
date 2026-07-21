# ReadFlow v2 代码审计报告

- **审计对象**：ReadFlow v2（WXT / Chrome MV3 浏览器扩展），版本 `2.0.9`
- **审计范围**：`src/` 全量源码（entrypoints + modules）
- **审计方法**：人工精读 + 静态检索（`innerHTML`/`sendMessage`/`fetch`/`any`/`eval` 等模式扫描）+ 架构比对（参照 read-frog）
- **审计结论（总览）**：架构清晰、职责分离良好，核心安全边界（LLM 调用集中在 background、内容脚本用 Shadow DOM 隔离、DOM 注入用 `textContent`/转义）基本到位。**未发现可直接利用的存储型 XSS 或 RCE**。主要问题集中在 **消息校验缺失、API Key 进入 `chrome.storage.sync` 并跨上下文传递、MV3 Service Worker 生命周期未兜底** 三类，建议按严重度处理。

> 下文所有「文件:行号」均基于审计时版本；改动后行号可能漂移，请以函数/符号名为准复核。

## 修复进展（2026-07-21）

F-01 ~ F-07 已全部修复并通过 `npm run build` + `npm run typecheck`（仅剩既存的 `wxt.config.ts:optionsUi` 类型告警，与本批无关）。版本升至 `2.0.10`。

| 编号 | 状态 | 修复要点 |
|------|------|----------|
| F-01 | ✅ 已修复 | `background.ts` 新增 `parseMessage()`：type 白名单 + 各 case payload shape 校验（`isStrArr`/`typeof` 等）；监听器入口先校验，非法消息直接 `sendResponse({success:false})` 拒绝。 |
| F-02 | ✅ 已修复 | `config/storage.ts`：apiKey 拆到 `chrome.storage.local`（`rf-apikeys`），`rf-config` 写 sync 时 `stripApiKeys` 脱敏；`getConfig` 合并 local key 回填，含一次性迁移（历史泄漏到 sync 的 key 自动搬到 local）；`onConfigChanged` 在 sync/local 任一变更时都回调合并后的完整配置。 |
| F-03 | ✅ 已修复 | `messaging.ts`：`translate-subtitles`/`translate-texts` 不再携带 `Settings`（apiKey）；`translate-texts` 改传 `from?/to?`。`background.ts` 两 case 改为 `getConfig()`+`deriveSettings()` 自取配置并应用语言覆盖。`subtitles/controller.ts`、`input-translation/engine.ts` 同步改为只发 texts/from/to。 |
| F-04 | ✅ 已修复 | 新增 `utils/bg-messaging.ts` 的 `sendToBackground()`（带 60s 超时），用于所有 await 响应的调用点（retryTranslate / hoverDict / subtitles / input-translation）。整页翻译 fire-and-forget 路径在 `manager.ts` 加 `stallTimer`（120s 无 partial/done/error → `handleError('翻译超时')`，partial 重置窗口）。 |
| F-05 | ✅ 已修复 | `background.ts` translate-pdf：优先 `sender.tab.url`（可信）而非 `message.url`，强制 `^https?://` 协议校验，非法 url 直接拒绝。 |
| F-06 | ✅ 已修复 | `toolbar.ts` doRequest/doLookup/runCustom 的 `sendMessage` 加 `.catch(()=>{})`，并启动 30s `responseTimer`：SW 无响应时把 spinner 替换为超时错误；收到结果时 `clearResponseTimeout()`。 |
| F-07 | ✅ 已修复 | `manager.ts` `send()`：translate 请求 `lastError` 时调用 `handleError()`（不再仅日志），`errorCooldownUntil` 生效；cancel-translation 失败仍 best-effort 仅日志。 |

F-08 ~ F-14（低危）未在本批处理，保留为后续改进项。

---

## 一、发现汇总

| 编号 | 严重度 | 维度 | 位置 | 问题摘要 |
|------|--------|------|------|----------|
| F-01 | 高 | 消息传递 | `entrypoints/background.ts:285` | `onMessage` 用 `any` 接收 message，无 sender 校验、无 payload shape 校验 |
| F-02 | 高 | 密钥存储 | `modules/config/storage.ts:114,166` | API Key 经 `chrome.storage.sync` 持久化（同步至用户 Google 账号） |
| F-03 | 中 | 密钥暴露面 | `modules/messaging.ts:20-21`；`background.ts:189-217` | `translate-subtitles` / `translate-texts` 把完整 `Settings`（含 apiKey）随消息传入 background，跨上下文传递不必要 |
| F-04 | 中 | MV3 生命周期 | `entrypoints/background.ts:284-288`；`translation/router.ts:93` | SW 在 `translate()` await 期间被终止时 `sendResponse` 永不触发，调用方静默挂起 |
| F-05 | 中 | SSRF / 网络 | `modules/pdf/background.ts:30` | `fetch(pdfUrl)` 中 `pdfUrl` 来自内容脚本消息（`message.url`），可被诱导请求任意 URL（带扩展 cookie），无白名单/内容类型校验 |
| F-06 | 中 | 错误处理 | `modules/selection/toolbar.ts:267,275,316` | 划词 `chrome.runtime.sendMessage` 无 callback、无 `.catch()`，SW 唤醒失败时产生未捕获 rejection |
| F-07 | 中 | 错误处理 | `modules/page-translator/manager.ts`（`send()` 回调） | `sendMessage` callback 仅记 `lastError` 日志，通信失败不触发 `handleError`，错误冷却不生效 |
| F-08 | 低 | 网络安全 | `modules/ai/providers/openai-compatible.ts:99-104` | `fat` provider 默认端点为 `http://dev.fit-ai.woa.com/...`（明文 HTTP），API Key 经明文链路传输 |
| F-09 | 低 | 网络健壮性 | `modules/ai/providers/openai-compatible.ts:71`；`dictionary.ts:10` | `fetch` 后未先判 `resp.ok` 即 `.json()`；词典查询无超时/中止 |
| F-10 | 低 | 类型安全 | `entrypoints/background.ts:285`；多处 `as` 断言 | `message: any` → `as ContentToBackground`，`switch` 内直接取字段，shape 不符时 `undefined` 下传 |
| F-11 | 低 | 配置校验 | `modules/config/storage.ts:22-24` | `customActions` 从存储直接取用，未做 shape 校验/过滤（依赖信任源） |
| F-12 | 低 | 权限收敛 | `wxt.config.ts:48-53` | `web_accessible_resources` 仍暴露 `icons/*.png` 给 `<all_urls>`，划词图标已改内联 SVG，存在不必要的指纹/资源暴露面 |
| F-13 | 低 | 权限收敛 | `wxt.config.ts:20` | 申明 `alarms` 权限但未见使用（待复核），可移除以收敛权限 |
| F-14 | 低 | 提示注入 | `entrypoints/background.ts:254-256` | `custom-action` 用 `replace` 把选中文本拼进 system prompt，选中文本含 `{{targetLang}}` 会被替换（预期但需知晓） |

> 已确认**良好实践**：DOM 注入译文统一用 `textContent`（`injector.ts:12`）；划词气泡/工具条结果均经 `escapeHtml`（`toolbar.ts`、`hoverDict.ts`）；PDF 面板用 `escHtml` 转义 `& < >`；划词浮层整体 Shadow DOM 隔离。

---

## 二、详细发现

### F-01（高）onMessage 缺少发送方与消息结构校验
**位置**：`src/entrypoints/background.ts:285-288`

```ts
chrome.runtime.onMessage.addListener((message: any, sender, sendResponse) => {
  handleMessage(message as ContentToBackground, sender, sendResponse);
  return true;
});
```
- `message` 以 `any` 接收并直接 `as ContentToBackground`，`handleMessage`（`background.ts:42`）的 `switch` 内直接访问 `message.paragraphs`、`message.settings`、`message.url` 等字段，无任何 shape 校验。
- 未校验 `sender.id` / `sender.url` / `sender.frameId`。虽然 MV3 下外部页面默认无法向扩展发消息（除非 `externally_connectable`），但任何**已注入的内容脚本**（含被注入到恶意页面的本扩展 content script）都可发任意结构消息，shape 不符会把 `undefined` 传进 `translate()` / `fetch()` 等下游。
- **建议**：在 `handleMessage` 入口对 `message?.type` 做白名单校验；每个 `case` 内对关键字段做最小校验（`Array.isArray(paragraphs)`、`typeof text === 'string'` 等）；对敏感动作（`test-connection`、`translate-pdf`）校验 `sender.tab`。

### F-02（高）API Key 存入 `chrome.storage.sync`
**位置**：`src/modules/config/storage.ts:114`（读）、`166`（写）

```ts
const stored = await chrome.storage.sync.get(CONFIG_KEY);   // 读
await chrome.storage.sync.set({ [CONFIG_KEY]: config, ... }); // 写
```
- `config.providersConfig[].apiKey` 随 `rf-config` 写入 `storage.sync`，会**同步到用户 Google 账号**，跨设备漫游。
- 风险：账号被盗/设备共用时密钥外泄；同步配额受限（QUOTA_BYTES_PER_ITEM 8KB，多 provider 配置可能触限被截断，导致配置损坏）。
- **建议**：把 `apiKey` 单独拆到 `chrome.storage.local`（或迁移到 `storage.session` 运行期缓存 + local 持久化），其余非敏感配置保留 sync 漫游。

### F-03（中）API Key 随消息跨上下文传递
**位置**：`src/modules/messaging.ts:20-21`、`src/entrypoints/background.ts:189-217`

```ts
| { type: 'translate-subtitles'; texts: string[]; settings: Settings }
| { type: 'translate-texts';     texts: string[]; settings: Settings }
```
- 字幕/输入翻译路径由内容脚本把**完整 `Settings`（含 apiKey）**塞进消息发给 background。`translate` / `selection-translate` / `lookup` / `custom-action` 路径则是 background 自取配置——两套不一致。
- 内容脚本运行在隔离世界，宿主页脚本无法直接读其变量，但密钥在内容脚本上下文中存在本身就扩大了暴露面（如调试、扩展冲突、未来代码改动引入泄漏）。
- **建议**：统一为「background 读配置」模式：消息只传 `texts` 与目标 provider id，密钥永不下沉到 content。`translate-subtitles`/`translate-texts` 改为 background 内 `getConfig()`。

### F-04（中）MV3 SW 生命周期未兜底
**位置**：`src/entrypoints/background.ts:284`、`src/modules/translation/router.ts:93`

- `handleMessage` 为 `async`，`return true` 表示异步回 `sendResponse`。`translate()` 内有批量+重试+并发，耗时较长。MV3 SW 在 ~30s 无活动后被终止；若 SW 在 `await` 中被杀，`sendResponse` 永不触发，调用方（content / popup）**静默挂起**。
- `tabTranslationSession` Map 在 SW 内存中，SW 重启后丢失，旧 session 比对失效。
- **建议**：
  1. 长任务用 `chrome.runtime.connect` 长连接或拆分进度消息（已有 `translate-partial`，可在此基础上让 content 侧带超时兜底）。
  2. 调用方对 `sendMessage` 设超时（如 60s 无响应则报错并允许重试）。
  3. 关键会话状态（`tabTranslationSession`）落到 `chrome.storage.session` 而非内存。

### F-05（中）PDF URL 可被诱导触发 SSRF
**位置**：`src/modules/pdf/background.ts:30`

```ts
const url = message.url ?? sender.tab?.url ?? '';
...
const pdfResp = await fetch(pdfUrl);
```
- `message.url` 来自内容脚本，background 用扩展身份发起 `fetch`（携带扩展 cookie 上下文）。恶意/被注入的内容脚本可让扩展请求任意内网/任意 URL。
- 未校验协议（`http/https`）、未校验 host、未校验 `Content-Type`。
- **建议**：限定 `url` 为 `sender.tab?.url` 或同源；校验 `^https?:` 且禁止内网/环回；校验响应 `Content-Type` 含 `application/pdf`。

### F-06 / F-07（中）消息通信失败静默吞掉
**位置**：`selection/toolbar.ts:267,275,316`；`page-translator/manager.ts`（`send()`）

- 划词的 `chrome.runtime.sendMessage(msg)`（`doRequest`/`doLookup`/`runCustom`）**无 callback、无 `.catch()`**：SW 休眠唤醒失败时产生未捕获 promise rejection，且 UI 一直转圈。
- 整页翻译 `send()` 的 callback 仅 `logger` 记 `lastError`，不触发 `handleError`，`errorCooldownUntil` 失效，用户看不到失败态。
- **建议**：所有 `sendMessage` 加 `.catch(err => handleError(err))` 或 callback 内失败时清理 UI/上报错误；划词路径加超时（如 30s 关闭 spinner 并提示）。

### F-08（低）内部网关走明文 HTTP
**位置**：`src/modules/ai/providers/openai-compatible.ts:99-104`

```ts
export const fatProvider = makeOpenAIProvider('fat', 'FAT (公司 AI 网关)',
  'http://dev.fit-ai.woa.com/api/llmproxy', 'deepseek-v3.1');
```
- API Key 经 `Authorization: Bearer` 在明文 HTTP 链路传输。虽为公司内网网关，但若用户在非内网/公共网络使用，密钥可被中间人嗅探。
- **建议**：默认端点改 HTTPS，或在文档中明确「仅限内网使用」并提示风险。

### F-09（低）网络响应处理健壮性
**位置**：`openai-compatible.ts:71`、`dictionary.ts:10`

- `const data = await resp.json();` 未先判 `resp.ok`：非 2xx 且响应非 JSON（如 HTML 错误页）时 `.json()` 抛错，错误信息不友好（抛 `SyntaxError` 而非 API 错误）。
- 词典 `fetch` 无 `AbortController` 超时，网络挂起时 hover 词典一直「查询中」。
- **建议**：先 `if (!resp.ok) throw new Error(\`HTTP ${resp.status}\`)` 再解析；词典加 8–10s 超时。

### F-10（低）类型安全
**位置**：`background.ts:285`，及各 `as` 断言

- `message: any` → `as ContentToBackground` 是信任边界缺口（见 F-01）。其余 `as HTMLElement`、`as BackgroundToContent` 多为窄化，风险可控。
- **建议**：引入运行时校验（如 zod 或手写 type guard）在边界处收口。

### F-11（低）customActions 存储无校验
**位置**：`config/storage.ts:22-24`

```ts
customActions: Array.isArray(s.customActions) ? s.customActions : DEFAULT_CONFIG.customActions,
```
- 直接透传存储中的数组，未逐项校验 `id/name/prompt/providerId/enabled`。若存储被其它途径写入畸形数据，`runCustom`（`background.ts:247`）可能取到非法 `action.prompt`。
- **建议**：mergeConfig 内对每项做 `{ ...blankAction(), ...item }` 归一化与字段过滤。

### F-12 / F-13（低）权限与可访问资源收敛
**位置**：`wxt.config.ts:20,48-53`

- `web_accessible_resources` 暴露 `icons/*.png` 给 `<all_urls>`：划词图标已改内联 SVG（见 `selection/toolbar.ts` 的 `ICON`），provider 图标仅在 popup/options（扩展页）使用，不需要 WAR。保留会扩大扩展可被任意页面探测的指纹面。
- `alarms` 权限申明但未检索到使用点（待复核 `chrome.alarms` 调用）。
- **建议**：从 WAR 移除 `icons/*.png`；若 `alarms` 未用则移除该权限。

### F-14（低）自定义指令提示注入
**位置**：`background.ts:254-256`

```ts
const systemPrompt = action.prompt
  .replace(/\{\{\s*text\s*\}\}/g, message.text)
  .replace(/\{\{\s*targetLang\s*\}\}/g, targetLang);
```
- 选中文本若含字面量 `{{targetLang}}` 会被二次替换。属预期行为但需知晓：用户选中的恶意文本可影响 prompt（非 XSS，仅 prompt 层）。
- **建议**：先替换 `{{targetLang}}` 再替换 `{{text}}`，或对 `message.text` 中的 `{{...}}` 做转义。

---

## 三、专项维度分析

### 3.1 消息传递
- **消息清单**（`messaging.ts`）：Content→Background 12 类，Background→Content 8 类，类型联合完整、有注释。
- **问题**：见 F-01（无校验）、F-04（异步响应不可靠）、F-06/F-07（失败静默）。
- **`return true` 模式**：`handleMessage` 全程 `return true`，但部分 case（`selection-translate`/`lookup`/`custom-action`）先 `sendResponse({success:true})` 再用 `tabs.sendMessage` 异步回传结果——两条通道混用，调用方拿到的 `success:true` 不代表业务成功。建议文档化或统一。

### 3.2 XSS / 注入面（已审，整体良好）
检索到的 DOM 写入点逐一核对：

| 位置 | 写入方式 | 输入来源 | 是否安全 |
|------|----------|----------|----------|
| `page-translator/injector.ts:12,88` | `textContent` | 译文 | ✅ 安全 |
| `injector.ts:98` | `innerHTML = '&#x21bb;'` | 常量 | ✅ 安全 |
| `selection/toolbar.ts:234` | `innerHTML = bodyHtml` | `escapeHtml(result/error)` | ✅ 已转义 |
| `toolbar.ts:189` | `host.innerHTML` | `escapeHtml(icon/name)` | ✅ 已转义 |
| `page-translator/hoverDict.ts:65,72` | `tip.innerHTML` | `escapeHtml(word/err)` | ✅ 已转义 |
| `pdf/background.ts:162,170-174` | `innerHTML/insertAdjacentHTML` | `escHtml(original/translated)` | ✅ 转义 `& < >`（文本节点足够） |
| `pdf/background.ts:115` | `innerHTML` 模板 | 静态结构 | ✅ 安全 |
| `manager.ts:112`、`pdf/content.ts:10` | `innerHTML` | 静态字符串 | ✅ 安全 |

- `escapeHtml`（`toolbar.ts:151`）覆盖 `& < > " '`，足够用于属性与文本。
- PDF `escHtml`（`background.ts:145`）仅转义 `& < >`，但所有插值均在**文本节点**（非属性），可接受；若未来把变量写入属性需补 `"`/`'`。
- **无** `eval` / `new Function` / `document.write` / `dangerouslySetInnerHTML`。

### 3.3 密钥与权限
- **权限**（`wxt.config.ts:15-23`）：`storage, activeTab, scripting, tabs, alarms, contextMenus` + `host_permissions: <all_urls>`。`<all_urls>` 对翻译扩展属合理但范围大；`activeTab` 在有 `tabs`+`<all_urls>` 下冗余。
- **密钥流向**：popup/options 写配置 → `storage.sync` → background `getConfig()` 读 → provider `fetch`。内容脚本在字幕/输入翻译路径会读到 apiKey（F-03）。
- **测试连接**（`test-connection`）：由 options 页发起，settings 含临时输入的 key，走 background `provider.testConnection`，未落盘，合理。

### 3.4 网络
- LLM 调用均在 background（`router.ts` → `ai/providers/*`），120s 超时（`openai-compatible.ts:60`），有重试与降级（`router.ts:48-91`）。
- 端点可由用户自定义（`customProvider`），`settings.endpoint` 未校验协议/host（F-08 同源）。
- 词典端点硬编码 `https://api.dictionaryapi.dev`（`dictionary.ts:10`），`encodeURIComponent` 转义参数 ✅。

### 3.5 内容脚本隔离
- 划词浮层：整体 Shadow DOM（`toolbar.ts:117 ensureShadow()`），样式注入 shadow 内，宿主页 CSS 隔离 ✅（已修复 retargeting 坑，见 `onDocMouseDown`/`handleMouseUp` 用 `composedPath`）。
- 整页翻译：用 `rf-` 前缀类 + `data-rf-*` 属性，样式经 `styles.css` 注入 `document`；无 Shadow DOM，但译文用 `textContent` 注入，CSS 前缀降低冲突，可接受。
- PDF 面板：直接挂 `document.body`，内联 style，z-index `2147483647`；无隔离但属一次性面板，风险低。
- 无 `!important` 滥用残留。

### 3.6 错误处理与边界
- `router.ts` 重试/降级完善 ✅。
- `getConfig`/`saveConfig` 有 try/catch 兜底默认值 ✅。
- **缺口**：F-04（SW 终止）、F-06/F-07（消息失败静默）、F-09（网络响应未判 ok）。
- 多处 `.catch(() => {})` 静默吞错（`background.ts:53,67,89,97,123,160,168,177,243`），便于 best-effort 但掩盖故障；建议至少 `logger.warn`。

### 3.7 类型安全
- 整体类型化良好；主要 `any` 在 `background.ts:285` 的 message（F-01）。
- `as` 断言集中在 DOM 窄化与消息构造，风险可控。
- 未发现 `@ts-ignore`。

### 3.8 MV3 特定
- SW 非持久：F-04。
- `chrome.storage` 异步：已正确 await。
- `chrome.alarms`：权限在但使用待复核（F-13）。
- `commands`（`Alt+Shift+T`/`Option+T`）：`background.ts:290` 处理，best-effort 发送 ✅。
- `contextMenus` 权限申明，使用待复核。

### 3.9 其它
- 版本管理：`package.json` `2.0.9` 驱动 manifest，`wxt.config.ts` 不再硬编码版本 ✅。
- 死代码/遗留：`public/icons/sel-*.png` 已删；`LEGACY_SETTINGS_KEY` 双写兼容（`storage.ts:169`）属过渡设计，可在迁移期后移除。
- 重复实现：`escHtml`（PDF）与 `escapeHtml`（toolbar）两套转义，建议统一到 `utils`。

---

## 四、审计复核清单（供他人逐项核对）

> 复核人请对每项标注 ✅ 通过 / ⚠️ 需改进 / ❌ 不通过，并附证据（文件:行或测试记录）。

### A. 消息与信任边界
- [ ] A1. `onMessage` 对 `message.type` 做白名单校验（F-01）
- [ ] A2. 每个 case 对关键 payload 字段做 shape 校验（F-01）
- [ ] A3. 敏感动作校验 `sender.tab`/`sender.url`（F-01, F-05）
- [ ] A4. 调用方对 `sendMessage` 设超时兜底（F-04, F-06）
- [ ] A5. 所有 `sendMessage` 失败有 `.catch`/callback 处理（F-06, F-07）
- [ ] A6. `sendResponse` 与 `tabs.sendMessage` 双通道语义有文档说明（3.1）

### B. 密钥与权限
- [ ] B1. apiKey 不入 `storage.sync`（F-02）
- [ ] B2. apiKey 不随消息下沉到 content（F-03）
- [ ] B3. `host_permissions`/permissions 最小化（移除冗余 `activeTab`、未用 `alarms`）（F-13, 3.3）
- [ ] B4. `web_accessible_resources` 不暴露不再使用的 `icons/*.png`（F-12）
- [ ] B5. 自定义端点校验协议（默认 HTTPS）（F-08）

### C. XSS / 注入
- [ ] C1. 所有 `innerHTML=` 插值均经转义或为常量（3.2 表）
- [ ] C2. 无 `eval`/`new Function`/`document.write`（3.2）
- [ ] C3. PDF `escHtml` 若用于属性需补 `"`/`'`（3.2）
- [ ] C4. 统一 `escapeHtml` 工具，消除 `escHtml` 重复（3.9）

### D. 网络与第三方
- [ ] D1. `fetch` 先判 `resp.ok` 再解析 body（F-09）
- [ ] D2. 词典查询有超时（F-09）
- [ ] D3. PDF `fetch(url)` 校验 url 来源与协议、Content-Type（F-05）
- [ ] D4. LLM provider 调用有超时与重试（已通过，复核 `router.ts:48-91`、`openai-compatible.ts:60`）

### E. MV3 生命周期
- [ ] E1. 长任务在 SW 终止后有兜底（超时/长连接）（F-04）
- [ ] E2. 会话状态不依赖 SW 内存（F-04）
- [ ] E3. `chrome.alarms`/`contextMenus` 权限若不用则移除（F-13）

### F. 错误处理
- [ ] F1. `.catch(() => {})` 处至少 `logger.warn`（3.6）
- [ ] F2. 整页翻译通信失败触发 `handleError`（F-07）
- [ ] F3. 划词失败关闭 spinner 并提示（F-06）

### G. 类型与配置
- [ ] G1. message 入口去 `any`，改 type guard（F-10）
- [ ] G2. `customActions` mergeConfig 内做字段归一化（F-11）
- [ ] G3. 自定义指令先替换 `{{targetLang}}` 后替换 `{{text}}`（F-14）

---

## 五、关键文件索引

| 文件 | 职责 | 审计关注点 |
|------|------|-----------|
| `src/entrypoints/background.ts` | SW 消息中枢 + LLM 入口 | F-01,04,05,06,14 |
| `src/modules/messaging.ts` | 消息类型联合 | F-03 |
| `src/modules/config/storage.ts` | 配置持久化（sync） | F-02,11 |
| `src/modules/translation/router.ts` | 翻译编排/重试 | F-04 |
| `src/modules/ai/providers/openai-compatible.ts` | LLM provider | F-08,09 |
| `src/modules/ai/dictionary.ts` | 词典查询 | F-09 |
| `src/modules/pdf/background.ts` | PDF 解析+面板注入 | F-05 |
| `src/modules/selection/toolbar.ts` | 划词工具条（Shadow DOM） | F-06，XSS（已通过） |
| `src/modules/page-translator/injector.ts` | 译文 DOM 注入 | XSS（已通过） |
| `src/modules/page-translator/manager.ts` | 整页翻译控制器 | F-07 |
| `wxt.config.ts` | manifest/权限 | F-12,13 |

---

## 六、总体评价

- **架构健康度：良好**。content/background 职责清晰，LLM 调用集中后台，DOM 注入用 `textContent`，划词浮层 Shadow DOM 隔离——安全骨架是对的。
- **首要整改**：F-01（消息校验）、F-02（密钥存储）、F-04（SW 兜底）三项属「高/中」且影响面广，建议优先。
- **无阻断性安全漏洞**：未发现存储型 XSS、RCE 或可被宿主页直接利用的越权；现存问题多为健壮性与纵深防御层面。
