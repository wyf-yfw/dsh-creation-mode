import './test-env.mjs';
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

import { registerCreationTools } from './tools.js';
import { existsSync, readFileSync } from 'node:fs';
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
  assert.match(v.id, /^po-/);
  assert.equal(v.sections.length, 2);
  const saved = JSON.parse(readFileSync(join(OUTPUT_DIR, `${v.id}.json`), 'utf8'));
  assert.equal(saved.sections[0].name, '首屏');
});

test('save_outline 拒绝空 sections', async () => {
  const outline = toolsOf().get('save_outline');
  await assert.rejects(() => outline.execute({ title: 'x', sections: [] }), /区块/);
});

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

test('save_page 不会删掉区块清单', async () => {
  const t = toolsOf();
  const o = await t.get('save_outline').execute({ title: '共存', sections: [{ name: '首屏' }] });
  await t.get('save_page').execute({ title: '共存', outline_id: o.id, html: PAGE });
  assert.ok(existsSync(join(OUTPUT_DIR, `${o.id}.json`)), '页面保存后区块清单不应被删除');
});

test('save_outline 不会删掉已有页面', async () => {
  const t = toolsOf();
  const page = await t.get('save_page').execute({ title: '共存2', html: PAGE });
  await t.get('save_outline').execute({ title: '共存2', sections: [{ name: '首屏' }] });
  assert.ok(existsSync(join(OUTPUT_DIR, `${page.id}.html`)), '清单保存后页面不应被删除');
});

const bypasses = {
  '@import 字符串形式': '<style>@import "https://fonts.googleapis.com/css2?family=Inter";</style>',
  'CSS url() 外链': '<style>.a{background:url(https://x.test/a.png)}</style>',
  'img srcset 外链': '<img srcset="https://x.test/a.png 1x">',
  '协议相对地址': '<img src="//cdn.test/a.png">',
  '相对脚本': '<script src="app.js"></script>',
  'iframe 外链': '<iframe src="https://x.test/embed"></iframe>',
  'video source 外链': '<video><source src="https://x.test/a.mp4"></video>',
  '无引号 type=module': '<script type=module>export default 1</script>',
  '动态 import': '<script>import("https://x.test/m.js")</script>',
};

for (const [name, snippet] of Object.entries(bypasses)) {
  test(`拦下：${name}`, () => {
    const bad = snippet.includes('<script') || snippet.includes('<style') || snippet.includes('<img')
      ? ok.replace('</body>', `${snippet}</body>`).replace('</head>', snippet.includes('<style') ? `${snippet}</head>` : '</head>')
      : ok.replace('</body>', `${snippet}</body>`);
    assert.throws(() => assertPageable(bad), /页面/);
  });
}

test('data: 内联图片放行', () => {
  const inline = ok.replace('<section>a</section>', '<section><img src="data:image/png;base64,iVBORw0KGgo="></section>');
  assert.doesNotThrow(() => assertPageable(inline));
});

test('页内锚点链接放行', () => {
  const anchor = ok.replace('<section>a</section>', '<section><a href="#top">上</a></section>');
  assert.doesNotThrow(() => assertPageable(anchor));
});
