# 创作模式：页面设计能力 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在同一个「创作模式」里增加 UI 页面设计这条流水线，由 Agent 按用户原话判断走视频还是页面。

**Architecture:** 复用现有六步骨架：前两步（问需求、推荐风格）与第三道门禁（拍板风格）两条线共用；第 4、5 步按产物分叉——视频走 `save_storyboard`，页面走 `save_outline`；第 6 步分别落到 `save_animation` 与 `save_page`。页面产物是单文件 HTML，`file://` 下可打开、可交互，卡片提供 iframe 预览与宽度切换，下载走现有导出通道但文件名是 `.html`。

**Tech Stack:** Node ESM（Host 半）、React 函数组件 + `h()`（Client 半，由 `build.cjs` 内联成 `client.js`）、浏览器 Canvas/MediaRecorder（现有视频导出）、JSON Schema 工具定义。

**Spec:** `docs/superpowers/specs/2026-11-11-page-design-design.md`

## Global Constraints

- 页面 HTML 必须是**单文件自包含**：禁止 `fetch` / `XMLHttpRequest` / `<script type="module">` / 外链字体 / 外链图片 / CDN。
- 页面必须在 `file://` 下可用（用户双击打开）。
- 页面不接真实业务：表单只做前端校验不提交，列表与图表用写死数据。
- 风格库共用现有 333 条，页面只取配色、字体、质感，忽略运动描述。
- 现有视频流水线（六步、两道门禁、`save_animation` 行为）**不得改变**。
- 不改 `plugin/cordis.patch.yml`（仍是单 preset `code-animation`）。
- 工具总数从 6 增到 8，`TOOL_NAMES` 顺序：`list_styles, show_stills, get_style, save_storyboard, save_animation, save_outline, save_page, get_reference`。
- 所有新增用户可见文本用简体中文，与现有风格一致（无句号结尾的短句、参数说明写清默认值）。
- 页面预览宽度：桌面 1440、平板 834、手机 390。
- 存储沿用 `OUTPUT_DIR`（`plugin/created/`），页面文件名为 `<id>.html`，sidecar 为 `<id>.json`。

## Review Focus

- **页面 HTML 里有外链资源**：`<link href="https://…">`、`<img src="http://…">`、`@import`、Google Fonts。断网或离线打开时页面垮掉。校验必须在保存时拦下，不能只在提示词里要求。
- **页面在 `file://` 下白屏**：用了 `fetch`、`type="module"`、`import`。保存时拦下。
- **同一会话中途换线**：先说做视频，中途说「算了做页面」，工具被混用。`flow.js` 必须写明「判断定下后整条会话只走一条线，用户明确要求换才换」。
- **页面卡片在窄屏溢出**：iframe 宽度切到 390 时，卡片容器没有 `max-width: 100%`，横向滚动。卡片 CSS 必须让 iframe 宽度不超过容器。
- **区块清单与页面不一致**：`save_page` 收到的 `outline_id` 指向的区块数与 HTML 里 `<section>` 数量对不上。`save_page` 要在 `warnings` 里指出，而不是静默接受。

---

## File Structure

| 文件 | 职责 | 本计划中的改动 |
|---|---|---|
| `plugin/tools.js` | 8 个工具的定义与执行 | 新增 `save_outline`、`save_page`；抽出页面校验函数 |
| `plugin/data.js` | 目录、参考表、工具名清单 | `TOOL_NAMES` 加两项；`BUILD_REV` +1 |
| `plugin/flow.js` | 系统提示词里的流程 | 第 1 步加判断；新增页面四步；视频段不动 |
| `plugin/src/ui.js` | 卡片组件与 CSS | 新增 `PageCard`、`OutlineRow`，注册两个 toolview |
| `plugin/index.js` | HTTP 路由 | 新增 `/page/<id>`；导出允许 `.html` |
| `plugin/references/page.md` | 版式工艺参考 | 新建 |
| `plugin/package.json` | npm 打包清单 | 无改动（`references` 已在 `files` 里） |
| `docs/tools.md` | 工具参考 | 补两个工具的参数表 |
| `docs/guide.md` | 使用指南 | 补「做页面」这条线 |

`plugin/client.js` 是 `src/ui.js` 的构建产物，每次改完 `src/ui.js` 都要跑 `node build.cjs` 重新生成，不要手改。

---

## Task 1: 页面 HTML 校验函数

**Files:**
- Modify: `plugin/tools.js`（在 `assertRecordable` 附近新增导出函数）
- Test: `plugin/tools.test.mjs`（新建，用 `node --test`）

**Interfaces:**
- Produces: `assertPageable(html: string): void` —— 不满足约束时抛 `Error`，消息以「页面…」开头；满足则返回 undefined。
- Produces: `inspectPage(html: string): string[]` —— 返回警告数组，可为空。

- [ ] **Step 1: 写失败的测试**

```js
// plugin/tools.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { assertPageable, inspectPage } from './tools.js';

const ok = '<!doctype html><html><head><meta name="viewport" content="width=device-width"></head>'
  + '<body><section>a</section></body></html>';

test('合格的单文件页面通过校验', () => {
  assert.doesNotThrow(() => assertPageable(ok));
});

test('外链样式表被拦下', () => {
  const bad = ok.replace('</head>', '<link rel="stylesheet" href="https://cdn.example.com/a.css"></head>');
  assert.throws(() => assertPageable(bad), /页面.*外链/);
});

test('外链图片被拦下', () => {
  const bad = ok.replace('<section>a</section>', '<section><img src="http://example.com/a.png"></section>');
  assert.throws(() => assertPageable(bad), /页面.*外链/);
});

test('fetch 被拦下', () => {
  const bad = ok.replace('</body>', '<script>fetch("/api")</script></body>');
  assert.throws(() => assertPageable(bad), /页面.*file:\/\//);
});

test('type=module 被拦下', () => {
  const bad = ok.replace('</body>', '<script type="module">export default 1</script></body>');
  assert.throws(() => assertPageable(bad), /页面.*file:\/\//);
});

test('缺 viewport 时给警告而不是报错', () => {
  const noViewport = ok.replace(/<meta name="viewport"[^>]*>/, '');
  assert.deepEqual(inspectPage(noViewport), ['缺少 viewport meta，手机上会按桌面宽度渲染']);
});

test('没有 section 时给警告', () => {
  const noSection = ok.replace('<section>a</section>', '<div>a</div>');
  assert.deepEqual(inspectPage(noSection), ['没有 <section>，区块结构与清单对不上']);
});
```

- [ ] **Step 2: 跑测试确认失败**

Run: `cd plugin && node --test tools.test.mjs`
Expected: FAIL，`SyntaxError` 或 `assertPageable is not a function`

- [ ] **Step 3: 实现**

在 `plugin/tools.js` 的 `assertRecordable` 之后加：

```js
/** 页面里出现这些就是外链，离线打开必挂。 */
const PAGE_REMOTE = [
  /<link[^>]+href\s*=\s*["']https?:\/\//i,
  /<script[^>]+src\s*=\s*["']https?:\/\//i,
  /<img[^>]+src\s*=\s*["']https?:\/\//i,
  /@import\s+url\(\s*["']?https?:\/\//i,
];

/** 页面里出现这些在 file:// 下必然失败。 */
const PAGE_FILE_PROTOCOL = [
  /\bfetch\s*\(/,
  /XMLHttpRequest/,
  /<script[^>]+type\s*=\s*["']module["']/i,
];

export function assertPageable(html) {
  const body = String(html || '');
  if (!/<html[\s>]/i.test(body)) throw new Error('页面不是完整的 HTML 文档（缺 <html>）');
  if (PAGE_REMOTE.some((re) => re.test(body))) {
    throw new Error('页面里有外链资源（link/script/img/@import 指向 http(s)），离线打开会垮；改成内联');
  }
  if (PAGE_FILE_PROTOCOL.some((re) => re.test(body))) {
    throw new Error('页面用了 fetch / XMLHttpRequest / type="module"，file:// 下会失败；改成内联脚本');
  }
}

export function inspectPage(html) {
  const body = String(html || '');
  const warnings = [];
  if (!/<meta[^>]+name\s*=\s*["']viewport["']/i.test(body)) {
    warnings.push('缺少 viewport meta，手机上会按桌面宽度渲染');
  }
  if (!/<section[\s>]/i.test(body)) {
    warnings.push('没有 <section>，区块结构与清单对不上');
  }
  return warnings;
}
```

- [ ] **Step 4: 跑测试确认通过**

Run: `cd plugin && node --test tools.test.mjs`
Expected: PASS，7 个测试全绿

- [ ] **Step 5: 提交**

```bash
git add plugin/tools.js plugin/tools.test.mjs
git commit -m "feat: 页面 HTML 校验（外链与 file:// 不兼容的写法）"
```

---

## Task 2: `save_outline` 工具

**Files:**
- Modify: `plugin/tools.js`（新增工具注册）
- Modify: `plugin/data.js:71`（`TOOL_NAMES`）
- Test: `plugin/tools.test.mjs`（追加）

**Interfaces:**
- Consumes: `OUTPUT_DIR`、`slug()`、`inspectPage`（Task 1 不需要，此处仅沿用目录约定）
- Produces: 工具 `save_outline`，参数 `{ title, style_id?, sections[], aspect? }`，返回 `{ id, title, styleId, styleName, aspect, sections[], warnings[] }`，落盘 `plugin/created/<id>.json`（id 形如 `pg-<slug>-<ts>`）。

- [ ] **Step 1: 写失败的测试**

```js
// 追加到 plugin/tools.test.mjs
import { registerCreationTools } from './tools.js';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { OUTPUT_DIR } from './data.js';

function toolsOf() {
  const defs = new Map();
  registerCreationTools({ tools: { register: (d) => { defs.set(d.name, d); return () => {}; } } });
  return defs;
}

test('save_outline 落盘并返回 id', async () => {
  const outline = toolsOf().get('save_outline');
  const v = await outline.execute({
    title: '落地页',
    style_id: 'K1',
    sections: [
      { name: '首屏', purpose: '一句话说清是什么', content: '标题 + 副标 + 按钮', layout: '居中', text: '说一句话就出片' },
      { name: '特性', purpose: '三条能力', content: '三列卡片', layout: '三列网格', text: '' },
    ],
  });
  assert.match(v.id, /^pg-landing/);
  assert.equal(v.sections.length, 2);
  const saved = JSON.parse(readFileSync(join(OUTPUT_DIR, `${v.id}.json`), 'utf8'));
  assert.equal(saved.sections[0].name, '首屏');
});

test('save_outline 拒绝空 sections', async () => {
  const outline = toolsOf().get('save_outline');
  await assert.rejects(() => outline.execute({ title: 'x', sections: [] }), /区块/);
});
```

- [ ] **Step 2: 跑测试确认失败**

Run: `cd plugin && node --test tools.test.mjs`
Expected: FAIL，`Cannot read properties of undefined (reading 'execute')`

- [ ] **Step 3: 实现**

在 `plugin/tools.js` 里 `save_storyboard` 之后注册。description 写：

```
提交页面区块清单草稿。页面没有时间轴，所以不写秒数，写清每一块说什么、放什么、什么版式、文案原文。
调用前应当已完成风格拍板。提交后必须用 ask_user_question 让用户确认区块结构。
```

参数 schema：`title`（string，必填）、`style_id`（string）、`aspect`（enum `['16:9','9:16','1:1']`，默认 `'16:9'`）、`sections`（array，必填，items 含 `name`/`purpose`/`content`/`layout`/`text` 五个 string，`name` 必填）。

执行体：校验 `sections.length > 0`，否则 `throw new Error('区块清单不能为空')`；生成 `id = 'pg-' + slug(title) + '-' + Date.now().toString(36)`，撞名时按现有 `save_animation` 的探测循环加 `-2`；写出 `{ id, title, styleId, styleName, aspect, sections, warnings: [] }` 到 `OUTPUT_DIR/<id>.json`；返回同一对象。

在 `plugin/data.js` 的 `TOOL_NAMES` 里按全局约束的顺序插入 `'save_outline'`。

- [ ] **Step 4: 跑测试确认通过**

Run: `cd plugin && node --test tools.test.mjs`
Expected: PASS，9 个测试全绿

- [ ] **Step 5: 提交**

```bash
git add plugin/tools.js plugin/data.js plugin/tools.test.mjs
git commit -m "feat: save_outline 工具，页面区块清单"
```

---

## Task 3: `save_page` 工具

**Files:**
- Modify: `plugin/tools.js`
- Modify: `plugin/data.js:71`（`TOOL_NAMES` 再加 `'save_page'`）
- Test: `plugin/tools.test.mjs`（追加）

**Interfaces:**
- Consumes: `assertPageable`、`inspectPage`（Task 1），`OUTPUT_DIR`，`save_outline` 产出的 `<id>.json`（Task 2）
- Produces: 工具 `save_page`，参数 `{ title, style_id?, outline_id?, html }`，返回 `{ id, title, styleId, styleName, url, bytes, sections, warnings }`，落盘 `plugin/created/<id>.html` 与 `<id>.json`。

- [ ] **Step 1: 写失败的测试**

```js
const PAGE = '<!doctype html><html><head><meta name="viewport" content="width=device-width">'
  + '<style>body{margin:0}</style></head><body><section>首屏</section><section>特性</section></body></html>';

test('save_page 落盘并返回 /page/ 地址', async () => {
  const page = toolsOf().get('save_page');
  const v = await page.execute({ title: '落地页', style_id: 'K1', html: PAGE });
  assert.match(v.url, /^\/code-animation-api\/page\//);
  assert.equal(v.bytes, Buffer.byteLength(PAGE));
  assert.equal(readFileSync(join(OUTPUT_DIR, `${v.id}.html`), 'utf8'), PAGE);
});

test('save_page 拒绝外链页面', async () => {
  const page = toolsOf().get('save_page');
  const bad = PAGE.replace('</head>', '<link rel="stylesheet" href="https://x.test/a.css"></head>');
  await assert.rejects(() => page.execute({ title: 'x', html: bad }), /外链/);
});

test('save_page 在区块数与 section 数不一致时给警告', async () => {
  const outline = toolsOf().get('save_outline');
  const o = await outline.execute({
    title: '落地页',
    sections: [{ name: '首屏' }, { name: '特性' }, { name: '价格' }],
  });
  const page = toolsOf().get('save_page');
  const v = await page.execute({ title: '落地页', outline_id: o.id, html: PAGE });
  assert.ok(v.warnings.some((w) => w.includes('区块')));
});
```

- [ ] **Step 2: 跑测试确认失败**

Run: `cd plugin && node --test tools.test.mjs`
Expected: FAIL，`save_page` 不存在

- [ ] **Step 3: 实现**

在 `save_animation` 之后注册。description 写：

```
提交页面本体。产物必须是单文件 HTML：样式和脚本全部内联，禁止外链字体/图片/CDN，
禁止 fetch / XMLHttpRequest / type="module"——用户会双击在浏览器里打开，file:// 下这些都不工作。
页面要真能交互：hover、滚动进场、tab、手风琴、模态、轮播都可以；表单只做前端校验不提交。
```

参数：`title`（string，必填）、`style_id`（string）、`outline_id`（string）、`html`（string，必填）。

执行体顺序（顺序重要：先校验再落盘，避免留下孤儿文件）：

1. `assertPageable(html)` —— 抛错直接终止
2. `mkdirSync(OUTPUT_DIR, { recursive: true })`
3. 生成 `id = 'pg-' + slug(title) + '-' + Date.now().toString(36)`，撞名探测加 `-2`
4. 写 `<id>.html`
5. 若 `outline_id` 存在，读 `OUTPUT_DIR/<outline_id>.json`，取 `sections.length`；与 `html` 里 `<section` 出现次数比对，不等时把 `区块清单有 N 块，页面里有 M 个 <section>` 推进 warnings
6. `warnings.push(...inspectPage(html))`
7. 写 `<id>.json` sidecar（`{ ...value }`），返回 value

`url` 为 `/code-animation-api/page/${id}`。

- [ ] **Step 4: 跑测试确认通过**

Run: `cd plugin && node --test tools.test.mjs`
Expected: PASS，12 个测试全绿

- [ ] **Step 5: 提交**

```bash
git add plugin/tools.js plugin/data.js plugin/tools.test.mjs
git commit -m "feat: save_page 工具，单文件页面产物"
```

---

## Task 4: `/page/<id>` 路由与导出 `.html`

**Files:**
- Modify: `plugin/index.js`（在 `/animation/` 路由之后）
- Test: 手动 curl（本任务无单测，Host 路由在现有代码里也没有测试）

**Interfaces:**
- Consumes: `OUTPUT_DIR`、`safeId()`、`send()`
- Produces: `GET /code-animation-api/page/<id>` → `text/html; charset=utf-8`，`cache-control: no-store`；缺失时返回 404 纯文本 `not found`。

- [ ] **Step 1: 加路由**

在 `/animation/` 那段之后照抄结构，改成读 `<id>.html` 并返回 `text/html`。与动画路由的区别：**不注入自适应样式**（页面自己负责响应式），404 时直接 `send(res, 404, 'not found')`，不要那套「这一版已经被清理」的提示。

- [ ] **Step 2: 导出允许 .html**

`/export` 路由现在只用于录制好的 mp4，逻辑不变；页面下载直接复用同一个路由，只是前端传的 `name` 以 `.html` 结尾。检查 `safeFileName` 是否保留 `.html` 后缀，若被替换则放宽后缀白名单到 `[a-z0-9]`。

- [ ] **Step 3: 验证路由**

```bash
cd /home/wyf/dsh-code-animation
node -e "
import('./plugin/tools.js').then(async (m) => {
  const defs = new Map();
  m.registerCreationTools({ tools: { register: (d) => { defs.set(d.name, d); return () => {}; } } });
  const v = await defs.get('save_page').execute({
    title: '路由自检',
    html: '<!doctype html><html><head><meta name=\"viewport\" content=\"width=device-width\"></head><body><section>hi</section></body></html>',
  });
  console.log(v.id, v.url);
});
"
sleep 2
curl -s -o /dev/null -w "page HTTP %{http_code} %{size_download}B\n" "http://127.0.0.1:3080/code-animation-api/page/<上一步的 id>"
```

Expected: `page HTTP 200`，字节数与 HTML 一致

- [ ] **Step 4: 提交**

```bash
git add plugin/index.js
git commit -m "feat: /page/<id> 路由"
```

---

## Task 5: 页面卡片与区块卡片

**Files:**
- Modify: `plugin/src/ui.js`（新增组件、CSS、注册）
- Build: `plugin/client.js`（`node build.cjs` 生成，不手改）

**Interfaces:**
- Consumes: `API` 常量（`/code-animation-api`）、现有 `.cas-card` 样式族
- Produces: `PageCard`（渲染 `save_page` 结果）、`OutlineRow`（渲染 `save_outline` 结果）；在 `tool.call.toolview` 里以 key `save_page`、`save_outline` 注册。

- [ ] **Step 1: 写组件**

`OutlineRow`：一张卡片，标题行显示「页面区块 · N 块」，下面是可折叠的区块列表，每行「序号 · 名称 · 版式 · 文案」，样式复用 `.cas-card` / `.cas-card-head`。

`PageCard`：标题行显示 `title · styleName` 与三个宽度按钮；主体是 `<iframe src={API + '/page/' + id}>`，高度 480，宽度跟随选中宽度但不超过容器：

```css
.cas-page-frame{width:100%;border:0;background:#fff;display:block}
.cas-page-wrap{overflow:hidden}
.cas-page-wrap[data-w="1440"] .cas-page-frame{width:1440px;transform:scale(var(--cas-scale,1));transform-origin:top left}
```

用 `useState` 存宽度，用 `useRef` + `ResizeObserver` 算 `--cas-scale = 容器宽 / 目标宽`，保证 1440 宽在窄屏上按比例缩小而不是横向滚动。底部条：`1440 × 900 · N 个区块` + 「下载 HTML」按钮。

下载实现：`fetch(API + '/page/' + id)` 拿文本 → `new Blob([text], {type:'text/html'})` → `URL.createObjectURL` → `<a download={title + '.html'}>` 触发点击。**不要**走 `/export` 路由，那是给二进制 mp4 用的，页面直接在前端下载更简单，也避免把 HTML 传一遍。

- [ ] **Step 2: 注册两个 toolview**

在 `apply()` 里现有的 `tool.call.toolview` 生成器后追加：

```js
yield ctx.slots.register({ name: 'tool.call.toolview', key: 'save_outline' }, OutlineRow);
yield ctx.slots.register({ name: 'tool.call.toolview', key: 'save_page' }, PageCard);
```

- [ ] **Step 3: 构建并检查**

```bash
cd plugin && node --check src/ui.js && node build.cjs
```
Expected: `client.js written: … loader calls: 1`

- [ ] **Step 4: 窄屏检查**

把浏览器窗口缩到 600px 宽，确认卡片里的 1440 宽 iframe **按比例缩小**而不是出现横向滚动条；
再切到 390 宽，页面应显示手机布局。这一步是在页面卡片上做的，不是打开页面本身。

- [ ] **Step 5: 提交**

```bash
git add plugin/src/ui.js plugin/client.js
git commit -m "feat: 页面卡片与区块卡片"
```

---

## Task 6: 流程分岔

**Files:**
- Modify: `plugin/flow.js`
- Modify: `plugin/data.js`（`BUILD_REV` +1）

**Interfaces:**
- Consumes: 无
- Produces: 提示词里第 1 步的判断规则、页面四步；`FLOW_PROMPT` 长度增加但视频段不变

- [ ] **Step 1: 第 1 步加判断**

在第 1 步开头插入：

```
先判断这次做什么，用用户的原话判断，不要问「你要做哪种」：

- 视频、短片、宣传片、动画、片子、预告、MV、导出 MP4 → 走视频流水线
- 页面、落地页、官网、主页、界面、UI、网页、设计稿、组件 → 走页面流水线
- 两者都没提 → 追问一句用途，再判断

判断结果用一句话说出来（「这次做页面。」）。定下之后整条会话只走那一条线，
用户明确要求换才换，不要中途自己改。
```

- [ ] **Step 2: 插入页面流水线**

在视频的第 4 步之前插入「页面流水线」小节，写清四步：区块清单（`save_outline`）→ 拍板区块（`ask_user_question`）→ 写页面（`save_page`）→ 交付。

必须写明：页面**没有**分镜门禁，只有区块门禁；页面不需要 `beats`、`score_js`、`duration`；`save_page` 的 html 要内联全部样式与脚本。

- [ ] **Step 3: 视频段不动**

确认视频四步的正文一字未改（`git diff` 只应看到新增行）。

- [ ] **Step 4: 验证提示词**

```bash
cd plugin && node --input-type=module -e "
import { registerFlowSection } from './flow.js';
let t='';
registerFlowSection({ section: (s) => { t = s.text; return () => {}; } });
console.log('长度', t.length);
console.log('有判断段', t.includes('走页面流水线'));
console.log('有 save_outline', t.includes('save_outline'));
console.log('有 save_page', t.includes('save_page'));
console.log('视频分镜还在', t.includes('save_storyboard'));
console.log('有换线规则', t.includes('用户明确要求换才换'));
"
```
Expected: 五个 `true`，长度比改前增加

- [ ] **Step 5: 提交**

```bash
git add plugin/flow.js plugin/data.js
git commit -m "feat: 流程分岔，Agent 判断做视频还是页面"
```

---

## Task 7: 版式参考 `page.md`

**Files:**
- Create: `plugin/references/page.md`
- Modify: `plugin/data.js`（`REFERENCES` 加 `page`）
- Modify: `plugin/flow.js`（页面流水线路由表加一行）

**Interfaces:**
- Consumes: 无
- Produces: `get_reference("page")` 返回版式参考全文

- [ ] **Step 1: 写参考**

按现有 13 份的结构（原则 → 参数表 → 代码 → 常见错误 → 自检清单）写，覆盖：12 栏网格与最大宽度、间距阶梯（4/8/16/24/32/48/64/96）、区块类型（首屏/特性/案例/价格/页脚各自的构成）、三个断点（1440/834/390）的行为、对比度（正文 4.5:1，大字 3:1）、触控目标最小 44px。字数控制在 5000 字符上下，与现有参考同一量级。

- [ ] **Step 2: 注册**

`plugin/data.js` 的 `REFERENCES` 加 `page: '版式与页面结构'`；`plugin/flow.js` 的页面段路由表加 `| get_reference("page") | 写页面前。网格、间距、区块类型、断点、对比度 |`。

- [ ] **Step 3: 验证**

```bash
cd plugin && node --input-type=module -e "
import { registerCreationTools } from './tools.js';
const defs = new Map();
registerCreationTools({ tools: { register: (d) => { defs.set(d.name, d); return () => {}; } } });
const v = await defs.get('get_reference').execute({ name: 'page' });
console.log(v.title, v.body.length);
"
```
Expected: `版式与页面结构`，长度 > 4000

- [ ] **Step 4: 提交**

```bash
git add plugin/references/page.md plugin/data.js plugin/flow.js
git commit -m "docs: 版式参考 page.md"
```

---

## Task 8: 文档同步

**Files:**
- Modify: `docs/tools.md`、`docs/guide.md`、`README.md`

- [ ] **Step 1: `docs/tools.md`**

工具表加两行（`save_outline` 第 4 步、`save_page` 第 6 步），参数节各补一张参数表，风格与现有表格一致。

- [ ] **Step 2: `docs/guide.md`**

在「流程门禁」后加一小节「做视频还是做页面」，写判断规则与两条流水线的步骤对照表。

- [ ] **Step 3: `README.md`**

特性列表的「6 个工具」改成「8 个工具」，并加一条「**页面设计**：同一个模式里说「做个落地页」，产出双击就能打开的单文件页面」。

- [ ] **Step 4: 检查断链与数字**

```bash
cd /home/wyf/dsh-code-animation
python3 - <<'PY'
import re, os, glob
bad=[]
for f in ['README.md']+glob.glob('docs/*.md'):
    for m in re.finditer(r'\]\(([^)]+)\)', open(f,encoding='utf-8').read()):
        t=m.group(1).split('#')[0]
        if not t or t.startswith(('http','mailto:')): continue
        if not os.path.exists(os.path.normpath(os.path.join(os.path.dirname(f),t))): bad.append((f,t))
print('断链:', bad or '无')
PY
grep -rn "6 个工具\|六个工具" README.md docs/*.md | head
```
Expected: 断链无；无「6 个工具」残留

- [ ] **Step 5: 提交**

```bash
git add README.md docs
git commit -m "docs: 页面设计能力的说明"
```

---

## Task 9: 端到端自检

**Files:** 无改动，只验证

- [ ] **Step 1: 工具全部可调用**

```bash
cd plugin && node --test tools.test.mjs
```
Expected: 全绿

- [ ] **Step 2: 健康检查显示 8 个工具**

```bash
curl -s http://127.0.0.1:3080/code-animation-api/health
```
Expected: `"tools"` 数组含 `save_outline` 与 `save_page`，`"styles":333`

- [ ] **Step 3: 真实生成一个页面并打开**

用 `save_page` 造一个三区块页面（首屏/特性/页脚，含一个可点的 tab），把返回的 `url` 用浏览器打开，确认：能点、能滚、无控制台报错、断网后刷新仍然完整。

- [ ] **Step 4: 视频流水线没被破坏**

用 `save_animation` 存一个 3 秒动画，确认卡片能播、能导出 MP4。

- [ ] **Step 5: 提交（若有修正）**

```bash
git add -A && git commit -m "test: 页面与视频两条流水线端到端自检"
```
