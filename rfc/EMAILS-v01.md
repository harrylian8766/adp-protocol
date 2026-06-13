# 邮件草稿

## 1. 发给 dnsop@ietf.org

```
To: dnsop@ietf.org
Subject: Updated I-D: draft-pro-adp-agent-discovery-01 — SVCB-first + IANA registration

Hi DNSOP,

We've updated draft-pro-adp-agent-discovery to -01. The major changes
from -00:

1. SVCB-first DNS discovery (RFC 9460), delegating the DNS layer to
   DNS-AID (draft-mozleywilliams-dnsop-dnsaid) for SvcParamKey
   registration (bap, cap, cap-sha256, well-known).

2. TLSA + DNSSEC for DANE-based TLS endpoint authentication
   (RFC 6698).

3. Four-level trust escalation model: dns-verified →
   dane-verified → key-verified → peer-verified.

4. The original TXT+SRV scheme from -00 is retained as a documented
   fallback for backward compatibility.

5. IANA registered "ai-adp" as the service name in the Service Name
   and Transport Protocol Port Number Registry on 2026-06-12.

The SVCB-first approach aligns ADP's DNS layer with the ongoing work
in dnsop. We'd appreciate any feedback on the SVCB parameter usage,
the ALPN negotiation strategy, and the trust escalation model.

I-D: https://datatracker.ietf.org/doc/draft-pro-adp-agent-discovery/
Repo: https://github.com/harrylian8766/adp-protocol

Thanks,
Harry
```

## 2. 发给 rfc-ise@rfc-editor.org

```
To: rfc-ise@rfc-editor.org
Subject: Independent Submission intent: draft-pro-adp-agent-discovery-01

Dear Independent Submissions Editor,

I would like to express intent to submit draft-pro-adp-agent-discovery
for publication through the Independent Submission stream (RFC 4846).

ADP (Agent Discovery Protocol) is a three-layer, decentralized
discovery and interaction protocol for AI Agents:

- Layer 1: DNS-AID (SVCB + TLSA) — service resolution
- Layer 2: Well-Known JSON — capability metadata
- Layer 3: WebSocket AGP — real-time inter-agent messaging

The protocol requires no centralized registry; domain ownership is
the root of identity. It builds on established IETF standards:
SVCB (RFC 9460), TLSA (RFC 6698), DNSSEC (RFC 9364), Well-Known
URIs (RFC 8615), WebSocket (RFC 6455), and Ed25519 (RFC 8032).

Status:
- I-D -01 published: SVCB-first + DANE + trust escalation model
- IANA service name "ai-adp" registered (2026-06-12)
- Reference implementations in Node.js, Go, and Python (MIT licensed)
- All code and schemas on GitHub

I welcome guidance on the review process and readiness assessment.

I-D: https://datatracker.ietf.org/doc/draft-pro-adp-agent-discovery/
Repo: https://github.com/harrylian8766/adp-protocol

Best regards,
Harry Lian
harrylian8766@gmail.com
```
