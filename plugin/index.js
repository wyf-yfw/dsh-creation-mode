/**
 * Host half of the Code Animation Studio bundle.
 *
 * The bundle is used twice, on purpose, with different configs:
 *   - once at the profile root (`tools: false`) to serve catalog assets and the
 *     animations the Agent wrote;
 *   - once inside the 创作模式 preset (`tools: true`) to mount the creation tools
 *     in the sessions created under that mode.
 *
 * Routes are profile-wide, so only the root row registers them; the preset row is
 * mounted per preset and would otherwise collide on the same prefix.
 */
import { appendFileSync, existsSync, mkdirSync, readFileSync, statSync, unlinkSync, writeFileSync } from 'node:fs';
import { isAbsolute, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { BUILD_REV, EXPORT_DIR_NAME, OUTPUT_DIR, STILLS_DIR, TOOL_NAMES, catalog, isApproved } from './data.js';
import { registerFlowSection } from './flow.js';
import { registerCreationTools } from './tools.js';

const PREFIX = '/code-animation-api';
const LOG_FILE = fileURLToPath(new URL('./api.log', import.meta.url));
/** Rendered clips reach the host as one body; 8s of 1080p is tens of megabytes. */
const EXPORT_MAX_BYTES = 512 * 1024 * 1024;

function trace(line) {
  try {
    appendFileSync(LOG_FILE, `${new Date().toISOString()} ${line}\n`);
  } catch {
    /* diagnostics must never break a request */
  }
}

function send(res, status, body, type) {
  res.writeHead(status, {
    'content-type': type || 'text/plain; charset=utf-8',
    'cache-control': 'no-store',
    'content-length': Buffer.byteLength(body),
  });
  res.end(body);
}

/** One exact id, no traversal: the id grammar is the allowlist. */
function safeId(raw) {
  const id = String(raw || '').split('?')[0];
  return /^[A-Za-z0-9_-]{1,80}$/.test(id) ? id : '';
}

/** Keep a client-supplied name to a single safe path segment. */
function safeFileName(raw, fallback) {
  const base = String(raw || '').split(/[\\/]/).pop() || '';
  const cleaned = base.replace(/[^\w.\-\u4e00-\u9fa5]+/g, '_').replace(/^[._]+/, '').slice(0, 120);
  return cleaned || fallback;
}

/**
 * Resolve where an export lands.
 *
 * The session directory is used when the caller supplies one, so the clip appears
 * beside the user's other files rather than inside the plugin package. A supplied
 * path is accepted only when it is absolute, already a directory, and the final
 * target stays inside it.
 */
function resolveExportDir(requested, fallbackRoot) {
  // If user explicitly picked a directory, honor it directly
  if (typeof requested === 'string' && requested.trim()) {
    const chosen = resolve(requested.trim());
    if (isAbsolute(chosen) && existsSync(chosen)) {
      try {
        if (statSync(chosen).isDirectory()) return chosen;
      } catch {}
    }
  }

  // Fallback to session working directory / code-animation
  if (typeof fallbackRoot === 'string' && fallbackRoot.trim()) {
    const root = resolve(fallbackRoot.trim());
    if (isAbsolute(root) && existsSync(root)) {
      try {
        if (statSync(root).isDirectory()) return join(root, EXPORT_DIR_NAME);
      } catch {}
    }
  }

  return join(OUTPUT_DIR, 'exports');
}

/**
 * 让动画在预览框里按原比例缩放到完整可见。
 *
 * 生成的动画多半把画布写成固定像素（`canvas{width:1280px;height:720px}`），而卡片
 * 里的预览框只有几百像素宽，于是 iframe 内部出现滚动条、画面被切掉。
 *
 * 补的这层样式只影响显示尺寸：canvas 的 width/height 属性（像素缓冲区）不动，
 * 所以 recordAnimation 走 captureStream 导出时拿到的仍是原始分辨率。
 *
 * 用 !important 是因为动画自己那条 `canvas{width:1280px}` 和本规则同等特异性，
 * 而它的 <style> 可能排在后面；不压制的话自适应会失效。
 */
const FIT_STYLE = [
  '<style data-creation-mode-fit>',
  'html,body{margin:0;padding:0;height:100%;overflow:hidden;background:#05070b}',
  'body{display:flex;align-items:center;justify-content:center}',
  'canvas{max-width:100%!important;max-height:100%!important;',
  'width:auto!important;height:auto!important;object-fit:contain}',
  '</style>',
].join('');

function fitToFrame(html) {
  if (/<\/head>/i.test(html)) return html.replace(/<\/head>/i, `${FIT_STYLE}</head>`);
  if (/<body[^>]*>/i.test(html)) return html.replace(/<body[^>]*>/i, (tag) => `${tag}${FIT_STYLE}`);
  return FIT_STYLE + html;
}

/** 导出目录里记录「本插件写过哪些成片」的清单，只用来删自己写过的文件。 */
const EXPORT_INDEX = '.creation-mode-exports.json';

/**
 * 只留成品：导出目录里也只保留这一次的成片。
 *
 * 只删清单里记过的、由本插件自己写出来的文件，用户放在同一目录的其他视频不会被碰。
 * 清单本身用点号开头，导出卡片里不会显示它。
 *
 * @returns 被删掉的旧成片文件名。
 */
function pruneExports(dir, keepName) {
  const index = join(dir, EXPORT_INDEX);
  let previous = [];
  try {
    const parsed = JSON.parse(readFileSync(index, 'utf8'));
    if (Array.isArray(parsed?.files)) previous = parsed.files.filter((n) => typeof n === 'string');
  } catch { /* 第一次导出：还没有清单 */ }

  const removed = [];
  for (const name of previous) {
    if (name === keepName) continue;
    const file = join(dir, name);
    if (!existsSync(file)) continue;
    try { unlinkSync(file); removed.push(name); } catch { /* 删不掉就留着 */ }
  }

  try {
    writeFileSync(index, JSON.stringify({ files: [keepName] }, null, 2), 'utf8');
  } catch { /* 清单写不了不影响导出本身 */ }
  return removed;
}

function readBody(req, limit) {
  return new Promise((resolvePromise, reject) => {
    const chunks = [];
    let size = 0;
    req.on('data', (chunk) => {
      size += chunk.length;
      if (size > limit) {
        reject(new Error(`请求体超过上限 ${Math.round(limit / 1048576)} MB`));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on('end', () => resolvePromise(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}

/**
 * No `inject` declaration: the same module is mounted twice with different configs,
 * and each placement only owns one half. Declaring either service would leave the
 * other placement waiting forever, so both are read lazily and each half no-ops
 * when its service is absent.
 */
export function apply(ctx, config = {}) {
  const withTools = config.tools !== false;
  const withRoutes = config.routes !== false;

  if (withTools) {
    // `ctx.inject` runs the callback once the service is present, and again if it is
    // replaced. Reading `ctx.get('tools')` directly races plugin activation order and
    // silently skips registration when the service is not ready yet.
    ctx.inject(['tools'], (scoped) => {
      scoped.effect(() => registerCreationTools({
        tools: scoped.tools,
        getAttachments: () => scoped.get('attachments'),
      }), 'code-animation-studio:tools');
    });

    // The staged flow is a policy, so it lives in the prompt rather than in a tool.
    ctx.inject(['systemPrompt'], (scoped) => {
      scoped.effect(() => registerFlowSection(scoped.systemPrompt), 'code-animation-studio:flow');
    });
  }

  if (withRoutes) {
    ctx.inject(['webServer'], (scoped) => {
      const handler = async (req, res) => {
        const url = req.url || '';
        try {
          if (url.startsWith(`${PREFIX}/health`) && req.method === 'GET') {
            return send(res, 200, JSON.stringify({
              ok: true,
              rev: BUILD_REV,
              tools: TOOL_NAMES,
              styles: catalog().styles.length,
              stills: catalog().styles.filter((s) => s.still).length,
            }), 'application/json; charset=utf-8');
          }

          // Rendered clips land where the user can find them, and the absolute path
          // is echoed back so the card can show exactly where the file went.
          if (url.startsWith(`${PREFIX}/export`) && req.method === 'POST') {
            const query = new URL(url, 'http://localhost').searchParams;
            const body = await readBody(req, EXPORT_MAX_BYTES);
            if (!body.length) {
              return send(res, 400, JSON.stringify({ error: '空文件' }), 'application/json; charset=utf-8');
            }

            const fallbackRoot = scoped.get('workingDirectory')?.defaultDirectory;
            const dir = resolveExportDir(query.get('dir'), fallbackRoot);
            const name = safeFileName(query.get('name'), `animation-${Date.now()}.mp4`);
            mkdirSync(dir, { recursive: true });
            const file = join(dir, name);
            writeFileSync(file, body);
            const removed = pruneExports(dir, name);
            trace(`export ${name} ${body.length}B -> ${file}${removed.length ? `（清理旧成片 ${removed.length} 个）` : ''}`);
            return send(res, 200, JSON.stringify({
              path: file,
              dir,
              bytes: body.length,
              removed,
            }), 'application/json; charset=utf-8');
          }

          // 样式库面板用的一次性目录快照：只给已上架的 333 种，含参考图地址。
          if (url.startsWith(`${PREFIX}/styles`) && req.method === 'GET') {
            const { series, styles } = catalog();
            const body = JSON.stringify({
              series: Object.entries(series || {}).map(([id, name]) => ({ id, name })),
              styles: styles.map((style) => ({
                id: style.id,
                name: style.name,
                en: style.en || '',
                series: style.series,
                seriesName: style.seriesName,
                category: style.category,
                description: style.desc,
                fit: style.fit,
                tags: style.tags || [],
                stillUrl: `${PREFIX}/still/${style.id}`,
              })),
            });
            res.writeHead(200, {
              'content-type': 'application/json; charset=utf-8',
              'content-length': Buffer.byteLength(body),
              'cache-control': 'no-store',
            });
            return res.end(body);
          }

          if (url.startsWith(`${PREFIX}/export-dir`) && req.method === 'GET') {
            const query = new URL(url, 'http://localhost').searchParams;
            const fallbackRoot = scoped.get('workingDirectory')?.defaultDirectory;
            return send(res, 200, JSON.stringify({
              dir: resolveExportDir(query.get('dir'), fallbackRoot),
            }), 'application/json; charset=utf-8');
          }

          // The model-written score is served as script text; the client compiles it
          // into a function and runs it against an OfflineAudioContext.
          if (url.startsWith(`${PREFIX}/score/`)) {
            const id = safeId(url.slice(`${PREFIX}/score/`.length));
            const file = id ? join(OUTPUT_DIR, `${id}.score.js`) : '';
            if (!file || !existsSync(file)) return send(res, 404, 'not found');
            const body = readFileSync(file, 'utf8');
            res.writeHead(200, {
              'content-type': 'text/javascript; charset=utf-8',
              'content-length': Buffer.byteLength(body),
              'cache-control': 'no-store',
            });
            return res.end(body);
          }

          if (url.startsWith(`${PREFIX}/still/`)) {
            const id = safeId(url.slice(`${PREFIX}/still/`.length));
            // Unpublished stills keep their file but are not served: a style the user
            // has not cleared must not leak through a hand-typed URL either.
            const file = id && isApproved({ id }) ? join(STILLS_DIR, `${id}.jpg`) : '';
            if (!file || !existsSync(file)) return send(res, 404, 'not found');
            const buf = readFileSync(file);
            res.writeHead(200, {
              'content-type': 'image/jpeg',
              'content-length': buf.length,
              'cache-control': 'public, max-age=86400, immutable',
            });
            return res.end(buf);
          }

          if (url.startsWith(`${PREFIX}/animation/`)) {
            const id = safeId(url.slice(`${PREFIX}/animation/`.length));
            const file = id ? join(OUTPUT_DIR, `${id}.html`) : '';
            // 旧稿会被清理（只留最新一版），所以历史卡片点开会落到这里：给一句话，
            // 而不是让 iframe 里空着显示 not found。
            if (!file || !existsSync(file)) {
              const gone = [
                '<!doctype html><meta charset="utf-8">',
                '<body style="margin:0;display:flex;align-items:center;justify-content:center;',
                'height:100vh;background:#111;color:#888;',
                'font:14px/1.6 system-ui,sans-serif;text-align:center">',
                '<div>这一版已经被清理<br><span style="font-size:12px;opacity:.6">',
                '工作区只保留最新的成品，请看对话里最新那张卡片</span></div></body>',
              ].join('');
              res.writeHead(404, {
                'content-type': 'text/html; charset=utf-8',
                'content-length': Buffer.byteLength(gone),
                'cache-control': 'no-store',
              });
              return res.end(gone);
            }
            const html = readFileSync(file, 'utf8');
            // 生成出来的动画常常把画布写死成 1280×720 或 1920×1080，塞进卡片那个
            // 几百像素宽的预览框就会溢出、出滚动条、画面看不全。这里统一补一层
            // 自适应样式：画布按原比例缩到框里，不再滚动。
            // 只改显示尺寸，canvas 的像素缓冲区不动，导出仍然是原始分辨率。
            const fitted = fitToFrame(html);
            res.writeHead(200, {
              'content-type': 'text/html; charset=utf-8',
              'content-length': Buffer.byteLength(fitted),
              'cache-control': 'no-store',
            });
            return res.end(fitted);
          }

          return send(res, 404, 'not found');
        } catch (error) {
          trace(`error ${req.method} ${url} :: ${error?.message || error}`);
          if (!res.headersSent) send(res, 500, error?.message || 'internal error');
          else res.end();
        }
      };

      scoped.effect(() => scoped.webServer.register({ kind: 'prefix', path: PREFIX, handler }),
        'code-animation-studio:routes');
    });
  }
}
