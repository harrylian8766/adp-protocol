# ADP v01 IETF Datatracker 提交指南

## 你需要准备的文件

以下文件在 `adp-protocol/rfc/` 目录：

| 文件 | 说明 |
|---|---|
| `draft-pro-adp-agent-discovery-01.md` | Markdown 源文档（已更新） |
| `draft-pro-adp-agent-discovery-01.txt` | 纯文本渲染稿 |
| `draft-pro-adp-agent-discovery-01.xml` | RFC XML v3 格式（新生成） |

## 提交步骤

### 方法一：在线提交（推荐）

1. 打开 https://datatracker.ietf.org/submit/
2. 用 IETF 账号登录
3. 上传 `draft-pro-adp-agent-discovery-01.xml`
4. 确认信息后提交
5. 提交后 v01 倒计时重置为 6 个月

### 方法二：通过 Author Tools 转换（备选）

1. 打开 https://author-tools.ietf.org/
2. 上传 `draft-pro-adp-agent-discovery-01.md`
3. 选择输出格式：XML
4. 下载生成的 XML
5. 到 https://datatracker.ietf.org/submit/ 上传

## v01 变更摘要（供 Datatracker 变更说明）

```
- Updated IANA Considerations: service name "ai-adp" registered
  (2026-06-12) in Service Name and Transport Protocol Port Number
  Registry
- Updated document date to 2026-06-13
- Updated version history
```

## 提交后

提交成功后，新版本 6 个月内有效（到期 2026-12-13 左右），
期间可继续收集反馈准备后续修订。
