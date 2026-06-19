#!/usr/bin/env python3
"""
Convert kramdown-rfc2629 markdown to RFC XML v3.
Handles YAML front matter, section anchors, code fences, definition lists,
xrefs, and reference auto-generation.
"""
import sys, re, html as html_mod

def esc(s):
    return html_mod.escape(str(s), quote=False)

def render_inline(text, refs_declared):
    # Bold
    text = re.sub(r'\*\*(.+?)\*\*', r'<strong>\1</strong>', text)
    # Xref: {{target}}
    def xref(m):
        t = m.group(1)
        if t in refs_declared:
            return f'<xref target="{t}"/>'
        rm = re.match(r'^RFC(\d+)$', t)
        if rm:
            return f'<xref target="RFC{rm.group(1)}"/>'
        return f'<xref target="{t}"/>'
    text = re.sub(r'\{\{([^}]+)\}\}', xref, text)
    # eref: <url>
    text = re.sub(r'<(https?://[^>]+)>', r'<eref target="\1">\1</eref>', text)
    # Bare URLs - only outside code spans. Do code spans FIRST to protect from eref.
    text = re.sub(r'`([^`]+)`', lambda m: '<tt>' + esc(m.group(1)) + '</tt>', text)
    return text


# Inline reference data (no external xi:include dependency)
REF_DATA = {
    "RFC1035": {"title": "Domain names - implementation and specification", "authors": [("P.", "Mockapetris", "P. Mockapetris")], "date": ("November", "1987"), "series": ["STD", "13"]},
    "RFC2782": {"title": "A DNS RR for specifying the location of services (DNS SRV)", "authors": [("A.", "Gulbrandsen", "A. Gulbrandsen"), ("P.", "Vixie", "P. Vixie"), ("L.", "Esibov", "L. Esibov")], "date": ("February", "2000")},
    "RFC6455": {"title": "The WebSocket Protocol", "authors": [("I.", "Fette", "I. Fette"), ("A.", "Melnikov", "A. Melnikov")], "date": ("December", "2011")},
    "RFC6698": {"title": "The DNS-Based Authentication of Named Entities (DANE) Transport Layer Security (TLS) Protocol: TLSA", "authors": [("P.", "Hoffman", "P. Hoffman"), ("J.", "Schlyter", "J. Schlyter")], "date": ("August", "2012")},
    "RFC6838": {"title": "Media Type Specifications and Registration Procedures", "authors": [("N.", "Freed", "N. Freed"), ("J.", "Klensin", "J. Klensin"), ("T.", "Hansen", "T. Hansen")], "date": ("January", "2013"), "series": ["BCP", "13"]},
    "RFC6901": {"title": "JavaScript Object Notation (JSON) Pointer", "authors": [("P.", "Bryan", "P. Bryan"), ("K.", "Zyp", "K. Zyp"), ("M.", "Nottingham", "M. Nottingham")], "date": ("April", "2013")},
    "RFC7033": {"title": "WebFinger", "authors": [("P.", "Jones", "P. Jones"), ("G.", "Salgueiro", "G. Salgueiro"), ("M.", "Jones", "M. Jones"), ("J.", "Smarr", "J. Smarr")], "date": ("September", "2013")},
    "RFC7301": {"title": "Transport Layer Security (TLS) Application-Layer Protocol Negotiation Extension", "authors": [("S.", "Friedl", "S. Friedl"), ("A.", "Popov", "A. Popov"), ("A.", "Langley", "A. Langley"), ("E.", "Stephan", "E. Stephan")], "date": ("July", "2014")},
    "RFC8032": {"title": "Edwards-Curve Digital Signature Algorithm (EdDSA)", "authors": [("S.", "Josefsson", "S. Josefsson"), ("I.", "Liusvaara", "I. Liusvaara")], "date": ("January", "2017")},
    "RFC8259": {"title": "The JavaScript Object Notation (JSON) Data Interchange Format", "authors": [("T.", "Bray", "T. Bray")], "date": ("December", "2017"), "series": ["STD", "90"]},
    "RFC8615": {"title": "Well-Known Uniform Resource Identifiers (URIs)", "authors": [("M.", "Nottingham", "M. Nottingham")], "date": ("May", "2019")},
    "RFC9364": {"title": "DNS-Based Authentication of Named Entities (DANE) TLSA for SMTP", "authors": [("V.", "Dukhovni", "V. Dukhovni"), ("W.", "Hardaker", "W. Hardaker")], "date": ("February", "2023")},
    "RFC9460": {"title": "Service Binding and Parameter Specification via the DNS (SVCB and HTTPS Resource Records)", "authors": [("B.", "Schwartz", "B. Schwartz"), ("M.", "Bishop", "M. Bishop"), ("E.", "Nygren", "E. Nygren")], "date": ("November", "2023")},
    "I-D.mozleywilliams-dnsop-dnsaid": {"title": "DNS-AID: DNS Agent Identity Discovery Using SVCB Resource Records", "authors": [("L.", "Mozley-Williams", "L. Mozley-Williams")], "date": ("", "2025"), "target": "https://datatracker.ietf.org/doc/draft-mozleywilliams-dnsop-dnsaid/"},
    "draft-pro-adp-agent-discovery-00": {"title": "Agent Discovery Protocol (ADP)", "authors": [("H.", "Lian", "H. Lian")], "date": ("June", "2026"), "target": "https://datatracker.ietf.org/doc/draft-pro-adp-agent-discovery-00/"},
}

def render_reference(anchor, info):
    """Render a single reference element."""
    target = info.get("target", f"https://www.rfc-editor.org/info/{anchor.lower()}")
    month, year = info["date"]
    out = [f'    <reference anchor="{anchor}" target="{target}">']
    out.append('      <front>')
    out.append(f'        <title>{esc(info["title"])}</title>')
    for ins, sur, full in info["authors"]:
        out.append(f'        <author initials="{ins}" surname="{sur}" fullname="{full}"/>')
    if month:
        out.append(f'        <date month="{month}" year="{year}"/>')
    else:
        out.append(f'        <date year="{year}"/>')
    out.append('      </front>')
    if "series" in info:
        out.append(f'    <seriesInfo name="{info["series"][0]}" value="{info["series"][1]}"/>')
    out.append('    </reference>')
    return '\n'.join(out)

def parse_front_matter(lines):
    """Parse YAML front matter."""
    meta = {'authors': [], 'normative': [], 'informative': []}
    state = 'top'  # top | normative | informative
    author = None
    
    for line in lines:
        s = line.rstrip()
        if not s or s.startswith('#'):
            continue
        
        # Detect reference sections
        if s == 'normative:':
            state = 'normative'
            continue
        if s == 'informative:':
            state = 'informative'
            continue
        
        if state == 'normative':
            m = re.match(r'^  (RFC\d+|I-D\.\S+):', s)
            if m:
                meta['normative'].append(m.group(1))
            continue
        
        if state == 'informative':
            m = re.match(r'^  (RFC\d+|I-D\.\S+|draft-\S+):', s)
            if m:
                meta['informative'].append(m.group(1))
            continue
        
        # Author detection
        if s.strip() == '-':
            if author:
                meta['authors'].append(author)
            author = {}
            continue
        
        if author is not None:
            m = re.match(r'^\s{4}(\S+):\s*(.*)', s)
            if m:
                k, v = m.group(1), m.group(2).strip().strip('"')
                author[k] = v
            continue
        
        # Top-level YAML
        m = re.match(r'^(\S+):\s*(.*)', s)
        if m:
            k, v = m.group(1), m.group(2).strip().strip('"')
            if k not in ('normative', 'informative'):
                # Handle list values
                if v.startswith('['):
                    meta[k] = [x.strip().strip('"') for x in v.strip('[]').split(',')]
                else:
                    meta[k] = v
    
    if author:
        meta['authors'].append(author)
    
    return meta

def parse_body(text, markers):
    """Split body into abstract, middle, back sections."""
    parts = {'abstract': [], 'middle': [], 'back': []}
    current = 'middle'
    
    for line in text.split('\n'):
        stripped = line.strip()
        if stripped == '--- abstract':
            current = 'abstract'
            continue
        if stripped == '--- middle':
            current = 'middle'
            continue
        if stripped == '--- back':
            current = 'back'
            continue
        parts[current].append(line)
    
    return parts

def parse_sections(lines):
    """Parse sections from middle/back matter."""
    sections = []
    current = None
    
    for line in lines:
        m = re.match(r'^(#{1,6})\s+(.+?)(?:\s+\{(.+?)\})?\s*$', line)
        if m:
            if current:
                sections.append(current)
            current = {
                'level': len(m.group(1)),
                'title': m.group(2).strip(),
                'anchor': m.group(3) or '',
                'lines': []
            }
            continue
        
        if current is not None:
            current['lines'].append(line)
    
    if current:
        sections.append(current)
    
    return sections

def render_section_body(lines, refs, indent):
    """Render section body lines to XML."""
    out = []
    in_code = False
    in_ul = False
    in_dl = False
    
    def close_ul():
        nonlocal in_ul
        if in_ul:
            out.append(' ' * indent + '</ul>')
            in_ul = False
    
    def close_dl():
        nonlocal in_dl
        if in_dl:
            out.append(' ' * indent + '</dl>')
            in_dl = False
    
    i = 0
    while i < len(lines):
        raw = lines[i]
        s = raw.strip()
        
        # Code fence
        if re.match(r'^(~~~+|```+)$', s):
            close_ul()
            close_dl()
            if not in_code:
                out.append(' ' * indent + '<figure><artwork><![CDATA[')
                in_code = True
            else:
                out.append(' ' * indent + ']]></artwork></figure>')
                in_code = False
            # Check for title/figure attributes on next line
            if not in_code and i + 1 < len(lines):
                next_s = lines[i + 1].strip()
                next_i = i + 1
            i += 1
            continue
        
        if in_code:
            out.append(raw)
            i += 1
            continue
        
        # Figure attribute line
        if re.match(r'^\{:[\s#]', s):
            i += 1
            continue
        
        # Empty line = close lists
        if not s:
            close_ul()
            close_dl()
            i += 1
            continue
        
        # Bullet
        m = re.match(r'^(\s*)\*\s+(.+)$', raw)
        if m:
            close_dl()
            txt = render_inline(m.group(2), refs)
            if not in_ul:
                out.append(' ' * indent + '<ul spacing="compact">')
                in_ul = True
            out.append(' ' * (indent + 2) + f'<li>{txt}</li>')
            i += 1
            continue
        
        # Separator
        if re.match(r'^-{3,}$', s):
            close_ul()
            close_dl()
            i += 1
            continue
        
        # Numbered list
        m = re.match(r'^(\s*)\d+\.\s+(.+)$', raw)
        if m:
            close_dl()
            close_ul()
            txt = render_inline(m.group(2), refs)
            out.append(' ' * indent + f'<t>{txt}</t>')
            i += 1
            continue
        
        # Definition list term with optional ": description"
        m = re.match(r'^(\S[^:]*?):$', s)
        if m:
            close_ul()
            term = render_inline(m.group(1), refs)
            
            # Check if next line is ": description"
            has_desc = False
            if i + 1 < len(lines):
                next_s = lines[i + 1].strip()
                nm = re.match(r'^:\s+(.+)$', next_s)
                if nm:
                    has_desc = True
                    desc = render_inline(nm.group(1), refs)
                    out.append(' ' * indent + f'<dl spacing="compact"><dt>{term}</dt>')
                    out.append(' ' * indent + f'<dd>{desc}</dd>')
                    out.append(' ' * indent + '</dl>')
                    i += 2
                    continue
            
            # No description — render as regular paragraph (bold term)
            if not has_desc:
                close_dl()
                out.append(' ' * indent + f'<t><strong>{term}</strong></t>')
                i += 1
                continue
        
        # Standalone ": description"
        m = re.match(r'^:\s+(.+)$', s)
        if m:
            close_ul()
            desc = render_inline(m.group(1), refs)
            out.append(' ' * indent + f'<t><em>{desc}</em></t>')
            i += 1
            continue
        
        close_ul()
        close_dl()
        
        # Regular paragraph
        out.append(' ' * indent + f'<t>{render_inline(s, refs)}</t>')
        i += 1
    
    close_ul()
    close_dl()
    if in_code:
        out.append(' ' * indent + ']]></artwork></figure>')
    
    return '\n'.join(out)

def generate_xml(meta, body_parts):
    cat = meta.get('category', 'info')
    ipr = meta.get('ipr', 'trust200902')
    docname = meta.get('docname', 'draft-pro-adp-agent-discovery-02')
    
    lines = []
    w = lines.append
    
    w('<?xml version="1.0" encoding="UTF-8"?>')
    w('<?rfc toc="yes"?>')
    w('<?rfc symrefs="yes"?>')
    w('<?rfc sortrefs="yes"?>')
    w('<?rfc compact="yes"?>')
    w('')
    w(f'<rfc xmlns:xi="http://www.w3.org/2001/XInclude" ipr="{ipr}" category="{cat}" docName="{docname}" submissionType="independent" version="3">')
    w('')
    w('  <front>')
    
    # Title
    title = meta.get('title', 'Untitled')
    abbrev = meta.get('abbrev', '')
    if abbrev:
        w(f'    <title abbrev="{esc(abbrev)}">{esc(title)}</title>')
    else:
        w(f'    <title>{esc(title)}</title>')
    
    # Authors
    for au in meta.get('authors', []):
        ins = esc(au.get('ins', ''))
        name = esc(au.get('name', ''))
        org = esc(au.get('organization', ''))
        email = esc(au.get('email', ''))
        w(f'    <author initials="{ins}" surname="{name.split()[-1] if name else ""}" fullname="{name}">')
        if org:
            w(f'      <organization>{org}</organization>')
        if email:
            w('      <address>')
            w(f'        <email>{email}</email>')
            w('      </address>')
        w('    </author>')
    
    # Date
    date_val = meta.get('date', '2026-06-18')
    parts = date_val.split('-')
    year = parts[0]
    if len(parts) >= 3:
        w(f'    <date year="{year}" month="{parts[1]}" day="{parts[2]}"/>')
    else:
        w(f'    <date year="{year}"/>')
    
    # Abstract
    abstract_lines = body_parts['abstract']
    w('    <abstract>')
    for line in abstract_lines:
        s = line.strip()
        if s:
            w(f'      <t>{render_inline(s, set())}</t>')
    w('    </abstract>')
    
    w('  </front>')
    w('')
    w('  <middle>')
    
    # Build refs set
    all_refs = set(meta.get('normative', []) + meta.get('informative', []))
    
    # Middle sections
    mid_sections = parse_sections(body_parts['middle'])
    render_sections(mid_sections, all_refs, lines, '    ')
    
    w('  </middle>')
    
    # Back matter — references MUST come before sections in xml2rfc v3
    back_sections = parse_sections(body_parts['back'])
    if back_sections or normative or informative:
        w('')
        w('  <back>')
        
        # Generate references FIRST (xml2rfc v3 requirement)
        normative = meta.get('normative', [])
        informative = meta.get('informative', [])
        
        if normative:
            lines.extend(['    <references>', '      <name>Normative References</name>'])
            for ref in normative:
                lines.append(render_reference(ref, REF_DATA[ref]))
            lines.append('    </references>')
        
        if informative:
            lines.extend(['    <references>', '      <name>Informative References</name>'])
            for ref in informative:
                lines.append(render_reference(ref, REF_DATA[ref]))
            lines.append('    </references>')
        
        # Render appendix sections AFTER references
        render_sections(back_sections, all_refs, lines, '    ')
        
        w('  </back>')
    
    w('')
    w('</rfc>')
    
    return '\n'.join(lines)

def render_sections(sections, refs, lines, base_indent):
    """Render nested sections to XML lines list."""
    stack = []  # (level,)
    
    for sec in sections:
        level = sec['level']
        title = esc(sec['title'])
        anchor = sec['anchor']
        body = '\n'.join(sec['lines'])
        
        while stack and stack[-1] >= level:
            inner = base_indent + '  ' * (len(stack) - 1)
            lines.append(f'{inner}</section>')
            stack.pop()
        
        inner = base_indent + '  ' * len(stack)
        if anchor:
            lines.append(f'{inner}<section anchor="{anchor.lstrip("#")}" title="{title}">')
        else:
            lines.append(f'{inner}<section title="{title}">')
        
        xml_body = render_section_body(sec['lines'], refs, len(inner) + 2)
        if xml_body.strip():
            lines.append(xml_body)
        
        stack.append(level)
    
    while stack:
        inner = base_indent + '  ' * (len(stack) - 1)
        lines.append(f'{inner}</section>')
        stack.pop()

def main():
    if len(sys.argv) < 2:
        print("Usage: python3 md2xml-v3.py <input.md>")
        sys.exit(1)
    
    with open(sys.argv[1]) as f:
        text = f.read()
    
    # Find YAML front matter boundaries: opens with ---, closes with --- abstract
    if not text.startswith('---'):
        print("ERROR: YAML front matter not found (file must start with ---)")
        sys.exit(1)
    lines = text.split('\n')
    yaml_end = -1
    for i, line in enumerate(lines):
        if i == 0:
            continue
        if line.strip() == '--- abstract':
            yaml_end = i
            break
    if yaml_end < 0:
        print("ERROR: YAML closing '--- abstract' not found")
        sys.exit(1)
    fm_lines = lines[1:yaml_end]
    body_text = '\n'.join(lines[yaml_end:])
    
    meta = parse_front_matter(fm_lines)
    body_parts = parse_body(body_text, {})
    
    xml = generate_xml(meta, body_parts)
    
    output = sys.argv[1].replace('.md', '.xml')
    with open(output, 'w') as f:
        f.write(xml)
    
    print(f"Generated: {output} ({len(xml)} bytes)")
    print(f"Title: {meta.get('title', '?')}")
    print(f"Authors: {len(meta.get('authors', []))}")
    print(f"Sections: {len(parse_sections(body_parts['middle']))} middle, {len(parse_sections(body_parts['back']))} back")
    print(f"Normative refs: {len(meta.get('normative', []))}")
    print(f"Informative refs: {len(meta.get('informative', []))}")

if __name__ == '__main__':
    main()
