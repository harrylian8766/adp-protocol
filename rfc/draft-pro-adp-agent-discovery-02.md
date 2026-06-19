---
title: "Agent Discovery Protocol (ADP) v1.1 — Well-Known Metadata and Interaction Layer"
abbrev: adp-agent-discovery
docname: draft-pro-adp-agent-discovery-02
date: 2026-06-18
category: info
ipr: trust200902
area: General
workgroup: Independent Submission
keyword:
  - agent
  - discovery
  - DNS
  - Well-Known
  - DNS-AID

stand_alone: yes
pi: [toc, sortrefs, symrefs]

author:
  -
    ins: H. Lian
    name: Bin Lian
    organization: AI Pair
    email: TBD

normative:
  RFC1035:
  RFC2782:
  RFC6455:
  RFC6698:
  RFC6838:
  RFC7301:
  RFC8032:
  RFC8259:
  RFC8615:
  RFC9364:
  RFC6901:
  RFC9460:
  I-D.mozleywilliams-dnsop-dnsaid:

informative:
  RFC7033:
  draft-pro-adp-agent-discovery-00:

--- abstract

This document defines the Agent Discovery Protocol (ADP) v1.1, a
layered protocol for discovering, verifying, and interacting with AI
Agents on the Internet.  ADP delegates DNS discovery to DNS-AID (SVCB
records) and defines a Well-Known JSON metadata format, an
Ed25519-based identity model, and the Agent Gateway Protocol (AGP)
for real-time WebSocket messaging.  The protocol is designed to be
decentralized, standards-based, and incremental — clients escalate
from DNS to HTTP to WebSocket only as needed.

--- middle

# Introduction

## Background

AI Agents are evolving from chatbot plugins into autonomous,
internet-native entities.  Each platform (OpenAI, Dify, Coze)
provides its own directory and identity system, but there is no
universal discovery mechanism: an Agent on one platform cannot
natively discover an Agent on another without a bridging registry.

The Web solved an analogous problem decades ago: any resource can be
discovered through a combination of DNS names, well-known ports, and
HTML interlinking.  ADP applies the same principle to Agents, adding
what the Web assumes but Agents require: structured capability
descriptions, cryptographic identity binding, and real-time
communication primitives.

## Relationship to DNS-AID

DNS-AID {{I-D.mozleywilliams-dnsop-dnsaid}} defines the DNS discovery
layer for Agents using SVCB records {{RFC9460}}.  It registers the
following SvcParamKeys:

* bap: Bulk Agent Protocol identifier (e.g., a2a, mcp).
* cap: URI or URN of the Agent's capability descriptor.
* cap-sha256: SHA-256 digest of the capability descriptor.
* well-known: Path relative to /.well-known/ for the Agent's metadata
  document.

ADP v1.1 adopts DNS-AID as its normative DNS discovery mechanism.  The
ADP Well-Known JSON schema ({{well-known}}) serves as the content format
pointed to by the well-known SvcParamKey.

If DNS-AID is unavailable (the DNS resolver does not support SVCB, or
the authoritative server has not published SVCB records), ADP provides
a fallback path using TXT {{RFC1035}} and SRV {{RFC2782}} records as
documented in {{fallback}}.

## Changes from -00

* Layer 1 (DNS): Replaced TXT+SRV as the primary mechanism with
  reference to DNS-AID {{I-D.mozleywilliams-dnsop-dnsaid}}.  The
  original TXT+SRV scheme is retained as a documented fallback
  ({{fallback}}).

* Added TLSA {{RFC6698}} + DNSSEC {{RFC9364}} for DANE-style TLS
  endpoint authentication.

* Defined a trust escalation chain: dns-verified → dane-verified →
  key-verified → peer-verified.

* Protocol version string updated from ADP/1.0 to ADP/1.1.

* Updated Well-Known schema with dns block and dane auth method.

* Added implementation guidance for SVCB-first discovery clients.

* Updated IANA media type registration to vendor tree:
  application/vnd.adp+json (see {{iana-media-type}}).

## Design Goals

* *Decentralized*: No central registry; domain ownership is the root
  of identity.

* *Layered and incremental*: SVCB answers connectivity in one round
  trip; Well-Known provides full metadata; WebSocket enables
  real-time chat.  Do not escalate to a heavier layer when a lighter
  one suffices.

* *Standards-based*: Built on SVCB {{RFC9460}}, TLSA {{RFC6698}},
  DNSSEC {{RFC9364}}, Well-Known URIs {{RFC8615}}, WebSocket
  {{RFC6455}}, and Ed25519 {{RFC8032}}.

* *Aligned with IETF work*: DNS layer defers to DNS-AID
  {{I-D.mozleywilliams-dnsop-dnsaid}}.  ADP focuses on what happens
  after discovery.

* *Human-and-machine readable*: The root URL serves both a browser
  user and an automated client via JSON-LD embedding.

* *Secure by default*: DNS-AID + TLSA/DANE anchors the TLS endpoint;
  Ed25519 signatures authenticate messages end-to-end.

# Terminology

Agent:
: An autonomous or semi-autonomous software entity identified by a
  domain name, capable of being discovered through DNS-AID + ADP and
  interacting via standard Web protocols.

Agent Domain:
: A fully qualified domain name (FQDN) that serves as the canonical
  identifier for an Agent.  The Agent URI scheme is
  `agent:{domain}`.

Discovery Client:
: Software that performs discovery to locate and verify an Agent's
  identity, capabilities, and endpoints.

Fingerprint:
: The SHA-256 hash of an Ed25519 public key, encoded in base64url
  without padding and prefixed with `ed25519:`.

AGP (Agent Gateway Protocol):
: The WebSocket-based messaging protocol defined in {{agp}}, used
  for inter-agent communication after discovery.

DNS-AID:
: The DNS-based Agent Identity and Discovery mechanism defined in
  {{I-D.mozleywilliams-dnsop-dnsaid}}, which serves as ADP's
  normative Layer 1.

# Protocol Overview

The Agent Discovery Protocol defines a three-layer discovery and
interaction stack:

1. **Layer 1 — DNS Discovery (delegated to DNS-AID):** A single SVCB
   query at the Agent's domain name returns the target, port, IP
   hints, ALPN protocol list, Agent protocol identifier (bap),
   capability descriptor URI (cap), its SHA-256 digest (cap-sha256),
   and the Well-Known URI path (well-known).  TLSA records enable
   DANE-based TLS endpoint authentication.  TXT+SRV records serve
   as fallback.

2. **Layer 2 — Well-Known Metadata (this document):** A GET request
   to the Well-Known URI (default `/.well-known/agent.json`) returns
   a JSON document containing the Agent's identity, capabilities,
   relationships, security policies, and endpoint map.

3. **Layer 3 — Interaction Endpoints (this document):** An HTML
   landing page at the domain root provides human-readable discovery
   with embedded JSON-LD structured data.  WebSocket endpoints using
   the Agent Gateway Protocol (AGP) enable real-time inter-agent
   communication with Ed25519 signature authentication.

~~~~

  +-----------------------------------------------------+
  |                 Agent Discovery Stack                |
  +-----------------------------------------------------+
  |  Layer 1: DNS-AID        |  Layer 2+3: ADP          |
  |  (SVCB + TLSA)           |  (Well-Known + AGP)      |
  +-----------------------------------------------------+
  |          IETF dnsop WG              |  This Document |
  +-----------------------------------------------------+

~~~~
{: #fig-stack title="Agent Discovery Stack"}

*Core principle*: If SVCB answers your question, do not issue an HTTP
request.  If Well-Known suffices, do not open a WebSocket.

# Layer 1: DNS Discovery (DNS-AID)

ADP v1.1 delegates its DNS discovery layer to DNS-AID
{{I-D.mozleywilliams-dnsop-dnsaid}}.  This section summarizes the
integration points; the normative specification resides in that
document.

## SVCB Record (RECOMMENDED)

An ADP-compliant Agent SHOULD publish a SVCB record at its domain
name.

~~~
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
~~~
{: #fig-svcb title="SVCB Record Example"}

### SvcParamKey Usage in ADP

alpn:
: The application-layer protocol negotiation IDs {{RFC7301}}.  ADP
  Agents SHOULD include the relevant Agent protocol identifier
  (e.g., a2a) alongside standard HTTP protocol IDs (h2, h3).

bap:
: Bulk Agent Protocol identifier.  Separated from alpn so that
  policy engines can match on Agent-level protocol without parsing
  transport protocol negotiation.  ADP v1.1 defines the protocol
  identifier a2a for the AGP messaging protocol ({{agp}}).

well-known:
: Path relative to the Well-Known URI namespace.  Discovery
  Clients MUST resolve this against
  `https://{target}/.well-known/{well-known}`.  If absent, the
  default path `/.well-known/agent.json` is used.

cap:
: URI or URN identifying the Agent's capability descriptor.  ADP
  Agents SHOULD publish this as a URL to their capability document.

cap-sha256:
: SHA-256 digest of the capability descriptor at the time of DNS
  publishing.  Allows a Discovery Client to verify that the
  capability document has not changed without re-fetching.

### Hosted Agents (TargetName)

When an Agent is hosted by a third-party provider, the SVCB
TargetName field points to the provider's domain.

~~~
alice.example.com.  3600  IN  SVCB  1  provider.example.com. (
    alpn="a2a,h2"
    port=443
    bap=a2a
    well-known=agent.json
)
~~~
{: #fig-svcb-hosted title="SVCB Record for Hosted Agent"}

### Organization Index (AliasMode)

Organizations MAY publish an index of their Agents using AliasMode.

~~~
_agents.example.com.  3600  IN  SVCB  0  alice.example.com.
_agents.example.com.  3600  IN  SVCB  0  bob.example.com.
~~~
{: #fig-svcb-alias title="SVCB AliasMode Agent Index"}

## TLSA Record (RECOMMENDED with DNSSEC) {#tlsa}

ADP Agents SHOULD publish a TLSA record to enable DANE-based TLS
endpoint authentication.

~~~
_443._tcp.alice.example.com.  3600  IN  TLSA  3  1  1  <cert-sha256>
~~~
{: #fig-tlsa title="TLSA Record Example"}

* TLSA records are only valid when the DNS zone is DNSSEC-signed
  {{RFC9364}}, to prevent downgrade attacks.

* The RECOMMENDED usage is DANE-EE (3), selector SPKI (1), matching
  type SHA-256 (1).

* A Discovery Client that receives both a valid TLSA record and a
  certificate that does not match MUST terminate the connection.

## DNSSEC

All DNS records used for Agent discovery SHOULD be DNSSEC-signed.
TLSA records MUST be DNSSEC-signed to be trusted.

# Fallback Discovery: TXT + SRV {#fallback}

When the DNS resolver or authoritative server does not support SVCB
queries (returns NODATA or NXDOMAIN for a SVCB query), Discovery
Clients SHOULD fall back to the following mechanism.  This section
preserves the Layer 1 from ADP v1.0 (-00) as a backward-compatible
alternative.

## TXT Record

~~~
_agent.{domain}.  IN  TXT  "v=ADP1.1; pk=ed25519:<fp>; wk=<url>; alpn=a2a"
~~~
{: #fig-txt title="TXT Record Format"}

v (REQUIRED):
: Protocol version.  MUST be ADP1, ADP1.0, or ADP1.1.

pk (REQUIRED):
: Public key fingerprint.  Computed as SHA-256 of the raw Ed25519
  public key, encoded in base64url without padding.

wk (REQUIRED):
: Full HTTPS URL to the Well-Known agent metadata endpoint.

alpn (OPTIONAL in fallback):
: Application protocol identifier (e.g., a2a).

port (OPTIONAL):
: Service port number.  Default: 443.

bap (OPTIONAL):
: Agent protocol identifier.  Multi-record TXT: Values exceeding
  255 octets MAY be split across multiple TXT records at the same
  owner name.  Reassembly concatenates RDATA in returned order.

## SRV Record

~~~
_agent._tcp.{domain}.  IN  SRV  <priority> <weight> <port> <target>
~~~
{: #fig-srv title="SRV Record Format"}

If no SRV record is published, Discovery Clients SHOULD connect to
{domain} on TCP port 443.

## Fallback Procedure

1. Query SVCB at {domain}.
2. If NODATA or NXDOMAIN, proceed to fallback.
3. Query TXT at `_agent.{domain}`.
4. Parse v, pk, wk fields.
5. Query SRV at `_agent._tcp.{domain}` to locate host:port.
6. Proceed to Layer 2 ({{well-known}}) using the resolved URL and host.

Discovery Clients that successfully use the fallback path SHOULD
indicate this in their user agent or log, as the security properties
of fallback discovery are weaker than SVCB-based discovery (no DANE
support, weaker path validation).

# Layer 2: Well-Known Metadata {#well-known}

## Endpoint

~~~
GET https://{domain}/.well-known/agent.json
~~~

## Content Type

The server MUST respond with Content-Type:
`application/vnd.adp+json` (vendor-tree media type registered per
{{iana-media-type}}).  Prior to formal registration, servers MAY use
`application/json` as a transitional content type.

## Schema {#schema}

### Top-Level Members

The JSON document contains the following top-level members:

protocol:
: REQUIRED.  Protocol version string.  MUST be `ADP/1.1`.

identity:
: REQUIRED.  Identity block ({{identity-block}}).

endpoints:
: REQUIRED.  Endpoints block ({{endpoints-block}}).

capabilities:
: REQUIRED.  Capabilities block ({{capabilities-block}}).

security:
: RECOMMENDED.  Security block ({{security-block}}).

policies:
: OPTIONAL.  Privacy, terms, and data handling policies.

availability:
: OPTIONAL.  Status and uptime information.

meta:
: OPTIONAL.  Generator, version, and documentation references.

### Identity Block {#identity-block}

The identity block MUST contain:

id:
: Agent URI in the form `agent:{domain}`.

domain:
: The Agent's FQDN.

name:
: Human-readable Agent name.

publicKey:
: Object containing:
  * algorithm: MUST be `ed25519`.
  * fingerprint: SHA-256 of the Ed25519 public key, encoded in
    base64url without padding, prefixed with `ed25519:`.
  * full: PEM-encoded Ed25519 public key (if verification needed).
  * proof: OPTIONAL.  Self-signature proving key possession.

### Endpoints Block {#endpoints-block}

At minimum, the `wellKnown` endpoint MUST be present.  Additional
endpoints provide entry points for different interaction modes:

wellKnown:
: URL of this document (self-referential).

discovery:
: HTML landing page URL.

chat:
: WebSocket URL for AGP real-time messaging.

tasks:
: REST endpoint for asynchronous task submission.

swarm:
: REST endpoint for multi-agent swarm coordination.

webhook:
: REST endpoint for external event callbacks.

### Capabilities Block {#capabilities-block}

Each capability is an object with:

id:
: Unique capability identifier.

name:
: Human-readable name.

description:
: Free-text description.

input:
: Array of accepted MIME types or tokens (e.g., `["text", "image",
  "file"]`).

output:
: Array of produced MIME types or tokens.

interfaces:
: Array of supported interface modes (e.g., `["chat", "api"]`).

languages:
: Array of BCP 47 language tags.

pricing:
: Object with `model` (free, per_use, subscription) and optional
  `details`.

### Security Block {#security-block}

tlsRequired:
: MUST be true per {{tls-requirements}}.

minProtocolVersion:
: Minimum ADP protocol version accepted.

authMethods:
: Array of supported authentication methods.  All implementations
  MUST support `pubkey`.  MAY also support `bearer_token`.

rateLimit:
: Object with `requestsPerMinute` and `burstSize` for rate limiting.

### Example

~~~
{
  "protocol": "ADP/1.1",
  "identity": {
    "id": "agent:alice.example.com",
    "domain": "alice.example.com",
    "name": "Alice's Agent",
    "publicKey": {
      "algorithm": "ed25519",
      "fingerprint": "ed25519:dGhpcyBpcyBhIHRlc3QgcHVibGljIGtleQ",
      "full": "-----BEGIN PUBLIC KEY-----\nMCowBQYDK2VwAyE...\n-----END PUBLIC KEY-----"
    }
  },
  "endpoints": {
    "wellKnown": "https://alice.example.com/.well-known/agent.json",
    "discovery": "https://alice.example.com/",
    "chat": "wss://alice.example.com/agent/chat",
    "tasks": "https://alice.example.com/agent/tasks",
    "swarm": "https://alice.example.com/agent/swarm"
  },
  "capabilities": [
    {
      "id": "chat",
      "name": "Conversational Chat",
      "description": "General-purpose conversational AI",
      "input": ["text", "image", "file"],
      "output": ["text", "html"],
      "interfaces": ["chat", "api"],
      "languages": ["en", "zh"],
      "pricing": { "model": "free" }
    }
  ],
  "security": {
    "tlsRequired": true,
    "minProtocolVersion": "ADP/1.1",
    "authMethods": ["pubkey"],
    "rateLimit": {
      "requestsPerMinute": 60,
      "burstSize": 10
    }
  },
  "dns": {
    "svcbVerified": true,
    "dnssecSigned": true,
    "dane": {
      "supported": true,
      "usage": "DANE-EE",
      "selector": "SPKI",
      "matchingType": "SHA-256"
    }
  }
}
~~~
{: #fig-well-known title="Example Well-Known JSON Document"}

## Caching

Discovery Clients SHOULD cache Well-Known metadata with respect to the
HTTP Cache-Control headers returned by the server.  If no explicit
cache directives are present, clients SHOULD apply a default TTL of
3600 seconds.

Clients MAY use the cap-sha256 SvcParamKey from DNS-AID to detect
changes to the capability descriptor without re-fetching the full
document.

# Layer 3: Interaction Endpoints

## HTML Landing Page

The domain root (`GET /`) MUST return an HTML page suitable for both
human browsing and machine parsing.

### JSON-LD Embedding

The page MUST embed a `<script type="application/ld+json">` block
containing the Agent's full metadata (equivalent to the Well-Known
JSON content).

### HTML Meta Tags

The page SHOULD include the following meta tags:

~~~
<meta name="agent-id" content="agent:{domain}">
<meta name="agent-protocol" content="ADP/1.1">
~~~
{: #fig-meta title="Recommended HTML Meta Tags"}

### Semantic HTML

Agent landing pages SHOULD use semantic HTML elements and custom
elements (e.g., `<agent-card>`) to describe capabilities and enable
human interaction.  An example landing page structure is provided
in {{appendix-html}}.

## Agent Gateway Protocol (AGP) {#agp}

### Overview

AGP is a WebSocket-based messaging protocol that enables real-time
communication between Agents after discovery.  It uses JSON as the
message framing format, with Ed25519 signatures for per-message
authentication.

### Connection Handshake

A Discovery Client establishes an AGP connection as follows:

1. Resolve the Agent's chat endpoint from the Well-Known metadata
   (`endpoints.chat`).
2. Open a WebSocket connection to the resolved URL using WSS
   (WebSocket Secure).
3. The connecting Agent sends a `hello` message containing its
   Agent URI and public key fingerprint.
4. The receiving Agent responds with its own `hello` message.
5. Both sides verify the counterparty's public key fingerprint
   against the value obtained from the Well-Known metadata.
6. Subsequent messages are signed and verified using Ed25519.

### Message Format

Each AGP message is a single JSON object with the following
structure:

~~~
{
  "id": "<message-uuid>",
  "from": "agent:alice.example.com",
  "to": "agent:bob.example.com",
  "type": "chat|task|system|ack",
  "timestamp": "2026-06-18T10:00:00Z",
  "signature": "ed25519:<base64url-signature>",
  "body": {
    "content": "<message content>",
    "contentType": "text/plain|text/html|application/json",
    "replyTo": "<optional-message-id>"
  }
}
~~~
{: #fig-agp-message title="AGP Message Format"}

### Message Types

chat:
: Conversational message between Agents.

task:
: Asynchronous task request or result.

system:
: Protocol-level control messages (heartbeat, error, disconnect).

ack:
: Acknowledgment of message receipt.

### Signature Computation

The signature covers the following fields, concatenated with
newlines:

~~~
{id}\n{from}\n{to}\n{type}\n{timestamp}\n{body.content}
~~~

The signature is computed using Ed25519 {{RFC8032}} and encoded as
base64url without padding, prefixed with `ed25519:`.

## HTTP Endpoints

### Task Endpoint

~~~
POST /agent/tasks
Content-Type: application/json

{
  "task": "code-review",
  "input": { "code": "...", "language": "python" },
  "callback": "https://requester.example.com/agent/webhook"
}
~~~

The server responds with `202 Accepted` and a task status URL.
Results are delivered to the callback endpoint when complete.

### Swarm Endpoint

~~~
POST /agent/swarm/join
Content-Type: application/json

{
  "agent": "agent:alice.example.com",
  "task": "collaborative-analysis",
  "role": "participant"
}
~~~

# Security Considerations

## Trust Escalation Model

ADP defines a progressive trust model:

dns-verified:
: The DNS record for the Agent has been resolved.  The public key
  fingerprint in the DNS record (SVCB bap or TXT pk) has been
  retrieved.  No cryptographic verification has been performed.

dane-verified:
: The TLS endpoint certificate has been validated against the
  DNSSEC-signed TLSA record.  The transport channel is
  authenticated at the DANE level.

key-verified:
: The full Ed25519 public key from the Well-Known metadata has
  been verified to match the fingerprint from the DNS record.  The
  key is cryptographically bound to the domain.

peer-verified:
: Bidirectional signature verification has been completed.  The
  communication partner's identity is fully authenticated.

### Freshness and Replay Protection

Each AGP message includes a timestamp.  Receivers MUST reject
messages with timestamps more than 300 seconds in the past or more
than 60 seconds in the future (relative to the receiver's clock),
with appropriate clock skew tolerance.

Implementations SHOULD track recently seen message IDs to detect
replay attempts within the validity window.

### Fingerprint Verification

Discovery Clients MUST verify that the SHA-256 hash of the full
Ed25519 public key obtained from the Well-Known metadata matches the
fingerprint published in the DNS record (SVCB or TXT).  If the
fingerprints do not match, the connection MUST be terminated and the
Agent MUST NOT be trusted.

## TLS Requirements {#tls-requirements}

All endpoints (Well-Known, WebSocket, REST) MUST be served over
TLS 1.3 or later.  Certificates MUST be valid and chain to a trusted
root CA.  Self-signed certificates are NOT acceptable for production
deployments, except in local development environments.

When TLSA records are published ({{tlsa}}), Discovery Clients SHOULD
perform DANE verification in addition to standard PKI validation.

## Private Agents

Agents that do not wish to be publicly discoverable may:

* Not publish `_agent` DNS records.
* Return HTTP 404 or 403 from the Well-Known endpoint.
* Require a bearer token for Well-Known access.
* Use invitation-based discovery instead of DNS discovery.

### Invitation Format

A private Agent may distribute invitations containing the
information normally obtained through DNS discovery:

~~~
{
  "protocol": "ADP/1.1",
  "invite": {
    "code": "a1b2c3d4",
    "agent": "agent:alice.example.com",
    "wellKnown": "https://alice.example.com/.well-known/agent.json",
    "pubkey": "ed25519:<fingerprint>",
    "expires": "2026-12-31T00:00:00Z"
  }
}
~~~
{: #fig-invitation title="Private Agent Invitation Format"}

# IANA Considerations

## Well-Known URI Registration

IANA has denied registration of the "agent" Well-Known URI
{{RFC8615}} in case #1453939 (2026-06).  This document therefore
specifies the URI path `/.well-known/agent.json` as a de facto
convention pending future availability of the Well-Known URI registry
slot.  Implementers should be aware that this path has not been
formally registered.

## SvcParamKey Registration (via DNS-AID)

The SvcParamKeys used by ADP (bap, cap, cap-sha256, well-known) are
registered through the DNS-AID specification
{{I-D.mozleywilliams-dnsop-dnsaid}}.  ADP does not independently
request these registrations.

## Service Name Registration

ADP uses the service name `_agent` for SRV records.  Formal service
name registration with IANA is pending.

## Media Type Registration {#iana-media-type}

This document requests the registration of the following media type
in the vendor tree:

Type name:
: application

Subtype name:
: vnd.adp+json

Required parameters:
: N/A

Optional parameters:
: N/A

Encoding considerations:
: binary.  The format is JSON-based and may contain lines longer
  than 998 octets and arbitrary octet sequences within string
  values.  Per {{RFC6838}} Section 4.8, binary encoding is
  appropriate.

Security considerations:
: See {{security-considerations}} of this document.

Interoperability considerations:
: Unknown JSON fields MUST be ignored for forward compatibility.
  The `protocol` field determines the schema version; clients
  MUST check it before processing.

Published specification:
: This document (draft-pro-adp-agent-discovery).

Applications that use this media type:
: AI Agent discovery clients, DNS-AID resolvers, agent registries,
  and agent gateway implementations.

Fragment identifier considerations:
: JSON Pointer {{RFC6901}} fragment identifiers MAY be used.

Restrictions on usage:
: This media type is designed for use within the ADP protocol and
  is not recommended for use in email or other non-HTTP contexts.

Provisional registration:
: No.

Additional information:
: Deprecated alias names: N/A
  Magic number(s): N/A (JSON)
  File extension(s): N/A
  Macintosh file type code(s): N/A
  OID(s): N/A

Intended usage:
: LIMITED USE.

Contact name:
: Bin Lian

Contact email:
: TBD

Author/Change controller:
: Bin Lian (AI Pair)

Change controller:
: Bin Lian (AI Pair)

# Implementation Status

## Reference Implementation

A reference implementation of ADP is available at
[https://github.com/harrylian8766/adp-protocol](https://github.com/harrylian8766/adp-protocol).

The reference implementation includes:

* A DNS record generator for ADP-compliant zones.
* A Well-Known metadata server.
* An AGP WebSocket server and client library.
* An HTML landing page template with JSON-LD embedding.

## Backward Compatibility

ADP v1.1 is backward compatible with ADP v1.0 at the Well-Known
metadata layer.  v1.1 adds the `dns` block and `dane` auth method to
the schema; v1.0 clients that ignore unknown fields will function
correctly with v1.1 metadata.

The fallback TXT+SRV discovery mechanism ({{fallback}}) is identical to
the ADP v1.0 Layer 1, ensuring that pre-v1.1 Discovery Clients can
still locate Agents that have migrated to SVCB-based discovery.

# Acknowledgments

The ADP protocol design draws on WebFinger {{RFC7033}}, the
`.well-known` URI pattern {{RFC8615}}, and the DNS-AID specification
{{I-D.mozleywilliams-dnsop-dnsaid}}.

# Version History

-00 (2026-06-09):
: Initial draft.  Defined three-layer discovery stack with TXT+SRV
  as primary DNS mechanism.

-01 (2026-06-17):
: Adopted DNS-AID (SVCB) as normative Layer 1.  Added TLSA/DANE
  support.  Defined trust escalation model.  Updated protocol
  version to ADP/1.1.

-02 (2026-06-18):
: Fixed markup and cross-reference errors.  Updated media type
  registration to vendor tree (application/vnd.adp+json).  Noted
  Well-Known URI registration denial.  Added Private Agents and
  Invitation Format sections.

--- back

# Appendix: HTML Landing Page Example {#appendix-html}

~~~~
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="agent-id" content="agent:alice.example.com">
  <meta name="agent-protocol" content="ADP/1.1">
  <title>Alice's Agent</title>
  <script type="application/ld+json">
  {
    "@context": "https://schema.org",
    "@type": "SoftwareApplication",
    "protocol": "ADP/1.1",
    "identity": {
      "id": "agent:alice.example.com",
      "domain": "alice.example.com",
      "name": "Alice's Agent",
      "publicKey": {
        "algorithm": "ed25519",
        "fingerprint": "ed25519:dGhpcyBpcyBhIHRlc3Q..."
      }
    },
    "endpoints": {
      "wellKnown": "https://alice.example.com/.well-known/agent.json",
      "chat": "wss://alice.example.com/agent/chat"
    },
    "capabilities": [
      {
        "id": "chat",
        "name": "Conversational Chat",
        "description": "General-purpose conversational AI",
        "input": ["text", "image", "file"],
        "output": ["text", "html"],
        "interfaces": ["chat", "api"],
        "languages": ["en", "zh"],
        "pricing": { "model": "free" }
      }
    ]
  }
  </script>
</head>
<body>
  <agent-card>
    <h1>Alice's Agent</h1>
    <p>General-purpose conversational AI agent.</p>
    <capability-list>
      <capability name="Chat" status="available"></capability>
    </capability-list>
    <connect-form action="/agent/connect">
      <input name="from" placeholder="Your Agent ID (agent:...)">
      <button type="submit">Connect</button>
    </connect-form>
  </agent-card>
</body>
</html>
~~~~

# Author's Address

~~~
Bin Lian
AI Pair
Email: TBD
~~~