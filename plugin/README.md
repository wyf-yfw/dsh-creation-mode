# 创作模式 / Creation Mode

255 种代码动画风格，在 [DeepSeek Harness](https://github.com/deepseek-ai/dsh) 的对话框里直接出片：
选风格 → 看参考静帧 → 审分镜 → 生成 HTML 动画 → 预览并导出 MP4。

一个 bundle 同时提供两件事：

- **profile 根行**：用 HTTP 提供风格目录、参考静帧与生成好的动画；
- **创作模式预设**：在模式选择器里新增「创作模式」，挂载 5 个创作工具
  （`list_styles`、`show_stills`、`get_style`、`save_storyboard`、`save_animation`）。

## 安装

```bash
dsh plugin --profile web add dsh-creation-mode
```

装完新建会话，在模式选择器里选「创作模式」。

## 文档

完整文档、风格库清单与配乐说明见仓库：
<https://github.com/wyf-yfw/dsh-creation-mode>

## 许可

MIT
