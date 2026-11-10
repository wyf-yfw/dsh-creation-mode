<div align="center">

<img src="docs/cover.png" alt="创作模式" width="100%">

# 创作模式

333 种代码动画风格，接入 DeepSeek Harness 对话框：说一句话就出片。

[![stars](https://badgen.net/github/stars/wyf-yfw/dsh-creation-mode?icon=github&color=ff8a3d)](https://github.com/wyf-yfw/dsh-creation-mode/stargazers)
[![license](https://badgen.net/badge/license/MIT/3ea675)](LICENSE)
[![DeepSeek Harness](https://badgen.net/badge/DeepSeek%20Harness/plugin/4d6bfe)](https://github.com/deepseek-ai/dsh)
[![npm](https://badgen.net/npm/v/dsh-creation-mode?color=cb3837)](https://www.npmjs.com/package/dsh-creation-mode)
[![styles](https://badgen.net/badge/styles/333/e0457b)](docs/styles.md)
[![deps](https://badgen.net/badge/deps/0/2f9e6e)](docs/internals.md#限制)

[快速开始](#快速开始) · [文档](#文档) · [风格库](docs/styles.md) · [配乐](docs/music.md) · [导出](docs/export.md)

</div>

---

## 这是什么

把 [XiaoyeCodes/code-animation-prompts](https://github.com/XiaoyeCodes/code-animation-prompts)
的 333 种风格提示词封装成 DeepSeek Harness 的一个 Agent 模式。每种风格都配了参考静帧，
选之前能先看到画面。

对话里的 Agent 会问你想要什么，挑几条风格给你看画面，和你确认分镜，然后**自己写 HTML + Canvas
把片子做出来**——不经过第二次模型调用。成品以卡片形式出现在对话里，可直接拖动预览、试听配乐、
导出 MP4。

- **零依赖**：不用 ffmpeg、playwright 或任何网络服务，导出由浏览器完成
- **333 种风格**：10 个系列，覆盖国风水墨、像素游戏、赛博、奥斯卡电影等
- **配乐也是现写的**：每个片子都由 Agent 现场写 Web Audio 合成代码，没有内置曲库、没有兜底
- **6 个工具**：检索风格、贴参考图、读规范、提交分镜、产出动画、取工艺参考
- **13 份工艺参考**：缓动、转场、排版、调色、特效、粒子、镜头、图表、音画、音色、文案，按需加载

<div align="center">
<img src="docs/mode-picker.png" alt="模式选择器中的创作模式" width="82%">
</div>

---

## 快速开始

要求 dsh `0.2.1` 及以上。

<div align="center">
<img src="docs/demo.webp" alt="创作模式演示：说需求、选风格、改分镜、导出成片" width="82%">
</div>

<p align="center"><sub>48 秒演示，画面与配乐都是插件在对话里当场生成的 · 动图无声音，<a href="docs/demo.mp4">看完整版（含配乐）</a></sub></p>

### 安装

三种装法，任选一种。前两种效果相同，只是入口不同。

**① 命令安装**

```bash
dsh plugin --profile web add -w dsh-creation-mode
```

`-w` 不能省：profile 目录带 `pnpm-workspace.yaml`，不加会被 pnpm 当成往 workspace 根装而报
`ERR_PNPM_ADDING_TO_ROOT`。装完 DSH 会自动把它登记进 `dsh.profile.bundles`。

**② 界面安装**

打开 DSH 的「添加插件」对话框，输入包名点安装：

```
dsh-creation-mode
```

**③ 从源码安装**（要改代码时用）

```bash
git clone https://github.com/wyf-yfw/dsh-creation-mode.git
dsh plugin --profile web add -w ./dsh-creation-mode/plugin
```

`add` 一个本地目录会用 link 方式安装，改代码即时生效。

包在 npm 上：<https://www.npmjs.com/package/dsh-creation-mode>，官方源与 npmmirror 镜像源都能装。

### 更新

命令行直接覆盖装最新版，**不用先卸载**：

```bash
dsh plugin --profile web add -w dsh-creation-mode
```

版本号是可选的——不写就是装 npm 上的 `latest`。想锁版本时再写：

```bash
dsh plugin --profile web add -w dsh-creation-mode@3.1.0
```

重启 `dsh web` 后生效——插件模块在进程启动时导入一次，不重启会继续跑旧版本。
已存在的会话保留旧版本，验证新版请新建会话。

> 界面里的「添加插件」会提示「该插件已安装」，那是 `installBundle` 的检查：界面上要先卸载再装。
> 两条路都能更新，命令行省一步。

### 使用

装完新建会话，在模式选择器里选「创作模式」，然后用自然语言说需求：

```text
想做一个 8 秒的竖屏短片，讲「首屏加载从 3.2 秒压到 0.8 秒」，
发在朋友圈，要爽快、有冲击力，主色 #4D6BFE。
```

```text
用 A1 字雨做一个 5 秒的动画：屏幕上不断落下「已读」「未回」「在吗」，
越堆越多，最后压成一堵墙。16:9，30fps，深色背景。
```

Agent 会依次走完六步：问需求 → 推荐风格并贴参考图 → 你拍板风格 → 出分镜草稿 → 你拍板分镜 →
写动画并交付。**两道确认门禁**（风格、分镜）不能跳过，因为那是返工成本最低的两个位置。

---

## 文档

| 文档 | 内容 |
|---|---|
| [使用指南](docs/guide.md) | 六步流程、两道门禁、界面说明、示例输入 |
| [工具参考](docs/tools.md) | 6 个工具的参数、分镜校验、交付契约校验 |
| [工艺参考](docs/references.md) | 13 份按需加载的工艺文档、加载时机、新增方式 |
| [风格库](docs/styles.md) | 10 个系列的构成、上架白名单、补图流程 |
| [配乐](docs/music.md) | 现场写合成代码、28 条音色配方、卡点、自定义音频 |
| [导出](docs/export.md) | 浏览器录制 MP4 的机制与参数 |
| [架构与运维](docs/internals.md) | 挂载方式、卡片渲染位置、已知限制、故障排查 |
| [浏览式插件市场](docs/market.md) | 在插件页按关键词浏览安装（可选） |
| [素材来源与许可](docs/credits.md) | 第三方素材出处与参与方式 |

---

## 许可

代码 MIT。风格提示词与参考静帧来自上游项目，许可见[素材来源与许可](docs/credits.md)。
