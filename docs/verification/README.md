# 验证脚本

用 Playwright 在真实浏览器里跑，模型响应用 `page.route` 拦截，所以结果是确定的、不花钱、不联网。

## 怎么跑

```bash
# 1. 在仓库根目录起一个静态服务器
python3 -m http.server 8899

# 2. 另开一个终端
NODE_PATH=$(npm root -g) node docs/verification/<脚本>.js
```

可用环境变量：`BASE`（默认 `http://localhost:8899`）、`CHROME`（Chromium 可执行文件路径）、`SHOT_DIR`（截图目录）。

## 各脚本守着什么

| 脚本 | 守着的东西 |
|---|---|
| `wiki-demo.js` | 拿一篇维基百科文本从零标到底，然后**回查每一步到底有没有覆盖原文**，逐句给出严格口径 / 后端宽松口径两个覆盖率和"真正丢失"的词 |
| `skill-update-test.js` | 对话里接受的修订**真的进了下一次 prompt**（标准只有一条：新 prompt 里字面包含那条规则），且刷新后仍在 |
| `replay-test.js` | replay 模式查得到录制数据；查不到时**说对是哪一种情况**（文档没录制 vs. 当年导出漏了这一步） |
| `i18n-threads-test.js` | 中英切换在两个方向上都干净、刷新后保持；每个节点的对话彼此独立，且能互相跳转 |
| `boot-banner-test.js` | 用 `file://` 打开时，红色横幅必须出现并说清原因（否则页面看着能用、其实一行 JS 都没跑）；用 HTTP 打开时横幅消失且语言按钮真的能切 |
| `i18n-leak-test.js` | 英文模式下走一遍全流程，屏幕上**一个中文字都不应该出现**（语言按钮和中文语料标题按 DOM 排除，不靠字符串白名单） |

失败判定：`replay-test.js` 和 `i18n-leak-test.js` 以退出码报告结果（非 0 即失败）；其余脚本把每条断言打印成 `true` / `false`，看输出即可。所有脚本都会统计控制台错误和 `pageerror`，**期望是 0**。
