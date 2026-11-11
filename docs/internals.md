# 架构与运维

插件挂载方式、卡片渲染位置、已知限制与故障排查。

> 返回 [README](../README.md)

---

![架构](architecture.png)

一个 bundle 插两行，挂进两个作用域：路由归 profile，工具归预设。

同一个插件挂载两次，职责分离。preset 会挂载进每个 Agent 作用域，而 HTTP 路由是 profile 级的，
两处都注册路由会冲突：

```
code-animation-studio (dsh-creation-mode):
  webserver: duplicate prefix route "/code-animation-api"
```

因此路由归 profile 层，工具归 preset 层，各自由 `config.routes` 与 `config.tools` 控制。

## 卡片渲染位置

```
conversation.chat.node（工具组）
  └─ tool.call.toolview     工具行；show_stills / save_storyboard 的卡片挂在这里
                            （回合进行中即渲染，随结果落地可见）

conversation.chat.turnTail（回合末尾，始终展开）
  └─ code-animation-studio  动画预览（回合结束后才发布）
```

卡片位置是实测出来的：`turnTail` 只在 `turn/end` 发布，而用户是在回合**进行中**
被要求选风格、拍板分镜的，那时它还没渲染，所以静帧与分镜改挂在产生它们的工具行上。

数据来自 `uiConversation.events.register()` 注册的回合级投影：将每个回合中
`show_stills`、`save_storyboard`、`save_animation` 的落盘参数与结果文本折叠为一份回合数据。
工具行卡片则直接读工具结果的 `meta`（Host 回传的结构化草稿），不再正则解析文本。
数据源为会话日志而非插件内存，因此刷新页面与重放历史会话均可还原。

## 目录

```
dsh-creation-mode/
├── plugin/                  # npm 包 dsh-creation-mode（bundle 根）
│   ├── index.js             # Host：路由与挂载；按 config 决定装载哪一半
│   ├── flow.js              # 六步流程与门禁的系统提示段落
│   ├── tools.js             # 八个工具的 schema、校验与执行
│   ├── references/          # 十三份工艺参考，get_reference 按需加载
│   ├── data.js              # 风格目录的检索、投影与风格到配乐的映射
│   ├── client.js            # 浏览器端：回合末尾卡片（含配乐引擎）
│   ├── src/ui.js            # client.js 的可读源码
│   ├── src/music.js         # 程序化配乐：八个预设、卡点拟合、离线渲染
│   ├── styles.json          # 333 条风格提示词
│   ├── stills/              # 参考静帧；approved.json 是上架白名单，index.json 是上游清单
│   └── cordis.patch.yml     # 两行：根行开启路由；预设行声明「创作模式」
├── market.json              # format 1 插件市场索引
└── docs/
    ├── cover.html           # 封面源码
    ├── cover.png
    ├── architecture.html    # 架构图源码
    ├── architecture.png
    ├── mode-picker.png
    ├── shoot.cjs            # HTML → PNG 渲染（无依赖）
    ├── sound-samples/       # 乐器试听样本
    └── *.md                 # 本目录下的分册文档
```

## 重新生成图

封面与架构图都由 HTML 渲染。改完源文件后执行：

```bash
node docs/shoot.cjs docs/cover.html        docs/cover.png        1280 640
node docs/shoot.cjs docs/architecture.html docs/architecture.png 1200 700
```

用法是 `shoot.cjs <源 html> <输出 png> [宽] [高] [缩放]`，默认 2 倍缩放。
脚本通过 Chrome DevTools Protocol 驱动无头浏览器，**无 npm 依赖**：自动查找本机
Chrome / Edge / Chromium，或用 `CHROME=<路径>` 指定。

在 WSL 下也能用——脚本会自动选中 Windows 的 Chrome，把页面起在临时本地 HTTP 服务上
（Windows 能访问 WSL 的 localhost），并把用户目录参数转成 Windows 路径。

---

---

- **升级插件后需重启 dsh**，见 [故障排查](#故障排查)
- 导出为实时录制：8 秒 30fps 约需 8 秒，期间切换标签页会被浏览器节流
- 导出需手动点击，不自动执行：`AudioContext` 需要用户手势，且录制耗时与片长成正比
- MP4 录制需要 Chromium 111+；Firefox 将回退至 WebM
- 配乐为程序化合成，非真实乐器录音
- 自定义音频仅在浏览器内混入，不上传，不写回工作区
- 风格提示词中的 `{{ }}` 占位符原样保留，由 Agent 在生成时填入
- 动画必须渲染到 `<canvas>`；纯 DOM / CSS 动画可预览但无法录制

---

---

## 规则：更新插件后必须重启 dsh

Agent 创建模式挂载的是 `dsh-creation-mode` 模块的一个实例，该模块在 **dsh 进程启动时导入一次**
并留在 ESM 缓存中。在 Web 界面里禁用再启用插件行不会重新导入模块，因此：

- 修改或升级插件后，**必须重启 `dsh web`**
- 未重启时，创作模式运行的是旧版本：可能缺少工具、卡片不渲染、或界面提示与实际不符
- 已存在的会话保留创建时的插件版本；验证新版行为请新建会话

## 检查当前加载的版本

```bash
curl -s http://127.0.0.1:3080/code-animation-api/health
```

```json
{
  "ok": true,
  "rev": 24,
  "tools": ["list_styles", "show_stills", "get_style", "save_storyboard", "save_animation", "get_reference"],
  "styles": 333,
  "stills": 333
}
```

| 字段 | 判读 |
|---|---|
| 缺少 `rev` / `tools` | 加载的是 rev 3 之前的版本，需要重启 |
| `rev` 低于仓库中的 `BUILD_REV` | 加载的是旧版本，需要重启 |
| `tools` 少于五项 | 同上 |
| `styles` / `stills` 与上架数不符 | 白名单未生效，检查 `stills/approved.json` |

`BUILD_REV` 定义在 `plugin/data.js`，工具名或结果结构变化时应递增。

## 卡片没有出现

依次检查：

1. `health` 的 `rev` 是否与仓库一致；不一致则重启
2. 该会话是否在**创作模式**下创建；其他模式不挂载这些工具
3. 会话中是否调用过 `save_animation`；只有调用过才有卡片
4. 浏览器控制台是否有 `slot entry crashed` 报错

## Agent 自己写脚本或去装 ffmpeg

这是工具不可用的典型表现：没有 `save_storyboard` 时，Agent 会尝试用命令行自行录制。
按上一节确认 `tools` 齐全后重启即可。`plugin/flow.js` 中也已明确禁止自建录制脚本、
禁止查找或安装 ffmpeg、禁止使用 playwright。

---
