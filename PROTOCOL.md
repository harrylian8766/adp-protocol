# Agent Discovery Protocol (ADP) v1.1

> **定位：基于域名 + DNS(SVCB) + HTTPS 的 AI Agent 发现协议**
>
> 状态：Draft
> 作者：Pro 🐙（基于与 Harry、Ross 的讨论）
> 日期：2026-06-10
> 协议标识符：`urn:adp:1.1`
>
> **v1.1 核心变更：DNS Layer 从 TXT+SRV 改为 SVCB-first，对齐 DNS-AID IETF 草案。**

---

## 1. 设计原则

1. **站在肩膀上** — 复用 DNS(SVCB)、HTTPS、Well-Known URI、WebFinger 等成熟标准，不另造轮子
2. **SVCB 优先** — 服务发现用 SVCB（RFC 9460），结构化、类型化、单次查询，TXT 仅作回退
3. **与 IETF 对齐** — DNS 层复用 DNS-AID（draft-mozleywilliams-dnsop-dnsaid）的 SvcParamKey 注册
4. **渐进发现** — 三层递进：DNS(SVCB) 轻量发现 → Well-Known 完整元数据 → 端点交互
5. **域名即身份** — 域名是 Agent 的唯一标识符，不需要额外的注册表或 DHT
6. **人机通用** — 同一份输出人类可读（浏览器）、Agent 可解析（结构化 JSON）
7. **安全内置** — DNSSEC + TLSA(DANE) + 公钥验证链，多层信任锚定

---

## 2. 协议层次

```
Layer 1: DNS 发现（最轻量，单次 SVCB 查询）
    ├── SVCB 记录：目标地址 + 端口 + IP hints + ALPN + 协议 + 能力摘要 + well-known
    ├── TLSA 记录：DANE TLS 端点认证（需 DNSSEC）
    └── [fallback] TXT + SRV：SVCB 不可用时的回退方案

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
    ├── Swarm API → 多 Agent 协作
    └── Webhook API → 外部事件回调
```

**原则：能在一层解决的不到二层，能 SVCB 单次查询拿到的不多发 DNS 请求。**

---

## 3. Layer 1 — DNS 发现（SVCB-first）

### 3.1 SVCB 记录（主要机制，RECOMMENDED）

SVCB（Service Binding，RFC 9460）是 DNS 服务发现的标准记录类型，单次查询返回目标地址、端口、传输协议、IP hints 和可扩展的服务参数。

**查询名称：**
```
<agent-name>.<domain>
例如: alice.example.com  或  assistant.example.com
```

**SVCB ServiceMode 记录结构：**

```
alice.example.com. 3600 IN SVCB 1 . (
    alpn="a2a,h2,h3"
    port=443
    ipv4hint=192.0.2.1,192.0.2.2
    ipv6hint=2001:db8::1,2001:db8::2
    bap=a2a
    well-known=agent-card.json
    cap=https://alice.example.com/capabilities/a2a.json
    cap-sha256=Li7sBxT4...
)
```

**托管在服务提供商的 Agent（TargetName 指向外部）：**

```
alice.example.com. 3600 IN SVCB 1 hosted.example-provider.com. (
    alpn="a2a,h2"
    port=443
    bap=a2a
    well-known=agent-card.json
    cap=https://alice.example.com/capabilities/a2a.json
    cap-sha256=Li7sBxT4...
)
```

#### SvcParamKey 说明

| SvcParamKey | 来源 | 必需 | 说明 |
|---|---|---|---|
| `alpn` | RFC 9460 | ✅ | 应用层协议协商 ID，如 `a2a`、`mcp`、`h2`、`h3` |
| `port` | RFC 9460 | ✅ | 服务端口，默认 443 |
| `ipv4hint` | RFC 9460 | 推荐 | IPv4 地址列表，减少额外 A 记录查询 |
| `ipv6hint` | RFC 9460 | 推荐 | IPv6 地址列表，减少额外 AAAA 记录查询 |
| `bap` | DNS-AID | 推荐 | Agent 协议标识（Bulk Agent Protocol），如 `a2a`、`mcp`。与 alpn 分离，方便策略引擎独立匹配 |
| `well-known` | DNS-AID | ✅ | Well-Known URI 路径，相对于 `https://<target>/.well-known/`，如 `agent-card.json` |
| `cap` | DNS-AID | 推荐 | 能力描述符 URL（URI 或 URN） |
| `cap-sha256` | DNS-AID | 推荐 | 能力描述符的 SHA-256 摘要（base64url 编码） |

> **对齐 DNS-AID：** `bap`、`cap`、`cap-sha256`、`well-known` 的语义和注册完全遵循 DNS-AID 草案（draft-mozleywilliams-dnsop-dnsaid-02）的定义。ADP 不重新发明这些参数。

#### SVCB AliasMode（组织索引）

组织可以在 `_agents.example.com` 下用 AliasMode 按 DNS-SD 兼容格式发布 Agent 索引：

```
_agents.example.com. 3600 IN SVCB 0 alice.example.com.
_agents.example.com. 3600 IN SVCB 0 bob.example.com.
```

消费者查 `_agents.example.com` SVCB 即可枚举该组织的所有公开 Agent。

### 3.2 TLSA 记录（RECOMMENDED，需 DNSSEC）

TLSA（RFC 6698）提供 DANE 风格的 TLS 端点认证，比传统 CA 体系更适合 Agent-to-Agent 场景。

```
_443._tcp.alice.example.com. 3600 IN TLSA 3 1 1 (
    d2abde240d7cd3...（证书的公钥 SHA-256）
)
```

**要求：**
- TLSA 记录仅在启用 DNSSEC 时有效（防止降级攻击）
- 使用 `3 1 1`（DANE-EE，SPKI SHA-256）作为默认用法
- SVCB 响应中包含 TLSA 支持标记时为 MUST 验证

### 3.3 DNSSEC（SHOULD）

所有用于 Agent 发现的 DNS 记录 SHOULD 由 DNSSEC（RFC 9364）签名。

- SVCB 记录：SHOULD 签名
- TLSA 记录：MUST 签名（否则不可信）
- 回退 TXT/SRV：SHOULD 签名

### 3.4 回退方案：TXT + SRV（SVCB 不可用时）

当 DNS 解析器或权威服务器不支持 SVCB 查询时，回退到以下方案。

#### TXT 记录

```
名称: _agent.{domain}
格式: key=value 对，分号分隔
```

```
_agent.example.com.  IN  TXT  "v=ADP1.1; pk=ed25519:abc123...; wk=https://agent.example.com/.well-known/agent.json; alpn=a2a; port=443"
```

| 字段 | 必需 | 说明 |
|---|---|---|
| `v` | ✅ | 协议版本，当前为 `ADP1.1` |
| `pk` | ✅ | Base64 编码的公钥指纹（SHA-256 of Ed25519 pubkey） |
| `wk` | ✅ | Well-Known 端点完整 URL |
| `alpn` | ❌ | 应用协议 ID |
| `port` | ❌ | 端口号 |
| `bap` | ❌ | Agent 协议标识 |

#### SRV 记录

```
_agent._tcp.{domain}.  IN  SRV  10 5 443 agent.example.com.
```

| 字段 | 说明 |
|---|---|
| Priority | 优先级，数字越低越优先 |
| Weight | 同优先级下的负载均衡权重 |
| Port | 服务端口 |
| Target | 目标主机 FQDN |

**回退发现流程：**

```
1. 尝试 SVCB query agent-name.example.com
2. 若 NODATA/NXDOMAIN/不支持 → 回退
3. 查询 _agent.{domain} TXT → 获取 v, pk, wk
4. 查询 _agent._tcp.{domain} SRV → 获取 host:port
5. GET {wk} → 继续 Layer 2
```

---

## 4. Layer 2 — Well-Known 元数据

### 4.1 端点

```
GET https://{domain}/.well-known/agent.json
```

（或由 SVCB `well-known` 参数指定的自定义路径）

### 4.2 JSON Schema

```json
{
  "$schema": "https://agent-discovery.org/schemas/1.1/agent.json",
  "protocol": "ADP/1.1",
  "identity": {
    "id": "agent:alice.example.com",
    "domain": "alice.example.com",
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
    "discovery": "https://alice.example.com/",
    "wellKnown": "https://alice.example.com/.well-known/agent.json",
    "chat": "wss://alice.example.com/agent/chat",
    "tasks": "https://alice.example.com/agent/tasks",
    "swarm": "https://alice.example.com/agent/swarm",
    "webhook": "https://alice.example.com/agent/webhook"
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
    }
  ],
  "interfaces": {
    "html": "https://alice.example.com/",
    "api": "https://alice.example.com/agent/",
    "chat": "wss://alice.example.com/agent/chat"
  },
  "relationships": [
    {
      "type": "parent",
      "id": "agent:alicecorp.com",
      "name": "Alice Corp Main Agent"
    },
    {
      "type": "peer",
      "id": "agent:bob.example.com",
      "name": "Bob's Agent",
      "trust": "verified",
      "since": "2026-03-01T00:00:00Z"
    }
  ],
  "security": {
    "tlsRequired": true,
    "minProtocolVersion": "ADP/1.1",
    "authMethods": ["pubkey", "bearer_token", "dane"],
    "rateLimit": {
      "requestsPerMinute": 60,
      "burstSize": 10
    }
  },
  "dns": {
    "svcbRecord": "alice.example.com",
    "tlsaRecord": "_443._tcp.alice.example.com",
    "dnssec": true
  },
  "policies": {
    "privacy": "https://alice.example.com/policies/privacy",
    "terms": "https://alice.example.com/policies/terms",
    "dataRetention": "7 days",
    "thirdPartySharing": false
  },
  "availability": {
    "status": "online",
    "uptime": "99.9%",
    "maintenanceWindow": "Sun 03:00-04:00 UTC"
  },
  "meta": {
    "updated": "2026-06-10T10:00:00Z",
    "version": "2.3.0",
    "generator": "OpenClaw Gateway v3.1.0",
    "documentation": "https://docs.alice.example.com/"
  }
}
```

### 4.3 v1.1 新增字段

| 字段路径 | 新增 | 说明 |
|---|---|---|
| `dns.svcbRecord` | ✅ | SVCB 记录查询名称 |
| `dns.tlsaRecord` | ✅ | TLSA 记录查询名称 |
| `dns.dnssec` | ✅ | 是否启用 DNSSEC |
| `security.authMethods` 新增 `dane` | ✅ | DANE 认证标志 |

### 4.4 人类友好发现页

Agent 必须在域名根路径提供 HTML 页面。

```html
<!DOCTYPE html>
<html lang="zh">
<head>
  <meta charset="UTF-8">
  <meta name="agent-id" content="agent:alice.example.com">
  <meta name="agent-protocol" content="ADP/1.1">
  <title>Alice's Agent</title>
  <script type="application/ld+json">
  {
    "@context": "https://agent-discovery.org/schemas/1.1",
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

基于 JSON Lines（RFC 7464）的 WebSocket 消息流：

```json
{
  "id": "msg_uuid",
  "from": "agent:bob.example.com",
  "to": "agent:alice.example.com",
  "type": "chat|task|swarm|system",
  "timestamp": "2026-06-10T10:00:00Z",
  "signature": "ed25519:base64...",
  "body": {
    "content": "Hello Alice, can you review this code?",
    "contentType": "text/plain|text/html|application/json",
    "replyTo": "msg_uuid_previous"
  },
  "attachments": []
}
```

---

## 6. 安全

### 6.1 DNS 安全分层

```
DNSSEC 签名
  ↓
SVCB 记录（数据完整 + 来源认证）
  ↓
TLSA 记录（TLS 端点绑定，需 DNSSEC）
  ↓
DANE 验证（证书/公钥与 TLSA 匹配）
  ↓
TLS 1.3 连接建立
  ↓
公钥验证（Well-Known 中的公钥指纹与 DNS 匹配）
  ↓
消息签名验证（每条 AGP 消息的 Ed25519 签名）
```

### 6.2 公钥验证链

```
SVCB/TXT 记录 → pk 指纹
    ↓
Well-Known agent.json → identity.publicKey（完整密钥）
    ↓
验证：SHA-256(完整密钥) == DNS 指纹
    ↓
每条 AGP 消息 → 签名验证
```

### 6.3 信任等级

| 等级 | 验证方式 | 含义 |
|---|---|---|
| `unverified` | 无 | 首次发现，未验证 |
| `dns-verified` | SVCB 签名有效 + 公钥指纹匹配 | DNS 层已验证 |
| `dane-verified` | TLSA DANE 验证通过 | TLS 端点身份已确认 |
| `key-verified` | 签名验证通过 | 已建立可信连接 |
| `peer-verified` | 双向签名 + 人类确认 | 已建立对等信任关系 |

### 6.4 TLS 要求

- 所有端点 MUST 使用 TLS 1.3
- 证书 SHOULD 为公开 CA 签发
- TLSA + DNSSEC 环境可用 DANE 代替 CA 验证
- 自签名证书仅限本地开发

### 6.5 降级防护

- SVCB 查询失败时回退 TXT+SRV，但 SHOLUD 在 agent.json 中标注 `"svcFallback": true`
- TLSA 不可用时退回到传统 CA 验证，但 MUST NOT 在没有 DNSSEC 的环境下信任 TLSA

---

## 7. 发现流程总览

### 7.1 主流程（SVCB-first）

```
发现方（Bob's Agent）
│
├─ ① SVCB query: alice.example.com
│     → target, port, ipv4hint, ipv6hint, alpn, bap, well-known, cap, cap-sha256
│     单次查询拿到全部连接信息 ✓
│
├─ ② [可选] TLSA query: _443._tcp.alice.example.com
│     → DANE TLS 端点验证
│
├─ ③ GET https://alice.example.com/.well-known/agent.json
│     → 完整元数据：身份、能力、端点、安全策略
│     → 验证公钥指纹与 SVCB/TXT 一致 ✓
│
├─ ④ [可选] GET https://alice.example.com/
│     → HTML 人类友好页面
│
└─ ⑤ WSS wss://alice.example.com/agent/chat
      → AGP 签名握手
      → 连接建立，开始通信 🎯
```

### 7.2 回退流程（TXT+SRV）

```
SVCB 查询 → NODATA 或 NXDOMAIN
│
├─ ① dig TXT _agent.alice.example.com
│     → v=ADP1.1, pk=ed25519:..., wk=URL
│
├─ ② dig SRV _agent._tcp.alice.example.com
│     → host, port
│
└─ ③-⑤ 同主流程 Layer 2/3
```

---

## 8. 实现指南

### 8.1 最小可行实现（发布方）

**SVCB 路径（推荐）：**

```
1. DNS: 添加 SVCB 记录
   alice.example.com. 3600 IN SVCB 1 . (
       alpn="a2a,h2"
       port=443
       ipv4hint=192.0.2.1
       bap=a2a
       well-known=agent-card.json
       cap=https://alice.example.com/capabilities/a2a.json
   )

2. [可选] DNSSEC: 为 zone 签名

3. [可选] TLSA: 添加 TLSA 记录
   _443._tcp.alice.example.com. 3600 IN TLSA 3 1 1 <cert-sha256>

4. 文件: 放 agent.json 到 webroot
   /.well-known/agent.json

5. 页面: 放 index.html 在 webroot
   包含 <script type="application/ld+json">
```

**TXT 回退路径（简化部署）：**

```
1. DNS: 添加 TXT 记录
   _agent.example.com.  IN  TXT  "v=ADP1.1; pk=ed25519:...; wk=https://example.com/.well-known/agent.json"

2. DNS: 添加 SRV 记录
   _agent._tcp.example.com.  IN  SRV  10 5 443 agent.example.com.

3-5. 同上
```

### 8.2 最小可行实现（发现方 / SDK）

```javascript
async function discoverAgent(domain) {
  // Step 1: 尝试 SVCB 查询
  let info;
  try {
    info = await dns.resolveSVCB(domain);
    // info = { target, port, ipv4hint, ipv6hint, alpn, bap, wellKnown, cap, capSha256 }
  } catch (e) {
    // SVCB 不可用 → 回退
    info = await fallbackDiscovery(domain);
  }

  // Step 2: [可选] TLSA
  try {
    const tlsa = await dns.resolveTLSA(`_${info.port}._tcp.${info.target || domain}`);
    info.tlsaValidated = await validateTLSA(tlsa);
  } catch (e) {
    // TLSA 不可用，退回到传统 TLS 验证
  }

  // Step 3: Well-Known
  const wkUrl = info.wellKnown
    ? `https://${info.target || domain}/.well-known/${info.wellKnown}`
    : `https://${info.target || domain}/.well-known/agent.json`;
  const meta = await fetch(wkUrl).then(r => r.json());

  // Step 4: 验证公钥（如果有 DNS pk 指纹）
  if (info.publicKey && !verifyFingerprint(meta.identity.publicKey, info.publicKey)) {
    throw new Error('Public key mismatch');
  }

  return { meta, dns: info };
}

async function fallbackDiscovery(domain) {
  const txt = await dns.resolveTxt(`_agent.${domain}`);
  const txtParsed = parseTXT(txt); // { v, pk, wk, alpn, port, bap }
  const srv = await dns.resolveSrv(`_agent._tcp.${domain}`);
  const best = srv.sort((a, b) => a.priority - b.priority)[0];

  return {
    target: best.target,
    port: best.port,
    alpn: txtParsed.alpn ? [txtParsed.alpn] : [],
    bap: txtParsed.bap || null,
    publicKey: txtParsed.pk,
    wellKnown: txtParsed.wk,
    svcFallback: true
  };
}

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

### 8.3 运维检查清单

**发布方：**
- [ ] SVCB 记录已配置（推荐）
- [ ] 或者 TXT + SRV 回退记录已配置
- [ ] DNSSEC 已启用（推荐）
- [ ] TLSA 记录已配置（可选）
- [ ] `/.well-known/agent.json` 可公开访问
- [ ] 根路径 HTML 页面存在
- [ ] TLS 1.3 已启用
- [ ] 公钥在 DNS 和 agent.json 中一致

**发现方：**
- [ ] 支持 SVCB 查询（优先）
- [ ] 支持 TXT + SRV 回退
- [ ] 支持 TLSA/DANE 验证（可选）
- [ ] 验证公钥指纹一致性
- [ ] 验证每条 AGP 消息签名

---

## 9. 扩展到 WebFinger（人→Agent 发现）

```
GET https://alice.example.com/.well-known/webfinger?resource=acct:alice@alice.example.com

Response (JRD):
{
  "subject": "acct:alice@alice.example.com",
  "links": [
    {
      "rel": "urn:adp:agent",
      "href": "agent:alice.example.com",
      "properties": {
        "protocol": "ADP/1.1",
        "svcbRecord": "alice.example.com",
        "endpoint": "https://alice.example.com/.well-known/agent.json"
      }
    }
  ]
}
```

---

## 10. 隐私与私密 Agent

**公开 Agent：** SVCB 记录公开，Well-Known 可公开访问。

**私密 Agent：**
- 方案 A：不设 SVCB/TXT 记录
- 方案 B：Well-Known 返回 403
- 方案 C：通过 invitation code 发现，不依赖 DNS

**邀请制：**
```json
{
  "protocol": "ADP/1.1",
  "invite": {
    "code": "a1b2c3d4",
    "expires": "2026-06-17T00:00:00Z",
    "agent": "agent:alice.example.com",
    "wellKnown": "https://alice.example.com/.well-known/agent.json?invite=a1b2c3d4",
    "pubkey": "ed25519:..."
  }
}
```

---

## 11. v1.0 → v1.1 迁移指南

| 项 | v1.0 | v1.1 |
|---|---|---|
| DNS 主记录 | TXT（`_agent.{domain}`）| SVCB（`agent-name.{domain}`）|
| 服务定位 | SRV（`_agent._tcp.{domain}`）| SVCB 内联（target + ip hints）|
| 协议协商 | 无，需拉 well-known | ALPN + bap 内联 |
| 最少 DNS 查询 | 2 次（TXT + SRV）| 1 次（SVCB）|
| 安全发送信 | 公钥指纹在 TXT | 公钥指纹可选；推荐 TLSA + DNSSEC |
| TXT 角色 | 主记录 | 回退记录（SVCB 不可用时）|
| SRV 角色 | 主记录 | 回退记录 |
| 对齐标准 | 自定义 | DNS-AID IETF 草案 |
| Well-Known | `agent.json` | `agent.json`（不变）|
| AGP 消息格式 | JSON Lines | JSON Lines（不变）|

**向后兼容：**
- v1.1 发现方 MUST 先尝试 SVCB，失败后回退 TXT+SRV
- v1.0 发布方仍然可被发现（v1.1 客户端会走回退路径）
- v1.0 发现方无法利用 v1.1 的 SVCB 记录（只查 TXT+SRV）

---

## 12. 与现有标准的关系

| 标准 | 本协议使用方式 |
|---|---|
| SVCB（RFC 9460）| Agent 服务发现主记录（v1.1 新增）|
| TLSA（RFC 6698）| DANE TLS 端点认证（v1.1 新增）|
| DNSSEC（RFC 9364）| DNS 数据来源认证和完整性（v1.1 新增推荐）|
| DNS TXT | 公钥指纹 + 元数据（v1.1 降级为回退）|
| DNS SRV（RFC 2782）| 服务定位（v1.1 降级为回退）|
| Well-Known URI（RFC 8615）| `/.well-known/agent.json` 完整元数据 |
| WebFinger（RFC 7033）| `acct:user@domain` → `agent:` URI 映射 |
| JSON-LD / Schema.org | HTML 页面内嵌结构化数据 |
| TLS 1.3 | 所有端点强制 TLS |
| Ed25519 | 默认签名算法 |
| WebSocket（RFC 6455）| 实时通信通道 |
| JSON Lines（RFC 7464）| Agent 间消息流格式 |
| DNS-AID（draft-mozleywilliams-dnsop-dnsaid）| SvcParamKey 注册对齐（v1.1 新增）|

---

## 13. 附录：DNS 记录完整示例

### 主路径（SVCB-first）

```
; ====== SVCB 主记录 ======
alice.example.com.      3600  IN  SVCB  1  .  (
    alpn="a2a,h2,h3"
    port=443
    ipv4hint=192.0.2.1
    ipv6hint=2001:db8::1
    bap=a2a
    well-known=agent-card.json
    cap=https://alice.example.com/capabilities/a2a.json
    cap-sha256=Li7sBxT4GHkKNg7NX5hxk2qB7ZxrQVMvJGLdH7pGzD4
)

; ====== TLSA 记录 ======
_443._tcp.alice.example.com.  3600  IN  TLSA  3  1  1  (
    d2abde240d7cd3ee6b46dbb7884c69f0c70c6e4c7a9e5e7e8e9e0e1e2e3e4e5
)

; ====== 组织索引（可选）======
_agents.example.com.    3600  IN  SVCB  0  alice.example.com.
_agents.example.com.    3600  IN  SVCB  0  bob.example.com.
```

### 回退路径（TXT+SRV）

```
; ====== 仅 SVCB 不可用时配置 ======
_agent.example.com.     3600  IN  TXT   "v=ADP1.1; pk=ed25519:dGhpcyBpcyBhIHRlc3Q; wk=https://agent.example.com/.well-known/agent.json; alpn=a2a; port=443"
_agent._tcp.example.com. 3600  IN  SRV   10 5 443 agent.example.com.
```

---

> **协议标识符**: `urn:adp:1.1`
> **存放路径**: `/home/node/.openclaw/workspace/reports/agent-discovery-protocol-v1.1.md`
> **上一版本**: `reports/agent-discovery-protocol-v1.md`
> **变更摘要**: Layer 1 从 TXT+SRV 改为 SVCB-first；新增 TLSA+DNSSEC 安全层；对齐 DNS-AID IETF 草案
