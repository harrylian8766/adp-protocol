#!/usr/bin/env python3
"""
Convert ADP mmark Internet-Draft to RFC XML v3 format.

The ADP draft uses mmark format where the entire header (%%% blocks,
seriesInfo, author blocks) is enclosed within %%% delimiters.
"""

import sys, re, html

def escape_xml(text):
    if text is None:
        return ""
    return html.escape(str(text), quote=False)

def render_inline(text):
    text = re.sub(r'\*\*(.+?)\*\*', r'<strong>\1</strong>', text)
    # Code spans: escape XML inside <tt>
    def code_span(m):
        return '<tt>' + escape_xml(m.group(1)) + '</tt>'
    text = re.sub(r'`([^`]+)`', code_span, text)
    text = re.sub(r'\{\{\?([^}]+)\}\}', r'<xref target="\1"/>', text)
    text = re.sub(r'\{\{!([^}]+)\}\}', r'<xref target="\1"/>', text)
    text = re.sub(r'<(https?://[^>]+)>', r'<eref target="\1">\1</eref>', text)
    return text

def render_body(lines, indent=6):
    """Render body content lines into XML."""
    out = []
    in_code = False
    in_ul = False
    in_dl = False
    
    def close_dl():
        nonlocal in_dl
        if in_dl:
            out.append(' ' * indent + '</dl>')
            in_dl = False
    
    def close_ul():
        nonlocal in_ul
        if in_ul:
            out.append(' ' * indent + '</ul>')
            in_ul = False
    
    i = 0
    while i < len(lines):
        raw = lines[i]
        s = raw.strip()
        
        # Code fence: ~~~ or ```
        if s == '~~~' or s == '```':
            close_dl()
            close_ul()
            if in_code:
                out.append(' ' * indent + ']]></artwork></figure>')
                in_code = False
            else:
                out.append(' ' * indent + '<figure><artwork><![CDATA[')
                in_code = True
            i += 1
            continue
        
        if in_code:
            out.append(raw)
            i += 1
            continue
        
        if not s:
            close_ul()
            close_dl()
            i += 1
            continue
        
        # Bullet items
        m = re.match(r'^(\s*)\*\s+(.+)$', raw)
        if m:
            close_dl()
            txt = render_inline(m.group(2))
            if not in_ul:
                out.append(' ' * indent + '<ul spacing="compact">')
                in_ul = True
            out.append(' ' * (indent+2) + f'<li>{txt}</li>')
            i += 1
            continue
        
        # Separator
        if re.match(r'^-{3,}$', s):
            close_ul()
            close_dl()
            i += 1
            continue
        
        # Definition list: term line ending with colon, optionally followed by description
        m = re.match(r'^(\S[^:]*?):$', s)
        if m:
            close_ul()
            close_dl()
            term = render_inline(m.group(1))
            out.append(' ' * indent + f'<dl spacing="compact"><dt>{term}</dt>')
            in_dl = True
            
            # Look ahead: if next line is ": description", include it
            if i + 1 < len(lines):
                next_s = lines[i + 1].strip()
                next_m = re.match(r'^:\s+(.+)$', next_s)
                if next_m:
                    desc = render_inline(next_m.group(1))
                    out.append(' ' * indent + f'<dd>{desc}</dd>')
                    i += 1  # skip the description line
            
            out.append(' ' * indent + '</dl>')
            in_dl = False
            i += 1
            continue
        
        # Standalone ": description" (without preceding term)
        m = re.match(r'^:\s+(.+)$', s)
        if m:
            close_ul()
            desc = render_inline(m.group(1))
            out.append(' ' * indent + f'<t><em>{desc}</em></t>')
            i += 1
            continue
        
        close_ul()
        close_dl()
        
        # Regular paragraph
        out.append(' ' * indent + f'<t>{render_inline(s)}</t>')
        i += 1
    
    close_ul()
    close_dl()
    if in_code:
        out.append(' ' * indent + ']]></artwork></figure>')
    
    return '\n'.join(out)


def parse_draft(filepath):
    """Parse the entire mmark draft."""
    with open(filepath, 'r') as f:
        text = f.read()
    
    lines = text.split('\n')
    
    # Step 1: Find front matter block
    # In this mmark file, everything between the first and closing %%%
    # is the header (metadata + seriesInfo + authors)
    pct_lines = []
    for i, line in enumerate(lines):
        if line.strip() == '%%%':
            pct_lines.append(i)
    
    if len(pct_lines) < 2:
        raise ValueError("Front matter delimiters not found")
    
    header_lines = lines[pct_lines[0]+1 : pct_lines[1]]
    body_text = '\n'.join(lines[pct_lines[1]+1:])
    
    # Step 2: Parse header into sections
    meta = {}
    series_info = []
    authors = []
    current_author = None
    
    state = 'meta'  # meta | seriesInfo | author
    
    for line in header_lines:
        s = line.strip()
        
        if not s:
            continue
        
        # Handle sub-blocks without =
        if s == '[author.address]' and current_author is not None:
            current_author['address'] = {}
            continue
        
        if s == '[seriesInfo]':
            state = 'seriesInfo'
            continue
        
        if s == '[[author]]':
            if current_author:
                authors.append(current_author)
            current_author = {}
            state = 'author'
            continue
        
        if s.startswith('[') and s.endswith(']') and not s.startswith('[['):
            # Other block types — fall back to meta
            state = 'meta'
            continue
        
        if '=' not in s:
            continue
        
        k, v = s.split('=', 1)
        k = k.strip()
        v = v.strip().strip('"')
        
        if state == 'seriesInfo':
            series_info.append((k, v))
        elif state == 'author' and current_author is not None:
            if k in ('initials', 'surname', 'fullname', 'organization'):
                current_author[k] = v
            elif k.startswith('email'):
                if 'address' in current_author:
                    current_author['address']['email'] = v
                else:
                    current_author['email'] = v
            else:
                meta[k] = v
        else:
            meta[k] = v
    
    if current_author:
        authors.append(current_author)
    
    # Step 3: Parse body into sections
    sections = []
    current_section = None
    section_content = []
    
    for line in body_text.split('\n'):
        m = re.match(r'^(#{1,6})\s+(.+?)(?:\s+\{(.+?)\})?\s*$', line)
        if m:
            if current_section:
                current_section['content'] = '\n'.join(section_content)
                sections.append(current_section)
            
            current_section = {
                'level': len(m.group(1)),
                'title': m.group(2).strip(),
                'tag': m.group(3),
                'content': ''
            }
            section_content = []
            continue
        
        if line.strip() in ('{mainmatter}', '{backmatter}'):
            continue
        
        if current_section is not None:
            section_content.append(line)
    
    if current_section:
        current_section['content'] = '\n'.join(section_content)
        sections.append(current_section)
    
    return meta, series_info, authors, sections


def generate_xml(meta, series_info, authors, sections):
    """Generate RFC XML v3."""
    L = []
    w = L.append
    
    w('<?xml version="1.0" encoding="UTF-8"?>')
    w('<?rfc toc="yes"?>')
    w('<?rfc symrefs="yes"?>')
    w('<?rfc sortrefs="yes"?>')
    w('<?rfc compact="yes"?>')
    w('')
    
    cat = meta.get('category', 'info')
    ipr = meta.get('ipr', 'trust200902')
    docname = meta.get('docName', 'draft-pro-adp-agent-discovery-01')
    sub = meta.get('submissionType', 'independent')
    
    w(f'<rfc xmlns:xi="http://www.w3.org/2001/XInclude"')
    w(f'     ipr="{ipr}"')
    w(f'     category="{cat}"')
    w(f'     docName="{escape_xml(docname)}"')
    w(f'     submissionType="{sub}" version="3">')
    w('')
    w('  <front>')
    
    # Title
    title = meta.get('title', 'Untitled')
    abbrev = meta.get('abbrev', '')
    if abbrev:
        w(f'    <title abbrev="{escape_xml(abbrev)}">{escape_xml(title)}</title>')
    else:
        w(f'    <title>{escape_xml(title)}</title>')
    
    # Authors
    for author in authors:
        initials = escape_xml(author.get('initials', ''))
        surname = escape_xml(author.get('surname', ''))
        fullname = escape_xml(author.get('fullname', ''))
        w(f'    <author initials="{initials}" surname="{surname}" fullname="{fullname}">')
        
        org = author.get('organization', '')
        if org:
            w(f'      <organization>{escape_xml(org)}</organization>')
        
        addr = author.get('address', {})
        email = addr.get('email', '')
        if email:
            w('      <address>')
            w(f'        <email>{escape_xml(email)}</email>')
            w('      </address>')
        
        w('    </author>')
    
    # Date
    date_val = meta.get('date', '2026')
    year = date_val[:4]
    month = date_val[5:7] if len(date_val) >= 7 else None
    day = date_val[8:10] if len(date_val) >= 10 else None
    if month and day:
        w(f'    <date year="{year}" month="{month}" day="{day}"/>')
    else:
        w(f'    <date year="{year}"/>')
    
    # Keyword block
    keywords = meta.get('keyword', '')
    if keywords:
        keyword_list = [k.strip().strip('"') for k in keywords.strip('[]').split(',')]
        if keyword_list:
            w('')
            w('    <keyword>' + ', '.join(escape_xml(k) for k in keyword_list) + '</keyword>')
    
    # Abstract
    for sec in sections:
        if sec['title'].lower() == 'abstract':
            w('')
            w('    <abstract>')
            for line in sec['content'].strip().split('\n'):
                s = line.strip()
                if s:
                    w(f'      <t>{render_inline(s)}</t>')
            w('    </abstract>')
            break
    
    w('  </front>')
    w('')
    w('  <middle>')
    
    # Build nested sections
    stack = []  # (level, tag)
    
    for sec in sections:
        if sec['title'].lower() == 'abstract':
            continue
        
        level = sec['level']
        title = escape_xml(sec['title'])
        tag = sec.get('tag', '')
        body = sec['content'].strip()
        
        # Close deeper sections (use len(stack)-1 because stack still has the section)
        while stack and stack[-1][0] >= level:
            inner = '    ' + '  ' * (len(stack) - 1)
            w(f'{inner}</section>')
            stack.pop()
        
        inner = '    ' + '  ' * len(stack)
        anchor = f' anchor="{tag}"' if tag else ''
        w(f'{inner}<section{anchor} title="{title}">')
        
        body_lines = body.split('\n')
        xml_body = render_body(body_lines, indent=6 + 2 * (len(stack) + 1))
        if xml_body.strip():
            w(xml_body)
        
        stack.append((level, tag))
    
    # Close remaining
    while stack:
        inner = '    ' + '  ' * (len(stack) - 1)
        w(f'{inner}</section>')
        stack.pop()
    
    w('  </middle>')
    w('</rfc>')
    
    return '\n'.join(L)


def main():
    if len(sys.argv) < 2:
        print("Usage: python3 md2xml.py <input.md> [output.xml]")
        sys.exit(1)
    
    meta, series_info, authors, sections = parse_draft(sys.argv[1])
    
    print(f"Title: {meta.get('title', '?')}")
    print(f"Date: {meta.get('date', '?')}")
    print(f"Authors: {len(authors)}")
    for a in authors:
        print(f"  - {a.get('fullname', '?')} <{a.get('address', {}).get('email', '?')}>")
    print(f"Sections: {len(sections)}")
    for s in sections[:5]:
        print(f"  {'#' * s['level']} {s['title']}" + (f" {{{s['tag']}}}" if s.get('tag') else ''))
    if len(sections) > 5:
        print(f"  ... and {len(sections) - 5} more")
    
    xml = generate_xml(meta, series_info, authors, sections)
    
    output = sys.argv[2] if len(sys.argv) > 2 else sys.argv[1].replace('.md', '.xml')
    with open(output, 'w') as f:
        f.write(xml)
    
    print(f"\nGenerated: {output} ({len(xml)} bytes)")

if __name__ == '__main__':
    main()
