window.__ModuleLoader__.load({
  id: 'dsh-creation-mode',
  factory(require) {
    const React = require('react');
    const h = React.createElement;
    const { useState, useEffect, useMemo, useRef, useCallback } = React;

    const API = '/code-animation-api';
    /** Conversation event kind that carries one Turn's creation artifacts. */
    const KIND = 'code-animation';

    const CSS = `
.cas-tail{margin:8px 0 2px;display:flex;flex-direction:column;gap:8px}
/* Inline Tool view: the card sits inside the Tool row, which is already indented. */
.cas-inline{margin:6px 0 2px}
.cas-card{border:1px solid var(--dsw-alias-border-l1);border-radius:10px;overflow:hidden;
  background:var(--dsw-alias-bg-layer-1);font:13px/1.5 system-ui,"PingFang SC","Microsoft YaHei",sans-serif;
  color:var(--dsw-alias-label-primary)}
.cas-card-head{display:flex;align-items:center;gap:8px;padding:9px 11px;border-bottom:1px solid var(--dsw-alias-border-l1)}
.cas-dot{width:7px;height:7px;border-radius:2px;background:linear-gradient(135deg,#ff8a3d,#e0457b);flex:none}
.cas-card-title{font-weight:600;font-size:12.5px;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.cas-card-meta{font-size:11px;color:var(--dsw-alias-label-secondary);white-space:nowrap}
.cas-grow{flex:1}
.cas-btn{height:27px;padding:0 11px;border-radius:7px;font:600 11.5px/1 inherit;cursor:pointer;white-space:nowrap;
  border:1px solid var(--dsw-alias-border-l1);background:var(--dsw-alias-bg-layer-2);color:var(--dsw-alias-label-primary)}
.cas-btn:hover{border-color:var(--dsw-alias-border-l2)}
.cas-btn:disabled{opacity:.5;cursor:not-allowed}
.cas-btn-primary{background:var(--dsw-alias-label-primary);border-color:transparent;color:var(--dsw-alias-bg-base)}
.cas-btn-primary:hover{filter:brightness(.92)}

/* stills gallery */
.cas-stills{display:grid;grid-template-columns:repeat(auto-fill,minmax(210px,1fr));gap:8px;padding:10px}
.cas-still{border:1px solid var(--dsw-alias-border-l1);border-radius:8px;overflow:hidden;
  background:var(--dsw-alias-bg-layer-2);cursor:zoom-in;padding:0;text-align:left;font:inherit;color:inherit}
.cas-still img{width:100%;display:block;aspect-ratio:16/9;object-fit:cover}
.cas-still-cap{padding:6px 8px}
.cas-still-id{font-size:10px;font-weight:600;color:var(--dsw-alias-label-secondary);letter-spacing:.4px}
.cas-still-name{margin-left:6px;font-size:12.5px}
.cas-still-desc{display:block;margin-top:2px;font-size:11px;color:var(--dsw-alias-label-secondary);
  overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.cas-nostill{padding:8px 10px;font-size:11.5px;color:var(--dsw-alias-label-secondary)}

/* storyboard */
.cas-sb-track{display:flex;height:26px;gap:2px;padding:8px 10px 0}
.cas-sb-seg{display:flex;align-items:center;justify-content:center;border-radius:4px;min-width:14px;flex-basis:0;
  color:#0b0c10;font-size:10px;font-weight:700}
.cas-sb-list{max-height:280px;overflow:auto;padding:8px 10px 10px;display:flex;flex-direction:column;gap:6px}
.cas-sb-shot{display:grid;grid-template-columns:20px 78px minmax(0,1fr);gap:8px;align-items:start}
.cas-sb-idx{width:20px;height:20px;border-radius:5px;display:flex;align-items:center;justify-content:center;
  color:#0b0c10;font-size:10.5px;font-weight:700;margin-top:1px}
.cas-sb-t{font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-size:11px;
  color:var(--dsw-alias-label-secondary);padding-top:2px}
.cas-sb-body{min-width:0}
.cas-sb-scene{display:block;font-size:12.5px}
.cas-sb-text,.cas-sb-cam{display:block;margin-top:2px;font-size:11px;color:var(--dsw-alias-label-secondary)}
.cas-sb-foot{padding:8px 11px;border-top:1px solid var(--dsw-alias-border-l1);font-size:11.5px;
  color:var(--dsw-alias-label-secondary);background:var(--dsw-alias-bg-layer-2)}

/* animation player */
/* Each shape derives its width from the ratio and the height cap, then lets
   aspect-ratio compute the height. Sizing by max-height alone (or by height alone)
   left the box at the card's full width, and the canvas inside — which fills its
   frame at 100%/100% — was stretched to that wrong shape. */
.cas-stage{position:relative;background:#05070b;display:flex;align-items:center;justify-content:center;margin:0 auto}
.cas-stage[data-aspect="16:9"]{aspect-ratio:16/9;width:min(100%,calc(560px * 16 / 9))}
.cas-stage[data-aspect="9:16"]{aspect-ratio:9/16;width:min(100%,calc(520px * 9 / 16))}
.cas-stage[data-aspect="1:1"]{aspect-ratio:1/1;width:min(100%,520px)}
.cas-frame{display:block;width:100%;height:100%;border:0;background:#05070b}
.cas-bar{display:flex;align-items:center;gap:9px;padding:8px 11px;border-top:1px solid var(--dsw-alias-border-l1)}
/* two-track timeline: picture marks on top, real waveform below */
.cas-tracks{border-top:1px solid var(--dsw-alias-border-l1);background:#080a0e;user-select:none}
.cas-track{position:relative;height:22px;cursor:crosshair}
.cas-track-video{background:#10141c;border-bottom:1px solid #171c26}
.cas-track-audio{height:58px}
.cas-track-label{position:absolute;left:6px;top:50%;transform:translateY(-50%);font-size:10px;
  color:#5a6478;pointer-events:none;letter-spacing:.5px}
.cas-track-note{position:absolute;left:40px;top:50%;transform:translateY(-50%);font-size:10px;
  color:#3d4757;pointer-events:none}
.cas-cut{position:absolute;top:0;bottom:0;width:2px;margin-left:-1px;background:#3fd7c0;
  box-shadow:0 0 6px #3fd7c088}
.cas-wave{display:block;width:100%;height:58px}
.cas-play-btn{width:28px;height:28px;border-radius:6px;border:1px solid var(--dsw-alias-border-l1);
  background:var(--dsw-alias-bg-layer-2);color:var(--dsw-alias-label-primary);display:inline-flex;
  align-items:center;justify-content:center;cursor:pointer;font-size:12px;padding:0;flex-shrink:0;user-select:none}
.cas-play-btn:hover{background:var(--dsw-alias-bg-layer-3);border-color:var(--dsw-alias-border-l2)}
.cas-play-btn:active{transform:scale(0.96)}
.cas-scrub{flex:1;accent-color:var(--dsw-alias-label-secondary);min-width:0}
.cas-t{font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-size:11px;
  color:var(--dsw-alias-label-secondary);white-space:nowrap}
.cas-warn{padding:7px 11px;font-size:11.5px;color:var(--dsw-alias-state-warn-primary);
  border-top:1px solid var(--dsw-alias-border-l1);background:var(--dsw-alias-bg-layer-2)}
.cas-note{padding:8px 11px;font-size:11.5px;color:var(--dsw-alias-label-secondary)}
.cas-score{display:flex;align-items:center;gap:9px;padding:8px 11px;border-top:1px solid var(--dsw-alias-border-l1);
  flex-wrap:wrap}
.cas-score-label{font-size:11.5px;font-weight:600;color:var(--dsw-alias-label-secondary);white-space:nowrap}
.cas-select{height:27px;border-radius:7px;border:1px solid var(--dsw-alias-border-l1);
  background:var(--dsw-alias-bg-layer-2);color:var(--dsw-alias-label-primary);font:inherit;font-size:11.5px;
  padding:0 6px;outline:none;max-width:190px}
.cas-select:focus{border-color:var(--dsw-alias-border-l2)}
.cas-score-hint{font-size:11px;color:var(--dsw-alias-state-idle-primary);white-space:nowrap}
.cas-score-prompt{font-size:11.5px;color:var(--dsw-alias-label-primary);overflow:hidden;text-overflow:ellipsis;
  white-space:nowrap;max-width:340px;font-weight:500}
.cas-path{padding:7px 11px;border-top:1px solid var(--dsw-alias-border-l1);font-size:11px;
  font-family:ui-monospace,SFMono-Regular,Menlo,monospace;color:var(--dsw-alias-state-idle-primary);
  word-break:break-all;background:var(--dsw-alias-bg-layer-2)}
.cas-path-ok{color:var(--dsw-alias-state-success-primary)}
.cas-lightbox{position:fixed;inset:0;z-index:9100;background:rgba(4,5,8,.88);display:flex;align-items:center;
  justify-content:center;padding:32px;cursor:zoom-out}
.cas-lightbox img{max-width:100%;max-height:100%;border-radius:10px;box-shadow:0 20px 60px rgba(0,0,0,.6)}

/* 样式库：会话里的第三个页签（对话 / 轨迹 / 样式库） */
.cas-lib-view{display:flex;flex-direction:column;gap:10px;padding:16px;min-height:0}
.cas-lib-head{display:flex;align-items:center;gap:10px}
.cas-lib-title{font-weight:600;font-size:14px}
.cas-lib-count{font-size:11px;color:var(--dsw-alias-label-secondary);white-space:nowrap}
.cas-lib-search{flex:1;height:30px;padding:0 10px;border-radius:8px;outline:none;min-width:0;
  border:1px solid var(--dsw-alias-border-l1);background:var(--dsw-alias-bg-layer-2);
  color:var(--dsw-alias-label-primary);font:13px/1 inherit}
.cas-lib-search:focus{border-color:var(--dsw-alias-border-l2)}
.cas-lib-chips{display:flex;flex-wrap:wrap;gap:6px}
.cas-chip{height:24px;padding:0 9px;border-radius:999px;cursor:pointer;
  border:1px solid var(--dsw-alias-border-l1);background:transparent;
  color:var(--dsw-alias-label-secondary);font:11.5px/1 inherit}
.cas-chip:hover{border-color:var(--dsw-alias-border-l2)}
.cas-chip[data-on="1"]{background:var(--dsw-alias-label-primary);border-color:transparent;
  color:var(--dsw-alias-bg-base)}
.cas-lib-body{overflow:auto;min-height:240px;max-height:calc(100vh - 260px)}
.cas-lib-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(200px,1fr));gap:10px}
.cas-lib-card{border:1px solid var(--dsw-alias-border-l1);border-radius:9px;overflow:hidden;
  background:var(--dsw-alias-bg-layer-1);padding:0;text-align:left;cursor:zoom-in;
  color:inherit;font:inherit}
.cas-lib-card:hover{border-color:var(--dsw-alias-border-l2)}
.cas-lib-card img{width:100%;display:block;aspect-ratio:16/9;object-fit:cover;
  background:var(--dsw-alias-bg-layer-2)}
.cas-lib-cap{padding:7px 9px}
.cas-lib-id{font-size:10px;font-weight:600;letter-spacing:.5px;color:var(--dsw-alias-label-secondary)}
.cas-lib-name{margin-left:6px;font-size:12.5px}
.cas-lib-desc{display:block;margin-top:3px;font-size:11px;color:var(--dsw-alias-label-secondary);
  overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.cas-lib-empty{padding:48px 0;text-align:center;font-size:13px;color:var(--dsw-alias-label-secondary)}

/* 页面卡片：iframe 按目标宽度渲染，再整体缩到容器里，窄屏不出现横向滚动 */
.cas-page-wrap{position:relative;overflow:hidden;background:#fff;border-bottom:1px solid var(--dsw-alias-border-l1)}
.cas-page-frame{display:block;border:0;background:#fff;transform-origin:top left}
.cas-page-bar{display:flex;align-items:center;gap:8px;padding:8px 11px;border-top:1px solid var(--dsw-alias-border-l1)}
.cas-page-meta{font-size:11px;color:var(--dsw-alias-label-secondary);white-space:nowrap}
.cas-wbtn{height:24px;padding:0 9px;border-radius:6px;cursor:pointer;font:600 11px/1 inherit;
  border:1px solid var(--dsw-alias-border-l1);background:transparent;color:var(--dsw-alias-label-secondary)}
.cas-wbtn[data-on="1"]{background:var(--dsw-alias-label-primary);border-color:transparent;color:var(--dsw-alias-bg-base)}
.cas-outline{display:flex;flex-direction:column}
.cas-outline-row{display:flex;gap:10px;padding:8px 11px;border-top:1px solid var(--dsw-alias-border-l1);font-size:12px}
.cas-outline-idx{width:20px;color:var(--dsw-alias-label-secondary);flex:none}
.cas-outline-name{width:76px;font-weight:600;flex:none}
.cas-outline-rest{color:var(--dsw-alias-label-secondary);min-width:0}
`;

    const PALETTE = ['#ff8a3d', '#e0457b', '#7b5bff', '#3fd7c0', '#4d6bfe', '#ffc04d'];

    /** Parse one tool call's raw argument text; malformed input degrades to {}. */
    function parseArgs(raw) {
      if (typeof raw !== 'string' || raw === '') return {};
      try {
        const parsed = JSON.parse(raw);
        return parsed && typeof parsed === 'object' ? parsed : {};
      } catch {
        return {};
      }
    }

    /**
     * 把用户自己选的音频文件解码成 AudioBuffer，并铺满整段片长。
     *
     * 这是唯一一处「不是模型写的配乐」还能进片子的入口，而且必须由用户主动选文件；
     * 插件自己不会生成任何兜底配乐。
     */
    async function audioFileToBuffer(file, duration, sampleRate = 44100) {
      const bytes = await file.arrayBuffer();
      const ctx = new OfflineAudioContext(2, Math.ceil(duration * sampleRate), sampleRate);
      const decoded = await ctx.decodeAudioData(bytes);
      const targetLength = Math.ceil(duration * decoded.sampleRate);
      const out = ctx.createBuffer(2, targetLength, decoded.sampleRate);

      for (let ch = 0; ch < 2; ch += 1) {
        const from = decoded.getChannelData(Math.min(ch, decoded.numberOfChannels - 1));
        const to = out.getChannelData(ch);
        const take = Math.min(targetLength, from.length);
        to.set(from.subarray(0, take));
        // 素材比片子短就首尾相接地铺满，不做拉伸，免得变速变调。
        if (take < targetLength && from.length > 0) {
          let offset = take;
          while (offset < targetLength) {
            const chunk = Math.min(from.length, targetLength - offset);
            to.set(from.subarray(0, chunk), offset);
            offset += chunk;
          }
        }
      }

      const fadeLen = Math.min(Math.floor(out.sampleRate * 0.4), targetLength);
      for (let ch = 0; ch < 2; ch += 1) {
        const data = out.getChannelData(ch);
        for (let i = 0; i < fadeLen; i += 1) data[targetLength - 1 - i] *= i / fadeLen;
      }
      return out;
    }

    /**
     * Container preference, best first.
     *
     * Chromium records genuine H.264/AAC MP4 through MediaRecorder, so MP4 is the
     * default; the WebM entries are the fallback for browsers without it.
     */
    const CONTAINERS = [
      { id: 'mp4', label: 'MP4', ext: 'mp4', mimes: ['video/mp4;codecs=avc1.42E01E,mp4a.40.2', 'video/mp4;codecs=avc1.4D401F,mp4a.40.2', 'video/mp4'] },
      { id: 'webm', label: 'WebM', ext: 'webm', mimes: ['video/webm;codecs=vp9,opus', 'video/webm;codecs=vp8,opus', 'video/webm'] },
    ];

    /** Which container this browser can actually record, MP4 first. */
    function pickContainer(preferred) {
      const order = preferred === 'webm' ? ['webm', 'mp4'] : ['mp4', 'webm'];
      for (const id of order) {
        const container = CONTAINERS.find((c) => c.id === id);
        const mime = container.mimes.find((m) => (
          typeof MediaRecorder !== 'undefined'
          && MediaRecorder.isTypeSupported
          && MediaRecorder.isTypeSupported(m)
        ));
        if (mime) return { ...container, mime };
      }
      return null;
    }

    function download(blob, name) {
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = name;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 4000);
    }

    /**
     * Shape the arrangement around each beat, at one of two strengths.
     *
     * There are two different jobs here, and treating them the same makes one of them
     * wrong:
     *
     *   ordinary beat (power < 0.72)
     *     The rhythm should keep running; the beat just needs to be clearly audible on
     *     top of it. So the arrangement is not interrupted — it gets a small dip right
     *     under the transient, which clears space without breaking the groove. Cutting
     *     the bed here would read as a mistake, because a normal accent is supposed to
     *     land *inside* the音乐, not punctuate it.
     *
     *   climax beat (power >= 0.72)
     *     This is the one the audience is meant to feel, so the arrangement stops: a
     *     hard cut to near-silence ~90-130ms before, the hit lands in the hole, then the
     *     bed returns slightly hot. Silence to full level is the largest contrast there
     *     is, and it is reserved for peaks so it does not become fatiguing.
     *
     * Buses handed to the score:
     *   `bed`  - the arrangement; this is what gets shaped
     *   `dest` - the hits; never shaped, so they are what the gap exposes
     *
     * @returns `{ total, climax }` counts after shaping.
     */
    const CLIMAX_POWER = 0.72;

    function shapeBeats(bedGain, beats, duration) {
      const marks = (Array.isArray(beats) ? beats : [])
        .map((b) => ({
          time: Number(typeof b === 'number' ? b : b && b.time),
          power: Math.max(0.1, Math.min(1, Number(b && b.power) || 0.8)),
        }))
        .filter((b) => Number.isFinite(b.time) && b.time > 0.06 && b.time < duration - 0.02)
        .sort((a, b) => a.time - b.time);

      if (!marks.length) return { total: 0, climax: 0 };

      const g = bedGain.gain;
      g.setValueAtTime(1, 0);

      let climax = 0;
      for (const mark of marks) {
        const t = mark.time;

        if (mark.power >= CLIMAX_POWER) {
          // Climax: let the music fall away, then land the hit in the quiet.
          //
          // A hard cut would read as a dropout — the ear hears a broken tape, not a
          // build. So the arrangement fades out over a longer lead (~260ms at full
          // power) and reaches near-silence only right at the beat. What the listener
          // perceives is the music stepping back to make room, then the hit.
          climax++;
          const fade = 0.20 + mark.power * 0.12;
          const gapStart = Math.max(0, t - fade);
          const restoreAt = Math.min(duration, t + 0.045);

          g.setValueAtTime(1, gapStart);
          // Exponential-shaped fall: quick early, slow into the floor, so it feels like
          // a release rather than a switch.
          g.linearRampToValueAtTime(0.62, gapStart + fade * 0.42);
          g.linearRampToValueAtTime(0.22, gapStart + fade * 0.74);
          g.linearRampToValueAtTime(0.05, t - 0.006);
          g.setValueAtTime(0.05, restoreAt);
          // Return gently and slightly hot, so the beat reads as an arrival.
          g.linearRampToValueAtTime(1.05, Math.min(duration, restoreAt + 0.14));
          g.linearRampToValueAtTime(1, Math.min(duration, restoreAt + 0.32));
        } else {
          // Ordinary: keep the groove, just clear a little room under the hit.
          // Depth scales with power so a 0.3 beat barely moves and a 0.7 one is firm.
          // The dip is a rounded shape, not a step: stepping a gain in a few ms clicks.
          const dip = 0.46 - mark.power * 0.30;      // 0.37 at 0.3, 0.25 at 0.7
          const from = Math.max(0, t - 0.075);
          const hold = Math.min(duration, t + 0.028);

          g.setValueAtTime(1, from);
          g.linearRampToValueAtTime(0.78, t - 0.028);
          g.linearRampToValueAtTime(dip, t - 0.004);
          g.setValueAtTime(dip, hold);
          g.linearRampToValueAtTime(1.02, Math.min(duration, hold + 0.07));
          g.linearRampToValueAtTime(1, Math.min(duration, hold + 0.18));
        }
      }

      return { total: marks.length, climax };
    }

    /**
     * Render a score the model wrote for this clip.
     *
     * The code runs against an OfflineAudioContext with the same helpers the built-in
     * engine uses, so a model-written score can do anything the engine can — it just is
     * not limited to the engine's instrument set.
     *
     * Two buses are handed in: `bed` is where the arrangement should go, and `dest` is
     * the raw output. Anything connected to `bed` is ducked around each beat; anything
     * connected to `dest` is not, which is where the hits belong.
     *
     * @param url - `/code-animation-api/score/<id>`.
     * @param options - `{ duration, cuts, cues, beats }`.
     * @returns the rendered AudioBuffer, or null when the code is missing or throws.
     */
    async function renderModelScore(url, options) {
      const source = await fetch(url).then((r) => (r.ok ? r.text() : '')).catch(() => '');
      if (!source) return null;

      const duration = Math.max(0.5, Number(options.duration) || 8);
      const sampleRate = 44100;
      const ctx = new OfflineAudioContext(2, Math.ceil(duration * sampleRate), sampleRate);

      // Raw output: anything the model connects here is heard as-is, so hits belong here.
      const out = ctx.createGain();
      out.gain.value = 1;
      out.connect(ctx.destination);

      // The bed bus: the arrangement goes here and is shaped around each beat — a small
      // dip under ordinary accents, a full stop before a climax. Hits belong on `dest`
      // so they are what the gap exposes.
      const bed = ctx.createGain();
      bed.gain.value = 1;
      bed.connect(ctx.destination);
      const shaped = shapeBeats(bed, options.beats, duration);

      const rand = (() => {
        let a = 20261103;
        return () => {
          a = (a + 0x6D2B79F5) | 0;
          let t = Math.imul(a ^ (a >>> 15), 1 | a);
          t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
          return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
        };
      })();
      const hz = (midi) => 440 * 2 ** ((midi - 69) / 12);

      try {
        // `beats` carries the exact moments the model exported from its own animation
        // code, so the score can land on the picture without guessing.
        // eslint-disable-next-line no-new-func
        const fn = new Function(
          'ctx', 'dest', 'bed', 'duration', 'cuts', 'cues', 'beats', 'rand', 'hz', source,
        );
        fn(ctx, out, bed, duration, options.cuts || [], options.cues || [], options.beats || [], rand, hz);
        const buffer = await ctx.startRendering();
        buffer.__shapedBeats = shaped.total;
        buffer.__climaxBeats = shaped.climax;
        let peak = 0;
        for (let ch = 0; ch < buffer.numberOfChannels; ch++) {
          const data = buffer.getChannelData(ch);
          for (let i = 0; i < data.length; i += 7) peak = Math.max(peak, Math.abs(data[i]));
        }
        return peak > 1e-4 ? buffer : null;
      } catch (error) {
        console.warn('model score failed, falling back to the built-in engine:', error);
        return null;
      }
    }

    /**
     * Drive a detached document frame frame by frame and record it through MediaRecorder.
     * @param opts.scoreBuffer - 模型写的配乐，已经离线渲染好的 AudioBuffer。
     * @param opts.musicBuffer - 用户自己选的音频文件，优先级高于 scoreBuffer。
     *   两者都不给就是无声导出；这里不会凭空合成配乐。
     * @param opts.cuts - cut times in seconds; the score is fitted and accented to them.
     */
    /**
     * Find the canvas an export should record.
     *
     * The frame is loaded asynchronously and a page may create its canvas from script,
     * so this waits for the document and retries instead of failing on a first miss.
     * When several canvases exist the largest is used: decorative or helper canvases
     * are typically small.
     */
    async function resolveCanvas(iframe, timeoutMs = 2000) {
      const started = performance.now();
      let doc;
      let seen = '';

      while (performance.now() - started < timeoutMs) {
        doc = iframe && iframe.contentDocument;
        if (doc && doc.readyState !== 'loading') {
          const canvases = Array.from(doc.querySelectorAll('canvas'));
          if (canvases.length) {
            canvases.sort((a, b) => (b.width * b.height) - (a.width * a.height));
            return canvases[0];
          }
          // Remember what the page does contain, for an actionable failure message.
          const counts = ['div', 'svg', 'video', 'img']
            .map((tag) => [tag, doc.querySelectorAll(tag).length])
            .filter(([, n]) => n > 0)
            .map(([tag, n]) => `${n} 个 <${tag}>`);
          seen = counts.join('、');
        }
        await new Promise((r) => setTimeout(r, 80));
      }

      const win = iframe && iframe.contentWindow;
      const hasRenderAt = win && typeof win.renderAt === 'function';
      throw new Error([
        '画面里没有可录制的 <canvas>',
        seen ? `（页面里找到 ${seen}）` : '',
        hasRenderAt ? '' : '，且没有 window.renderAt',
        '。这个动画是 DOM/CSS 绘制的，无法逐帧录制；需要让 Agent 改为渲染到 <canvas> 的实现。',
      ].filter(Boolean).join(''));
    }

    async function recordAnimation(iframe, opts) {
      const win = iframe && iframe.contentWindow;
      if (!win) throw new Error('预览还没准备好');
      const canvas = await resolveCanvas(iframe);
      if (typeof canvas.captureStream !== 'function') throw new Error('当前浏览器不支持 canvas.captureStream');
      const container = pickContainer(opts.container);
      if (!container) throw new Error('当前浏览器不支持 MediaRecorder 录制');
      const mime = container.mime;

      const stream = canvas.captureStream(0);
      const videoTrack = stream.getVideoTracks()[0];
      const tracks = [videoTrack];

      // Audio is mixed into the same recording session so the two tracks share one clock.
      // There is no engine behind this: the buffer must be the model's score (or a file
      // the user picked). Missing it is an error, not a reason to synthesize something.
      let audioCtx;
      let source;
      let audioBuffer;
      let analyser;
      const wantsAudio = opts.scoreBuffer || opts.musicBuffer;
      if (wantsAudio) {
        audioBuffer = opts.musicBuffer || opts.scoreBuffer;
        audioCtx = new AudioContext();
        const destination = audioCtx.createMediaStreamDestination();
        source = audioCtx.createBufferSource();
        source.buffer = audioBuffer;
        source.connect(destination);
        // Tap the same signal so the export can prove audio actually flowed.
        analyser = audioCtx.createAnalyser();
        analyser.fftSize = 2048;
        source.connect(analyser);
        tracks.push(...destination.stream.getAudioTracks());

        // Bring the context up BEFORE the recorder exists. Doing this after start()
        // leaves the recorder capturing silence while the picture already runs, which
        // truncates the score (measured: a 3.000s clip came out as 2.640s) and shifts
        // every later beat.
        if (audioCtx.state === 'suspended') {
          await Promise.race([
            audioCtx.resume().catch(() => {}),
            new Promise((r) => setTimeout(r, 800)),
          ]);
        }
        if (audioCtx.state !== 'running' && opts.onStage) {
          opts.onStage('音频未能启动，本段可能无声');
        }
      }

      const recorder = new MediaRecorder(new MediaStream(tracks), { mimeType: mime, videoBitsPerSecond: 16000000 });
      const parts = [];
      recorder.ondataavailable = (e) => { if (e.data && e.data.size) parts.push(e.data); };
      const finished = new Promise((resolve) => {
        // Resolve with the container that was actually negotiated, not a hardcoded one.
        recorder.onstop = () => resolve(new Blob(parts, { type: mime }));
      });
      recorder.start();

      const fps = Math.max(1, Number(opts.fps) || 30);
      const total = Math.max(1, Math.round(opts.duration * fps));
      const hasRenderAt = typeof win.renderAt === 'function';
      const t0 = performance.now();
      let audioPeak = 0;

      // Start the score with no await in between: the recorder and the first frame must
      // share one origin, or the whole track lands late.
      if (source) source.start(0);

      try {
        for (let i = 0; i < total; i++) {
          if (opts.signal && opts.signal.aborted) break;
          if (hasRenderAt) await win.renderAt(i / fps);
          videoTrack.requestFrame();
          // Sample the score periodically; a peak of zero means the browser never
          // started audio, which would otherwise export as silent video.
          if (analyser && i % 5 === 0) {
            const probe = new Float32Array(analyser.fftSize);
            analyser.getFloatTimeDomainData(probe);
            for (let k = 0; k < probe.length; k++) {
              const v = Math.abs(probe[k]);
              if (v > audioPeak) audioPeak = v;
            }
          }
          if (opts.onProgress) opts.onProgress((i + 1) / total);
          const target = ((i + 1) * 1000) / fps;
          const wait = target - (performance.now() - t0);
          if (wait > 1) await new Promise((r) => setTimeout(r, wait));
        }
      } finally {
        recorder.stop();
      }

      const blob = await finished;
      try { if (source) source.stop(); } catch { /* already ended */ }
      if (audioCtx) void audioCtx.close();
      return { blob, container, hasAudio: tracks.length > 1, audioPeak };
    }

    /**
     * Two stacked tracks for the finished clip.
     *
     * The picture track marks the storyboard cuts; the sound track draws the score's real
     * waveform and marks every beat the animation code reported. Seeing where an accent
     * sits against the picture is the only way to diagnose a sync problem by eye, so the
     * waveform is drawn from the rendered buffer rather than a decorative placeholder.
     */
    function Timeline({ duration, scrub, beats, cuts, cues, score, fps, onSeek }) {
      const canvasRef = useRef(null);

      // Redraw whenever the buffer or the marks change.
      useEffect(() => {
        const canvas = canvasRef.current;
        if (!canvas) return undefined;
        const dpr = Math.min(2, window.devicePixelRatio || 1);
        const width = canvas.clientWidth || 600;
        const height = 56;
        canvas.width = Math.round(width * dpr);
        canvas.height = Math.round(height * dpr);
        const g = canvas.getContext('2d');
        g.setTransform(dpr, 0, 0, dpr, 0, 0);
        g.clearRect(0, 0, width, height);

        const lane = (top, h, fill) => {
          g.fillStyle = fill;
          g.fillRect(0, top, width, h);
        };
        lane(0, height, '#0b0d12');

        const xOf = (t) => (Math.max(0, Math.min(duration, t)) / duration) * width;

        if (score && typeof score.getChannelData === 'function') {
          // Peak envelope per pixel column: the honest shape of what will be heard.
          const data = score.getChannelData(0);
          const mid = height / 2;
          g.strokeStyle = '#3fb6f0';
          g.lineWidth = 1;
          g.beginPath();
          for (let x = 0; x < width; x++) {
            const from = Math.floor((x / width) * data.length);
            const to = Math.floor(((x + 1) / width) * data.length);
            let peak = 0;
            for (let i = from; i < to; i += 2) {
              const v = Math.abs(data[i]);
              if (v > peak) peak = v;
            }
            const half = Math.min(mid - 2, peak * mid * 1.6);
            g.moveTo(x + 0.5, mid - half);
            g.lineTo(x + 0.5, mid + half);
          }
          g.stroke();
        } else {
          g.fillStyle = '#1a1f2b';
          g.fillRect(0, height / 2 - 1, width, 2);
        }

        // Beat markers: the moments the animation code said matter.
        for (const b of beats) {
          const x = xOf(b.time);
          const power = Number.isFinite(b.power) ? b.power : 0.8;
          g.strokeStyle = `rgba(255,138,61,${0.45 + power * 0.55})`;
          g.lineWidth = 1 + power * 1.2;
          g.beginPath();
          g.moveTo(x, 0);
          g.lineTo(x, height);
          g.stroke();
          g.fillStyle = `rgba(255,138,61,${0.6 + power * 0.4})`;
          g.beginPath();
          g.arc(x, 3, 2 + power * 1.6, 0, Math.PI * 2);
          g.fill();
        }

        // Cue markers that were not already covered by a beat.
        for (const c of cues) {
          const near = beats.some((b) => Math.abs(b.time - c.time) < 0.05);
          if (near) continue;
          const x = xOf(c.time);
          g.strokeStyle = 'rgba(255,192,77,0.55)';
          g.lineWidth = 1;
          g.setLineDash([2, 3]);
          g.beginPath();
          g.moveTo(x, 0);
          g.lineTo(x, height);
          g.stroke();
          g.setLineDash([]);
        }

        // Playhead.
        const px = xOf(scrub);
        g.strokeStyle = '#ffffff';
        g.lineWidth = 1.5;
        g.beginPath();
        g.moveTo(px, 0);
        g.lineTo(px, height);
        g.stroke();

        return undefined;
      }, [duration, scrub, beats, cues, score]);

      /** Click or drag anywhere on the track to scrub there. */
      const seek = (event) => {
        const rect = event.currentTarget.getBoundingClientRect();
        const ratio = Math.max(0, Math.min(1, (event.clientX - rect.left) / rect.width));
        onSeek(ratio * duration);
      };

      return h('div', { className: 'cas-tracks' },
        // Picture track: storyboard cuts.
        h('div', {
          className: 'cas-track cas-track-video',
          onMouseDown: seek,
          title: '视频轨：竖线是分镜切点',
        },
          cuts.map((t) => h('span', {
            key: `c${t}`,
            className: 'cas-cut',
            style: { left: `${(t / duration) * 100}%` },
          })),
          cuts.length
            ? null
            : h('span', { className: 'cas-track-note' }, '无分镜切点'),
          h('span', { className: 'cas-track-label' }, '视频'),
        ),
        // Sound track: real waveform plus every reported beat.
        h('div', {
          className: 'cas-track cas-track-audio',
          onMouseDown: seek,
          title: '音频轨：波形是实际配乐，橙色竖线是卡点',
        },
          h('canvas', { ref: canvasRef, className: 'cas-wave' }),
          h('span', { className: 'cas-track-label' }, '音频'),
        ),
      );
    }
    function StillGallery({ stills, note, missing }) {
      const [lightbox, setLightbox] = useState('');
      return h('div', { className: 'cas-card' },
        h('div', { className: 'cas-card-head' },
          h('span', { className: 'cas-dot' }),
          h('span', { className: 'cas-card-title' }, '风格候选'),
          h('span', { className: 'cas-card-meta' }, `${stills.length} 条参考静帧`),
        ),
        note ? h('div', { className: 'cas-note' }, note) : null,
        h('div', { className: 'cas-stills' },
          stills.map((s) => h('button', {
            key: s.id,
            className: 'cas-still',
            onClick: () => setLightbox(`${API}/still/${s.id}`),
            title: '点击放大',
          },
            h('img', { src: `${API}/still/${s.id}`, alt: s.name || s.id, loading: 'lazy' }),
            h('span', { className: 'cas-still-cap' },
              h('span', { className: 'cas-still-id' }, s.id),
              h('span', { className: 'cas-still-name' }, s.name || ''),
              h('span', { className: 'cas-still-desc' }, s.desc || ''),
            ),
          )),
        ),
        (missing && missing.length)
          ? h('div', { className: 'cas-nostill' }, `没有参考静帧：${missing.join('、')}`)
          : null,
        lightbox
          ? h('div', { className: 'cas-lightbox', onClick: () => setLightbox('') },
              h('img', { src: lightbox, alt: '参考静帧' }))
          : null,
      );
    }

    /** The storyboard draft, as a proportional timeline plus a per-shot list. */
    function StoryboardCard({ board }) {
      const shots = board.shots || [];
      const shots2 = shots.length ? shots : [];
      return h('div', { className: 'cas-card' },
        h('div', { className: 'cas-card-head' },
          h('span', { className: 'cas-dot' }),
          h('span', { className: 'cas-card-title' }, `分镜 · ${board.title || ''}`),
          h('span', { className: 'cas-card-meta' },
            [
              board.styleId ? `${board.styleId} ${board.styleName || ''}`.trim() : '',
              `${shots2.length} 场`,
              `${board.duration}s`,
              board.aspect || '',
            ].filter(Boolean).join(' · ')),
        ),
        h('div', { className: 'cas-sb-track' },
          shots2.map((shot, i) => h('span', {
            key: i,
            className: 'cas-sb-seg',
            title: `${shot.start}–${shot.end}s｜${shot.scene}`,
            style: {
              flexGrow: String(Math.max(0.05, Number(shot.end) - Number(shot.start))),
              background: PALETTE[i % PALETTE.length],
            },
          }, h('b', null, String(i + 1))))),
        h('div', { className: 'cas-sb-list' },
          shots2.map((shot, i) => h('div', { key: i, className: 'cas-sb-shot' },
            h('span', { className: 'cas-sb-idx', style: { background: PALETTE[i % PALETTE.length] } }, String(i + 1)),
            h('span', { className: 'cas-sb-t' }, `${Number(shot.start).toFixed(2)}–${Number(shot.end).toFixed(2)}s`),
            h('span', { className: 'cas-sb-body' },
              h('span', { className: 'cas-sb-scene' }, shot.scene || ''),
              shot.text ? h('span', { className: 'cas-sb-text' }, `字幕「${shot.text}」`) : null,
              shot.camera ? h('span', { className: 'cas-sb-cam' }, shot.camera) : null,
            ),
          ))),
        (board.warnings && board.warnings.length)
          ? h('div', { className: 'cas-warn' }, `需要留意：${board.warnings.join('；')}`)
          : null,
        h('div', { className: 'cas-sb-foot' }, '这份分镜只是草稿。确认之后再让 Agent 开始写动画；要改就直接说加场、删场、调时长或改文案。'),
      );
    }

    /**
     * The finished animation: pick a score and a container, scrub any moment, export.
     *
     * Exports are written to the session directory through the Host so the file lands
     * somewhere the user can find; the card shows that absolute path before and after
     * the export, and keeps a browser download as a secondary action.
     */
    function AnimationCard({ anim, cwd, uiWorkspace }) {
      const [scrub, setScrub] = useState(0);
      const [busy, setBusy] = useState('');
      const [progress, setProgress] = useState(0);
      const [note, setNote] = useState('');
      const [savedPath, setSavedPath] = useState('');
      const [targetDir, setTargetDir] = useState('');
      const [customDir, setCustomDir] = useState('');
      const [aspect, setAspect] = useState('16:9');
      const [playing, setPlaying] = useState(false);
      // The rendered score, exposed to the timeline so it can draw the real waveform.
      const [scoreBuffer, setScoreBuffer] = useState(null);
      const animFrameRef = useRef(null);
      const scrubRef = useRef(0);
      scrubRef.current = scrub;
      const [music, setMusic] = useState(anim.music || 'none');
      const [custom, setCustom] = useState(null);
      const [customName, setCustomName] = useState('');
      const [stage, setStage] = useState('');
      const [format, setFormat] = useState(null);
      const previewRef = useRef(null);
      const audioCtxRef = useRef(null);
      const audioSourceRef = useRef(null);
      const scoreRef = useRef(null);
      const fileRef = useRef(null);
      const frameRef = useRef(null);

      // Only offer containers this browser can actually record.
      const available = useMemo(
        () => CONTAINERS.filter((c) => c.mimes.some((m) => (
          typeof MediaRecorder !== 'undefined' && MediaRecorder.isTypeSupported && MediaRecorder.isTypeSupported(m)
        ))),
        [],
      );
      const defaultFormat = available.some((c) => c.id === 'mp4') ? 'mp4' : (available[0] && available[0].id) || 'webm';
      const activeFormat = format || defaultFormat;

      const duration = Number(anim.duration) || 8;
      const fps = Number(anim.fps) || 30;
      // Cut points come from the storyboard, so the score lands on the edits.
      const cuts = useMemo(
        () => (Array.isArray(anim.cuts) ? anim.cuts.map(Number).filter((t) => Number.isFinite(t) && t > 0) : []),
        [anim.cuts],
      );
      // In-shot visual peaks the score must hit as well as the cuts.
      const cues = useMemo(() => (Array.isArray(anim.cues) ? anim.cues : []), [anim.cues]);
      // Beats are exported from the animation code, so they are the exact sync points.
      const beats = useMemo(() => (Array.isArray(anim.beats) ? anim.beats : []), [anim.beats]);

      useEffect(() => () => { if (previewRef.current) previewRef.current.stop(); }, []);

      // Resolve the destination up front so the card can state it before exporting.
      useEffect(() => {
        let cancelled = false;
        const query = cwd ? `?dir=${encodeURIComponent(cwd)}` : '';
        fetch(`${API}/export-dir${query}`)
          .then((r) => (r.ok ? r.json() : null))
          .then((data) => { if (!cancelled && data && data.dir) setTargetDir(data.dir); })
          .catch(() => {});
        return () => { cancelled = true; };
      }, [cwd]);

      const applyScrub = useCallback((value) => {
        setScrub(value);
        const win = frameRef.current && frameRef.current.contentWindow;
        if (win && typeof win.renderAt === 'function') {
          try { win.renderAt(Number(value)); } catch { /* one bad frame must not break the card */ }
        }
      }, []);

      /** Stop the auditioning source without touching the video clock. */
      const stopAudio = useCallback(() => {
        if (audioSourceRef.current) {
          try { audioSourceRef.current.stop(); } catch { /* already ended */ }
          audioSourceRef.current = null;
        }
        if (audioCtxRef.current) {
          void audioCtxRef.current.close().catch(() => {});
          audioCtxRef.current = null;
        }
      }, []);

      const stopPlayback = useCallback(() => {
        if (animFrameRef.current) {
          cancelAnimationFrame(animFrameRef.current);
          animFrameRef.current = null;
        }
        stopAudio();
        setPlaying(false);
      }, [stopAudio]);

      /**
       * Start the score at an offset so picture and sound share one clock.
       * The buffer is rendered ahead of time, so pressing play is instant.
       */
      const startAudioAt = useCallback(async (offset) => {
        const buffer = custom || (music && music !== 'none' ? scoreRef.current : null);
        if (!buffer) return;
        const ctx = new AudioContext();
        audioCtxRef.current = ctx;
        if (ctx.state === 'suspended') {
          await Promise.race([ctx.resume().catch(() => {}), new Promise((r) => setTimeout(r, 400))]);
        }
        if (audioCtxRef.current !== ctx) { void ctx.close(); return; }
        const source = ctx.createBufferSource();
        source.buffer = buffer;
        source.connect(ctx.destination);
        source.start(0, Math.max(0, Math.min(offset, buffer.duration - 0.01)));
        audioSourceRef.current = source;
      }, [music, custom]);

      const togglePlay = useCallback(() => {
        if (playing) {
          stopPlayback();
          return;
        }
        let startT = Number(scrubRef.current);
        if (startT >= duration - 0.05) {
          startT = 0;
          applyScrub(0);
        }
        setPlaying(true);
        void startAudioAt(startT);
        const startWallTime = performance.now() - startT * 1000;
        const step = (now) => {
          const curT = (now - startWallTime) / 1000;
          if (curT >= duration) {
            applyScrub(duration);
            stopAudio();
            setPlaying(false);
            animFrameRef.current = null;
          } else {
            applyScrub(curT);
            animFrameRef.current = requestAnimationFrame(step);
          }
        };
        animFrameRef.current = requestAnimationFrame(step);
      }, [playing, duration, applyScrub, stopPlayback, startAudioAt, stopAudio]);

      useEffect(() => () => {
        if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current);
        stopAudio();
      }, [stopAudio]);

      // Render the score once so auditioning is instant and export reuses the buffer.
      // 只有模型写的 score_js 会被渲染：没有兜底引擎，拿不到就是没声音，并说明原因。
      useEffect(() => {
        if (custom) { scoreRef.current = custom; return undefined; }
        if (music === 'none') { scoreRef.current = null; setScoreBuffer(null); return undefined; }
        if (!anim.scoreUrl) {
          scoreRef.current = null;
          setScoreBuffer(null);
          setNote('这一版没有配乐代码，无法出声；请让 Agent 重新提交 score_js');
          return undefined;
        }
        let cancelled = false;
        scoreRef.current = null;

        renderModelScore(anim.scoreUrl, { duration, cuts, cues, beats })
          .then((buf) => {
            if (cancelled) return;
            if (!buf) {
              setNote('配乐代码没有渲染出声音，请让 Agent 修 score_js');
              setScoreBuffer(null);
              return;
            }
            scoreRef.current = buf;
            // Hand the buffer to the timeline so it can draw the true waveform.
            setScoreBuffer(buf);
          })
          .catch(() => {});
        return () => { cancelled = true; };
      }, [music, custom, duration, cuts, cues, beats, anim.scoreUrl]);

      // The first build effect resets the buffer; keep the timeline in step with it.
      useEffect(() => {
        if (custom) setScoreBuffer(custom);
        // eslint-disable-next-line react-hooks/exhaustive-deps
      }, [custom]);

      const onPickFile = useCallback(async (event) => {
        const file = event.target.files && event.target.files[0];
        if (!file) return;
        try {
          const buffer = await audioFileToBuffer(file, duration);
          setCustom(buffer);
          setCustomName(file.name);
          setNote(`已载入 ${file.name}，导出时会混入`);
        } catch (error) {
          setNote(`音频读取失败：${error.message}`);
        }
      }, [duration]);

      const onPickDirectory = useCallback(async () => {
        if (uiWorkspace && typeof uiWorkspace.pickDirectory === 'function') {
          try {
            const chosen = await uiWorkspace.pickDirectory();
            if (chosen) {
              setCustomDir(chosen);
              setTargetDir(chosen);
              return;
            }
          } catch (e) {
            console.warn('uiWorkspace.pickDirectory error:', e);
          }
        }
        const val = window.prompt('请输入保存视频的目标文件夹路径（绝对路径）：', customDir || targetDir || cwd || '');
        if (val && val.trim()) {
          setCustomDir(val.trim());
          setTargetDir(val.trim());
        }
      }, [uiWorkspace, customDir, targetDir, cwd]);

      const onExport = useCallback(async () => {
        if (busy) return;
        setBusy('export');
        setProgress(0);
        setNote('');
        setSavedPath('');
        setStage('');
        try {
          // The score may still be rendering when export is pressed; wait for it so the
          // exported audio is the same one the preview played. 没有兜底引擎：等不到就报错。
          let score = scoreRef.current;
          if (!score && !custom && anim.scoreUrl) {
            setStage('正在合成配乐…');
            score = await renderModelScore(anim.scoreUrl, { duration, cuts, cues, beats }).catch(() => null);
          }
          if (!custom && music !== 'none' && !score) {
            throw new Error('配乐还没合成出来，无法导出。请让 Agent 重新提交 score_js。');
          }
          const { blob, container, hasAudio, audioPeak } = await recordAnimation(frameRef.current, {
            duration,
            fps,
            cuts,
            container: activeFormat,
            musicBuffer: custom || undefined,
            scoreBuffer: score || undefined,
            clipId: anim.id,
            onStage: setStage,
            onProgress: setProgress,
          });
          if (!blob || !blob.size) throw new Error('录制结果为空');

          const wanted = custom || music !== 'none';
          // A zero peak means the browser never started audio: say so instead of
          // handing over a silent file as if it were scored.
          const audioNote = !wanted
            ? '无声'
            : (hasAudio && audioPeak > 1e-4)
              ? '含配乐'
              : '⚠ 配乐未进入录制，这段是无声的';

          const fileName = `${anim.title || anim.id || 'animation'}.${container.ext}`;

          // One click does both: download to the browser, and also write into the
          // chosen directory, so the file is never hidden in only one place.
          download(blob, fileName);

          setStage('正在写入目录…');
          try {
            const query = new URLSearchParams({ name: fileName });
            const exportDir = customDir || cwd;
            if (exportDir) query.set('dir', exportDir);
            const res = await fetch(`${API}/export?${query}`, {
              method: 'POST',
              headers: { 'content-type': blob.type || 'application/octet-stream' },
              body: blob,
            });
            const data = await res.json().catch(() => ({}));
            if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
            setSavedPath(data.path);
            setNote(`已下载并保存到 ${data.path}（${(blob.size / 1048576).toFixed(1)} MB · ${container.label} · ${audioNote}）`);
          } catch (error) {
            // The download already happened, so the render is never lost.
            setNote(`已下载 ${fileName} · ${container.label} · ${audioNote}（未写入目录：${error.message}）`);
          }
        } catch (error) {
          setNote(`导出失败：${error.message}`);
        } finally {
          setBusy('');
          setStage('');
        }
      }, [busy, duration, fps, music, custom, cuts, cues, anim, activeFormat, customDir, cwd]);

      return h('div', { className: 'cas-card' },
        h('div', { className: 'cas-card-head' },
          h('span', { className: 'cas-dot' }),
          h('span', { className: 'cas-card-title' }, anim.title || '动画'),
          h('span', { className: 'cas-card-meta' },
            [
              anim.styleId ? `${anim.styleId} ${anim.styleName || ''}`.trim() : '',
              `${duration}s`,
              `${fps}fps`,
              beats.length ? `${beats.length} 个卡点` : (cuts.length ? `${cuts.length} 个切点` : ''),
            ].filter(Boolean).join(' · ')),
          h('span', { className: 'cas-grow' }),
          h('button', {
            className: 'cas-btn cas-btn-primary',
            onClick: onExport,
            disabled: !!busy,
          }, busy === 'export' ? (stage || `录制中 ${Math.round(progress * 100)}%`) : '导出视频'),
        ),
        h('div', { className: 'cas-stage', 'data-aspect': aspect },
          h('iframe', {
            ref: frameRef,
            className: 'cas-frame',
            title: anim.title || '动画',
            src: `${API}/animation/${anim.id}`,
            sandbox: 'allow-scripts allow-same-origin',
            onLoad: () => {
              const frame = frameRef.current;
              const doc = frame && frame.contentDocument;
              const win = frame && frame.contentWindow;
              const canvas = doc && doc.querySelector('canvas');
              if (canvas && canvas.width && canvas.height) {
                const ratio = canvas.width / canvas.height;
                setAspect(ratio > 1.2 ? '16:9' : ratio < 0.85 ? '9:16' : '1:1');
              }
              if (win && typeof win.renderAt === 'function') {
                try { win.renderAt(0); } catch { /* ignore */ }
              }
            },
          }),
        ),
        h(Timeline, {
          duration,
          scrub,
          beats,
          cuts,
          cues,
          score: scoreBuffer,
          fps,
          onSeek: (t) => { stopPlayback(); applyScrub(t); },
        }),
        h('div', { className: 'cas-bar' },
          h('button', {
            className: 'cas-play-btn',
            title: playing ? '暂停' : '播放',
            onClick: togglePlay,
          }, playing ? '⏸' : '▶'),
          h('input', {
            className: 'cas-scrub', type: 'range', min: 0, max: duration, step: 0.05,
            value: scrub,
            onChange: (e) => {
              stopPlayback();
              applyScrub(e.target.value);
            },
          }),
          h('span', { className: 'cas-t' }, `${Number(scrub).toFixed(2)}s / ${duration}s`),
          h('button', {
            className: 'cas-play-btn',
            style: { width: '24px', height: '24px', fontSize: '11px' },
            title: '从头播放',
            onClick: () => {
              stopPlayback();
              applyScrub(0);
            },
          }, '↺'),
        ),
        h('div', { className: 'cas-score' },
          h('span', { className: 'cas-score-label' }, '配乐'),
          custom || (music && music !== 'none')
            ? h('span', { className: 'cas-score-prompt', title: customName || music },
                customName ? `自定义：${customName}` : music)
            : h('span', { className: 'cas-score-hint' }, '无配乐'),
          h('span', { className: 'cas-score-hint' },
            custom ? '已载入自定义音频'
              : `${cuts.length} 个切点${cues.length ? ` + ${cues.length} 个画面重点` : ''} 已卡点`),
          h('span', { className: 'cas-grow' }),
          h('button', {
            className: 'cas-btn',
            onClick: () => {
              stopPlayback();
              if (custom || music === 'none') { setCustom(null); setCustomName(''); setMusic(anim.music || ''); return; }
              setMusic('none');
            },
            disabled: !!busy,
          }, custom || music === 'none' ? '恢复配乐' : '静音'),
          h('button', {
            className: 'cas-btn',
            onClick: () => { if (fileRef.current) fileRef.current.click(); },
            disabled: !!busy,
          }, '换音频…'),
          h('input', {
            ref: fileRef, type: 'file', accept: 'audio/*',
            style: { display: 'none' }, onChange: onPickFile,
          }),
        ),
        h('div', { className: 'cas-score' },
          h('span', { className: 'cas-score-label' }, '格式'),
          available.length > 1
            ? h('select', {
                className: 'cas-select',
                value: activeFormat,
                onChange: (e) => setFormat(e.target.value),
              }, available.map((c) => h('option', { key: c.id, value: c.id }, c.label)))
            : h('span', { className: 'cas-score-hint' }, available[0] ? available[0].label : '无可用容器'),
          h('span', { className: 'cas-score-hint' },
            available.some((c) => c.id === 'mp4')
              ? 'MP4 为 H.264 + AAC，可直接发微信、剪映、Premiere'
              : '当前浏览器不支持 MP4 录制，可用 ffmpeg 转码'),
        ),
        // State the destination before the export so the file is never a mystery.
        h('div', { className: 'cas-path' },
          h('div', { style: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px', flexWrap: 'wrap' } },
            h('span', null, savedPath
              ? h('span', { className: 'cas-path-ok' }, `已保存到 ${savedPath}`)
              : (customDir || targetDir
                  ? `导出目录：${customDir || targetDir}`
                  : '导出目录：会话工作目录下的 code-animation/')),
            h('button', {
              className: 'cas-btn',
              style: { fontSize: '11px', padding: '2px 8px', height: '22px' },
              onClick: onPickDirectory,
              disabled: !!busy,
            }, '📂 选择文件夹…'),
          ),
        ),
        (anim.warnings && anim.warnings.length)
          ? h('div', { className: 'cas-warn' }, `建议检查：${anim.warnings.join('；')}`)
          : null,
        note ? h('div', { className: 'cas-note' }, note) : null,
      );
    }

    /**
     * The Turn-level creation workspace.
     *
     * It renders beneath the closing prose and outside the collapsible Tool group,
     * so the reference stills, the storyboard draft and the finished animation stay
     * visible without expanding the process log.
     */
    function CreationTail(props) {
      const data = props.turn && props.turn.data ? props.turn.data.get(KIND) : undefined;
      const useSessions = props.useSessions;
      const sessionId = props.sessionId;
      // The session's working directory decides where exports land.
      const cwd = useSessions && sessionId
        ? useSessions((state) => state.byId[sessionId]?.cwd)
        : undefined;
      if (!data) return null;

      // The reference stills and the storyboard draft render in their own Tool rows
      // (see ShowStillsRow and StoryboardRow), which exist as soon as each result
      // lands. Repeating them here would show the same card twice once the Turn ends,
      // so this Turn-level seat only carries what has no Tool row of its own.
      const latestAnim = data.animations[data.animations.length - 1];
      if (!latestAnim) return null;

      return h('div', { className: 'cas-tail' },
        h('style', null, CSS),
        h(AnimationCard, { anim: latestAnim, cwd, uiWorkspace: props.uiWorkspace }),
      );
    }

    /**
     * Fold one Turn's creation artifacts out of the session log.
     *
     * Everything is narrowed from the persisted call arguments and result text, so a
     * replayed Session reproduces the same cards with no Host change and no reliance
     * on live plugin memory.
     */
    const creationTurnDefinition = {
      kind: KIND,
      match: (event) => {
        if (event.type === 'turn/start') return { id: String(event.data.turn), role: 'start' };
        if (event.type === 'tool/call') return { id: String(event.data.turn), role: 'update' };
        // Replacement copies stay model-only; only appended results are transcript material.
        if (event.type === 'tool/result' && event.surfaceOp === 'append') {
          return { id: String(event.data.turn), role: 'update' };
        }
        return null;
      },
      start: (_context, match) => ({
        turn: match.event.data.turn,
        calls: new Map(),
        stills: null,
        storyboards: [],
        animations: [],
      }),
      update: (context, match) => {
        const state = context.state;

        if (match.event.type === 'tool/call') {
          const calls = new Map(state.calls);
          calls.set(String(match.event.data.callId), {
            name: match.event.data.name,
            argsRaw: match.event.data.arguments,
          });
          return { ...state, calls };
        }
        if (match.event.type !== 'tool/result') return state;

        const message = match.event.data.message;
        if (message.isError === true) return state;
        const call = state.calls.get(String(message.source.callId));
        if (!call) return state;

        const args = parseArgs(call.argsRaw);
        const text = (message.content || [])
          .filter((block) => block.type === 'text')
          .map((block) => block.text)
          .join('\n');

        if (call.name === 'show_stills') {
          const items = (Array.isArray(args.ids) ? args.ids : []).map((id) => {
            const key = String(id).toUpperCase();
            const match2 = new RegExp(`${key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s+([^｜\\n]+)`).exec(text);
            return {
              id: key,
              name: match2 ? match2[1].trim() : '',
              desc: (new RegExp(`${key}\\s+[^｜\\n]+｜([^\\n]+)`).exec(text) || [])[1] || '',
            };
          });
          const missing = (new RegExp('没有参考静帧：([^\\n（]+)').exec(text) || [])[1];
          return {
            ...state,
            stills: {
              items,
              note: typeof args.note === 'string' ? args.note : '',
              missing: missing ? missing.split('、').map((s) => s.trim()).filter(Boolean) : [],
            },
          };
        }

        if (call.name === 'save_storyboard') {
          const shots = Array.isArray(args.shots) ? args.shots : [];
          // Shot starts after 0 are the cut points the score will be fitted to.
          const cuts = shots
            .map((s) => Number(s.start))
            .filter((t) => Number.isFinite(t) && t > 0.05)
            .sort((a, b) => a - b);
          return {
            ...state,
            storyboards: [...state.storyboards, {
              title: String(args.title || ''),
              styleId: String(args.style_id || ''),
              styleName: '',
              duration: Number(args.duration) || 0,
              aspect: String(args.aspect || ''),
              music: String(args.music || ''),
              cuts,
              shots: shots.map((s, i) => ({
                index: i + 1,
                start: Number(s.start) || 0,
                end: Number(s.end) || 0,
                scene: String(s.scene || ''),
                text: String(s.text || ''),
                camera: String(s.camera || ''),
              })),
              warnings: (new RegExp('需要留意：([^\\n]+)').exec(text) || [])[1]
                ? (new RegExp('需要留意：([^\\n]+)').exec(text))[1].split('；').map((s) => s.trim()).filter(Boolean)
                : [],
            }],
          };
        }

        if (call.name === 'save_animation') {
          const id = (new RegExp(`${API}/animation/([A-Za-z0-9_-]+)`).exec(text) || [])[1]
            || String(args.storyboard_id || '').replace(/^sb-/, 'anim-');
          if (!id) return state;
          const warn = (new RegExp('^(?:注意|建议检查)：(.+)$', 'm').exec(text) || [])[1];
          // The linked storyboard supplies the cut points, so the score can be fitted
          // to the real edits rather than to a fixed tempo.
          const board = state.storyboards.find((b) => b.id === args.storyboard_id)
            || state.storyboards[state.storyboards.length - 1];
          // The card can only play the model's score if it knows where it lives.
          // 先读回执里的「配乐地址」，读不到就直接按 id 拼：配乐现在是必填项，每次保存
          // 都一定写了 <id>.score.js，所以这个地址永远有效——不再依赖回执文案的措辞。
          const scoreUrl = (new RegExp('配乐地址：([^\\s]+)').exec(text) || [])[1] || `${API}/score/${id}`;
          return {
            ...state,
            animations: [...state.animations, {
              id,
              title: String(args.title || ''),
              styleId: String(args.style_id || ''),
              styleName: '',
              duration: Number(args.duration) || 8,
              fps: Number(args.fps) || 30,
              music: String(args.music || (board && board.music) || ''),
              scoreUrl,
              cuts: board ? board.cuts || [] : [],
              cues: Array.isArray(args.cues) ? args.cues : [],
              beats: Array.isArray(args.beats) ? args.beats : [],
              warnings: warn ? warn.split('；').map((s) => s.trim()).filter(Boolean) : [],
            }],
          };
        }

        return state;
      },
      buildLocationData: (context, scope, previous) => {
        if (scope !== 'turn' || context.state === undefined) return null;
        const state = context.state;
        // Reuse the previous value when nothing changed, so the snapshot does not republish.
        if (
          previous && previous.kind === 'turn' && previous.turn === state.turn && previous.key === KIND
          && previous.value.stills === state.stills
          && previous.value.storyboards === state.storyboards
          && previous.value.animations === state.animations
        ) return previous;
        return {
          kind: 'turn',
          turn: state.turn,
          key: KIND,
          value: {
            stills: state.stills,
            storyboards: state.storyboards,
            animations: state.animations,
          },
        };
      },
    };

    /**
     * Rebuild a storyboard card model from the Tool result's structured `meta`.
     *
     * The Host echoes the validated draft as `meta`, so this path uses the stored
     * fields instead of re-parsing the rendered prose the way the Turn fold does.
     */
    function boardFromMeta(meta) {
      if (!meta || !Array.isArray(meta.shots)) return null;
      const shots = meta.shots;
      return {
        id: String(meta.id || ''),
        title: String(meta.title || ''),
        styleId: String(meta.styleId || ''),
        styleName: String(meta.styleName || ''),
        duration: Number(meta.duration) || 0,
        aspect: String(meta.aspect || ''),
        music: String(meta.music || ''),
        cuts: shots
          .map((s) => Number(s.start))
          .filter((t) => Number.isFinite(t) && t > 0.05)
          .sort((a, b) => a - b),
        shots: shots.map((s, i) => ({
          index: Number(s.index) || i + 1,
          start: Number(s.start) || 0,
          end: Number(s.end) || 0,
          scene: String(s.scene || ''),
          text: String(s.text || ''),
          camera: String(s.camera || ''),
        })),
        warnings: Array.isArray(meta.warnings) ? meta.warnings : [],
      };
    }

    /**
     * Inline Tool views for the two cards the flow depends on.
     *
     * The Turn-level `turnTail` only publishes on `turn/end`, so during the Turn —
     * exactly when the user is being asked to choose a style or approve a draft —
     * those cards are not mounted yet. These views render the same content in the
     * Tool row that produced it, which exists as soon as its result lands.
     */
    function ShowStillsRow(props) {
      const { block } = props || {};
      const meta = block && block.meta;
      const shown = meta && Array.isArray(meta.shown) ? meta.shown : null;
      if (!shown || !shown.length) return null;
      return h('div', { className: 'cas-tail cas-inline' },
        h('style', null, CSS),
        h(StillGallery, {
          // The Host names the field `description`; the gallery renders `desc`.
          stills: shown.map((item) => ({
            id: String(item.id || ''),
            name: String(item.name || ''),
            desc: String(item.description || ''),
          })),
          note: String(meta.note || ''),
          missing: Array.isArray(meta.missing) ? meta.missing : [],
        }),
      );
    }

    /** 区块清单的元数据 → 渲染用结构。 */
    function outlineFromMeta(meta) {
      if (!meta || !Array.isArray(meta.sections)) return null;
      return {
        id: String(meta.id || ''),
        title: String(meta.title || ''),
        styleId: String(meta.styleId || ''),
        styleName: String(meta.styleName || ''),
        sections: meta.sections,
      };
    }

    /** 区块清单卡片：逐块列出名称、版式、文案，供用户拍板。 */
    function OutlineRow(props) {
      const outline = outlineFromMeta(props && props.block && props.block.meta);
      if (!outline) return null;
      return h('div', { className: 'cas-tail cas-inline' },
        h('style', null, CSS),
        h('div', { className: 'cas-card' },
          h('div', { className: 'cas-card-head' },
            h('span', { className: 'cas-dot' }),
            h('span', { className: 'cas-card-title' }, outline.title || '页面区块'),
            h('span', { className: 'cas-card-meta' },
              `${outline.sections.length} 块${outline.styleId ? ` · ${outline.styleId}` : ''}`),
          ),
          h('div', { className: 'cas-outline' },
            outline.sections.map((sec) => h('div', { className: 'cas-outline-row', key: `s${sec.index}` },
              h('span', { className: 'cas-outline-idx' }, String(sec.index)),
              h('span', { className: 'cas-outline-name' }, sec.name || ''),
              h('span', { className: 'cas-outline-rest' },
                [sec.layout, sec.text || sec.content].filter(Boolean).join(' · ')),
            )),
          ),
        ),
      );
    }

    /** 三种预览宽度的定义。 */
    const PAGE_WIDTHS = [
      { id: 'desktop', w: 1440, label: '桌面' },
      { id: 'tablet', w: 834, label: '平板' },
      { id: 'phone', w: 390, label: '手机' },
    ];

    /**
     * 页面卡片：iframe 按目标宽度渲染，再用 transform 等比缩到容器里。
     *
     * 直接给 iframe 设 1440px 宽会把卡片撑破，所以量出容器宽度后算一个 scale，
     * 既保住页面真实的桌面布局，又不会出现横向滚动条。
     */
    function PageCard(props) {
      const meta = (props && props.block && props.block.meta) || {};
      const id = String(meta.id || '');
      const [width, setWidth] = useState('desktop');
      const [scale, setScale] = useState(1);
      const wrapRef = useRef(null);
      const target = PAGE_WIDTHS.find((w) => w.id === width) || PAGE_WIDTHS[0];

      useEffect(() => {
        const el = wrapRef.current;
        if (!el || typeof ResizeObserver === 'undefined') return undefined;
        const fit = () => setScale(Math.min(1, el.clientWidth / target.w));
        fit();
        const ro = new ResizeObserver(fit);
        ro.observe(el);
        return () => ro.disconnect();
      }, [target.w]);

      if (!id) return null;
      const height = Math.round(900 * scale);

      const onDownload = () => {
        fetch(`${API}/page/${id}`)
          .then((r) => (r.ok ? r.text() : Promise.reject(new Error(`HTTP ${r.status}`))))
          .then((text) => {
            const url = URL.createObjectURL(new Blob([text], { type: 'text/html;charset=utf-8' }));
            const a = document.createElement('a');
            a.href = url;
            a.download = `${String(meta.title || 'page').replace(/[\\/:*?"<>|]+/g, '_')}.html`;
            document.body.appendChild(a);
            a.click();
            a.remove();
            setTimeout(() => URL.revokeObjectURL(url), 4000);
          })
          .catch(() => {});
      };

      return h('div', { className: 'cas-tail cas-inline' },
        h('style', null, CSS),
        h('div', { className: 'cas-card' },
          h('div', { className: 'cas-card-head' },
            h('span', { className: 'cas-dot' }),
            h('span', { className: 'cas-card-title' }, meta.title || '页面'),
            h('span', { className: 'cas-card-meta' }, meta.styleName || ''),
          ),
          h('div', { className: 'cas-page-wrap', ref: wrapRef, style: { height: `${height}px` } },
            h('iframe', {
              className: 'cas-page-frame',
              src: `${API}/page/${id}`,
              title: meta.title || '页面预览',
              style: { width: `${target.w}px`, height: '900px', transform: `scale(${scale})` },
            }),
          ),
          h('div', { className: 'cas-page-bar' },
            h('span', { className: 'cas-page-meta' }, `${meta.sections || 0} 个区块`),
            h('span', { className: 'cas-grow' }),
            PAGE_WIDTHS.map((w) => h('button', {
              key: w.id,
              type: 'button',
              className: 'cas-wbtn',
              'data-on': width === w.id ? '1' : '0',
              onClick: () => setWidth(w.id),
            }, w.label)),
            h('button', { type: 'button', className: 'cas-btn cas-btn-primary', onClick: onDownload }, '下载 HTML'),
          ),
        ),
      );
    }

    function StoryboardRow(props) {
      const { block } = props || {};
      const board = boardFromMeta(block && block.meta);
      if (!board) return null;
      return h('div', { className: 'cas-tail cas-inline' },
        h('style', null, CSS),
        h(StoryboardCard, { board }),
      );
    }

    /**
     * 样式库视图：把 333 种已上架风格连同参考图一次列全。
     *
     * 目录来自 Host 的 /code-animation-api/styles，参考图走 /still/<id>，两者都只
     * 认已上架的风格，所以这里看到的就是 Agent 能选到的那一批。
     *
     * 它注册成 conversation.view，也就是「对话 / 轨迹」旁边多出来的那个页签。
     */
    function StyleLibrary({ sessionId, useSessions }) {
      const selector = useMemo(() => (state) => {
        const value = state.byId[sessionId]?.projectionValues?.agentPreset;
        return typeof value === 'string' ? value : undefined;
      }, [sessionId]);
      const preset = useSessions(selector);
      const [data, setData] = useState(null);
      const [error, setError] = useState('');
      const [query, setQuery] = useState('');
      const [series, setSeries] = useState('*');
      const [zoom, setZoom] = useState('');

      useEffect(() => {
        let alive = true;
        fetch(`${API}/styles`)
          .then((response) => (response.ok ? response.json() : Promise.reject(new Error(`HTTP ${response.status}`))))
          .then((payload) => { if (alive) setData(payload); })
          .catch((cause) => { if (alive) setError(cause.message || '目录加载失败'); });
        return () => { alive = false; };
      }, []);

      useEffect(() => {
        const onKey = (event) => { if (event.key === 'Escape') setZoom(''); };
        window.addEventListener('keydown', onKey);
        return () => window.removeEventListener('keydown', onKey);
      }, []);

      const all = (data && data.styles) || [];
      const list = useMemo(() => {
        const keyword = query.trim().toLowerCase();
        return all.filter((style) => {
          if (series !== '*' && style.series !== series) return false;
          if (!keyword) return true;
          return [style.id, style.name, style.en, style.description, style.fit, (style.tags || []).join(' ')]
            .join(' ').toLowerCase().includes(keyword);
        });
      }, [all, query, series]);

      const chips = [{ id: '*', name: '全部' }, ...((data && data.series) || [])];

      // 这个页签对所有会话都注册，但只有创作模式的会话有内容可看。
      if (preset !== 'code-animation') {
        return h('div', { className: 'cas-lib-view' },
          h('style', null, CSS),
          h('div', { className: 'cas-lib-empty' }, '样式库只在创作模式的会话里可用'));
      }

      return h('div', { className: 'cas-lib-view' },
        h('style', null, CSS),
        h('div', { className: 'cas-lib-head' },
          h('span', { className: 'cas-lib-title' }, '样式库'),
          h('span', { className: 'cas-lib-count' }, error || `${list.length} / ${all.length}`),
          h('input', {
            className: 'cas-lib-search',
            placeholder: '搜编号、名字、气质或题材，例如 水墨 / 赛博 / B3',
            value: query,
            onChange: (event) => setQuery(event.target.value),
          }),
        ),
        h('div', { className: 'cas-lib-chips' },
          chips.map((chip) => h('button', {
            key: chip.id,
            type: 'button',
            className: 'cas-chip',
            'data-on': series === chip.id ? '1' : '0',
            onClick: () => setSeries(chip.id),
          }, chip.id === '*' ? chip.name : `${chip.id} ${chip.name}`)),
        ),
        h('div', { className: 'cas-lib-body' },
          error
            ? h('div', { className: 'cas-lib-empty' }, `目录加载失败：${error}`)
            : !data
              ? h('div', { className: 'cas-lib-empty' }, '正在加载…')
              : !list.length
                ? h('div', { className: 'cas-lib-empty' }, '没有匹配的风格')
                : h('div', { className: 'cas-lib-grid' },
                  list.map((style) => h('button', {
                    key: style.id,
                    type: 'button',
                    className: 'cas-lib-card',
                    title: [style.description, style.fit].filter(Boolean).join(' · '),
                    onClick: () => setZoom(style.stillUrl),
                  },
                  h('img', { src: style.stillUrl, alt: `${style.id} ${style.name}`, loading: 'lazy' }),
                  h('div', { className: 'cas-lib-cap' },
                    h('span', { className: 'cas-lib-id' }, style.id),
                    h('span', { className: 'cas-lib-name' }, style.name),
                    h('span', { className: 'cas-lib-desc' }, style.description || style.fit || ''),
                  ),
                  ))),
        ),
        zoom
          ? h('div', {
            className: 'cas-lightbox',
            onClick: () => setZoom(''),
          }, h('img', { src: zoom, alt: '' }))
          : null);
    }

    return {
      inject: ['slots', 'uiConversation'],
      apply(ctx) {
        ctx.effect(() => ctx.uiConversation.events.register(creationTurnDefinition), 'code-animation-studio:turn-data');

        ctx.slots.inject('conversation.chat.turnTail', () => ctx.slots.register({
          name: 'conversation.chat.turnTail',
          id: 'code-animation-studio',
          order: 30,
          label: '代码动画',
        }, (props) => h(CreationTail, { ...props, uiWorkspace: ctx.get('uiWorkspace') })));

        // One view per producing Tool, keyed by the wire Tool name.
        ctx.slots.inject('tool.call.toolview', function* () {
          yield ctx.slots.register({
            name: 'tool.call.toolview',
            key: 'show_stills',
          }, ShowStillsRow);
          yield ctx.slots.register({
            name: 'tool.call.toolview',
            key: 'save_storyboard',
          }, StoryboardRow);
          yield ctx.slots.register({
            name: 'tool.call.toolview',
            key: 'save_outline',
          }, OutlineRow);
          yield ctx.slots.register({
            name: 'tool.call.toolview',
            key: 'save_page',
          }, PageCard);
        });

        // 样式库做成「对话 / 轨迹」旁边的第三个页签：view 槽的每个注册就是页签行
        // 里的一项，内容由同一个组件渲染。非创作模式的会话也能点开，里面只说明
        // 它属于创作模式，不报错也不空白。
        ctx.slots.inject('conversation.view', () => ctx.slots.register({
          name: 'conversation.view',
          id: 'styles',
          order: 20,
          label: '样式库',
        }, StyleLibrary));
      },
    };
  },
});
