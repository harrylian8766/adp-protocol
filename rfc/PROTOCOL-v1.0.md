# Agent Discovery Protocol (ADP) v1.0

> **定位：基于域名 + DNS + HTTPS 的 AI Agent 发现协议**
> 
> 状态：Draft  
> 作者：Pro 🐙（基于与 Harry 的讨论）  
> 日期：2026-06-09  
> 协议标识符：`urn:adp:1`

---

## 1. 设计原则

1. **站在肩膀上** — 复用 DNS、HTTPS、TXT/SRV 记录、Well-Known URI、WebFinger 等成熟标准，不另造轮子
2. **渐进发现** — 三层递进：DNS 轻量发现 → Well-Known 元数据 → 完整端点交互
3. **域名即身份** — 域名是 Agent 的唯一标识符，不需要额外的注册表或 DHT
4. **人机通用** — 同一份输出人类可读（浏览器）、Agent 可解析（结构化 JSON/microdata）
5. **安全内置** — 公钥绑定在 DNS 记录中，防止中间人攻击
6. **零配置可发现** — 知道域名就够，不需要预装证书或注册账号

---

## 2. 协议层次

```
Layer 1: DNS 发现（最轻量）
    ├── TXT 记录：公钥指纹 + 协议版本
    ├── SRV 记录：Agent 服务端点位置
    └── CNAME/AAAA/A：域名到主机的路由

Layer 2: Well-Known 元数据（完整信息）
    └── GET /.well-known/agent.json
        ├── 身份
        ├── 能力清单
        ├── 端点列表
        ├── 安全策略
        └── 人类友好页面链接

Layer 3: Agent 端点交互（运行时）
    ├── 发现端点 → 交互式 HTML 页面
    ├── Chat API → WSS/SSE 实时通道
    ├── Task API → REST 异步任务
    └── Swarm API → 多 Agent 协作
```

**原则：能在一层解决的不到二层，能 DNS 发现的不发 HTTP 请求。**

---

## 3. Layer 1 — DNS 发现

### 3.1 TXT 记录（必需）

DNS TXT 记录承载 Agent 最关键的三条信息：协议版本、公钥指纹、发现入口。

```
名称: _agent.{domain}
格式: key=value 对，分号分隔
最大长度: 255 字节（单条），支持多条 TXT 拼接
```

**完整格式：**

```
_agent.example.com.  IN  TXT  "v=ADP1; pk=ed25519:abc123...; wk=https://agent.example.com/.well-known/agent.json"
```

| 字段 | 必需 | 说明 |
|---|---|---|
| `v` | ✅ | 协议版本，当前为 `ADP1` |
| `pk` | ✅ | Base64 编码的公钥指纹（SHA256 of Ed25519 pubkey） |
| `wk` | ✅ | Well-Known 端点完整 URL（可跨域托管） |
| `rel` | ❌ | 可选，逗号分隔的链接关系：`self,parent,cluster:my-net` |
| `note` | ❌ | 可选，最多 64 字符的人类可读描述 |

**示例：**

```
_agent.alice.agent.     IN  TXT  "v=ADP1; pk=ed25519:dGhpcyBpcyBhIHRlc3QgcHVibGljIGtleQ; wk=https://alice.agent/.well-known/agent.json"
_agent.bob.example.com. IN  TXT  "v=ADP1; pk=ed25519:YW5vdGhlciB0ZXN0IGtleSBmb3IgYm9i; wk=https://agent.bob.example.com/.well-known/agent.json"
```

**TX 记录支持跨域托管：** `wk` 字段允许指向不同的域名/主机。这意味着 Agent 本体可以在云上托管，但身份绑在原域名上。

**私密 Agent：** 不希望公开发现的 Agent，`_agent` 记录设为空值或指向内部地址。Agent 可以选择只在本地网络广告。

### 3.2 SRV 记录（推荐）

SRV 记录指定 Agent 实时通信端点的具体主机和端口。

```
名称: _agent._tcp.{domain}
格式: Priority Weight Port Target
```

**示例：**

```
_agent._tcp.alice.agent.  IN  SRV  10 5 443 agent.alice.agent.
_agent._tcp.alice.agent.  IN  SRV  20 5 443 fallback.alice.agent.
```

| 字段 | 说明 |
|---|---|
| Priority | 优先级，数字越低越优先。多记录支持故障转移 |
| Weight | 同优先级下的负载均衡权重 |
| Port | 默认 443（HTTPS/WSS），也可以是自定义端口 |
| Target | 目标主机 FQDN |

**WebSocket 专用 SRV：**

```
_agent-ws._tcp.alice.agent.  IN  SRV  10 5 443 agent.alice.agent.
_agent-ws._tcp 用于 AGP (Agent Gateway Protocol) 的 WebSocket 连接。
```

### 3.3 发现优先级

发现方查询顺序：

```
1. 查询 _agent.{domain} TXT → 获取 v, pk, wk
2. 查询 _agent._tcp.{domain} SRV → 获取 host:port
3. 如果无 SRV，回退：直接访问 {domain} 的 443 端口
4. GET {wk} → 获取完整元数据
```

---

## 4. Layer 2 — Well-Known 元数据

### 4.1 端点

```
GET https://{domain}/.well-known/agent.json
```

### 4.2 JSON Schema

```json
{
  "$schema": "https://agent-discovery.org/schemas/1.0/agent.json",
  "protocol": "ADP/1.0",
  "identity": {
    "id": "agent:alice.agent",
    "domain": "alice.agent",
    "name": "Alice's Agent",
    "owner": "Alice",
    "created": "2026-01-15T00:00:00Z",
    "publicKey": {
      "algorithm": "ed25519",
      "fingerprint": "ed25519:dGhpcyBpcyBhIHRlc3QgcHVibGljIGtleQ",
      "full": "-----BEGIN PUBLIC KEY-----\nMCowBQYDK2VwAyE...\n-----END PUBLIC KEY-----",
      "proof": "signature:..."
    }
  },
  "endpoints": {
    "discovery": "https://alice.agent/",
    "wellKnown": "https://alice.agent/.well-known/agent.json",
    "chat": "wss://alice.agent/agent/chat",
    "tasks": "https://alice.agent/agent/tasks",
    "swarm": "https://alice.agent/agent/swarm",
    "webhook": "https://alice.agent/agent/webhook"
  },
  "capabilities": [
    {
      "id": "chat",
      "name": "Conversational Chat",
      "description": "General-purpose conversational AI",
      "input": ["text", "image", "file"],
      "output": ["text", "html", "chart"],
      "interfaces": ["chat", "api"],
      "languages": ["en", "zh"],
      "pricing": {
        "model": "free",
        "details": null
      }
    },
    {
      "id": "code-review",
      "name": "Code Review",
      "description": "Review code for bugs, security, and style",
      "input": ["text", "file"],
      "output": ["text", "html"],
      "interfaces": ["api"],
      "languages": ["en"],
      "pricing": {
        "model": "per_use",
        "details": "0.01 USD per review"
      }
    }
  ],
  "interfaces": {
    "html": "https://alice.agent/",
    "api": "https://alice.agent/agent/",
    "chat": "wss://alice.agent/agent/chat"
  },
  "relationships": [
    {
      "type": "parent",
      "id": "agent:alicecorp.com",
      "name": "Alice Corp Main Agent"
    },
    {
      "type": "peer",
      "id": "agent:bob.agent",
      "name": "Bob's Agent",
      "trust": "verified",
      "since": "2026-03-01T00:00:00Z"
    }
  ],
  "security": {
    "tlsRequired": true,
    "minProtocolVersion": "ADP/1.0",
    "authMethods": ["pubkey", "bearer_token"],
    "rateLimit": {
      "requestsPerMinute": 60,
      "burstSize": 10
    }
  },
  "policies": {
    "privacy": "https://alice.agent/policies/privacy",
    "terms": "https://alice.agent/policies/terms",
    "dataRetention": "7 days",
    "thirdPartySharing": false
  },
  "availability": {
    "status": "online",
    "uptime": "99.9%",
    "maintenanceWindow": "Sun 03:00-04:00 UTC",
    "statusEndpoint": "https://status.alice.agent/"
  },
  "meta": {
    "updated": "2026-06-09T10:00:00Z",
    "version": "2.3.0",
    "generator": "OpenClaw Gateway v3.1.0",
    "documentation": "https://docs.alice.agent/"
  }
}
```

### 4.3 必需字段 vs 可选字段

| 字段路径 | 必需 | 说明 |
|---|---|---|
| `protocol` | ✅ | 固定 `ADP/1.0` |
| `identity.id` | ✅ | Agent 唯一 URI |
| `identity.publicKey` | ✅ | 公钥信息，与 TXT 记录一致 |
| `endpoints` | ✅ | 至少一个端点 |
| `capabilities` | ✅ | 至少一项能力 |
| 其他所有字段 | ❌ | 可选 |

### 4.4 人类友好发现页

Agent 必须在域名根路径提供一个 HTML 页面，使 Agent 可被浏览器访问和交互。

**要求：**
- 页面必须包含 `<script type="application/ld+json">` 嵌入完整的 Agent 元数据（同 well-known 内容）
- 推荐包含 `<agent-card>` 自定义元素或等效的 HTML 结构
- 必须设置 `<meta name="agent-id" content="agent:...">` 供简单解析

```html
<!DOCTYPE html>
<html lang="zh">
<head>
  <meta charset="UTF-8">
  <meta name="agent-id" content="agent:alice.agent">
  <meta name="agent-protocol" content="ADP/1.0">
  <title>Alice's Agent</title>
  <script type="application/ld+json">
  {
    "@context": "https://agent-discovery.org/schemas/1.0",
    "@type": "AI Agent",
    ... (完整 agent.json 内容)
  }
  </script>
</head>
<body>
  <agent-card>
    <h1>👋 I'm Alice's Agent</h1>
    <capability-list>
      <capability name="Chat" status="available"></capability>
      <capability name="Code Review" status="available"></capability>
    </capability-list>
    <connect-form action="/agent/connect">
      <input name="from" placeholder="Your Agent ID">
      <button>Connect</button>
    </connect-form>
  </agent-card>
</body>
</html>
```

---

## 5. Layer 3 — 标准端点

### 5.1 端点定义

| 端点 | 路径 | 协议 | 说明 |
|---|---|---|---|
| 发现页 | `GET /` | HTTPS | 人类友好交互界面 |
| 元数据 | `GET /.well-known/agent.json` | HTTPS | 机器可读完整元数据 |
| 聊天 | `WSS /agent/chat` | WebSocket | 实时对话流 |
| 任务 | `POST /agent/tasks` | HTTPS | 异步任务提交和查询 |
| Swarm | `POST /agent/swarm/join` | HTTPS | 多 Agent 协作加入 |
| Webhook | `POST /agent/webhook` | HTTPS | 外部事件回调 |

### 5.2 Agent 间通信协议（AGP）

```
WebSocket 连接建立:
  客户端 Agent → WSS /agent/chat
  → 消息格式: Agent Message (AM) — 基于 JSON Lines (RFC 7464)

每条消息一个 JSON 对象:
{
  "id": "msg_uuid",
  "from": "agent:bob.agent",
  "to": "agent:alice.agent",
  "type": "chat|task|swarm|system",
  "timestamp": "2026-06-09T10:00:00Z",
  "signature": "ed25519:base64...",
  "body": {
    "content": "Hello Alice, can you review this code?",
    "contentType": "text/plain",
    "replyTo": "msg_uuid_previous"
  },
  "attachments": []
}
```

### 5.3 HTML 输出协议（HOP）

当 Agent 回复内容为 HTML 时：

```json
{
  "type": "chat",
  "body": {
    "content": "<div class='agent-response'>...interactive HTML...</div>",
    "contentType": "text/html",
    "structuredData": {
      "@context": "https://schema.org",
      "@type": "SoftwareSourceCode",
      "codeReviewStatus": "approved"
    }
  }
}
```

人类消费者：浏览器渲染  
Agent 消费者：解析 `structuredData` 对象  
降级消费者：提取纯文本（HTML tag stripping）

---

## 6. 安全

### 6.1 公钥验证链

```
DNS TXT _agent.{domain} → pk (fingerprint)
    ↓
Well-Known agent.json → identity.publicKey (full key)
    ↓
每次消息 → 签名验证
```

验证流程：
1. 从 DNS TXT 获取公钥指纹
2. 从 Well-Known 获取完整公钥
3. 验证公钥的 SHA256 指纹与 DNS 记录一致
4. 用公钥验证后续每条消息签名

### 6.2 信任等级

| 等级 | 验证方式 | 含义 |
|---|---|---|
| `unverified` | 无 | 首次发现，未验证 |
| `dns-verified` | DNS TXT pk 匹配 | 公钥指纹已验证 |
| `key-verified` | 签名验证通过 | 已建立可信连接 |
| `peer-verified` | 双向签名 + 人类确认 | 已建立对等信任关系 |

### 6.3 TLS 要求

- 所有端点必须使用 TLS 1.3
- 证书必须有效（不能自签名，除非用于本地开发）
- DNS TXT `pk` 字段提供 TOFU（Trust On First Use）基础

---

## 7. 发现流程总览

```
┌─────────────────────────────────────────────────────┐
│              发现方 (Bob's Agent)                      │
├─────────────────────────────────────────────────────┤
│                                                       │
│  1. 知道域名: alice.agent                              │
│     │                                                 │
│     ├─ dig TXT _agent.alice.agent                     │
│     │  → v=ADP1, pk=ed25519:abc..., wk=URL            │
│     │                                                 │
│     ├─ dig SRV _agent._tcp.alice.agent                │
│     │  → host:agent.alice.agent, port:443              │
│     │                                                 │
│     ├─ GET https://alice.agent/.well-known/agent.json │
│     │  → 完整元数据: 身份、能力、端点、安全策略          │
│     │  → 验证公钥指纹与 DNS 一致 ✓                     │
│     │                                                 │
│     ├─ (可选) GET https://alice.agent/                │
│     │  → HTML 人类友好页面                             │
│     │  → <agent-card>, microdata 供机器解析           │
│     │                                                 │
│     └─ WSS wss://alice.agent/agent/chat              │
│        → 签名握手                                      │
│        → 建立连接，开始通信                             │
│                                                       │
│  🎯 Alice Agent 被发现并连接完成                       │
└─────────────────────────────────────────────────────┘
```

---

## 8. 实现指南

### 8.1 最小可行实现（管理员侧）

只需要做三件事：

```
1. DNS: 添加一条 _agent TXT 记录
   _agent.mydomain.com.  IN  TXT  "v=ADP1; pk=ed25519:BASE64_FINGERPRINT; wk=https://mydomain.com/.well-known/agent.json"

2. 文件: 放一个 agent.json 到 webroot
   /var/www/.well-known/agent.json

3. 页面: 放一个 index.html 在 webroot
   包含 <script type="application/ld+json"> 嵌入元数据
```

**搞定。你的 Agent 可被全球任何 Agent 发现。**

### 8.2 最小可行实现（发现方 / SDK）

```javascript
// 发现一个 Agent
async function discoverAgent(domain) {
  // Step 1: DNS TXT
  const txtRecords = await dns.resolveTxt(`_agent.${domain}`);
  const txt = parseTXT(txtRecords); // { v, pk, wk, rel }
  
  // Step 2: Well-Known
  const wkUrl = txt.wk || `https://${domain}/.well-known/agent.json`;
  const meta = await fetch(wkUrl).then(r => r.json());
  
  // Step 3: 验证公钥
  if (!verifyFingerprint(meta.identity.publicKey, txt.pk)) {
    throw new Error('Public key mismatch');
  }
  
  return meta;
}

// 连接 Agent
async function connectAgent(domain) {
  const meta = await discoverAgent(domain);
  const wsUrl = meta.endpoints.chat;
  return new AgentConnection(wsUrl, meta.identity.publicKey);
}
```

### 8.3 DNS TXT 解析工具

```javascript
function parseTXT(records) {
  const pairs = records.flat().join('').split(';').map(s => s.trim());
  const result = {};
  for (const pair of pairs) {
    const eq = pair.indexOf('=');
    if (eq === -1) continue;
    result[pair.slice(0, eq)] = pair.slice(eq + 1);
  }
  return result;
}
```

---

## 9. 扩展到 WebFinger（人→Agent 发现）

当不知道域名，只知道用户身份时：

```
GET https://alice.agent/.well-known/webfinger?resource=acct:alice@alice.agent

Response (JRD):
{
  "subject": "acct:alice@alice.agent",
  "links": [
    {
      "rel": "urn:adp:agent",
      "href": "agent:alice.agent",
      "properties": {
        "protocol": "ADP/1.0",
        "endpoint": "https://alice.agent/.well-known/agent.json"
      }
    }
  ]
}
```

这使得 `alice@alice.agent` 格式的"Agent 地址"可以解析为完整的 Agent 发现端点。

---

## 10. 隐私与私密 Agent

### 10.1 公开 Agent

DNS TXT 记录公开，Well-Known 可公开访问。任何人可发现。

### 10.2 私密 Agent

```
方案 A: DNS 记录不设 _agent 子域
方案 B: _agent TXT 设空值或内部 IP
方案 C: Well-Known 返回 404 或 403
方案 D: Well-Known 返回受限元数据，要求 bearer token
```

私密 Agent 可以通过手动交换发现 URL 或 invitation code 来建立连接，不依赖 DNS。

### 10.3 邀请制发现

```json
// invitation.json — 替代 DNS 发现
{
  "protocol": "ADP/1.0",
  "invite": {
    "code": "a1b2c3d4",
    "expires": "2026-06-10T00:00:00Z",
    "agent": "agent:alice.agent",
    "wellKnown": "https://alice.agent/.well-known/agent.json?invite=a1b2c3d4",
    "pubkey": "ed25519:..."
  }
}
```

---

## 11. 注册表与标准化组织

**本协议遵循 IETF 兼容路径：**

- SRV 服务名：`_agent`（建议向 IANA 注册 Port Number）
- Well-Known URI：`agent.json`（建议向 IANA Well-Known URI Registry 注册）
- Link Relation Type：`urn:adp:agent`（使用 URN 命名空间）
- Media Type：`application/agent+json`（建议向 IANA Media Types 注册）
- 协议标识符：`urn:adp:1`

**开源参考实现：**
- `agent-discovery-js` — JavaScript SDK
- `agent-discovery-py` — Python SDK
- `agent-discovery-go` — Go SDK

---

## 12. 附录：与现有标准的关系

| 标准 | 本协议使用方式 |
|---|---|
| DNS SRV (RFC 2782) | `_agent._tcp` 服务定位 |
| DNS TXT | 公钥指纹 + 元数据承载 |
| Well-Known URI (RFC 8615) | `/.well-known/agent.json` 完整元数据 |
| WebFinger (RFC 7033) | `acct:user@domain` → `agent:` URI 映射 |
| JSON-LD / Schema.org | HTML 页面内嵌结构化数据 |
| TLS 1.3 | 所有端点强制 TLS |
| Ed25519 | 默认签名算法 |
| WebSocket (RFC 6455) | 实时通信通道 |
| JSON Lines (RFC 7464) | Agent 间消息流格式 |

---

> **协议标识符**: `urn:adp:1`  
> **存放路径**: `/home/node/.openclaw/workspace/reports/agent-discovery-protocol-v1.md`
