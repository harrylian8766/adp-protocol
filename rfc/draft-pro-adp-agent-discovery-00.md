%%%
title = "Agent Discovery Protocol (ADP)"
abbrev = "adp-agent-discovery"
docName = "draft-pro-adp-agent-discovery-00"
category = "info"
ipr = "trust200902"
area = "Applications"
workgroup = "Independent Submission"
keyword = ["agent", "discovery", "dns", "well-known", "srv", "ed25519"]

[seriesInfo]
name = "Internet-Draft"
value = "draft-pro-adp-agent-discovery-00"
stream = "IETF"
status = "informational"

[[author]]
initials = "H."
surname = "Lian"
fullname = "Harry Lian"
organization = "AI Pair"
  [author.address]
  email = "harrylian8766@gmail.com"

date = 2026-06-09T00:00:00Z

%%%

.# Abstract

This document specifies the Agent Discovery Protocol (ADP), a three-layer
discovery mechanism for AI Agents that leverages existing Internet
infrastructure: DNS TXT and SRV records for lightweight service discovery
(Layer 1), Well-Known URIs for machine-readable metadata (Layer 2), and
HTML landing pages with WebSocket channels for human interaction and
inter-agent communication (Layer 3). ADP enables any domain owner to make
their AI Agent discoverable without relying on centralized registries,
using the Domain Name System as the decentralized trust anchor.

{mainmatter}

# Introduction

## Background

AI Agents are rapidly evolving from chatbot plugins into autonomous
internet-native entities. Yet the ecosystem lacks a universal discovery
mechanism: agents are locked inside proprietary platforms (OpenAI, Dify,
Coze), each with its own directory and identity system. An agent on one
platform cannot natively discover an agent on another.

The Web solved an analogous problem 40 years ago: any resource can be
discovered through a combination of DNS names, well-known ports, and HTML
document interlinking. This specification applies the same principle to
Agents.

## Design Goals

* **Decentralized**: No central registry required; domain ownership is the
  root of identity.
* **Incremental discovery**: Solve at the lowest possible layer; only
  escalate to heavier mechanisms when needed.
* **Web-native**: Build on existing IETF standards (DNS, TLS, Well-Known
  URIs, WebSocket) rather than invent new protocols.
* **Human-and-machine readable**: The same endpoint serves both a browser
  user and an automated agent.
* **Secure by default**: Public key fingerprint bound to the DNS record
  provides first-meeting trust without pre-shared keys or PKI.

# Terminology

{::boilerplate bcp14-tagged}

Agent:
: An autonomous or semi-autonomous software entity identified by a domain
  name, capable of being discovered through ADP and interacting via
  standard Web protocols.

Agent Domain:
: A fully qualified domain name (FQDN) that serves as the canonical
  identifier for an Agent. The agent URI scheme is `agent:{domain}`.

Discovery Client:
: Software that performs ADP discovery to locate and verify an Agent's
  identity, capabilities, and endpoints.

Fingerprint:
: The SHA-256 hash of an Ed25519 public key, encoded in base64url and
  prefixed with `ed25519:`.

# Protocol Overview

The Agent Discovery Protocol defines a three-layer discovery and
interaction stack:

1. **Layer 1 — DNS Discovery:** A TXT record at `_agent.{domain}` carries the
   protocol version, a public key fingerprint, and the Well-Known URI. An
   optional SRV record at `_agent._tcp.{domain}` locates the Agent's
   service endpoints.

2. **Layer 2 — Well-Known Metadata:** `GET /.well-known/agent.json` returns a
   JSON document containing the Agent's full identity, capabilities,
   relationship graph, security policies, and endpoint map.

3. **Layer 3 — Interaction Endpoints:** An HTML landing page at the domain
   root provides human-readable discovery with embedded JSON-LD
   structured data. WebSocket endpoints enable real-time inter-agent
   communication with Ed25519 signature authentication.

**Core principle**: Solve at the lowest possible layer. If DNS records
suffice, do not issue an HTTP request. If Well-Known metadata suffices, do
not open a WebSocket.

# Layer 1: DNS Discovery

## TXT Record (REQUIRED)

Every ADP-compliant Agent MUST publish a DNS TXT record at
`_agent.{domain}` containing semicolon-delimited key-value pairs.

### Record Format

```
_agent.{domain}.  IN  TXT  "v=ADP1; pk=<fingerprint>; wk=<well-known-uri>"
```

### Fields

v:
: Protocol version. Current value: `ADP1`. REQUIRED.

pk:
: Public key fingerprint in the format `ed25519:<base64url-sha256>`.
  Computed as the SHA-256 hash of the raw 32-byte Ed25519 public key,
  encoded in base64url without padding (Section 5 of {{!RFC4648}}).
  REQUIRED.

wk:
: Full URL to the Well-Known agent metadata endpoint. MUST use HTTPS.
  REQUIRED.

rel:
: Optional comma-separated list of relationship tags. Defined values
  include `self`, `parent`, and `cluster:{name}`.

note:
: Optional human-readable description, maximum 64 octets.

### Multi-Record TXT

When the combined key-value string exceeds 255 octets (a single TXT
resource record limit), it SHOULD be split across multiple TXT records at
the same owner name. Reassembly is performed by concatenating the RDATA
value of each TXT record in the order returned by the DNS resolver.

### Discovery Procedure

1. Query `IN TXT _agent.{domain}` using a DNSSEC-validating resolver.
2. Parse semicolon-delimited fields from the concatenated TXT data.
3. Verify `v=ADP1` is present.
4. Extract the `pk` fingerprint and `wk` Well-Known URL.
5. Optionally cache the fingerprint for subsequent signature verification.

## SRV Record (RECOMMENDED)

Agents that operate their own service endpoints SHOULD publish a DNS SRV
record {{!RFC2782}}:

```
_agent._tcp.{domain}.  IN  SRV  <priority> <weight> <port> <target>
```

The `target` field MUST resolve to a host providing ADP-compliant service
endpoints. If no SRV record is published, Discovery Clients SHOULD fall
back to connecting to `{domain}` on TCP port 443 (HTTPS).

# Layer 2: Well-Known Metadata

## Endpoint

Every ADP-compliant Agent MUST serve a JSON document at:

```
/.well-known/agent.json
```

As defined in {{!RFC8615}}, this URI suffix is registered under the
`/.well-known/` namespace.

## Content Type

The response MUST include `Content-Type: application/json`. The document
MUST be valid JSON {{!RFC8259}}.

## Schema

The root object contains the following top-level members:

protocol (string, REQUIRED):
: Protocol version string, e.g. `"ADP/1.0"`.

identity (object, REQUIRED):
: Agent identity block.

  * `id` (string): Agent URI in the format `agent:{domain}`.
  * `domain` (string): Canonical FQDN.
  * `name` (string): Human-readable Agent name.
  * `owner` (string): Display name of the entity operating the Agent.
  * `created` (string): ISO 8601 creation timestamp.
  * `publicKey` (object): Contains `algorithm` (`"ed25519"`), `fingerprint`
    (string), and optional `full` (base64url-encoded full public key).

endpoints (object, REQUIRED):
: Map of logical endpoint names to absolute URLs.

  * `discovery`: Landing page URL.
  * `wellKnown`: Canonical Well-Known URL.
  * `chat`: WebSocket Secure URL for real-time chat.
  * `tasks`: HTTPS URL for asynchronous task submission.
  * `swarm`: HTTPS URL for multi-agent coordination.

capabilities (array, REQUIRED):
: Array of capability objects, each describing a skill the Agent offers:
  `id`, `name`, `description`, `input` (array of MIME types), `output`
  (array of MIME types), `interfaces` (array of `chat`/`api`/`webhook`),
  `languages` (array of BCP 47 tags), and `pricing` (object with `model`
  and optional `details`).

interfaces (object, OPTIONAL):
: Map of interface type to URL.

relationships (array, OPTIONAL):
: Known peer Agents. Each entry contains `type` (`peer`/`child`/`parent`),
  `id` (Agent URI), `name`, optional `trust` level, and optional `since`
  timestamp.

security (object, REQUIRED):
: Security configuration. Contains `tlsRequired` (boolean), `minProtocolVersion`,
  `authMethods` (array, e.g. `["pubkey"]`), and optional `rateLimit` object.

policies (object, OPTIONAL):
: Links to privacy policy, terms of service, data retention policy, and
  third-party data sharing declaration.

availability (object, REQUIRED):
: Current status (`online`/`offline`/`maintenance`), uptime commitment,
  optional maintenance window.

meta (object, OPTIONAL):
: Document metadata: `updated` timestamp, `version`, `generator` string.

### Example

```
{
  "protocol": "ADP/1.0",
  "identity": {
    "id": "agent:alice.agent",
    "domain": "alice.agent",
    "name": "Alice's Agent",
    "owner": "Alice",
    "created": "2026-01-01T00:00:00Z",
    "publicKey": {
      "algorithm": "ed25519",
      "fingerprint": "ed25519:abc123..."
    }
  },
  "endpoints": {
    "discovery": "https://alice.agent/",
    "wellKnown": "https://alice.agent/.well-known/agent.json",
    "chat": "wss://alice.agent/agent/chat",
    "tasks": "https://alice.agent/agent/tasks"
  },
  "capabilities": [
    {
      "id": "chat",
      "name": "Conversation",
      "description": "General-purpose conversational AI",
      "input": ["text", "image"],
      "output": ["text", "html"],
      "interfaces": ["chat", "api"],
      "languages": ["en", "zh"],
      "pricing": { "model": "free" }
    }
  ],
  "security": {
    "tlsRequired": true,
    "minProtocolVersion": "ADP/1.0",
    "authMethods": ["pubkey"],
    "rateLimit": { "requestsPerMinute": 60 }
  },
  "availability": {
    "status": "online"
  }
}
```

# Layer 3: Interaction Endpoints

## HTML Landing Page

The domain root (`/`) SHOULD return an HTML document suitable for browser
rendering. The page serves as the human-facing Agent card and MUST embed
structured data for machine consumption.

### JSON-LD Embedding

The page MUST include a `<script type="application/ld+json">` block
containing the complete Agent metadata as a JSON-LD document. This allows
automated discovery from a single HTTP GET request.

### HTML Meta Tags

The page SHOULD include the following `<meta>` elements in the document
`<head>`:

* `<meta name="agent-id" content="agent:{domain}">`
* `<meta name="agent-protocol" content="ADP/1.0">`
* `<meta name="agent-fingerprint" content="ed25519:...">`

## WebSocket Communication

### Endpoint

The Agent's WebSocket endpoint (published in the Well-Known JSON under
`endpoints.chat`) provides a real-time, bidirectional communication
channel between Agents.

### Connection Handshake

Upon connection, the client MUST send an `adp_handshake` message
containing:

```
{
  "type": "adp_handshake",
  "protocol": "ADP/1.0",
  "agent_id": "agent:caller.domain",
  "public_key": "<base64url-encoded Ed25519 public key>",
  "nonce": "<random hex string>"
}
```

The server responds with its own handshake message, and subsequent
messages are authenticated with Ed25519 signatures.

### Message Format

All messages after handshake MUST be JSON objects with `type`, `id`,
`timestamp`, and `signature` fields:

```
{
  "type": "message",
  "id": "<uuid>",
  "timestamp": "<ISO 8601>",
  "from": "agent:caller.domain",
  "to": "agent:target.domain",
  "payload": { ... },
  "signature": "<base64url Ed25519 signature>"
}
```

The signature covers the concatenation of `type`, `id`, `timestamp`,
`from`, `to`, and the canonical JSON serialization of `payload`.

# Security Model

## Trust Chain

ADP establishes a trust chain anchored in DNSSEC and the domain
registration system:

```
DNSSEC-validated TXT record
  → fingerprint (embed in DNS)
    → Well-Known agent.json (verify fingerprint matches)
      → full public key (publish in JSON)
        → Ed25519 signatures (verify every message)
```

## Trust Levels

Discovery Clients assign one of four trust levels:

1. **unverified** — DNS resolved but no verification performed.
2. **dns-verified** — TXT record was validated via DNSSEC.
3. **key-verified** — Public key fingerprint from DNS matches the Agent's
   Well-Known document and the Agent successfully signed a challenge.
4. **peer-verified** — Mutual verification between known peers, tracked
   in the `relationships` array with a `trust` value of `verified`.

## Threat Mitigations

**Domain hijacking**: DNSSEC validation prevents DNS cache poisoning.
Even without DNSSEC, the fingerprint comparison between DNS TXT and
Well-Known JSON provides a second factor.

**Man-in-the-middle**: TLS 1.3 is REQUIRED for all HTTP and WebSocket
endpoints. The DNS-anchored fingerprint allows detection of TLS
termination attacks.

**Impersonation**: An attacker who controls a different domain cannot
claim another Agent's identity because the domain IS the identity. No
certificate authority can issue a valid certificate for another domain
without compromising that domain's DNS or the CA itself.

**Key rotation**: Agents SHOULD publish a `previousFingerprint` field in
their Well-Known document during key rotation. Discovery Clients SHOULD
accept the new key if it can be validated through the old key's signature
over a key rotation message.

# IANA Considerations

## Well-Known URI Registration

This document requests registration of the "agent" Well-Known URI in the
"Well-Known URIs" registry established by {{!RFC8615}}.

* URI suffix: agent
* Change controller: IETF
* Specification document(s): This document
* Related information: Agent metadata is served in JSON format at
  `/.well-known/agent.json`

## SRV Service Name Registration

This document requests registration of the "_agent" service name in the
"Service Name and Transport Protocol Port Number Registry" for TCP.

* Service Name: agent
* Transport Protocol: TCP
* Assignee: IETF (IESG)
* Contact: Harry Lian <harry@aipair.ai>
* Description: AI Agent Discovery Protocol service endpoint
* Reference: This document
* Port Number: None (uses SRV-defined port)

## Media Type Registration

This document requests registration of the media type
`application/adp+json` in the "Media Types" registry.

* Type name: application
* Subtype name: adp+json
* Required parameters: N/A
* Optional parameters: N/A
* Encoding considerations: binary (UTF-8 JSON)
* Security considerations: See Security Considerations of this document
* Interoperability considerations: N/A
* Published specification: This document
* Applications that use this media type: ADP-compliant Agent hosts and
  discovery clients
* Additional information:
  * Deprecated alias names for this type: N/A
  * Magic number(s): N/A
  * File extension(s): N/A
  * Macintosh file type code(s): N/A

# Security Considerations

## DNSSEC Dependency

The security of the trust chain depends on DNSSEC validation. Discovery
Clients SHOULD use DNSSEC-validating resolvers and MUST treat
non-validated DNS responses as `unverified` trust level. In environments
where DNSSEC is unavailable, the fingerprint comparison between DNS TXT
and Well-Known JSON provides defense-in-depth but does not constitute full
verification.

## Key Management

Agents MUST protect their Ed25519 private key with the same care as a TLS
private key. Compromise of the private key allows an attacker to
impersonate the Agent across all communication channels. Key rotation
SHOULD be performed by publishing a new fingerprint in DNS TXT, updating
the Well-Known document, and (optionally) signing a rotation message with
the previous key.

## Denial of Service

The Well-Known endpoint is a JSON document typically under 16 KiB and is
cacheable. Rate limiting at the application layer (published in
`security.rateLimit`) and standard HTTP caching headers SHOULD be
employed to prevent abuse.

## Privacy Considerations

Agent discovery is inherently public: any party that knows a domain name
can discover the associated Agent's capabilities and endpoints. Agents
SHOULD NOT include personally identifiable information in their
Well-Known documents. The `policies.privacy` URL provides a mechanism for
Agents to declare their data handling practices.

# Operational Considerations

## DNS Caching

Discovery Clients SHOULD cache DNS TXT and SRV query results for the TTL
specified in the DNS response, up to a maximum of 3600 seconds.

## Well-Known Caching

The Well-Known JSON document SHOULD be served with appropriate HTTP
caching headers (`Cache-Control`, `ETag`). Discovery Clients SHOULD
honor these headers and MAY use conditional requests.

## Version Negotiation

The protocol version is carried in DNS TXT (`v` field) and echoed in the
Well-Known JSON (`protocol` field). If a Discovery Client encounters a
version it does not support, it SHOULD abort discovery and report the
incompatibility. New protocol versions MUST increment the version string
(e.g., `ADP2`).

## Backwards Compatibility

ADP/1.0 is the initial protocol version. Future versions SHOULD be
backwards-compatible in their discovery layers (TXT record format,
Well-Known schema additions are non-breaking if unknown fields are
ignored).

--- back

# Acknowledgments

This protocol was conceived through discussions between Harry Lian and Pro
on the nature of the Agent Internet, with the shared conviction that
Agents should inherit the Web's proven infrastructure rather than
reinventing it.

# Sample TXT Record

```
_agent.alice.agent.  3600  IN  TXT  "v=ADP1; pk=ed25519:dGhpcyBpcyBhIHRlc3Q; wk=https://alice.agent/.well-known/agent.json"
```

# Sample SRV Record

```
_agent._tcp.alice.agent.  3600  IN  SRV  10 5 443 alice.agent.
```

# Reference Implementations

* Node.js SDK: <https://github.com/harrylian8766/adp-protocol>
* Protocol registry: <https://agent-discovery.org>

{backmatter}
