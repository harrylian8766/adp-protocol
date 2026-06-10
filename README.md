# ADP — Agent Discovery Protocol

> **基于域名 + DNS(SVCB) + HTTPS 的 AI Agent 发现协议**
> 让每个 Agent 拥有一个域名身份，无需中心化注册表即可被发现、连接、协作。

[![Protocol](https://img.shields.io/badge/protocol-ADP%2F1.1-blue)](PROTOCOL.md)
[![I-D](https://img.shields.io/badge/I--D-draft--pro--adp--agent--discovery-blue)](https://datatracker.ietf.org/doc/draft-pro-adp-agent-discovery/)
[![License: Protocol](https://img.shields.io/badge/license--protocol-CC0-lightgrey)](LICENSE-PROTOCOL)
[![License: SDK](https://img.shields.io/badge/license--SDK-MIT-green)](LICENSE-SDK)

---

## v1.1 核心变更

**DNS Layer 从 TXT+SRV 升级为 SVCB-first**，对齐 IETF 草案 [DNS-AID](https://datatracker.ietf.org/doc/draft-mozleywilliams-dnsop-dnsaid/)。

| | v1.0 | v1.1 |
|---|---|---|
| 主记录 | TXT (`_agent.{domain}`) | **SVCB** (`agent-name.{domain}`) |
| 服务定位 | SRV 二次查询 | SVCB 内联 target + IP hints |
| 协议协商 | 无，需拉 well-known | **ALPN + bap** 内联 |
| 最少查询 | 2 次 | **1 次** |
| 安全 | 公钥指纹在 TXT | **TLSA + DNSSEC** 推荐 |
| TXT/SRV | 主记录 | **回退方案** |

---

## 核心理念

```
域名 (身份/发现)  →  HTML (交互界面)  →  协作 (Swarm)
      ↓                      ↓                    ↓
  我是谁              你能跟我做什么        我们一起做什么
```

**Agent 网络不需要重新发明 Web。** 站在 DNS(SVCB)、HTTPS、Well-Known URI 这些已经跑了 40 年的标准上，做最轻量的 Agent 专用适配。

---

## 协议三明治

```
Layer 1: DNS 发现 (最轻量，单次 SVCB 查询)
    ├── SVCB agent-name.example.com  →  target, port, IP hints, ALPN, bap, cap, well-known
    ├── TLSA _443._tcp               →  DANE TLS 端点认证 (需 DNSSEC)
    └── [fallback] TXT + SRV         →  SVCB 不可用时的回退

Layer 2: Well-Known (完整元数据)
    └── GET /.well-known/agent.json
        → 身份、能力、端点、安全策略

Layer 3: HTML + 实时通道 (运行时)
    ├── GET /               → 人类交互界面 + JSON-LD
    └── WSS /agent/chat     → Agent 间实时通信
```

**原则：能 SVCB 单次查询拿到的，不多发 DNS 请求。**

---

## 最小可行接入（10 分钟）

### 作为 Agent 主人，让世界发现你：

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

2. 文件: 放 agent.json 到 /.well-known/
3. 页面: index.html 放在 webroot（含 JSON-LD）

✅ 你的 Agent 可被全球任何 Agent 发现。
```

### 作为发现方，找到任何 Agent：

```bash
# 单次查询直接拿到全部连接信息
dig SVCB alice.example.com
# → alpn="a2a,h2" port=443 ipv4hint=192.0.2.1 bap=a2a well-known=agent-card.json

# SDK 发现
import { discoverAgent } from 'adp-sdk';
const agent = await discoverAgent('alice.example.com');
console.log(agent.meta.identity.name);   // "Alice's Agent"
console.log(agent.dns.target);            // "alice.example.com"
console.log(agent.dns.port);              // 443
console.log(agent.trustLevel);            // "dane-verified"
```

---

## 快速开始

```bash
git clone https://github.com/harrylian8766/adp-protocol.git
cd adp-protocol
npm install

# 生成密钥
node bin/adp-cli.js keygen -o my-agent.key

# 生成 SVCB 记录
node bin/adp-cli.js dns-gen -d my-domain.com -p a2a

# 生成 agent.json
node bin/adp-cli.js agent-json-gen -c examples/agent-host/agent.json

# 生成 Landing Page
node bin/adp-cli.js landing-page -c examples/agent-host/agent.json -o index.html

# 启动 Agent Host
node examples/agent-host/server.js --port 3000

# 发现 Agent
node examples/discover-agent.js alice.example.com
```

---

## SDK 模块

| 模块 | 文件 | 说明 |
|---|---|---|
| 密码学 | `src/crypto.js` | Ed25519 密钥生成、签名、验证 |
| DNS 记录 | `src/dns-records.js` | SVCB/TLSA 记录生成和解析 + TXT/SRV 回退 |
| 元数据 | `src/agent-json.js` | agent.json 构建和验证 |
| 发现页 | `src/landing-page.js` | HTML Landing Page 生成 |
| 发现 | `src/discover.js` | SVCB-first 三层递进发现客户端 |
| 连接 | `src/connect.js` | WSS Agent 间连接 |
| 验证 | `src/verify.js` | 完整 DNSSEC+TLSA+公钥验证链 |

---

## 安全模型

```
DNSSEC 签名
  ↓
SVCB 记录 (数据完整 + 来源认证)
  ↓
TLSA 记录 (TLS 端点绑定，需 DNSSEC)
  ↓
DANE 验证 (证书/公钥与 TLSA 匹配)
  ↓
TLS 1.3 连接建立
  ↓
公钥验证 (Well-Known 中的公钥指纹与 DNS 匹配)
  ↓
消息签名验证 (每条 AGP 消息的 Ed25519 签名)
```

信任等级：`unverified` → `dns-verified` → `dane-verified` → `key-verified` → `peer-verified`

---

## 与现有标准的关系

| 标准 | 本协议使用方式 |
|---|---|
| **SVCB** (RFC 9460) | Agent 服务发现主记录 (v1.1) |
| **TLSA** (RFC 6698) | DANE TLS 端点认证 (v1.1) |
| **DNSSEC** (RFC 9364) | DNS 数据来源认证和完整性 (v1.1) |
| **DNS TXT** | 公钥指纹承载 (v1.1 回退) |
| **DNS SRV** (RFC 2782) | 服务定位 (v1.1 回退) |
| **Well-Known URI** (RFC 8615) | `/.well-known/agent.json` |
| **WebFinger** (RFC 7033) | `acct:user@domain` → `agent:` URI |
| **JSON-LD / Schema.org** | HTML 页面内嵌结构化数据 |
| **TLS 1.3** | 所有端点强制加密 |
| **Ed25519** | 默认签名算法 |
| **WebSocket** (RFC 6455) | Agent 间实时通信 |
| **DNS-AID** (draft-mozleywilliams-dnsop-dnsaid) | SvcParamKey 注册对齐 |

---

## 协议标识符

```
urn:adp:1.1
```

---

## 许可证

- **协议规范** (`PROTOCOL.md`): [CC0 1.0 Universal](LICENSE-PROTOCOL) — 公共领域，任何人可自由实现
- **SDK 代码** (`src/`, `bin/`, `examples/`): [MIT](LICENSE-SDK)

---

## 贡献

欢迎提交 Issue、PR。协议演进讨论请走 [Discussions]()。

### 待办

- [ ] SVCB 记录生成 CLI 实现
- [ ] TLSA 记录生成和验证集成
- [ ] DNSSEC 验证链在 SDK 中集成
- [ ] Python SDK (`adp-sdk-py`)
- [ ] Go SDK (`adp-sdk-go`)
- [ ] `_agent` TXT/SRV 回退兼容保持
- [ ] `bap` SvcParamKey 向 IANA 注册
- [ ] 多语言 Landing Page 模板

---

## 版本历史

- [v1.1](PROTOCOL.md) — SVCB-first, TLSA+DNSSEC, 对齐 DNS-AID (2026-06-10)
- [v1.0](rfc/PROTOCOL-v1.0.md) — TXT+SRV 初始版本 (2026-06-09)

---

## 作者

Pro 🐙 — 基于对 Agent 网络范式的思考：域名 + HTML + 标准 DNS 的 Agent Web。

---

*Agent 不需要新的互联网。它们只需要接入现有的那个。*
