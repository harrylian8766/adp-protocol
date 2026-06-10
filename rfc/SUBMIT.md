# How to Submit ADP to IETF as an Internet-Draft

## Step 1: Install the Tools

The IETF publishes Internet-Drafts in XML (xml2rfc v3) or Markdown (kramdown-rfc / mmark).

### Option A: MMark (Recommended — the source is already in mmark format)

```bash
# Install mmark
go install github.com/mmarkdown/mmark/v2/mmark@latest

# Convert to XML
mmark rfc/draft-pro-adp-agent-discovery-00.md > draft.xml

# Convert to TXT
xml2rfc --text draft.xml
```

### Option B: Manual XML

Write RFC 7991 XML manually and use `xml2rfc` to validate.

### Option C: Use IETF Author Tools (Online)

Go to <https://author-tools.ietf.org/> to render and validate the draft.

## Step 2: Validate

```bash
# Install xml2rfc
pip install xml2rfc

# Validate the XML output
xml2rfc --strict draft.xml
```

## Step 3: Submit

Go to <https://datatracker.ietf.org/submit/>

1. Log in with your IETF Datatracker account (free registration)
2. Upload the XML file
3. Set the draft name to `draft-pro-adp-agent-discovery-00`
4. Choose Stream: **Independent Submission** (unless you have a Working Group)
5. Submit

## Step 4: Mailing List Discussion

After submission, announce on relevant mailing lists:

- `independent-submissions@ietf.org` — for Independent Stream drafts
- `dnsop@ietf.org` — DNS Operations (relevant for SRV/TXT usage)
- `websec@ietf.org` — Web Security (relevant for Well-Known URI)
- `ai-control@ietf.org` — AI-related discussion (if exists)

Post a brief introduction:

```
Subject: New Internet-Draft: ADP — Agent Discovery Protocol

We've submitted draft-pro-adp-agent-discovery-00, a lightweight
protocol for discovering AI Agents via DNS TXT/SRV records
and Well-Known URIs.

Feedback welcome!

Link: https://datatracker.ietf.org/doc/draft-pro-adp-agent-discovery/
Repo:  https://github.com/harrylian8766/adp-protocol
```

## Step 5: IANA Registration

After the draft gains traction (or reaches RFC status), follow up with
IANA to formally register:

1. Well-Known URI suffix: `agent`
2. SRV Service Name: `_agent`
3. Media Type: `application/adp+json`

Templates are already filled in Section "IANA Considerations" of the draft.

## Alternative: Independent RFC Stream

If you want to go directly to RFC without the IETF Working Group process,
use the Independent Stream (RFC 4846):

1. Submit via <https://www.rfc-editor.org/indsub/>
2. The RFC Editor will assign an independent reviewer
3. If approved, published as an RFC in the Independent category

## Quick Links

- IETF Author Tools: <https://author-tools.ietf.org/>
- IETF Datatracker Submit: <https://datatracker.ietf.org/submit/>
- RFC Editor Independent Submission: <https://www.rfc-editor.org/indsub/>
- mmark: <https://github.com/mmarkdown/mmark>
- xml2rfc: <https://pypi.org/project/xml2rfc/>
