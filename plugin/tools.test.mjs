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
  assert.match(v.id, /^pg-/);
  assert.equal(v.sections.length, 2);
  const saved = JSON.parse(readFileSync(join(OUTPUT_DIR, `${v.id}.json`), 'utf8'));
  assert.equal(saved.sections[0].name, '首屏');
});

test('save_outline 拒绝空 sections', async () => {
  const outline = toolsOf().get('save_outline');
  await assert.rejects(() => outline.execute({ title: 'x', sections: [] }), /区块/);
});
