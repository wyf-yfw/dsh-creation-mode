# 素材来源与许可

第三方素材的出处、许可与参与方式。

> 返回 [README](../README.md)

---

| 部分 | 许可 |
|---|---|
| 插件代码（`index.js`、`tools.js`、`data.js`、`flow.js`、`client.js`、`src/`） | MIT |
| 风格提示词 | 基础库来自 [XiaoyeCodes/code-animation-prompts](https://github.com/XiaoyeCodes/code-animation-prompts)，遵循其 `LICENSE.md` 与 `references/attribution.md` |
| 参考静帧 | 上游原始静帧（333 张，即当前上架部分）遵循同一许可 |
| 其中 L / V / X 系列 | 分别来自 Lemo-Opuscar、mg-styles-15、code-video，第三方许可见原仓库 `assets/library/第三方许可/` |

再分发时请保留上述署名与第三方许可。素材版权归原作者。

---

---

Issue 与 PR 均可。以下方向尚未实现：

- [ ] 服务端导出 MP4，接入 ffmpeg 以避开浏览器的实时录制约束
- [ ] 将封面图或首帧写回会话，使 Agent 能检视自身产出
- [ ] 风格收藏与自定义风格目录
- [ ] 导出直接写入工作区文件，而非浏览器下载

---

<div align="center">

<sub>为 <a href="https://github.com/deepseek-ai/dsh">DeepSeek Harness</a> 构建 ·
风格库来自 <a href="https://github.com/XiaoyeCodes/code-animation-prompts">code-animation-prompts</a></sub>

</div>

## Motion Prompt

`plugin/vendor/motion-prompt/` 原样收录了 [showheyohtaki/motion-prompt](https://github.com/showheyohtaki/motion-prompt)
的 5 个包（motion / motion2 / ui / lp / lp2，共 120 条），未做任何改写。

- 作者：Shohei Ohtaki
- 授权：MIT，全文见 `plugin/vendor/motion-prompt/LICENSE`
- 抓取提交与日期见 `plugin/vendor/motion-prompt/SOURCE.md`
