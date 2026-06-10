%%%
title = "Agent Discovery Protocol (ADP) v1.1 — Well-Known Metadata and Interaction Layer"
abbrev = "adp-agent-discovery"
docName = "draft-pro-adp-agent-discovery-01"
category = "info"
ipr = "trust200902"
area = "Applications"
workgroup = "Independent Submission"
keyword = ["agent", "discovery", "well-known", "agp", "ed25519", "svcb", "dns-aid"]

[seriesInfo]
name = "Internet-Draft"
value = "draft-pro-adp-agent-discovery-01"
stream = "IETF"
status = "informational"

[[author]]
initials = "H."
surname = "Lian"
fullname = "Harry Lian"
organization = "AI Pair"
  [author.address]
  email = "harrylian8766@gmail.com"

date = 2026-06-10T00:00:00Z

%%%

.# Abstract

This document specifies Layer 2 and Layer 3 of the Agent Discovery
Protocol (ADP): a Well-Known JSON metadata schema for AI Agents (Layer 2),
and an HTML landing page convention with an Agent-to-Agent messaging
protocol (AGP) over WebSocket (Layer 3). For DNS-based service discovery
(Layer 1), ADP defers to DNS-AID
{{?I-D.mozleywilliams-dnsop-dnsaid}}, which defines SVCB {{!RFC9460}}
service parameters for Agent endpoint resolution, ALPN-based protocol
negotiation, and capability descriptor authentication.

Together, these three layers form a complete, decentralized discovery and
interaction stack for AI Agents that requires no centralized registry:
DNS-AID resolves *where* an Agent is and *how* to connect; ADP defines
*what* the Agent can do and *how* to talk to it once connected.

This revision (-01) reflects ADP v1.1, which adopts a SVCB-first DNS
discovery approach. The TXT/SRV-based Layer 1 defined in the -00 version
of this document is retained as a documented fallback mechanism for
environments where SVCB is unavailable.

{mainmatter}

# Introduction

## Background

AI Agents are evolving from chatbot plugins into autonomous,
internet-native entities. Each platform (OpenAI, Dify, Coze) provides its
own directory and identity system, but there is no universal discovery
mechanism: an Agent on one platform cannot natively discover an Agent on
another without a bridging registry.

The Web solved an analogous problem decades ago: any resource can be
discovered through a combination of DNS names, well-known ports, and HTML
interlinking. ADP applies the same principle to Agents, adding what the
Web assumes but Agents require: structured capability descriptions,
cryptographic identity binding, and real-time communication primitives.

## Relationship to DNS-AID

DNS-AID {{?I-D.mozleywilliams-dnsop-dnsaid}} defines the DNS discovery
layer for Agents using SVCB records {{!RFC9460}}. It registers the
following SvcParamKeys:

* `bap`: Bulk Agent Protocol identifier (e.g. `a2a`, `mcp`).
* `cap`: URI or URN of the Agent's capability descriptor.
* `cap-sha256`: SHA-256 digest of the capability descriptor.
* `well-known`: Path relative to `/.well-known/` for the Agent's metadata
  document.

ADP v1.1 adopts DNS-AID as its normative DNS discovery mechanism. The ADP
Well-Known JSON schema (Section {{well-known}}) serves as the content
format pointed to by the `well-known` SvcParamKey.

If DNS-AID is unavailable (the DNS resolver does not support SVCB, or the
authoritative server has not published SVCB records), ADP provides a
fallback path using TXT {{!RFC1035}} and SRV {{!RFC2782}} records as
documented in Section {{fallback}}.

## Changes from -00

* Layer 1 (DNS): Replaced TXT+SRV as the primary mechanism with reference
  to DNS-AID {{?I-D.mozleywilliams-dnsop-dnsaid}}. The original TXT+SRV
  scheme is retained as a documented fallback (Section {{fallback}}).
* Added TLSA {{!RFC6698}} + DNSSEC {{!RFC9364}} for DANE-style TLS
  endpoint authentication.
* Defined a trust escalation chain: dns-verified → dane-verified →
  key-verified → peer-verified.
* Protocol version string updated from `ADP/1.0` to `ADP/1.1`.
* Updated Well-Known schema with `dns` block and `dane` auth method.
* Added implementation guidance for SVCB-first discovery clients.

## Design Goals

* **Decentralized**: No central registry; domain ownership is the root of
  identity.
* **Layered and incremental**: SVCB answers connectivity in one round
  trip; Well-Known provides full metadata; WebSocket enables real-time
  chat. Do not escalate to a heavier layer when a lighter one suffices.
* **Standards-based**: Built on SVCB {{!RFC9460}}, TLSA {{!RFC6698}},
  DNSSEC {{!RFC9364}}, Well-Known URIs {{!RFC8615}}, WebSocket
  {{!RFC6455}}, and Ed25519 {{!RFC8032}}.
* **Aligned with IETF work**: DNS layer defers to DNS-AID
  {{?I-D.mozleywilliams-dnsop-dnsaid}}. ADP focuses on what happens after
  discovery.
* **Human-and-machine readable**: The root URL serves both a browser user
  and an automated client via JSON-LD embedding.
* **Secure by default**: DNS-AID + TLSA/DANE anchors the TLS endpoint;
  Ed25519 signatures authenticate messages end-to-end.

# Terminology

{::boilerplate bcp14-tagged}

Agent:
: An autonomous or semi-autonomous software entity identified by a domain
  name, capable of being discovered through DNS-AID + ADP and interacting
  via standard Web protocols.

Agent Domain:
: A fully qualified domain name (FQDN) that serves as the canonical
  identifier for an Agent. The Agent URI scheme is `agent:{domain}`.

Discovery Client:
: Software that performs discovery to locate and verify an Agent's
  identity, capabilities, and endpoints.

Fingerprint:
: The SHA-256 hash of an Ed25519 public key, encoded in base64url without
  padding and prefixed with `ed25519:`.

AGP (Agent Gateway Protocol):
: The WebSocket-based messaging protocol defined in Section {{agp}},
  used for inter-agent communication after discovery.

DNS-AID:
: The DNS-based Agent Identity and Discovery mechanism defined in
  {{?I-D.mozleywilliams-dnsop-dnsaid}}, which serves as ADP's normative
  Layer 1.

# Protocol Overview

The Agent Discovery Protocol defines a three-layer discovery and
interaction stack:

1. **Layer 1 — DNS Discovery (delegated to DNS-AID):** A single SVCB
   query at the Agent's domain name returns the target, port, IP hints,
   ALPN protocol list, Agent protocol identifier (`bap`), capability
   descriptor URI (`cap`), its SHA-256 digest (`cap-sha256`), and the
   Well-Known URI path (`well-known`). TLSA records enable DANE-based
   TLS endpoint authentication. TXT+SRV records serve as fallback.

2. **Layer 2 — Well-Known Metadata (this document):** A GET request to
   the Well-Known URI (default `/.well-known/agent.json`) returns a JSON
   document containing the Agent's identity, capabilities, relationships,
   security policies, and endpoint map.

3. **Layer 3 — Interaction Endpoints (this document):** An HTML landing
   page at the domain root provides human-readable discovery with
   embedded JSON-LD structured data. WebSocket endpoints using the Agent
   Gateway Protocol (AGP) enable real-time inter-agent communication with
   Ed25519 signature authentication.

The relationship between DNS-AID and ADP is:

~~~
+-----------------------------------------------------+
|                 Agent Discovery Stack               |
+-----------------------------------------------------+
|  Layer 1: DNS-AID        |  Layer 2+3: ADP         |
|  (SVCB + TLSA)           |  (Well-Known + AGP)     |
+-----------------------------------------------------+
|          IETF dnsop WG             |  This Document |
+-----------------------------------------------------+
~~~

**Core principle**: If SVCB answers your question, do not issue an HTTP
request. If Well-Known suffices, do not open a WebSocket.

# Layer 1: DNS Discovery (DNS-AID)

ADP v1.1 delegates its DNS discovery layer to DNS-AID
{{?I-D.mozleywilliams-dnsop-dnsaid}}. This section summarizes the
integration points; the normative specification resides in that document.

## SVCB Record (RECOMMENDED)

An ADP-compliant Agent SHOULD publish a SVCB record at its domain name
using the `ServiceMode` (SvcPriority 1–65535):

```
alice.example.com.  3600  IN  SVCB  1  . (
    alpn="a2a,h2,h3"
    port=443
    ipv4hint=192.0.2.1
    ipv6hint=2001:db8::1
    bap=a2a
    well-known=agent.json
    cap=https://alice.example.com/capabilities/a2a.json
    cap-sha256=<sha256-digest>
)
```

### SvcParamKey Usage in ADP

The following SvcParamKeys, defined by DNS-AID, are relevant to ADP:

`alpn`:
: The application-layer protocol negotiation IDs {{!RFC7301}}. ADP Agents
  SHOULD include the relevant Agent protocol identifier (e.g., `a2a`)
  alongside standard HTTP protocol IDs (`h2`, `h3`).

`bap`:
: Bulk Agent Protocol identifier. Separated from `alpn` so that policy
  engines can match on Agent-level protocol without parsing transport
  protocol negotiation. ADP v1.1 defines the protocol identifier `a2a` for
  the AGP messaging protocol (Section {{agp}}).

`well-known`:
: Path relative to the Well-Known URI namespace. Discovery Clients MUST
  resolve this against `https://{target}/.well-known/{well-known}`. If
  absent, the default path `/.well-known/agent.json` is used.

`cap`:
: URI or URN identifying the Agent's capability descriptor. ADP Agents
  SHOULD publish this as a URL to their capability document.

`cap-sha256`:
: SHA-256 digest of the capability descriptor at the time of DNS
  publishing. Allows a Discovery Client to verify that the capability
  document has not changed without re-fetching.

### Hosted Agents (TargetName)

When an Agent is hosted by a third-party provider, the SVCB TargetName
points to the provider's infrastructure:

```
alice.example.com.  3600  IN  SVCB  1  provider.example.com. (
    alpn="a2a,h2"
    port=443
    bap=a2a
    well-known=agent.json
)
```

### Organization Index (AliasMode)

Organizations MAY publish an index of their Agents using AliasMode
(SvcPriority 0) under a discoverable prefix:

```
_agents.example.com.  3600  IN  SVCB  0  alice.example.com.
_agents.example.com.  3600  IN  SVCB  0  bob.example.com.
```

## TLSA Record (RECOMMENDED with DNSSEC)

ADP Agents SHOULD publish a TLSA record to enable DANE
{{!RFC6698}}-based TLS endpoint authentication:

```
_443._tcp.alice.example.com.  3600  IN  TLSA  3  1  1  <cert-sha256>
```

Requirements:

* TLSA records are only valid when the DNS zone is DNSSEC-signed
  {{!RFC9364}}, to prevent downgrade attacks.
* The RECOMMENDED usage is DANE-EE (3), selector SPKI (1), matching type
  SHA-256 (1).
* A Discovery Client that receives both a valid TLSA record and a
  certificate that does not match MUST terminate the connection.

## DNSSEC

All DNS records used for Agent discovery SHOULD be DNSSEC-signed. TLSA
records MUST be DNSSEC-signed to be trusted.

# Fallback Discovery: TXT + SRV {#fallback}

When the DNS resolver or authoritative server does not support SVCB
queries (returns NODATA or NXDOMAIN for a SVCB query), Discovery Clients
SHOULD fall back to the following mechanism. This section preserves the
Layer 1 from ADP v1.0 (-00) as a backward-compatible alternative.

## TXT Record

```
_agent.{domain}.  IN  TXT  "v=ADP1.1; pk=ed25519:<fp>; wk=<url>; alpn=a2a"
```

Fields:

`v` (REQUIRED):
: Protocol version. MUST be `ADP1`, `ADP1.0`, or `ADP1.1`.

`pk` (REQUIRED):
: Public key fingerprint. Computed as SHA-256 of the raw Ed25519 public
  key, encoded in base64url without padding.

`wk` (REQUIRED):
: Full HTTPS URL to the Well-Known agent metadata endpoint.

`alpn` (OPTIONAL in fallback):
: Application protocol identifier (e.g., `a2a`).

`port` (OPTIONAL):
: Service port number. Default: 443.

`bap` (OPTIONAL):
: Agent protocol identifier.

Multi-record TXT: Values exceeding 255 octets MAY be split across
multiple TXT records at the same owner name. Reassembly concatenates
RDATA in returned order.

## SRV Record

```
_agent._tcp.{domain}.  IN  SRV  <priority> <weight> <port> <target>
```

If no SRV record is published, Discovery Clients SHOULD connect to
`{domain}` on TCP port 443.

## Fallback Procedure

1. Query SVCB at `{domain}`.
2. If NODATA or NXDOMAIN, proceed to fallback.
3. Query TXT at `_agent.{domain}`.
4. Parse `v`, `pk`, `wk` fields.
5. Query SRV at `_agent._tcp.{domain}` to locate host:port.
6. Proceed to Layer 2 (Section {{well-known}}) using the resolved URL and host.

Discovery Clients that successfully use the fallback path SHOULD indicate
this in their user agent or log, as the security properties of fallback
mode differ from SVCB-mode (no ALPN validation, no capability digest, no
IP hints).

# Layer 2: Well-Known Metadata {#well-known}

## Endpoint

Every ADP-compliant Agent MUST serve a JSON document at the path
indicated by the SVCB `well-known` parameter, or at the default:

```
/.well-known/agent.json
```

As defined in {{!RFC8615}}, this URI suffix is registered under the
`/.well-known/` namespace.

## Content Type

The response MUST include `Content-Type: application/json`. The document
MUST be valid JSON {{!RFC8259}} and SHOULD include a `$schema` field
pointing to the ADP schema resource.

## Schema

### Top-Level Members

`$schema` (string, OPTIONAL):
: URI of the JSON Schema for this document, e.g.
  `"https://raw.githubusercontent.com/harrylian8766/adp-protocol/main/schemas/v1.1/agent.json"`.

`protocol` (string, REQUIRED):
: Protocol version string. For this document, MUST be `"ADP/1.1"`.

`identity` (object, REQUIRED):
: Agent identity block (Section {{identity-block}}).

`endpoints` (object, REQUIRED):
: Map of endpoint names to absolute URLs (Section {{endpoints-block}}).

`capabilities` (array, REQUIRED):
: Array of capability objects (Section {{capabilities-block}}).

`interfaces` (object, OPTIONAL):
: Map of interface type to URL, e.g. `html`, `api`, `chat`.

`relationships` (array, OPTIONAL):
: Known peer Agents. Each entry contains `type`, `id`, `name`, optional
  `trust` level, and optional `since` timestamp.

`security` (object, REQUIRED):
: Security configuration (Section {{security-block}}).

`dns` (object, OPTIONAL):
: DNS record references for verification:
  * `svcbRecord` (string): The domain at which the SVCB record was queried.
  * `tlsaRecord` (string): The TLSA record query name.
  * `dnssec` (boolean): Whether the zone is DNSSEC-signed.

`policies` (object, OPTIONAL):
: Links to privacy policy, terms of service, data retention policy.

`availability` (object, REQUIRED):
: Current operational status.

`meta` (object, OPTIONAL):
: Document metadata: `updated`, `version`, `generator`, `documentation`.

### Identity Block {#identity-block}

Contains:

* `id` (REQUIRED): Agent URI `agent:{domain}`.
* `domain` (REQUIRED): Canonical FQDN.
* `name` (REQUIRED): Human-readable Agent name.
* `owner` (REQUIRED): Display name of the entity operating the Agent.
* `created` (REQUIRED): ISO 8601 creation timestamp.
* `publicKey` (REQUIRED): Object with:
  * `algorithm` (REQUIRED): `"ed25519"`.
  * `fingerprint` (REQUIRED): `ed25519:<base64url-sha256>` as defined in
    DNS-AID and the fallback TXT record.
  * `full` (OPTIONAL): Base64url-encoded full 32-byte Ed25519 public key.
  * `proof` (OPTIONAL): A signature over `agent:{domain}` made with the
    corresponding private key, encoded as `signature:<base64>`.

### Endpoints Block {#endpoints-block}

Contains:

* `discovery`: Landing page URL (HTTPS).
* `wellKnown`: Canonical Well-Known URL (HTTPS).
* `chat`: WebSocket Secure URL for AGP messaging (Section {{agp}}).
* `tasks`: HTTPS URL for asynchronous task submission.
* `swarm`: HTTPS URL for multi-agent coordination.
* `webhook`: HTTPS URL for outbound event callbacks.

### Capabilities Block {#capabilities-block}

Each capability object describes a skill the Agent offers:

* `id` (REQUIRED): Unique capability identifier (e.g., `chat`, `code-review`).
* `name` (REQUIRED): Human-readable name.
* `description` (REQUIRED): Short natural-language summary.
* `input` (array): Accepted MIME types and modalities (e.g., `text`, `image`, `file`).
* `output` (array): Produced MIME types and modalities.
* `interfaces` (array): Which interfaces expose this capability (`chat`, `api`, `webhook`).
* `languages` (array): BCP 47 language tags the Agent supports.
* `pricing` (object): `model` (`free`, `subscription`, `per-use`, `enterprise`) and optional `details`.

### Security Block {#security-block}

* `tlsRequired` (boolean): Whether TLS is required for all endpoints.
* `minProtocolVersion` (string): Minimum ADP protocol version required.
* `authMethods` (array): Supported authentication methods. ADP v1.1 adds
  the value `dane` to indicate DANE-based TLS authentication (Section
  {{tlsa}}).
* `rateLimit` (object): `requestsPerMinute` and `burstSize`.

### Example

```
{
  "$schema": "https://raw.githubusercontent.com/harrylian8766/adp-protocol/main/schemas/v1.1/agent.json",
  "protocol": "ADP/1.1",
  "identity": {
    "id": "agent:alice.example.com",
    "domain": "alice.example.com",
    "name": "Alice's Agent",
    "owner": "Alice",
    "created": "2026-01-15T00:00:00Z",
    "publicKey": {
      "algorithm": "ed25519",
      "fingerprint": "ed25519:dGhpcyBpcyBhIHRlc3Qg..."
    }
  },
  "endpoints": {
    "discovery": "https://alice.example.com/",
    "wellKnown": "https://alice.example.com/.well-known/agent.json",
    "chat": "wss://alice.example.com/agent/chat",
    "tasks": "https://alice.example.com/agent/tasks"
  },
  "capabilities": [
    {
      "id": "chat",
      "name": "Conversation",
      "description": "General-purpose conversational AI",
      "input": ["text", "image", "file"],
      "output": ["text", "html", "chart"],
      "interfaces": ["chat", "api"],
      "languages": ["en", "zh"],
      "pricing": { "model": "free" }
    }
  ],
  "security": {
    "tlsRequired": true,
    "minProtocolVersion": "ADP/1.1",
    "authMethods": ["pubkey", "dane"],
    "rateLimit": { "requestsPerMinute": 60, "burstSize": 10 }
  },
  "dns": {
    "svcbRecord": "alice.example.com",
    "tlsaRecord": "_443._tcp.alice.example.com",
    "dnssec": true
  },
  "availability": {
    "status": "online",
    "uptime": "99.9%"
  }
}
```

## Caching

Discovery Clients MAY cache the Well-Known JSON. The RECOMMENDED TTL is
the DNS TTL of the SVCB record or 3600 seconds, whichever is shorter.
Clients SHOULD revalidate using the `cap-sha256` digest from the SVCB
record when available.

# Layer 3: Interaction Endpoints

## HTML Landing Page

The domain root (`/`) SHOULD return an HTML document suitable for browser
rendering. The page serves as the human-facing Agent card and MUST embed
structured data for machine consumption.

### JSON-LD Embedding

The page MUST include a `<script type="application/ld+json">` block
containing the complete Agent metadata as a JSON-LD document, using the
context URI `https://raw.githubusercontent.com/harrylian8766/adp-protocol/main/schemas/v1.1`.

### HTML Meta Tags

The page SHOULD include the following `<meta>` elements in the document
`<head>`:

* `<meta name="agent-id" content="agent:{domain}">`
* `<meta name="agent-protocol" content="ADP/1.1">`
* `<meta name="agent-fingerprint" content="ed25519:...">`

### Semantic HTML

To enable browser-based agent interaction without JavaScript, Agents MAY
use semantic custom elements:

* `<agent-card>`: Root element for the Agent profile.
* `<capability-list>`: Container for capability entries.
* `<capability>`: Individual capability with `name` and `status` attributes.
* `<connect-form>`: Form with `action` pointing to a connection endpoint.

## Agent Gateway Protocol (AGP) {#agp}

### Overview

AGP is a JSON-based messaging protocol over WebSocket {{!RFC6455}} that
enables real-time, bidirectional communication between Agents after
discovery.

### Connection Handshake

Upon WebSocket connection, the client MUST send an `adp_handshake` frame:

```
{
  "id": "<uuid>",
  "type": "adp_handshake",
  "protocol": "ADP/1.1",
  "agent_id": "agent:caller.example.com",
  "public_key": "<base64url-encoded Ed25519 public key>",
  "nonce": "<random hex>"
}
```

The server MUST respond with its own `adp_handshake` frame. Both parties
validate the other's public key fingerprint against the one obtained
during discovery (DNS-AID SVCB record or fallback TXT).

### Message Format

All messages after handshake MUST be JSON objects (one per WebSocket
frame, JSON Lines {{!RFC7464}}) with the following structure:

```
{
  "id": "<uuid>",
  "from": "agent:sender.example.com",
  "to": "agent:recipient.example.com",
  "type": "<message-type>",
  "timestamp": "<ISO 8601>",
  "signature": "ed25519:<base64-signature>",
  "body": {
    "content": "<payload>",
    "contentType": "text/plain|text/html|application/json",
    "replyTo": "<message-id>"
  },
  "attachments": []
}
```

### Message Types

* `chat`: Conversational message between Agents.
* `task`: Task submission or status update.
* `swarm`: Multi-agent coordination message (join, leave, vote).
* `system`: Protocol-level control message (ping, pong, error).

### Signature Computation

The `signature` field contains an Ed25519 signature over the
canonical JSON representation of the message without the `signature`
field. The canonical form follows the JCS (JSON Canonicalization Scheme)
{{!RFC8785}}.

Discovery Clients MUST verify the signature against the public key
obtained during discovery. Messages with invalid signatures MUST be
discarded.

## HTTP Endpoints

In addition to the WebSocket chat endpoint, ADP Agents MAY expose:

### Task Endpoint

```
POST /agent/tasks
Content-Type: application/json

{
  "callback": "https://caller.example.com/agent/webhook",
  "body": {
    "type": "code-review",
    "content": "..."
  }
}
```

Response: `202 Accepted` with a `Location` header pointing to the task
status resource.

### Swarm Endpoint

```
POST /agent/swarm/join
Content-Type: application/json

{
  "agent_id": "agent:joiner.example.com",
  "swarm_id": "<uuid>",
  "role": "worker"
}
```

# Security Considerations

## Trust Escalation Model

ADP v1.1 defines a layered trust escalation:

~~~
Level 1: dns-verified
  ├── DNSSEC-validated SVCB response
  ├── Public key fingerprint obtained
  └── No connection established yet

Level 2: dane-verified
  ├── TLSA record retrieved and validated
  ├── TLS certificate matches TLSA binding
  └── Endpoint identity cryptographically confirmed

Level 3: key-verified
  ├── Well-Known JSON fetched
  ├── identity.publicKey.fingerprint == SVCB fingerprint
  └── Public key ownership confirmed

Level 4: peer-verified
  ├── Bidirectional AGP handshake with valid signatures
  ├── Human confirmation (for first meeting)
  └── Ongoing message-level signature verification
~~~

### Freshness and Replay Protection

AGP messages include a `nonce` (during handshake) and `timestamp` (in
every message). Receiving Agents SHOULD maintain a sliding window of
recent message IDs to detect replays.

### Fingerprint Verification

The fingerprint published in the DNS-AID SVCB record (or fallback TXT)
MUST match the `identity.publicKey.fingerprint` in the Well-Known JSON.
If they do not match, the Discovery Client MUST abort and MUST NOT
proceed to message exchange.

## TLS Requirements

* All endpoints MUST use TLS 1.3 {{!RFC8446}}.
* Certificates SHOULD be issued by a publicly trusted CA.
* When both TLSA records and DNSSEC are available, DANE verification
  {{!RFC6698}} SHOULD be preferred over CA validation.
* Self-signed certificates are acceptable only for local development and
  MUST NOT be used for public-facing Agents.

## Private Agents

Agents that are not intended for public discovery:

* Method A: Do not publish SVCB or TXT records.
* Method B: Return HTTP 403 from the Well-Known endpoint.
* Method C: Require an invitation code (out of band) that includes the
  Agent's domain and public key fingerprint.

### Invitation Format

```
{
  "protocol": "ADP/1.1",
  "invite": {
    "code": "<random>",
    "expires": "<ISO 8601>",
    "agent": "agent:alice.example.com",
    "wellKnown": "https://alice.example.com/.well-known/agent.json?invite=<code>",
    "pubkey": "ed25519:<fingerprint>"
  }
}
```

# IANA Considerations

## Well-Known URI Registration

IANA is requested to register the following Well-Known URI suffix in the
"Well-Known URIs" registry:

* URI suffix: `agent`
* Change controller: IETF
* Specification document(s): This document
* Related information: See also DNS-AID
  {{?I-D.mozleywilliams-dnsop-dnsaid}}

## SvcParamKey Registration (via DNS-AID)

The SvcParamKeys `bap`, `cap`, `cap-sha256`, and `well-known` are
registered through DNS-AID {{?I-D.mozleywilliams-dnsop-dnsaid}}. This
document does not request independent registration of these keys.

## Service Name Registration (for fallback mode)

IANA is requested to register the following service name in the "Service
Name and Transport Protocol Port Number Registry":

* Service Name: `agent`
* Transport Protocol: TCP
* Description: AI Agent Discovery Protocol (fallback mode)
* Assignee: IETF
* Contact: Author of this document
* Reference: This document

## Media Type Registration

IANA is requested to register the following media type:

* Type name: `application`
* Subtype name: `adp+json`
* Required parameters: N/A
* Optional parameters: N/A
* Encoding considerations: binary (UTF-8 JSON)
* Security considerations: See Security Considerations of this document
* Interoperability considerations: N/A
* Published specification: This document
* Applications that use this media type: AI Agent discovery and interop
* Fragment identifier considerations: N/A

# Implementation Status

## Reference Implementation

A reference implementation in Node.js/TypeScript is available at
<https://github.com/harrylian8766/adp-protocol>. It includes:

* SVCB and fallback DNS record generation and parsing.
* TLSA record verification.
* Well-Known JSON schema validation.
* HTML landing page generation.
* AGP WebSocket server and client with Ed25519 signing.
* Full Discovery Client implementing the three-layer discovery procedure.

## Backward Compatibility

ADP v1.1 Discovery Clients MUST support fallback to TXT+SRV discovery
(Section {{fallback}}) to interoperate with ADP v1.0 Agents.

ADP v1.0 Discovery Clients will not benefit from SVCB-based discovery or
DANE authentication, but can discover v1.1 Agents through the fallback
path.

{backmatter}

# Acknowledgments

The author thanks Ross for the suggestion to adopt a SVCB-first approach
and for pointing to DNS-AID as an emerging standard for Agent DNS
discovery. The DNS-AID authors (Richard Mozley et al.) provided a clean
SvcParamKey registration base that ADP builds upon.

The three-layer architecture and the principle of "solving at the lowest
possible layer" were inspired by discussions with Pro about the
relationship between domain identity, DNS discovery, and Web-native Agent
interaction.

{numbered="false"}
# Version History

* **-00**: Initial version with TXT+SRV DNS discovery.
* **-01**: SVCB-first via DNS-AID; TLSA+DANE; trust escalation model;
  fallback preservation for backward compatibility.
