#!/usr/bin/env node
// ADP CLI v1.1 — Agent Discovery Protocol 命令行工具
// 新增 SVCB/TLSA 生成，SVCB-first 发现

import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { generateKeyPair, exportKey, computeFingerprint, importKey } from '../src/crypto.js';
import { generateSVCBRecord, buildSVCBInfo, generateTLSARecord, generateTXTRecord, generateTXTZoneEntry, generateSRVZoneEntry, generateAllDNSRecords, parseTXTRecord, validateTXTRecord } from '../src/dns-records.js';
import { buildAgentJSON, validateAgentJSON } from '../src/agent-json.js';
import { generateLandingPage } from '../src/landing-page.js';
import { discoverAgent, trustLevelDescription } from '../src/discover.js';
import dns from 'node:dns/promises';

const cmd = process.argv[2];
const args = process.argv.slice(3);

function getArg(name, short) {
  const idx = args.indexOf(`--${name}`) !== -1 ? args.indexOf(`--${name}`)
    : args.indexOf(`-${short}`) !== -1 ? args.indexOf(`-${short}`) : -1;
  return idx !== -1 ? args[idx + 1] : null;
}
function hasArg(name, short) {
  return args.includes(`--${name}`) || args.includes(`-${short}`);
}

// ─── keygen ────────────────────────────────────────────

async function cmdKeygen() {
  const output = getArg('output', 'o') || 'agent.key';
  const { publicKey, privateKey, fingerprint } = await generateKeyPair();
  const keyData = {
    algorithm: 'ed25519',
    fingerprint,
    publicKey: exportKey(publicKey),
    privateKey: exportKey(privateKey),
    created: new Date().toISOString(),
  };
  writeFileSync(output, JSON.stringify(keyData, null, 2));
  console.log(`✅ Key pair generated: ${output}`);
  console.log(`   Fingerprint: ${fingerprint}`);
  console.log(`   Public key:  ${exportKey(publicKey).slice(0, 32)}...`);
}

// ─── dns-gen ────────────────────────────────────────────

function cmdDnsGen() {
  let domain = getArg('domain', 'd');
  const configFile = getArg('config', 'c');
  const fingerprint = getArg('fingerprint', 'f');
  const target = getArg('target', 't') || '.';
  const port = parseInt(getArg('port', 'p') || '443');
  const bap = getArg('bap', 'b') || 'a2a';
  const alpn = getArg('alpn', 'a') || 'a2a,h2';
  const svcOnly = hasArg('svcb-only', 's');
  const fallbackOnly = hasArg('fallback', 'F');

  let config = {};
  if (configFile) {
    try { config = JSON.parse(readFileSync(resolve(configFile), 'utf8')); } catch {}
    domain = domain || config.domain || config.identity?.domain;
  }
  domain = domain || 'example.com';
  const fp = fingerprint || config.fingerprint || config.identity?.publicKey?.fingerprint || 'ed25519:MISSING_KEY';

  // SVCB 主记录
  if (!fallbackOnly) {
    const svcbParams = {
      domain,
      target,
      port,
      alpn: alpn.split(',').map(s => s.trim()),
      bap,
      wellKnown: 'agent.json',
    };
    console.log('📋 SVCB Primary Record:\n');
    console.log(generateSVCBRecord(svcbParams));
    console.log('\n    # Single query returns: target, port, ALPN, bap, well-known\n');
  }

  // Fallback TXT + SRV
  if (!svcOnly) {
    console.log(`${fallbackOnly ? '📋' : '# '}Fallback TXT + SRV Records (for SVCB-unavailable environments):\n`);
    console.log(generateTXTZoneEntry({ domain, fingerprint: fp }));
    console.log(`\n${generateSRVZoneEntry({ domain, target: target === '.' ? domain : target, port })}`);
  }
}

// ─── tlsa-gen ───────────────────────────────────────────

function cmdTlsaGen() {
  const domain = getArg('domain', 'd');
  const certSha = getArg('cert-sha256', 'c');
  if (!domain || !certSha) {
    console.error('Usage: adp-cli tlsa-gen -d alice.example.com -c <cert-spki-sha256>');
    process.exit(1);
  }
  console.log(generateTLSARecord({ domain, certSha256: certSha }));
}

// ─── agent-json-gen ─────────────────────────────────────

function cmdAgentJsonGen() {
  const configFile = getArg('config', 'c');
  if (!configFile) {
    console.error('Usage: adp-cli agent-json-gen --config config.json');
    process.exit(1);
  }
  const config = JSON.parse(readFileSync(resolve(configFile), 'utf8'));
  const json = buildAgentJSON(config);
  console.log(JSON.stringify(json, null, 2));
}

// ─── landing-page ───────────────────────────────────────

function cmdLandingPage() {
  const configFile = getArg('config', 'c');
  const output = getArg('output', 'o') || 'index.html';
  if (!configFile) {
    console.error('Usage: adp-cli landing-page --config config.json [--output index.html]');
    process.exit(1);
  }
  const config = JSON.parse(readFileSync(resolve(configFile), 'utf8'));
  const json = buildAgentJSON(config);
  const html = generateLandingPage(json);
  writeFileSync(output, html);
  console.log(`✅ Landing page: ${output}`);
}

// ─── discover ───────────────────────────────────────────

async function cmdDiscover() {
  const domain = getArg('domain', 'd');
  if (!domain) {
    console.error('Usage: adp-cli discover --domain alice.example.com');
    process.exit(1);
  }

  console.log(`🔍 Discovering: ${domain} (SVCB-first)...\n`);

  const result = await discoverAgent(domain, {
    dnsResolveSVCB: async (name) => {
      try { return await dns.resolveSrv(name); } catch (e) { throw e; }
    },
    dnsResolveTxt: async (name) => {
      try { return await dns.resolveTxt(name); } catch (e) { throw e; }
    },
    dnsResolveSrv: async (name) => {
      try { return await dns.resolveSrv(name); } catch (_) { return []; }
    },
    dnsResolveTLSA: async (name) => {
      try { return []; } catch (_) { return []; }
    },
    fetch: globalThis.fetch,
  });

  if (result.errors.length > 0) {
    // Only fatal if no DNS data
    if (!result.dns) {
      console.log('❌ Discovery failed:');
      for (const e of result.errors) console.log(`   ${e}`);
      return;
    }
    console.log('⚠️  Discovery with warnings:');
    for (const e of result.errors) console.log(`   ${e}`);
    console.log();
  }

  console.log(`✅ Trust:   ${result.trustLevel}`);
  console.log(`   Method:  ${result.fallbackUsed ? 'TXT fallback' : 'SVCB'}`);
  console.log(`   Target:  ${result.dns.target || domain}`);
  console.log(`   Port:    ${result.dns.port}`);
  console.log(`   ALPN:    ${(result.dns.alpn || []).join(',') || 'N/A'}`);
  console.log(`   BAP:     ${result.dns.bap || 'N/A'}`);
  console.log(`   WellKnown: ${result.dns.wellKnown || 'agent.json'}`);
  if (result.daneAvailable) console.log(`   DANE:    TLSA available ✅`);

  if (result.meta) {
    const m = result.meta;
    console.log(`\n🤖 ${m.identity.name}`);
    console.log(`   Owner:    ${m.identity.owner}`);
    console.log(`   Protocol: ${m.protocol}`);
    console.log(`   Capabilities: ${m.capabilities.length}`);
    for (const c of m.capabilities) {
      console.log(`     • ${c.name} (${c.id}) [${c.pricing?.model || 'free'}]`);
    }
    if (m.security?.authMethods) {
      console.log(`   Auth:     ${m.security.authMethods.join(', ')}`);
    }
  }
}

// ─── validate ───────────────────────────────────────────

function cmdValidate() {
  const file = getArg('file', 'f');
  if (!file) {
    console.error('Usage: adp-cli validate --file agent.json');
    process.exit(1);
  }
  const json = JSON.parse(readFileSync(resolve(file), 'utf8'));
  const result = validateAgentJSON(json);  // 自动接受 ADP/1.0 和 ADP/1.1
  if (result.valid) {
    console.log(`✅ agent.json is valid (protocol: ${json.protocol})`);
  } else {
    console.log('❌ Validation failed:');
    for (const e of result.errors) console.log(`   ${e}`);
  }
}

// ─── help ───────────────────────────────────────────────

function cmdHelp() {
  console.log(`
🐙 ADP CLI v1.1 — Agent Discovery Protocol Tool

Commands:
  keygen            Generate Ed25519 key pair
    --output, -o    Output file (default: agent.key)

  dns-gen           Generate DNS records (SVCB primary + TXT/SRV fallback)
    --domain, -d    Agent domain (required)
    --config, -c    Config file for defaults
    --fingerprint, -f Public key fingerprint
    --target, -t    SVCB target (default: ".")
    --port, -p      Port (default: 443)
    --alpn, -a      ALPN list (default: "a2a,h2")
    --bap, -b       Agent protocol (default: "a2a")
    --svcb-only, -s Only output SVCB, skip fallback
    --fallback, -F  Only output TXT+SRV fallback

  tlsa-gen          Generate TLSA record for DANE
    --domain, -d    Agent domain (required)
    --cert-sha256   Certificate SPKI SHA-256 (required)

  agent-json-gen    Generate agent.json from config
    --config, -c    Config file

  landing-page      Generate HTML landing page
    --config, -c    Config file
    --output, -o    Output file (default: index.html)

  discover          Discover an agent (SVCB-first, fallback to TXT)
    --domain, -d    Target domain

  validate          Validate agent.json (ADP/1.0 or ADP/1.1)
    --file, -f      Path to agent.json
`);
}

// ─── Dispatch ───────────────────────────────────────────

const commands = {
  keygen: cmdKeygen,
  'dns-gen': cmdDnsGen,
  'tlsa-gen': cmdTlsaGen,
  'agent-json-gen': cmdAgentJsonGen,
  'landing-page': cmdLandingPage,
  discover: cmdDiscover,
  validate: cmdValidate,
  help: cmdHelp,
};

if (commands[cmd]) {
  try {
    const result = commands[cmd]();
    if (result && typeof result.catch === 'function') {
      result.catch(err => { console.error('Error:', err.message); process.exit(1); });
    }
  } catch (err) {
    console.error('Error:', err.message);
    process.exit(1);
  }
} else {
  cmdHelp();
}
