# ADP — Agent Discovery Protocol

> **基于域名 + DNS + HTTPS 的 AI Agent 发现协议**  
> 让每个 Agent 拥有一个域名身份，无需中心化注册表即可被发现、连接、协作。

[![Protocol](https://img.shields.io/badge/protocol-ADP%2F1.0-blue)](PROTOCOL.md)
[![SDK Language](https://img.shields.io/badge/SDK-Node.js-green)](src/)
[![License Protocol](https://img.shields.io/badge/license-protocol-CC0-lightgrey)](LICENSE-PROTOCOL)
[![License SDK](https://img.shields.io/badge/license-SDK-MIT-green)](LICENSE-SDK)

---

## 核心理念

```
域名 (身份/发现)  →  HTML (交互界面)  →  协作 (Swarm)
      ↓                      ↓                    ↓
  我是谁              你能跟我做什么        我们一起做什么
```

**Agent 网络不需要重新发明 Web。** 站在 DNS、HTTPS、Well-Known URI 这些已经跑了 40 年的标准上，做最轻量的 Agent 专用适配。

---

## 协议三明治

```
Layer 1: DNS 发现 (最轻量，一行命令)
    ├── TXT _agent.example.com  →  v=ADP1; pk=...; wk=...
    └── SRV _agent._tcp         →  host:port

Layer 2: Well-Known (完整元数据)
    └── GET /.well-known/agent.json
        → 身份、能力、端点、安全策略

Layer 3: HTML + 实时通道 (运行时)
    ├── GET /               → 人类交互界面 + JSON-LD
    └── WSS /agent/chat     → Agent 间实时通信
```

**原则：能在 DNS 解决的，不发 HTTP 请求。**

---

## 最小可行接入（10 分钟）

### 作为 Agent 主人，让世界发现你：

```
1. DNS: 加一条 TXT 记录
   _agent.your-domain.com  IN  TXT  "v=ADP1; pk=ed25519:YOUR_FINGERPRINT; wk=https://your-domain.com/.well-known/agent.json"

2. 文件: 放 agent.json 到 /.well-known/
3. 页面: index.html 放在 webroot（含 JSON-LD）

✅ 你的 Agent 可被全球任何 Agent 发现。
```

### 作为发现方，找到任何 Agent：

```bash
# 一行命令发现
dig TXT _agent.alice.agent
# → v=ADP1; pk=ed25519:abc...; wk=https://alice.agent/.well-known/agent.json

# SDK 发现
import { discoverAgent } from 'adp-sdk';
const agent = await discoverAgent('alice.agent');
console.log(agent.meta.identity.name);   // "Alice's Agent"
console.log(agent.meta.capabilities);    // [...]
console.log(agent.trustLevel);           // "key-verified"
```

---

## 快速开始

```bash
git clone https://github.com/YOUR_ORG/adp-protocol.git
cd adp-protocol
npm install

# 生成密钥
node bin/adp-cli.js keygen -o my-agent.key

# 生成 DNS 记录
node bin/adp-cli.js dns-gen -d my-domain.com -f YOUR_FINGERPRINT

# 生成 agent.json
node bin/adp-cli.js agent-json-gen -c examples/agent-host/agent.json

# 生成 Landing Page
node bin/adp-cli.js landing-page -c examples/agent-host/agent.json -o index.html

# 启动 Agent Host
node examples/agent-host/server.js --port 3000

# 发现 Agent
node examples/discover-agent.js alice.agent
```

---

## SDK 模块

| 模块 | 文件 | 说明 |
|---|---|---|
| 密码学 | `src/crypto.js` | Ed25519 密钥生成、签名、验证 |
| DNS 记录 | `src/dns-records.js` | TXT/SRV 记录生成和解析 |
| 元数据 | `src/agent-json.js` | agent.json 构建和验证 |
| 发现页 | `src/landing-page.js` | HTML Landing Page 生成 |
| 发现 | `src/discover.js` | 三层递进发现客户端 |
| 连接 | `src/connect.js` | WSS Agent 间连接 |
| 验证 | `src/verify.js` | 完整公钥验证链 |

---

## 安全模型

```
DNSSEC → TXT record → pk fingerprint
                          ↓ (verify)
                   Well-Known agent.json → full public key
                          ↓ (verify)
                   每个消息 → Ed25519 signature
```

信任等级：`unverified` → `dns-verified` → `key-verified` → `peer-verified`

---

## 与现有标准的关系

| 标准 | 本协议使用方式 |
|---|---|
| **DNS SRV** (RFC 2782) | `_agent._tcp` 服务定位 |
| **DNS TXT** | 公钥指纹 + 元数据承载 |
| **Well-Known URI** (RFC 8615) | `/.well-known/agent.json` |
| **WebFinger** (RFC 7033) | `acct:user@domain` → `agent:` URI |
| **JSON-LD / Schema.org** | HTML 页面内嵌结构化数据 |
| **TLS 1.3** | 所有端点强制加密 |
| **Ed25519** | 默认签名算法 |
| **WebSocket** (RFC 6455) | Agent 间实时通信 |

---

## 协议标识符

```
urn:adp:1
```

---

## 许可证

- **协议规范** (`PROTOCOL.md`): [CC0 1.0 Universal](LICENSE-PROTOCOL) — 公共领域，任何人可自由实现
- **SDK 代码** (`src/`, `bin/`, `examples/`): [MIT](LICENSE-SDK)

---

## 贡献

欢迎提交 Issue、PR。协议演进讨论请走 [Discussions]()。

### 待办

- [ ] Python SDK (`adp-sdk-py`)
- [ ] Go SDK (`adp-sdk-go`)
- [ ] `_agent` SRV 服务名向 IANA 注册
- [ ] `agent.json` Well-Known URI 向 IANA 注册
- [ ] 多语言 Landing Page 模板
- [ ] DNSSEC 验证集成

---

## 作者

Pro 🐙 — 基于对 Agent 网络范式的思考：域名 + HTML + HyperFrames 三合一的 Agent Web。

---

*Agent 不需要新的互联网。它们只需要接入现有的那个。*
