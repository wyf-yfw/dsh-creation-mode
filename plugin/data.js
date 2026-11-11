/**
 * Shared catalog helpers for both halves of the bundle.
 *
 * The 341 style entries ship beside this module as `styles.json`; their reference
 * stills live under `stills/`. Both the Host bundle (routes) and the creation-mode
 * tools (search) import from here so there is one source of truth.
 *
 * Only styles listed in `stills/approved.json` are published. The rest keep their
 * files on disk but stay out of the catalog until a usable still is added and its id
 * is appended to that list.
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const HERE = new URL('./', import.meta.url);

export const STYLES_FILE = fileURLToPath(new URL('./styles.json', HERE));
export const STILLS_DIR = fileURLToPath(new URL('./stills/', HERE));
/** Stills cleared for publication, one approved style id per entry. */
export const APPROVED_FILE = fileURLToPath(new URL('./stills/approved.json', HERE));
/** Where generated animations are written, one HTML file per creation. */
export const OUTPUT_DIR = fileURLToPath(new URL('./created/', HERE));
/** Subdirectory an export is written into, under the session directory. */
export const EXPORT_DIR_NAME = 'code-animation';
/**
 * 只留成品：返工不留中间稿。
 *
 * 每次 save_animation / save_storyboard 之后，同类旧稿会被删掉，created/ 里只保留
 * 最近 KEEP_SAVES 份（1 = 只留最新的一版动画工程、配乐工程与分镜）。
 * 调大可以留几版做对比，但用户要的是「不保留中间过程」，所以默认 1。
 */
export const KEEP_SAVES = 1;

/**
 * 工艺参考：按需加载的 Markdown，放在 references/ 下。
 *
 * 原来这些内容全压在 flow.js 里，每轮都要占满上下文；拆出来后由 get_reference
 * 按需取。13 份参考对应 13 个工艺方向，和 Remotion 的 skill 组织方式一致。
 */
export const REFERENCES_DIR = fileURLToPath(new URL('./references/', HERE));
/** 原样收录的上游词表（motion-prompt，MIT），按包分目录保存，不做改写。 */
export const VENDOR_DIR = fileURLToPath(new URL('./vendor/', HERE));

export const REFERENCES = {
  motion: '运动与缓动',
  transitions: '转场',
  typography: '中文排版',
  color: '调色与质感',
  effects: '视觉特效',
  'text-animation': '文字动画',
  particles: '粒子系统',
  camera: '镜头与空间',
  'data-viz': '数据可视化',
  sequencing: '编排',
  audio: '音画同步',
  timbre: '音色配方',
  copy: '文案标准',
  moves: '动效与界面词表',
};

/**
 * Build marker surfaced by the health route.
 *
 * Bump it whenever tool names or their result shape change: a preset mounts this
 * module once at process start, so a running host can still serve an older revision
 * than the one on disk, and this is how that shows up.
 */
export const BUILD_REV = 25;

/** Tool names this revision registers, in the order they are declared. */
export const TOOL_NAMES = ['list_styles', 'show_stills', 'get_style', 'save_storyboard', 'save_animation', 'save_outline', 'save_page', 'get_reference'];

let cached;
let approvedCache;

/**
 * Style ids whose still was reviewed and published.
 *
 * The list is read from disk on first use and cached; an absent or unreadable file
 * publishes nothing, which fails closed rather than shipping unvetted artwork.
 */
export function approvedIds() {
  if (approvedCache) return approvedCache;
  try {
    const raw = JSON.parse(readFileSync(APPROVED_FILE, 'utf8'));
    const list = Array.isArray(raw) ? raw : raw.approved;
    approvedCache = new Set(
      (Array.isArray(list) ? list : []).map((id) => String(id).trim().toUpperCase()).filter(Boolean),
    );
  } catch {
    approvedCache = new Set();
  }
  return approvedCache;
}

/** Whether one style's still is published, so the style may appear at all. */
export function isApproved(style) {
  return approvedIds().has(String(style?.id || '').toUpperCase());
}

/**
 * Load the catalog once, keeping only published styles.
 *
 * Filtering here rather than at each call site means search, `get_style`, the still
 * route and the card renderers cannot disagree about what is on offer.
 */
export function catalog() {
  if (cached) return cached;
  const raw = JSON.parse(readFileSync(STYLES_FILE, 'utf8'));
  const approved = approvedIds();
  const styles = raw.styles
    .filter((style) => approved.has(String(style.id).toUpperCase()))
    .map((style) => ({ ...style, still: true }));
  cached = { series: raw.series, styles };
  return cached;
}

/** Field weights: how much a hit in one field says about the intended style. */
const FIELD_WEIGHTS = {
  id: 120,
  name: 60,
  en: 40,
  tags: 34,
  category: 22,
  seriesName: 18,
  fit: 16,
  desc: 14,
  // Prompts describe technique ("±1 像素", "24 fps"), so a hit there is weak evidence
  // and never counts toward term coverage; it only orders otherwise-equal candidates.
  prompt: 2,
};

/** Fields whose hit proves the style is about the term, used for coverage. */
const CORE_FIELDS = ['name', 'en', 'tags', 'category', 'seriesName', 'fit', 'desc'];

/** Split a query into searchable terms, keeping CJK runs together. */
export function tokenize(query) {
  const raw = String(query || '').toLowerCase().trim();
  if (!raw) return [];
  // Latin words, numbers, and CJK runs; everything else separates terms.
  const parts = raw.match(/[\u4e00-\u9fff]+|[a-z0-9][a-z0-9+#.-]*/g) || [];
  const terms = [];
  const seen = new Set();
  const push = (term, weight) => {
    const key = `${term}\u0000${weight}`;
    if (term && !seen.has(key)) {
      seen.add(key);
      terms.push({ term, weight });
    }
  };
  for (const part of parts) {
    push(part, 1);
    // A long CJK run is one concept in prose but several in a catalog entry, so
    // its bigrams raise recall for queries like "水墨晕染" against "水墨".
    if (/^[\u4e00-\u9fff]+$/.test(part) && part.length > 2) {
      for (let i = 0; i < part.length - 1; i += 1) push(part.slice(i, i + 2), 0.5);
    }
  }
  return terms;
}

/** One lowercased field value, with array fields flattened. */
function fieldText(style, field) {
  const value = style[field];
  if (Array.isArray(value)) return value.join(' ').toLowerCase();
  return String(value ?? '').toLowerCase();
}

/** Score one term against one style across every weighted field. */
function scoreTerm(style, term) {
  let best = 0;
  if (style.id.toLowerCase() === term) best = Math.max(best, FIELD_WEIGHTS.id);
  else if (style.id.toLowerCase().startsWith(term)) best = Math.max(best, FIELD_WEIGHTS.id * 0.6);
  for (const field of [...CORE_FIELDS, 'prompt']) {
    if (fieldText(style, field).includes(term)) best = Math.max(best, FIELD_WEIGHTS[field]);
  }
  return best;
}

/**
 * Whether a hit on this term came from a field that describes the style itself.
 *
 * Coverage counts only these, so a prompt's incidental jargon cannot make an
 * unrelated style look like a multi-term match.
 */
function coreHit(style, term) {
  return CORE_FIELDS.some((field) => fieldText(style, field).includes(term));
}

/**
 * Whether a query names catalog ids outright, such as "B3" or "L49 O96".
 *
 * Prompts carry hex colours like `#4b3326`, so a bare `b3` substring also matches
 * unrelated entries; an id-shaped query is answered from the id field alone.
 */
export function looksLikeIds(query) {
  const raw = String(query || '').trim();
  if (!raw) return false;
  const parts = raw.split(/[\s,，、]+/).filter(Boolean);
  return parts.length > 0 && parts.every((part) => /^[a-z]{1,2}\d{1,3}$/i.test(part));
}

/** Split an id-shaped query into its lowercase ids. */
function idParts(query) {
  return String(query || '').trim().toLowerCase().split(/[\s,，、]+/).filter(Boolean);
}

/**
 * Nearest catalog entries to one misspelled id.
 *
 * Distance is the letter edit distance plus the numeric gap, so `B33` lands on `B3`
 * and `L9` on `L8`/`L10` rather than on an arbitrary entry.
 */
export function nearestIds(id, limit = 3) {
  const { styles } = catalog();
  const target = /^([a-z]{1,2})(\d{1,3})$/.exec(String(id || '').trim().toLowerCase());
  if (!target) return [];
  const [, letter, digits] = target;
  const number = Number(digits);
  const ranked = [];
  styles.forEach((style, index) => {
    const match = /^([a-z]{1,2})(\d{1,3})$/.exec(style.id.toLowerCase());
    if (!match) return;
    const [, otherLetter, otherDigits] = match;
    const letterGap = letter === otherLetter ? 0 : letterGap_(letter, otherLetter);
    // Rank by how close the ids read, not by raw difference: "B33" is a typo of "B3",
    // and 33 is nearer in written form to 3 than to 5 or 4.
    const numberGap = digitGap(digits, otherDigits);
    ranked.push({ style, cost: letterGap * 10 + numberGap, index });
  });
  ranked.sort((a, b) => (a.cost - b.cost) || (a.index - b.index));
  return ranked.slice(0, limit).map((entry) => entry.style);
}

/**
 * How far two id numbers read apart, counting a shared prefix cheaply.
 *
 * "33" is one insertion away from "3" and one from "34", but two from "5", which
 * keeps a dropped or doubled digit ranking above an unrelated neighbour.
 */
function digitGap(a, b) {
  const [short, long] = a.length <= b.length ? [a, b] : [b, a];
  let shared = 0;
  while (shared < short.length && short[shared] === long[shared]) shared += 1;
  const extra = long.length - shared;
  const tailGap = Number(long.slice(shared) || 0) - Number(short.slice(shared) || 0);
  return extra + Math.abs(tailGap) / 100;
}

/** How many letters separate two series prefixes; 1 for neighbouring series. */
function letterGap_(a, b) {
  const first = a.charCodeAt(0);
  const second = b.charCodeAt(0);
  return Math.abs(first - second) + Math.abs(a.length - b.length);
}

/**
 * Case-insensitive match over every weighted field.
 *
 * A multi-term query matches when any term matches, so a descriptive phrase never
 * collapses to zero results; ranking then prefers the styles matching more terms.
 */
export function matches(style, query) {
  if (looksLikeIds(query)) {
    // Prefix match keeps a near-miss id addressable for the caller's suggestion path.
    const id = String(style.id).toLowerCase();
    return idParts(query).some((part) => id.startsWith(part));
  }
  const terms = tokenize(query);
  if (!terms.length) return true;
  return terms.some(({ term }) => scoreTerm(style, term) > 0);
}

/**
 * Rank styles against a query.
 *
 * Each term scores against weighted fields; the total is summed and a coverage bonus
 * rewards styles that satisfy every term, so "8-bit 复古 街机" ranks the styles that
 * carry all three above those that carry one. Ties keep catalog order for stability.
 */
export function searchStyles(query, options = {}) {
  const { styles } = catalog();
  const limit = Math.max(1, Math.min(Number(options.limit) || 12, 50));
  const series = options.series ? String(options.series).toUpperCase() : '';

  // An id-shaped query never leaves the id field: prompts carry hex colours such as
  // `#4b3326`, and a full-text fallback would answer `B3` with unrelated entries.
  if (looksLikeIds(query)) {
    const wanted = idParts(query);
    const exact = [];
    const near = [];
    wanted.forEach((part) => {
      const hit = styles.find((style) => style.id.toLowerCase() === part);
      if (hit) exact.push(hit);
      else styles.forEach((style) => {
        const id = style.id.toLowerCase();
        if (id.startsWith(part) && !near.includes(style)) near.push(style);
      });
    });
    if (exact.length || near.length) return [...exact, ...near].slice(0, limit);
    // A misspelled id ("B33", "L9" when that is absent) still deserves a neighbour,
    // which the caller reports as the near-miss suggestion.
    return nearestIds(wanted[0], limit);
  }

  const terms = tokenize(query);
  const scored = [];
  styles.forEach((style, index) => {
    if (series && String(style.series).toUpperCase() !== series) return;
    if (!terms.length) {
      scored.push({ style, score: 0, covered: 0, index });
      return;
    }
    let score = 0;
    let covered = 0;
    let weightMatched = 0;
    let weightTotal = 0;
    for (const { term, weight } of terms) {
      weightTotal += weight;
      const hit = scoreTerm(style, term);
      if (hit > 0) {
        // A prompt-only hit still scores, but only a core-field hit proves the style
        // is about the term, so only that counts toward coverage and its bonus.
        if (coreHit(style, term)) {
          covered += 1;
          weightMatched += weight;
        }
        score += hit * weight;
      }
    }
    if (covered === 0) return;
    // Coverage dominates: a style matching every term outranks one matching a single
    // term in a heavy field, which is what a multi-word query actually means.
    const ratio = weightTotal > 0 ? weightMatched / weightTotal : 0;
    scored.push({ style, score: score + ratio * 400, covered, index });
  });
  scored.sort((a, b) => (b.score - a.score) || (b.covered - a.covered) || (a.index - b.index));
  return scored.slice(0, limit).map((entry) => entry.style);
}

/** Look one style up by its exact catalog id, ignoring case. */
export function styleById(id) {
  const { styles } = catalog();
  const key = String(id || '').trim().toUpperCase();
  return styles.find((style) => style.id === key);
}

/** Project a catalog entry onto what a caller actually needs to see. */
export function describe(style) {
  return {
    id: style.id,
    name: style.name,
    series: style.series,
    seriesName: style.seriesName,
    category: style.category,
    description: style.desc,
    fit: style.fit,
    tags: style.tags || [],
    hasStill: Boolean(style.still),
    // Empty string rather than null: the tool schema dialect has no nullable union.
    stillUrl: style.still ? `/code-animation-api/still/${style.id}` : '',
    prompt: style.prompt,
    promptChars: (style.prompt || '').length,
    music: defaultMusicFor(style),
  };
}

/**
 * Pick a score for a style.
 *
 * The series carries most of the signal (a Chinese-ink piece and a cyberpunk piece
 * should not get the same bed), with tags refined on top: 3D leans cinematic, and a
 * monochrome plate wants something sparser.
 */
export function defaultMusicFor(style) {
  const series = String(style?.series || '').toUpperCase();
  const tags = (style?.tags || []).join(' ');
  const text = `${style?.name || ''} ${style?.desc || ''} ${style?.fit || ''}`;

  if (series === 'Z') return 'guofeng';
  if (/中国风|水墨|敦煌|京剧|皮影|剪纸|年画|青花|书法/.test(text)) return 'guofeng';
  if (/赛博|霓虹|cyber|朋克|末日|故障|合成波|CRT|glitch/i.test(text)) return 'synth';
  if (/B&W|黑白/.test(tags) || /默片|银版|黑白/.test(text)) return 'ambient';
  if (series === 'O' || series === 'L') return 'epic';
  if (/\b3D\b/.test(tags)) return 'epic';
  if (series === 'K' || series === 'M') return 'bright';
  if (series === 'R') return 'synth';
  return 'pulse';
}
