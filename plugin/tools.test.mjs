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
