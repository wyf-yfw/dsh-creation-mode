/**
 * Creation-mode tools.
 *
 * The flow they support (enforced by flow.js, not by these tools):
 *   list_styles -> show_stills -> [用户拍板风格] -> get_style
 *   -> save_storyboard -> [用户拍板分镜] -> save_animation
 *
 * No second model call happens here: the Agent that already holds the user's
 * context is the one that authors the animation.
 */
import { existsSync, mkdirSync, readdirSync, readFileSync, statSync, unlinkSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import { KEEP_SAVES, OUTPUT_DIR, REFERENCES, REFERENCES_DIR, STILLS_DIR, VENDOR_DIR, catalog, defaultMusicFor, describe, searchStyles, styleById } from './data.js';

const MAX_HTML_BYTES = 2 * 1024 * 1024;
/** 原样收录的 motion-prompt 包（页面与界面用得上的五个）。 */
const MOVES_PACKS = ['motion', 'motion2', 'ui', 'lp', 'lp2'];
const MAX_STILLS_PER_CALL = 4;

/** Strip the wrappers a model habitually adds around a file body. */
function stripWrappers(text) {
  let body = String(text || '').trim();
  const fenced = /```(?:html|HTML)?\s*([\s\S]*?)```/.exec(body);
  if (fenced && fenced[1].includes('<')) body = fenced[1].trim();
  const start = body.search(/<!DOCTYPE html>|<html[\s>]/i);
  if (start > 0) body = body.slice(start);
  const end = body.toLowerCase().lastIndexOf('</html>');
  if (end >= 0) body = body.slice(0, end + '</html>'.length);
  return body.trim();
}

/**
 * Strip wrappers from model-written score code.
 *
 * The body is stored verbatim and later compiled in the browser, so it must be a bare
 * function body: no fences, no `function renderScore(...)` header, no `return`.
 */
function stripScore(text) {
  let body = String(text || '').trim();
  if (!body) return '';
  const fenced = /```(?:js|javascript|JS)?\s*([\s\S]*?)```/.exec(body);
  if (fenced) body = fenced[1].trim();

  // Accept a wrapped declaration and keep only its body.
  const wrapped = /(?:async\s+)?function\s+\w*\s*\([^)]*\)\s*\{([\s\S]*)\}\s*$/.exec(body);
  if (wrapped) body = wrapped[1].trim();

  // An arrow function with a block body.
  const arrow = /^(?:async\s*)?\([^)]*\)\s*=>\s*\{([\s\S]*)\}\s*$/.exec(body);
  if (arrow) body = arrow[1].trim();

  return body.trim();
}

/** Validate the contract the preview and exporter both rely on. */
function inspectHtml(html) {
  const problems = [];
  if (!/<html[\s>]/i.test(html)) problems.push('缺少 <html> 根元素');
  if (!/<canvas[\s>]/i.test(html)) problems.push('缺少 <canvas>（录制需要 canvas.captureStream）');
  if (/window\.renderAt\s*=/.test(html) === false) problems.push('缺少 window.renderAt = function(t)');
  if (/Math\.random\s*\(/.test(html)) problems.push('使用了 Math.random()，必须改为固定种子随机');
  if (/requestAnimationFrame\s*\(/.test(html)) problems.push('使用了 requestAnimationFrame 自播，导出需要关闭它');
  if (/<script[^>]+\bsrc=/i.test(html)) problems.push('引用了外部脚本');
  if (/<img[^>]+\bsrc\s*=\s*["']https?:/i.test(html)) problems.push('引用了外部图片');
  if (/<link[^>]+stylesheet/i.test(html)) problems.push('引用了外部样式表');
  return problems;
}

/** Does the document paint into a canvas the exporter can capture? */
function hasCanvas(html) {
  if (/<canvas[\s>]/i.test(html)) return true;
  // A page may create its canvas from script rather than markup.
  return /createElement\(\s*['"]canvas['"]\s*\)/i.test(html);
}

/**
 * Reject animations the exporter can never record.
 *
 * A DOM/CSS animation previews fine but cannot be captured frame by frame, so shipping
 * it only moves the failure to the export button. Failing here lets the Agent fix it in
 * the same turn instead.
 */
function assertRecordable(html) {
  if (!hasCanvas(html)) {
    throw new Error([
      '这段动画没有渲染到 <canvas>，无法逐帧录制，导出会失败。',
      '请改成纯 Canvas 2D 实现：页面里有一个可见的 <canvas>，所有画面用 ctx 绘制，',
      'window.renderAt(t) 负责把画面渲染到 t 时刻。',
      'DOM / CSS 做出来的动画（div、svg、文字排版动画）不能被 captureStream 捕获。',
    ].join(''));
  }
}

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

/**
 * 页面 HTML 的硬校验：用户会双击在浏览器里打开，file:// 下外链资源和
 * fetch / module 脚本都不工作，所以这里直接拦下，不靠提示词自觉。
 */
function assertPageable(html) {
  const body = String(html || '');
  if (!/<html[\s>]/i.test(body)) throw new Error('页面不是完整的 HTML 文档（缺 <html>）');
  if (PAGE_REMOTE.some((re) => re.test(body))) {
    throw new Error('页面里有外链资源（link/script/img/@import 指向 http(s)），离线打开会垮；改成内联');
  }
  if (PAGE_FILE_PROTOCOL.some((re) => re.test(body))) {
    throw new Error('页面用了 fetch / XMLHttpRequest / type="module"，file:// 下会失败；改成内联脚本');
  }
}

/** 页面里不致命、但值得提醒的问题。 */
function inspectPage(html) {
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

function slug(input) {
  const base = String(input || 'animation')
    .toLowerCase()
    .replace(/[^\w-]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40);
  return base || 'animation';
}

function round(value, digits = 2) {
  const factor = 10 ** digits;
  return Math.round(Number(value) * factor) / factor;
}

/**
 * 只留成品：一次创作只保留最近一次保存，不留中间稿。
 *
 * 动画是 `anim-<title>-<ts>.{html,score.js,json}`，分镜是 `sb-<title>-<ts>.json`，
 * 同一个前缀下的文件按 id 归组，除这次刚存的 `keepId` 外，最多再留 KEEP_SAVES-1 份。
 *
 * `keepId` 直接算在名额里，所以 KEEP_SAVES = 1 就是「只留这一次」。这一点很重要：
 * 清理发生在落盘之前还是之后都不影响结果，也不会因为两次保存落在同一毫秒
 * （mtime 相同、排序谁前谁后说不准）而多留一份。
 *
 * @returns 被删掉的文件名，用于在工具返回值里如实说明。
 */
function pruneSaves(prefix, keepId) {
  let names = [];
  try { names = readdirSync(OUTPUT_DIR); } catch { return []; }

  const sets = new Map();
  for (const name of names) {
    if (!name.startsWith(prefix)) continue;
    const matched = /^(.+?)\.(html|score\.js|json)$/.exec(name);
    if (!matched) continue;
    const id = matched[1];
    const entry = sets.get(id) || { id, mtime: 0 };
    try { entry.mtime = Math.max(entry.mtime, statSync(join(OUTPUT_DIR, name)).mtimeMs); } catch { /* 读不到时间就按 0 算 */ }
    sets.set(id, entry);
  }

  const older = [...sets.values()]
    .filter((entry) => entry.id !== keepId)
    .sort((a, b) => b.mtime - a.mtime || b.id.localeCompare(a.id));
  const keep = new Set([keepId, ...older.slice(0, Math.max(0, KEEP_SAVES - 1)).map((x) => x.id)]);

  const removed = [];
  for (const id of sets.keys()) {
    if (keep.has(id)) continue;
    for (const ext of ['.html', '.score.js', '.json']) {
      const file = join(OUTPUT_DIR, `${id}${ext}`);
      if (!existsSync(file)) continue;
      try { unlinkSync(file); removed.push(`${id}${ext}`); } catch { /* 删不掉就留着，不影响这次保存 */ }
    }
  }
  return removed;
}

/** 最近一次保存的 id，用作 base 兜底（旧稿已被清理时仍能返工）。 */
function latestSave(prefix, ext) {
  try {
    let best = '';
    let bestTime = -1;
    for (const name of readdirSync(OUTPUT_DIR)) {
      if (!name.startsWith(prefix) || !name.endsWith(ext)) continue;
      let mtime = 0;
      try { mtime = statSync(join(OUTPUT_DIR, name)).mtimeMs; } catch { /* 忽略 */ }
      if (mtime > bestTime) { bestTime = mtime; best = name.slice(0, -ext.length); }
    }
    return best;
  } catch {
    return '';
  }
}

/**
 * Phrases that make on-screen copy read as machine-written.
 *
 * These are warnings, never blocks: a line can quote one of them on purpose, and the
 * model judges that. They exist because the prompt's ban list only works if the draft
 * reports back when it was ignored.
 */
const AI_TELLS = [
  '赋能', '闭环', '抓手', '颗粒度', '链路', '矩阵', '生态位',
  '综上所述', '值得一提的是', '让我们一起', '前所未有',
  '极致', '震撼', '惊艳', '颠覆', '化繁为简', '由浅入深', '层层递进',
];

/** Characters a viewer can comfortably read per second in a subtitle. */
const CHARS_PER_SECOND = 5.5;

/**
 * Check a shot list for the mistakes that make a storyboard unusable.
 * @returns warnings plus the total covered seconds; warnings render on the card.
 */
function inspectShots(shots, duration) {
  const warnings = [];
  if (!Array.isArray(shots) || shots.length === 0) {
    return { warnings: ['分镜为空'], totalSeconds: 0 };
  }

  const ordered = [...shots].sort((a, b) => Number(a.start) - Number(b.start));
  let cursor = 0;
  let covered = 0;

  for (const [index, shot] of ordered.entries()) {
    const start = Number(shot.start);
    const end = Number(shot.end);
    const label = `第 ${index + 1} 场`;

    if (!Number.isFinite(start) || !Number.isFinite(end)) {
      warnings.push(`${label}的起止时间不是数字`);
      continue;
    }
    if (end <= start) warnings.push(`${label}的结束时间不大于开始时间`);
    if (start < -0.001) warnings.push(`${label}开始时间早于 0`);
    if (end > duration + 0.001) warnings.push(`${label}超出总时长 ${duration}s`);
    if (start > cursor + 0.05) warnings.push(`${label}与上一场之间有 ${round(start - cursor)}s 空档`);
    if (start < cursor - 0.05) warnings.push(`${label}与上一场时间重叠`);
    if (!String(shot.scene || '').trim()) warnings.push(`${label}没有写画面内容`);

    // On-screen copy is read once, at speed. A line that outlasts its shot is the
    // most common reason a draft feels rushed, so it is measured, not left to taste.
    const caption = String(shot.text || '').trim();
    if (caption) {
      const span = Math.max(0, end - start);
      const limit = Math.max(4, Math.ceil(span * CHARS_PER_SECOND));
      if (caption.length > limit) {
        warnings.push(`${label}字幕 ${caption.length} 字，${round(span)}s 的镜头最多约 ${limit} 字，删到只剩一件事`);
      }
      const tells = AI_TELLS.filter((word) => caption.includes(word));
      if (tells.length) warnings.push(`${label}字幕有套话「${tells.join('、')}」，换成具体的东西`);
    }

    cursor = Math.max(cursor, end);
    covered += Math.max(0, end - start);
  }

  if (ordered.length < 2) warnings.push('只有 1 场：分镜至少拆成 3 场才有节奏');
  if (Math.abs(covered - duration) > 0.15) {
    warnings.push(`各场时长合计 ${round(covered)}s，与总时长 ${duration}s 不一致`);
  }
  if (cursor < duration - 0.15) {
    warnings.push(`最后一场在 ${round(cursor)}s 结束，距总时长 ${duration}s 还差 ${round(duration - cursor)}s`);
  }

  return { warnings, totalSeconds: round(covered) };
}

/**
 * Resolve which score a clip should carry.
 *
 * An explicit request wins; otherwise the style implies a mood, so a Chinese-ink piece
 * and a cyberpunk piece do not end up with the same bed.
 * @param requested - the caller's `music` argument, if any.
 * @param style - the chosen style, when known.
 * @returns a preset id, or the caller's own free-form score description.
 */
function resolveMusic(requested, style) {
  const wanted = String(requested || '').trim();
  if (['none', 'off', '无', '无配乐', 'mute', '静音'].includes(wanted.toLowerCase())) return 'none';
  // Allow completely unrestricted, tailored music prompt descriptions
  if (wanted) return wanted;
  if (style) return defaultMusicFor(style);
  return '贴合画面风格与分镜剧情的专属卡点配乐';
}

/**
 * Register the creation tools.
 * @param deps - `{ tools, attachments }` from the realm that owns them. `tools` is
 *   required; `attachments` is optional and only disables inline reference stills,
 *   which then fall back to their URLs.
 */
export function registerCreationTools(deps) {
  const { tools } = deps || {};
  if (!tools) throw new Error('registerCreationTools needs the tools registry');
  // A getter is preferred so an attachments service that arrives after activation is
  // still picked up; a plain object keeps the simple call sites working.
  const attachmentsOf = typeof deps.getAttachments === 'function'
    ? deps.getAttachments
    : () => deps.attachments;
  const disposers = [];

  disposers.push(tools.register({
    name: 'get_reference',
    description: [
      '取一份工艺参考：缓动、转场、排版、调色、音画同步、音色配方、文案标准。',
      '这些是写画面和配乐的具体做法，按需加载，不占每轮的上下文。',
      '写动画之前至少取 motion；画面里有中文标题取 typography；要片子感取 color；',
      '写 score_js 之前取 timbre 和 audio；写分镜文案之前取 copy。',
      '同一份取过一次就不必再取。',
    ].join('\n'),
    parameters: {
      type: 'object',
      properties: {
        name: {
          type: 'string',
          description: '参考名：motion / transitions / typography / color / audio / timbre / copy。',
        },
      },
      required: ['name'],
      additionalProperties: false,
    },
    output: {
      schema: {
        type: 'object',
        properties: {
          name: { type: 'string' },
          title: { type: 'string' },
          body: { type: 'string', description: '参考全文（Markdown）。' },
        },
        required: ['name', 'title', 'body'],
        additionalProperties: false,
      },
      render: (_args, value) => [{ type: 'text', text: value.body }],
      presentationMeta: (_args, value) => value,
    },
    async execute(args) {
      const raw = String(args?.name || '').trim().toLowerCase();
      if (!raw) {
        throw new Error(`没有这份参考。可用：${Object.keys(REFERENCES).join(' / ')}，`
          + '或 moves/<pack>、moves/<pack>/code 取上游词表的完整数据与代码。');
      }

      // moves/<pack> 与 moves/<pack>/code：直接返回上游原文件，不做任何改写。
      const parts = raw.split('/');
      if (parts[0] === 'moves' && parts.length >= 2) {
        const pack = parts[1];
        if (!MOVES_PACKS.includes(pack)) {
          throw new Error(`没有这个包：${pack}。可用：${MOVES_PACKS.join(' / ')}`);
        }
        if (parts.length > 3 || (parts[2] !== undefined && parts[2] !== 'code')) {
          throw new Error(`子路径只能是 code：moves/${pack} 或 moves/${pack}/code`);
        }
        const wantCode = parts[2] === 'code';
        const file = join(VENDOR_DIR, 'motion-prompt', pack, wantCode ? 'pack.js' : 'meta.json');
        let body;
        try {
          body = readFileSync(file, 'utf8');
        } catch {
          throw new Error(`上游文件缺失：vendor/motion-prompt/${pack}/${wantCode ? 'pack.js' : 'meta.json'}`);
        }
        return {
          name: raw,
          title: wantCode ? `motion-prompt/${pack} 实现代码` : `motion-prompt/${pack} 完整数据`,
          body,
        };
      }

      const hit = REFERENCES[raw];
      if (!hit) {
        throw new Error(`没有这份参考：${raw}。可用：${Object.keys(REFERENCES).join(' / ')}，`
          + `或 moves/<pack>（${MOVES_PACKS.join(' / ')}）。`);
      }
      let body;
      try {
        body = readFileSync(join(REFERENCES_DIR, `${raw}.md`), 'utf8');
      } catch {
        throw new Error(`参考文件缺失：references/${raw}.md`);
      }
      return { name: raw, title: hit, body };
    },
  }));

  disposers.push(tools.register({
    name: 'list_styles',
    description: [
      `在 ${catalog().styles.length} 种代码动画风格里检索。用户说出气质、题材或编号时先调用它。`,
      '返回每条风格的编号、名称、系列、适用题材、是否有参考静帧，以及完整风格提示词。',
      '检索结果只是候选清单：挑出 2–3 条之后，必须再用 show_stills 把画面给用户看。',
      '选择规则：用户给了编号就精确匹配；只描述气质时挑 2–3 条最匹配的说明理由。',
      '不要把多条风格的约束机械叠加：主画风、运动方式、版式各选一条，各自负责一件事。',
    ].join('\n'),
    parameters: {
      type: 'object',
      properties: {
        query: {
          type: 'string',
          description: '自然语言描述或编号。可以整句照搬用户说法（「赛博朋克霓虹街景」「像素小游戏开场」），会按词分别匹配并按命中词数排序；也可以直接给编号（「B3」「B3 A1」），此时只在编号里查。留空则按目录顺序浏览。',
        },
        series: {
          type: 'string',
          description: '限定系列：AG（代码样片）、M（动态风格）、K（卡通画风）、Z（中国风）、H（现成版式）、L（Lemo-Opuscar）、V（mg-styles-15）、X（code-video）、R（照参考学来的）、O（奥斯卡 98 部）。',
        },
        limit: { type: 'integer', description: '返回条数，默认 12，最多 50。', minimum: 1, maximum: 50 },
      },
      additionalProperties: false,
    },
    output: {
      schema: {
        type: 'object',
        properties: {
          total: { type: 'integer' },
          styles: { type: 'array', items: { type: 'object', additionalProperties: true } },
        },
        required: ['total', 'styles'],
        additionalProperties: false,
      },
      render: (_args, value) => [{
        type: 'text',
        text: value.styles.length
          ? value.styles.map((s) => `${s.id} ${s.name}（${s.seriesName}）｜${s.description}${s.hasStill ? '｜有参考静帧' : ''}`).join('\n')
            + '\n\n下一步：用 show_stills 把候选的画面给用户看，然后再让用户选。'
          : '没有匹配的风格',
      }],
      presentationMeta: (_args, value) => ({ styles: value.styles }),
    },
    async execute(args) {
      const { styles } = catalog();
      const found = searchStyles(args?.query, { series: args?.series, limit: args?.limit });
      return { total: styles.length, styles: found.map(describe) };
    },
  }));

  disposers.push(tools.register({
    name: 'show_stills',
    description: [
      '把选定风格的参考静帧作为图片贴进对话，让用户先看到画面再决定用哪一条。',
      '推荐风格之后必须调用它：只靠文字描述，用户没法判断风格合不合口味。',
      `一次最多贴 ${MAX_STILLS_PER_CALL} 张，通常给 2–3 条候选就够。没有参考静帧的风格会如实标出，此时用文字描述画面。`,
      '贴完图就停下来等用户选，不要接着往下做。',
    ].join('\n'),
    parameters: {
      type: 'object',
      properties: {
        ids: {
          type: 'array',
          items: { type: 'string' },
          description: '要展示的风格编号，如 ["B3","A1"]。',
        },
        note: { type: 'string', description: '一句话说明为什么给这几条，会显示在图片上方。' },
      },
      required: ['ids'],
      additionalProperties: false,
    },
    output: {
      schema: {
        type: 'object',
        properties: {
          shown: { type: 'array', items: { type: 'object', additionalProperties: true } },
          missing: { type: 'array', items: { type: 'string' } },
          unpublished: { type: 'array', items: { type: 'string' } },
          note: { type: 'string' },
        },
        required: ['shown', 'missing'],
        additionalProperties: false,
      },
      render: (_args, value) => {
        const blocks = [];
        const lines = [];
        if (value.note) lines.push(value.note);
        for (const item of value.shown) {
          lines.push(`${item.id} ${item.name}｜${item.description}`);
          if (item.attachment) blocks.push({ type: 'image', attachment: item.attachment });
        }
        if (value.unpublished && value.unpublished.length) {
          lines.push(`参考图还没上架：${value.unpublished.join('、')}（暂时不能用，等补图后再选）`);
        }
        if (value.missing.length) {
          lines.push(`没有参考静帧：${value.missing.join('、')}（这几条请用文字描述画面）`);
        }
        return [{ type: 'text', text: lines.join('\n') }, ...blocks];
      },
      presentationMeta: (_args, value) => ({
        shown: value.shown.map(({ attachment, ...rest }) => rest),
        missing: value.missing,
        unpublished: value.unpublished,
        // The inline Tool view renders the reason the Agent gave for these candidates.
        note: value.note,
      }),
    },
    async execute(args) {
      const ids = Array.isArray(args?.ids) ? args.ids.slice(0, MAX_STILLS_PER_CALL) : [];
      if (!ids.length) throw new Error('ids 不能为空');
      const shown = [];
      const missing = [];
      // A style that exists but has no published still is reported apart from an id
      // that does not exist at all: the first is "not ready yet", the other is a typo.
      const unpublished = [];

      for (const raw of ids) {
        const key = String(raw).trim().toUpperCase();
        const style = styleById(raw);
        if (!style) {
          const known = styleById(key) || catalog().styles.find((s) => s.id === key);
          if (!known && existsSync(join(STILLS_DIR, `${key}.jpg`))) unpublished.push(key);
          else missing.push(String(raw));
          continue;
        }
        if (!style.still) { missing.push(`${style.id} ${style.name}`); continue; }

        let attachment;
        const attachments = attachmentsOf();
        if (attachments) {
          try {
            const data = readFileSync(join(STILLS_DIR, `${style.id}.jpg`));
            attachment = await attachments.saveImage({
              data,
              mediaType: 'image/jpeg',
              name: `${style.id}-${style.name}.jpg`,
            });
          } catch {
            attachment = undefined; // the URL form below still tells the user which style it is
          }
        }
        shown.push({
          id: style.id,
          name: style.name,
          description: style.desc,
          seriesName: style.seriesName,
          ...(attachment ? { attachment } : {}),
          url: `/code-animation-api/still/${style.id}`,
        });
      }

      if (!shown.length) {
        throw new Error(unpublished.length
          ? `这些风格的参考图还没上架：${unpublished.join('、')}，暂时不能选；请从有图的风格里挑。`
          : `这些编号没有可展示的静帧：${missing.join('、')}`);
      }
      return { shown, missing, unpublished, note: String(args?.note || '') };
    },
  }));

  disposers.push(tools.register({
    name: 'get_style',
    description: '读取某一条风格的完整提示词与参考静帧信息。用户拍板风格后、出分镜之前调用它。',
    parameters: {
      type: 'object',
      properties: { id: { type: 'string', description: '风格编号，如 B3、A1、O96。' } },
      required: ['id'],
      additionalProperties: false,
    },
    output: {
      schema: {
        type: 'object',
        properties: {
          id: { type: 'string' },
          name: { type: 'string' },
          prompt: { type: 'string' },
          description: { type: 'string' },
          stillUrl: { type: 'string', description: '参考静帧地址；没有静帧时是空字符串。' },
          series: { type: 'string' },
          seriesName: { type: 'string' },
          // describe() 还会返回这些字段；漏声明会让模型看不到它们（如 promptChars）
          category: { type: 'string' },
          fit: { type: 'string' },
          tags: { type: 'array', items: { type: 'string' } },
          hasStill: { type: 'boolean' },
          promptChars: { type: 'integer' },
          music: { type: 'string', description: '该风格默认的配乐预设。' },
        },
        required: ['id', 'name', 'prompt'],
        additionalProperties: true,
      },
      render: (_args, value) => [{
        type: 'text',
        text: `${value.id} ${value.name}\n\n${value.prompt || value.description || ''}\n\n下一步：按这条规范拆 3–8 个镜头，用 save_storyboard 出分镜草稿，等用户拍板。`,
      }],
      presentationMeta: (_args, value) => value,
    },
    async execute(args) {
      const style = styleById(args?.id);
      if (!style) {
        const near = searchStyles(args?.id, { limit: 3 }).map((s) => s.id);
        throw new Error(`没有编号为 ${args?.id} 的风格${near.length ? `，相近的有：${near.join('、')}` : ''}`);
      }
      return describe(style);
    },
  }));

  disposers.push(tools.register({
    name: 'save_storyboard',
    description: [
      '提交分镜草稿，在对话里渲染成可逐场审阅的分镜表。',
      '每个镜头写清起止时间、画面内容、画面上的文字、运镜与转场。',
      '分镜要覆盖开头、中段、结尾，各场时间合计等于总时长。',
      '这一步不写动画代码。提交后停下来等用户拍板：加场、删场、改时长、改文案，改完重新提交。',
    ].join('\n'),
    parameters: {
      type: 'object',
      properties: {
        title: { type: 'string', description: '这个片子叫什么。' },
        style_id: { type: 'string', description: '已拍板的风格编号。' },
        duration: { type: 'number', description: '总时长（秒）。' },
        fps: { type: 'integer', description: '帧率，默认 30。' },
        aspect: { type: 'string', description: '画幅。', enum: ['16:9', '9:16', '1:1'] },
        music: {
          type: 'string',
          description: '配乐风格与氛围定制提示词，根据画面风格与剧情转折自由生成（如：国风空灵古筝起步，2.5秒大堂鼓卡点爆发，4秒转入琵琶扫弦高潮）。没有预设限制，留空则自动按风格匹配。',
        },
        shots: {
          type: 'array',
          description: '镜头列表，按时间顺序。每个镜头的起始点会自动作为音乐切点卡点。',
          items: {
            type: 'object',
            properties: {
              start: { type: 'number', description: '开始时间（秒）。' },
              end: { type: 'number', description: '结束时间（秒）。' },
              scene: { type: 'string', description: '画面内容：谁、在哪、在做什么。' },
              text: { type: 'string', description: '画面上出现的文字原文，没有就留空。' },
              camera: { type: 'string', description: '运镜与转场，如「慢推」「硬切」「横向滑入」。' },
              cues: {
                type: 'array',
                description: '该镜头内部的重点视觉动作与卡点时间（如文字砸落、数字翻转、粒子爆发瞬间）。',
                items: {
                  type: 'object',
                  properties: {
                    time: { type: 'number', description: '卡点精确秒数' },
                    type: { type: 'string', description: '声音类型：impact(重击)/drop(跌落低音)/hit(打击)/rise(聚气扫频)/whoosh(呼啸)' },
                    label: { type: 'string', description: '动作描述，如「数字冲顶」' },
                  },
                  required: ['time'],
                  additionalProperties: false,
                },
              },
            },
            required: ['start', 'end', 'scene'],
            additionalProperties: false,
          },
        },
      },
      required: ['title', 'duration', 'shots'],
      additionalProperties: false,
    },
    output: {
      schema: {
        type: 'object',
        properties: {
          id: { type: 'string' },
          title: { type: 'string' },
          styleId: { type: 'string' },
          styleName: { type: 'string' },
          duration: { type: 'number' },
          fps: { type: 'integer' },
          aspect: { type: 'string' },
          music: { type: 'string' },
          totalSeconds: { type: 'number' },
          shots: { type: 'array', items: { type: 'object', additionalProperties: true } },
          warnings: { type: 'array', items: { type: 'string' } },
        },
        required: ['id', 'title', 'duration', 'fps', 'aspect', 'music', 'shots', 'warnings'],
        additionalProperties: false,
      },
      render: (_args, value) => [{
        type: 'text',
        text: [
          `分镜草稿「${value.title}」${value.styleId ? `（${value.styleId} ${value.styleName || ''}）` : ''}：${value.shots.length} 场 / ${value.duration}s`,
          ...value.shots.map((s, i) => `${i + 1}. ${s.start}–${s.end}s｜${s.scene}${s.text ? `｜字幕「${s.text}」` : ''}${s.camera ? `｜${s.camera}` : ''}`),
          value.warnings.length ? `\n需要留意：${value.warnings.join('；')}` : '',
          `\n分镜 id：${value.id}　配乐：${value.music}`,
          '请用户审这份分镜：要不要加场、删场、改时长、改文案。拍板之前不要开始写动画。',
        ].filter(Boolean).join('\n'),
      }],
      presentationMeta: (_args, value) => value,
    },
    async execute(args) {
      const shots = Array.isArray(args?.shots) ? args.shots : [];
      if (!shots.length) throw new Error('shots 不能为空');
      const duration = Math.max(1, Math.min(Number(args?.duration) || 8, 300));
      const fps = Math.max(1, Math.min(Number(args?.fps) || 30, 60));
      const aspect = ['16:9', '9:16', '1:1'].includes(args?.aspect) ? args.aspect : '16:9';
      const style = args?.style_id ? styleById(args.style_id) : undefined;
      const { warnings, totalSeconds } = inspectShots(shots, duration);
      const music = resolveMusic(args?.music, style);

      // 同一毫秒内保存两次会撞 id，后一份会覆盖前一份：探测到空闲的名字为止。
      const stem = `sb-${slug(args?.title)}-${Date.now().toString(36)}`;
      let id = stem;
      for (let n = 2; existsSync(join(OUTPUT_DIR, `${id}.json`)); n++) id = `${stem}-${n}`;
      const storyboard = {
        id,
        title: String(args?.title || '分镜'),
        styleId: style ? style.id : '',
        styleName: style ? style.name : '',
        duration,
        fps,
        aspect,
        music,
        totalSeconds,
        shots: shots.map((s, i) => ({
          index: i + 1,
          start: round(Number(s.start) || 0),
          end: round(Number(s.end) || 0),
          scene: String(s.scene || ''),
          text: String(s.text || ''),
          camera: String(s.camera || ''),
          cues: Array.isArray(s.cues) ? s.cues.map((c) => ({
            time: round(Number(c.time) || 0),
            type: String(c.type || 'hit'),
            label: String(c.label || ''),
          })) : [],
        })),
        warnings,
      };

      mkdirSync(OUTPUT_DIR, { recursive: true });

      // 只留成品：分镜也只保留最新这一份，改一次覆盖一次，不堆中间稿。
      // 先清理再落盘，这样新分镜的 warnings 里能如实写上清了几个文件。
      const removed = pruneSaves('sb-', id);
      if (removed.length) storyboard.warnings = [...warnings, `已清理 ${removed.length} 个旧分镜文件，只保留这一份`];

      writeFileSync(join(OUTPUT_DIR, `${id}.json`), JSON.stringify(storyboard, null, 2), 'utf8');
      return storyboard;
    },
  }));

  disposers.push(tools.register({
    name: 'save_outline',
    description: [
      '提交页面区块清单草稿，在对话里渲染成可逐块审阅的结构表。',
      '页面没有时间轴，所以不写秒数：写清每一块说什么、放什么、什么版式、文案原文。',
      '区块要覆盖首屏到页脚，从用户第一眼看到的内容开始。',
      '这一步不写页面代码。提交后停下来等用户拍板：加块、删块、改文案、调顺序，改完重新提交。',
    ].join('\n'),
    parameters: {
      type: 'object',
      properties: {
        title: { type: 'string', description: '这个页面叫什么。' },
        style_id: { type: 'string', description: '已拍板的风格编号。' },
        aspect: { type: 'string', description: '画幅。页面一般用 16:9（桌面），移动端优先用 9:16。', enum: ['16:9', '9:16', '1:1'] },
        sections: {
          type: 'array',
          description: '区块列表，按页面从上到下的顺序。',
          items: {
            type: 'object',
            properties: {
              name: { type: 'string', description: '区块名，如「首屏」「特性」「价格」「页脚」。' },
              purpose: { type: 'string', description: '这一块要达成什么，一句话。' },
              content: { type: 'string', description: '放什么内容：标题、图片、卡片、表格、按钮。' },
              layout: { type: 'string', description: '版式：居中、左右分栏、三列网格、全宽等。' },
              text: { type: 'string', description: '这一块出现的文字原文，没有就留空。' },
            },
            required: ['name'],
            additionalProperties: false,
          },
        },
      },
      required: ['title', 'sections'],
      additionalProperties: false,
    },
    output: {
      schema: {
        type: 'object',
        properties: {
          id: { type: 'string' },
          title: { type: 'string' },
          styleId: { type: 'string' },
          styleName: { type: 'string' },
          aspect: { type: 'string' },
          sections: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                index: { type: 'integer' },
                name: { type: 'string' },
                purpose: { type: 'string' },
                content: { type: 'string' },
                layout: { type: 'string' },
                text: { type: 'string' },
              },
              required: ['index', 'name'],
              additionalProperties: false,
            },
          },
          warnings: { type: 'array', items: { type: 'string' } },
        },
        required: ['id', 'title', 'sections'],
        additionalProperties: false,
      },
      render: (_args, value) => [{
        type: 'text',
        text: [
          `已生成页面区块清单「${value.title}」${value.styleId ? `（${value.styleId} ${value.styleName || ''}）` : ''}`,
          `共 ${value.sections.length} 块：${value.sections.map((s) => s.name).join(' / ')}`,
          value.warnings.length ? `注意：${value.warnings.join('；')}` : '',
          '请用户审这份区块清单：加块、删块、改文案、调顺序。拍板之前不要写页面。',
        ].filter(Boolean).join('\n'),
      }],
      presentationMeta: (_args, value) => value,
    },
    async execute(args) {
      const sections = Array.isArray(args?.sections) ? args.sections : [];
      if (!sections.length) throw new Error('区块清单不能为空：至少要有一块');
      const aspect = ['16:9', '9:16', '1:1'].includes(args?.aspect) ? args.aspect : '16:9';
      const style = args?.style_id ? styleById(args.style_id) : undefined;
      const warnings = [];
      if (!style) warnings.push('没有关联风格：这版页面未经风格拍板');
      if (sections.length < 3) warnings.push('区块少于 3 块，页面可能显得单薄');

      // 区块清单用 po- 前缀：页面是 pg-，两者不能共用前缀，否则 pruneSaves 会互相删。
      const stem = `po-${slug(args?.title)}-${Date.now().toString(36)}`;
      let id = stem;
      for (let n = 2; existsSync(join(OUTPUT_DIR, `${id}.json`)); n++) id = `${stem}-${n}`;

      const outline = {
        id,
        title: String(args?.title || '页面'),
        styleId: style ? style.id : '',
        styleName: style ? style.name : '',
        aspect,
        sections: sections.map((sec, i) => ({
          index: i + 1,
          name: String(sec.name || ''),
          purpose: String(sec.purpose || ''),
          content: String(sec.content || ''),
          layout: String(sec.layout || ''),
          text: String(sec.text || ''),
        })),
        warnings,
      };

      mkdirSync(OUTPUT_DIR, { recursive: true });
      const removed = pruneSaves('po-', id);
      if (removed.length) outline.warnings = [...warnings, `已清理 ${removed.length} 个旧区块清单，只保留这一份`];
      writeFileSync(join(OUTPUT_DIR, `${id}.json`), JSON.stringify(outline, null, 2), 'utf8');
      return outline;
    },
  }));

  disposers.push(tools.register({
    name: 'save_animation',
    description: [
      '把一段动画 HTML 存到工作区，并在对话里渲染成可播放、可导出视频的动画卡片。',
      '调用前应当已经完成：风格拍板（get_style）与分镜拍板（save_storyboard）。把分镜 id 传进 storyboard_id，卡片会带上分镜信息。',
      'HTML 必须满足：单个完整文件、只含原生 HTML/JS/Canvas、不引用任何外部库或图片、实现 window.renderAt(t)（t 为秒，同一 t 渲染同一帧）、使用固定种子随机、不启用 requestAnimationFrame 自播。',
      '生成后用 renderAt 检查首帧、中段、尾帧，确认不是黑屏或静止。',
      '每次保存都会覆盖上一版：工作区里只留最新这一份动画（html + 配乐 + 元数据），旧稿自动删除，不要指望旧版文件还在。',
    ].join('\n'),
    parameters: {
      type: 'object',
      properties: {
        title: { type: 'string', description: '这个动画叫什么，用于卡片标题和文件名。' },
        style_id: { type: 'string', description: '采用的风格编号，如 B3。' },
        storyboard_id: { type: 'string', description: '已拍板的分镜 id（save_storyboard 的返回值）。' },
        music: {
          type: 'string',
          description: '配乐风格定制提示词（如：国风水墨意境、赛博重低音电子、史诗管弦、轻快动感等），留空则自动从分镜或风格继承，无任何固定预设限制。',
        },
        cues: {
          type: 'array',
          description: '全片精确卡点列表（秒数与事件类型），除镜头切点外，镜头内部的关键视觉重点（文字砸下、数据爆发、粒子聚散）在此标注，配乐会在该时间触发重音。',
          items: {
            type: 'object',
            properties: {
              time: { type: 'number', description: '精确时间点（秒）' },
              type: { type: 'string', description: '声音类型：impact/drop/hit/rise/whoosh' },
              label: { type: 'string', description: '事件名称' },
            },
            required: ['time'],
            additionalProperties: false,
          },
        },
        beats: {
          type: 'array',
          description: [
            '从你自己写的动画代码里导出的精确节奏点，这是卡点最可靠的来源。',
            '写动画时你就知道每个元素在第几秒出现、哪一帧爆发，把那些时刻抄到这里。',
            '每项 { time, type, label, power }：time 是精确秒数（可以带小数，如 2.87）；',
            'type 是 impact（重击）/ rise（起势）/ drop（下坠）/ hit（轻点）/ swell（渐强）；',
            'label 写清对应画面里发生了什么，如「故障闪烁峰值」「中文标题砸下」；',
            'power 是 0–1 的强度。',
            '这些时间点会传给配乐代码，卡点位置不必再猜。',
          ].join(''),
          items: {
            type: 'object',
            properties: {
              time: { type: 'number', description: '精确秒数，可带小数' },
              type: { type: 'string', description: 'impact / rise / drop / hit / swell' },
              label: { type: 'string', description: '画面里发生了什么' },
              power: { type: 'number', description: '强度 0–1，默认 0.8' },
            },
            required: ['time'],
            additionalProperties: false,
          },
        },
        duration: { type: 'number', description: '片长（秒），用于预览进度条与导出。默认 8。' },
        fps: { type: 'integer', description: '帧率，默认 30。' },
        base_id: {
          type: 'string',
          description: [
            '返工时用：上一版动画的 id（save_animation 返回值里的 id）。',
            '给了它就可以省略 html，系统会读回上一版正文，只改你这次传的字段。',
            '只换配乐时，传 base_id + 新的 score_js 即可，不必重发整份 HTML。',
            '工作区只保留最新一版，所以 base_id 写错或已被清理时，系统会自动退到最近一版继续。',
          ].join(''),
        },
        html: { type: 'string', description: '完整的动画 HTML 文件正文。给了 base_id 时可省略。' },
        score_js: {
          type: 'string',
          description: [
            '你自己为这个片子写的配乐合成代码（Web Audio）。不要用任何预设音色库。',
            '代码是一个函数体，可用的形参：ctx（OfflineAudioContext）、dest（AudioNode 出口）、',
            'duration（秒）、cuts（分镜切点秒数数组）、cues（分镜里的镜头重点）、',
            'beats（你在 beats 参数里给的精确节奏点，每项 {time,type,label,power}）、',
            'rand（可复现随机函数）、hz（MIDI 转频率）。',
            '在里面用 ctx.createOscillator / createBufferSource / createBiquadFilter / createGain 等搭音色，',
            '把声音接到 dest 上，并在绝对时间点上 schedule（用 start(t)）。',
            '所有节点必须按 duration 收尾，不要在函数里 await。',
            '卡点用 beats 里的 time：它来自动画代码本身，比 cuts 准。',
            '禁止做低频扫频底鼓（正弦从一两百赫兹滑到三四十赫兹）：听感像放屁。',
            '要重音就给固定频率的低正弦加鼓皮噪声，让包络做冲击，不要让频率滑。',
            '必填：没有兜底引擎，不传这段代码这片子就没有声音。',
          ].join(''),
        },
      },
      required: [],
      additionalProperties: false,
    },
    output: {
      schema: {
        type: 'object',
        properties: {
          id: { type: 'string' },
          title: { type: 'string' },
          styleId: { type: 'string' },
          styleName: { type: 'string' },
          storyboardId: { type: 'string' },
          music: { type: 'string' },
          cuts: { type: 'array', items: { type: 'number' }, description: '切点秒数，配乐按这些点卡拍。' },
          cues: { type: 'array', items: { type: 'object', additionalProperties: true }, description: '精确卡点列表' },
          beats: { type: 'array', items: { type: 'object', additionalProperties: true }, description: '从动画代码导出的节奏点' },
          scoreUrl: { type: 'string', description: '模型自写配乐的地址。' },
          duration: { type: 'number' },
          fps: { type: 'integer' },
          url: { type: 'string' },
          bytes: { type: 'integer' },
          warnings: { type: 'array', items: { type: 'string' } },
        },
        required: ['id', 'title', 'url', 'duration', 'fps'],
        additionalProperties: false,
      },
      render: (_args, value) => [{
        type: 'text',
        text: [
          `已生成动画「${value.title}」${value.styleId ? `（${value.styleId} ${value.styleName || ''}）` : ''}`,
          `片长 ${value.duration}s · ${value.fps}fps · ${(value.bytes / 1024).toFixed(0)} KB`,
          value.warnings.length ? `注意：${value.warnings.join('；')}` : '',
          `地址：${value.url}`,
          `配乐：${value.music}`,
          value.scoreUrl ? `配乐地址：${value.scoreUrl}` : '',
          `卡点对齐：${value.cuts.length} 个分镜切点${value.cues && value.cues.length ? ` + ${value.cues.length} 个镜头重点` : ''}已毫秒级精准对齐`,
          '对话末尾已显示预览卡片：点击播放音画同步出声，点击导出直接一键下载成片。',
        ].filter(Boolean).join('\n'),
      }],
      presentationMeta: (_args, value) => value,
    },
    async execute(args) {
      // A revision reuses the previous cut: only the parts the caller actually changed
      // travel over the wire, so "just change the music" stays a two-field call.
      const notes = [];
      let baseId = String(args?.base_id || '').trim();
      // 旧稿会被自动清理，所以 base_id 指向的那一版可能已经不在了：退到最近一版，
      // 让「只换配乐」这类返工不会因为文件被清掉而直接失败。
      if (baseId && !existsSync(join(OUTPUT_DIR, `${baseId}.html`))) {
        const newest = latestSave('anim-', '.html');
        if (newest) {
          notes.push(`上一版 ${baseId} 已随旧稿清理，已改用最近一版 ${newest} 作为底稿`);
          baseId = newest;
        } else {
          baseId = '';
        }
      }
      let base;
      if (baseId) {
        try {
          base = JSON.parse(readFileSync(join(OUTPUT_DIR, `${baseId}.json`), 'utf8'));
        } catch { /* no sidecar: fall back to the html alone */ }
      }

      let html = stripWrappers(args?.html);
      if (!html && baseId) {
        try { html = readFileSync(join(OUTPUT_DIR, `${baseId}.html`), 'utf8'); } catch { /* reported below */ }
      }
      if (!html) {
        throw new Error(baseId
          ? `找不到上一版 ${baseId} 的正文，请改用完整 html 重新提交`
          : 'html 为空');
      }
      const bytes = Buffer.byteLength(html, 'utf8');
      if (bytes > MAX_HTML_BYTES) throw new Error(`HTML 过大（${(bytes / 1048576).toFixed(1)} MB），上限 2 MB`);

      // 强制校验必须含有 <canvas>，若是 DOM/CSS 动画在此处直接报错并提示 Agent 修复
      assertRecordable(html);

      const warnings = inspectHtml(html);
      const styleId = args?.style_id || base?.styleId;
      const style = styleId ? styleById(styleId) : undefined;
      let storyboardId = String(args?.storyboard_id || base?.storyboardId || '');

      // 分镜同样只留最新一份，旧 id 可能已被清理：退到最近一版分镜，别让卡点凭空消失。
      if (storyboardId && !existsSync(join(OUTPUT_DIR, `${storyboardId}.json`))) {
        const newestBoard = latestSave('sb-', '.json');
        if (newestBoard) {
          notes.push(`分镜 ${storyboardId} 已随旧稿清理，已改用最近一版 ${newestBoard}`);
          storyboardId = newestBoard;
        }
      }

      // The storyboard supplies both the score choice and the cut points; without it
      // the score still works, it just has no edits to land on.
      let board;
      if (storyboardId) {
        try {
          board = JSON.parse(readFileSync(join(OUTPUT_DIR, `${storyboardId}.json`), 'utf8'));
        } catch {
          warnings.push(`找不到分镜 ${storyboardId}，卡片不会带分镜信息`);
        }
      } else {
        warnings.push('没有关联分镜：这版动画未经用户拍板');
      }

      const music = resolveMusic(args?.music || base?.music || (board && board.music), style);
      const cuts = Array.isArray(board?.shots)
        ? board.shots
          .map((shot) => round(Number(shot.start) || 0))
          .filter((t) => t > 0.05 && t < (Number(args?.duration) || board.duration || 8))
          .sort((a, b) => a - b)
        : [];

      // Collect all internal visual hit cues from storyboard shots and args
      const cues = [];
      if (Array.isArray(board?.shots)) {
        for (const s of board.shots) {
          if (Array.isArray(s.cues)) {
            for (const c of s.cues) {
              const t = round(Number(c.time) || 0);
              if (t > 0.05 && t < (Number(args?.duration) || board.duration || 8)) {
                cues.push({ time: t, type: c.type || 'hit', label: c.label || '' });
              }
            }
          }
        }
      }
      const cueSource = Array.isArray(args?.cues) && args.cues.length ? args.cues
        : (Array.isArray(base?.cues) ? base.cues : []);
      if (cueSource.length) {
        for (const c of cueSource) {
          const t = round(Number(c.time) || 0);
          if (t > 0.05 && t < (Number(args?.duration) || board.duration || 8)) {
            cues.push({ time: t, type: c.type || 'hit', label: c.label || '' });
          }
        }
      }

      const duration = Math.max(1, Math.min(Number(args?.duration) || base?.duration || board?.duration || 8, 120));
      const fps = Math.max(1, Math.min(Number(args?.fps) || base?.fps || board?.fps || 30, 60));

      // Beats come from the animation code the model just wrote, so they are the most
      // trusted sync points: keep sub-second precision rather than rounding like cues.
      const beatSource = Array.isArray(args?.beats) && args.beats.length ? args.beats
        : (Array.isArray(base?.beats) ? base.beats : []);
      const beats = beatSource
        .map((b) => ({
          time: Math.round((Number(b.time) || 0) * 1000) / 1000,
          type: String(b.type || 'hit'),
          label: String(b.label || ''),
          power: Number.isFinite(Number(b.power)) ? Math.max(0, Math.min(1, Number(b.power))) : 0.8,
        }))
        .filter((b) => b.time > 0.02 && b.time < duration)
        .sort((a, b) => a.time - b.time);

      // 配乐必须由模型当场写。没有兜底引擎：拿不到 score_js 就报错，让 Agent 重写，
      // 绝不悄悄换成一段通用配乐。校验放在写文件之前，否则被拒的那次会留下孤儿 HTML。
      let scoreJs = stripScore(args?.score_js);
      if (!scoreJs && baseId && base?.scoreUrl) {
        try { scoreJs = readFileSync(join(OUTPUT_DIR, `${baseId}.score.js`), 'utf8'); } catch { /* 下面统一报错 */ }
      }
      if (!scoreJs) {
        throw new Error('缺少 score_js：配乐必须由你为这个片子当场写，没有兜底引擎。'
          + '返工时可以传 base_id 沿用上一版配乐，但首版必须自带 score_js。');
      }
      if (!/createOscillator|createBufferSource|createGain|createBiquadFilter/.test(scoreJs)) {
        throw new Error('score_js 里没有创建任何音频节点（createOscillator / createBufferSource / '
          + 'createGain / createBiquadFilter），这段代码发不出声音。');
      }

      // Two saves inside the same millisecond would otherwise share an id and the
      // second would silently overwrite the first, so probe until the name is free.
      mkdirSync(OUTPUT_DIR, { recursive: true });
      const stem = `anim-${slug(args?.title || base?.title)}-${Date.now().toString(36)}`;
      let id = stem;
      for (let n = 2; existsSync(join(OUTPUT_DIR, `${id}.html`)); n++) id = `${stem}-${n}`;

      writeFileSync(join(OUTPUT_DIR, `${id}.html`), html, 'utf8');

      writeFileSync(join(OUTPUT_DIR, `${id}.score.js`), scoreJs, 'utf8');
      const scoreUrl = `/code-animation-api/score/${id}`;

      // Without beats the score has to infer where the picture peaks, which is exactly
      // the guessing the beats parameter exists to remove.
      if (!beats.length) {
        warnings.push('配乐没有收到 beats：卡点只能靠 cuts 推，精度会差一些');
      }

      // 只留成品：这一版已经落盘，再把之前的动画稿（html + 配乐 + sidecar）全部删掉。
      // 必须写在所有写入之后，否则新稿会被自己的清理逻辑扫到。
      const removed = pruneSaves('anim-', id);
      if (removed.length) notes.push(`已清理 ${removed.length} 个旧稿文件，只保留这一版`);

      const value = {
        id,
        title: String(args?.title || base?.title || '动画'),
        styleId: style ? style.id : '',
        styleName: style ? style.name : '',
        music: music && music !== 'none' ? music : '模型自写配乐',
        cuts,
        cues,
        beats,
        scoreUrl,
        duration,
        fps,
        url: `/code-animation-api/animation/${id}`,
        bytes,
        warnings: notes.length ? [...notes, ...warnings] : warnings,
      };
      if (storyboardId) value.storyboardId = storyboardId;

      // Keep a sidecar so a later revision can inherit everything it did not resend.
      writeFileSync(join(OUTPUT_DIR, `${id}.json`), JSON.stringify({ ...value, baseId: baseId || undefined }, null, 2), 'utf8');
      return value;
    },
  }));

  disposers.push(tools.register({
    name: 'save_page',
    description: [
      '提交页面本体，在对话里渲染成可预览、可下载的页面卡片。',
      '产物必须是单文件 HTML：样式和脚本全部内联，禁止外链字体/图片/CDN，禁止 fetch / XMLHttpRequest / type="module"——用户会双击在浏览器里打开，file:// 下这些都不工作。',
      '页面要真能交互：hover、滚动进场、tab、手风琴、模态、轮播都可以；表单只做前端校验不提交，列表和图表用写死的数据。',
      '必须含 <meta name="viewport">，并用 <section> 把每个区块分开，块数要与区块清单一致。',
    ].join('\n'),
    parameters: {
      type: 'object',
      properties: {
        title: { type: 'string', description: '这个页面叫什么。' },
        style_id: { type: 'string', description: '已拍板的风格编号。' },
        outline_id: { type: 'string', description: '已拍板的区块清单 id（save_outline 的返回值）。' },
        html: { type: 'string', description: '完整的页面 HTML 正文，单文件自包含。' },
      },
      required: ['title', 'html'],
      additionalProperties: false,
    },
    output: {
      schema: {
        type: 'object',
        properties: {
          id: { type: 'string' },
          title: { type: 'string' },
          styleId: { type: 'string' },
          styleName: { type: 'string' },
          outlineId: { type: 'string' },
          url: { type: 'string' },
          bytes: { type: 'integer' },
          sections: { type: 'integer', description: '页面里 <section> 的个数' },
          warnings: { type: 'array', items: { type: 'string' } },
        },
        required: ['id', 'title', 'url', 'bytes', 'sections'],
        additionalProperties: false,
      },
      render: (_args, value) => [{
        type: 'text',
        text: [
          `已生成页面「${value.title}」${value.styleId ? `（${value.styleId} ${value.styleName || ''}）` : ''}`,
          `${value.sections} 个区块 · ${(value.bytes / 1024).toFixed(0)} KB`,
          value.warnings.length ? `注意：${value.warnings.join('；')}` : '',
          `地址：${value.url}`,
          '对话末尾已显示页面卡片：可切桌面/平板/手机宽度预览，点「下载 HTML」拿到双击就能打开的文件。',
        ].filter(Boolean).join('\n'),
      }],
      presentationMeta: (_args, value) => value,
    },
    async execute(args) {
      const html = stripWrappers(args?.html);
      if (!html) throw new Error('html 为空');
      const bytes = Buffer.byteLength(html, 'utf8');
      if (bytes > MAX_HTML_BYTES) throw new Error(`页面过大（${(bytes / 1048576).toFixed(1)} MB），上限 2 MB`);

      // 先校验再落盘：被拒的那次不留孤儿文件。
      assertPageable(html);

      const style = args?.style_id ? styleById(args.style_id) : undefined;
      const outlineId = String(args?.outline_id || '');
      const warnings = [...inspectPage(html)];

      // 区块数与 <section> 数对不上时如实指出，不静默接受。
      let outline;
      if (outlineId) {
        try {
          outline = JSON.parse(readFileSync(join(OUTPUT_DIR, `${outlineId}.json`), 'utf8'));
        } catch {
          warnings.push(`找不到区块清单 ${outlineId}`);
        }
      }
      const sectionCount = (html.match(/<section[\s>]/gi) || []).length;
      if (outline && Array.isArray(outline.sections) && outline.sections.length !== sectionCount) {
        warnings.push(`区块清单有 ${outline.sections.length} 块，页面里有 ${sectionCount} 个 <section>`);
      }
      if (!outlineId) warnings.push('没有关联区块清单：这版页面未经用户拍板');

      const stem = `pg-${slug(args?.title)}-${Date.now().toString(36)}`;
      let id = stem;
      for (let n = 2; existsSync(join(OUTPUT_DIR, `${id}.html`)); n++) id = `${stem}-${n}`;

      mkdirSync(OUTPUT_DIR, { recursive: true });
      writeFileSync(join(OUTPUT_DIR, `${id}.html`), html, 'utf8');

      const value = {
        id,
        title: String(args?.title || '页面'),
        styleId: style ? style.id : '',
        styleName: style ? style.name : '',
        url: `/code-animation-api/page/${id}`,
        bytes,
        sections: sectionCount,
        warnings,
      };
      if (outlineId) value.outlineId = outlineId;

      const removed = pruneSaves('pg-', id);
      if (removed.length) value.warnings = [...value.warnings, `已清理 ${removed.length} 个旧页面文件，只保留这一版`];

      writeFileSync(join(OUTPUT_DIR, `${id}.json`), JSON.stringify({ ...value, outlineId: outlineId || undefined }, null, 2), 'utf8');
      return value;
    },
  }));

  return () => {
    for (const dispose of disposers.reverse()) {
      try { dispose(); } catch { /* one bad disposer must not block the rest */ }
    }
  };
}

export { inspectHtml, inspectShots, assertRecordable, assertPageable, inspectPage };
