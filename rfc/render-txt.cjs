#!/usr/bin/env node
// render-rfc-txt.js — Convert mmark RFC draft to plain text
// Usage: node render-rfc-txt.js < draft.md > draft.txt

const fs = require('fs');
let input = fs.readFileSync(process.argv[2] || '/dev/stdin', 'utf8');

// Strip mmark front matter (%%% ... %%%)
input = input.replace(/^%%%.*?^%%%/ms, '').trim();

// Convert headers
let txt = input
  .replace(/^#\s+(.*?)$/gm, (_, t) => '\n' + t.toUpperCase() + '\n' + '='.repeat(Math.min(t.length, 72)))
  .replace(/^##\s+(.*?)$/gm, (_, t) => '\n' + t + '\n' + '-'.repeat(Math.min(t.length, 60)))
  .replace(/^###\s+(.*?)$/gm, (_, t) => '\n' + t)
  .replace(/^####\s+(.*?)$/gm, (_, t) => '\n  ' + t);

// Basic inline formatting
txt = txt
  .replace(/\*\*(.*?)\*\*/g, '$1')
  .replace(/`([^`]+)`/g, '$1')
  .replace(/\{::boilerplate\s+bcp14-tagged\}/g, 
    'The key words "MUST", "MUST NOT", "REQUIRED", "SHALL", "SHALL NOT",\n' +
    '"SHOULD", "SHOULD NOT", "RECOMMENDED", "NOT RECOMMENDED", "MAY", and\n' +
    '"OPTIONAL" in this document are to be interpreted as described in\n' +
    'BCP 14 [RFC2119] [RFC8174] when, and only when, they appear in all\n' +
    'capitals, as shown here.');

// Code blocks
txt = txt.replace(/^```$/gm, '\n---BEGIN---\n');
txt = txt.replace(/^```json\n([\s\S]*?)\n```/gm, '\n$1');

// Lists
txt = txt.replace(/^- /gm, '  o  ');
txt = txt.replace(/^  - /gm, '     - ');

// Definition lists (* field:)
txt = txt.replace(/^(\w+):\n:\s+/gm, '   $1:  ');

// Clean up extra whitespace
txt = txt.replace(/\n{4,}/g, '\n\n\n');

// Section markers
txt = txt.replace(/\{mainmatter\}/g, '');
txt = txt.replace(/\{backmatter\}/g, '');

// References
txt = txt.replace(/\{\{!(\w+)\}\}/g, '[$1]');

// Page width (wrap lines at 72 chars for RFC format)
const lines = txt.split('\n');
const wrapped = [];
for (const line of lines) {
  if (line.length <= 72 || line.startsWith('+') || line.startsWith('-') || line.startsWith('=') || line.startsWith('   ')) {
    wrapped.push(line);
    continue;
  }
  // Simple wrapping
  let remaining = line;
  while (remaining.length > 72) {
    let breakAt = remaining.lastIndexOf(' ', 72);
    if (breakAt < 0) breakAt = 72;
    wrapped.push(remaining.substring(0, breakAt));
    remaining = remaining.substring(breakAt + 1);
  }
  if (remaining) wrapped.push(remaining);
}

console.log(wrapped.join('\n'));
