#!/usr/bin/env node
// ADP CLI — Agent Discovery Protocol 命令行工具
// 用法：node bin/adp-cli.js <command> [options]

import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { generateKeyPair, exportKey, computeFingerprint, importKey } from '../src/crypto.js';
import { generateAllDNSRecords, parseTXTRecord, validateTXTRecord } from '../src/dns-records.js';
import { buildAgentJSON, validateAgentJSON } from '../src/agent-json.js';
import { generateLandingPage } from '../src/landing-page.js';
import { discoverAgent } from '../src/discover.js';
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
  let domain = getArg("domain", "d");
  const configFile = getArg('config', 'c');
  const fingerprint = getArg('fingerprint', 'f');
  const wellKnown = getArg('well-known', 'w');
  const target = getArg('target', 't');
  const port = parseInt(getArg('port', 'p') || '443');

  let config = {};
  
  if (configFile) {
    try {
      config = JSON.parse(readFileSync(resolve(configFile), 'utf8'));
      domain = domain || config.domain || config.identity?.domain;
    } catch { /* fallthrough */ }
  }

  domain = domain || 'example.com';
  const fp = fingerprint || config.fingerprint || config.identity?.publicKey?.fingerprint || 'ed25519:MISSING_KEY';
  const wk = wellKnown || config.wellKnown || `https://${domain}/.well-known/agent.json`;
  const tgt = target || config.target || domain;

  const params = { domain, fingerprint: fp, wellKnown: wk, target: tgt, port };
  const records = generateAllDNSRecords(params);

  console.log('📋 DNS Records for ADP Agent Discovery\n');
  console.log(`# TXT Record (REQUIRED)`);
  console.log(records.txtZone);
  console.log(`\n# SRV Records (RECOMMENDED)`);
  console.log(records.srvTcpZone);
  if (records.srvTlsZone) console.log(records.srvTlsZone);
  console.log(`\n# TXT Content:`);
  console.log(records.txt);
}

// ─── agent-json-gen ─────────────────────────────────────

function cmdAgentJsonGen() {
  const configFile = getArg('config', 'c');
  if (!configFile) {
    console.error('Usage: adp-cli agent-json-gen --config agent.json');
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
    console.error('Usage: adp-cli landing-page --config agent.json [--output index.html]');
    process.exit(1);
  }
  const config = JSON.parse(readFileSync(resolve(configFile), 'utf8'));
  const json = buildAgentJSON(config);
  const html = generateLandingPage(json);
  writeFileSync(output, html);
  console.log(`✅ Landing page generated: ${output}`);
}

// ─── discover ───────────────────────────────────────────

async function cmdDiscover() {
  const domain = getArg('domain', 'd');
  if (!domain) {
    console.error('Usage: adp-cli discover --domain alice.agent');
    process.exit(1);
  }

  console.log(`🔍 Discovering Agent: ${domain}...\n`);

  const result = await discoverAgent(domain, {
    dnsResolveTxt: async (name) => {
      try {
        const records = await dns.resolveTxt(name);
        return records;
      } catch (e) {
        throw new Error(`DNS TXT lookup failed for ${name}: ${e.message}`);
      }
    },
    dnsResolveSrv: async (name) => {
      try {
        const records = await dns.resolveSrv(name);
        return records;
      } catch (_) { return []; }
    },
    fetch: globalThis.fetch,
  });

  if (result.errors.length > 0) {
    console.log('❌ Discovery failed:');
    for (const e of result.errors) console.log(`   ${e}`);
    return;
  }

  console.log(`✅ Trust Level: ${result.trustLevel}`);
  console.log(`   Protocol:     ${result.txt.v}`);
  console.log(`   Fingerprint:  ${result.txt.pk}`);
  console.log(`   Well-Known:   ${result.txt.wk}`);
  
  if (result.srv?.length) {
    console.log('\n📡 SRV Records:');
    for (const s of result.srv) {
      console.log(`   ${s.target}:${s.port} (priority=${s.priority}, weight=${s.weight})`);
    }
  }

  if (result.meta) {
    const m = result.meta;
    console.log(`\n🤖 Agent Info:`);
    console.log(`   Name:         ${m.identity.name}`);
    console.log(`   Owner:        ${m.identity.owner}`);
    console.log(`   Capabilities: ${m.capabilities.length}`);
    for (const c of m.capabilities) {
      console.log(`     • ${c.name} (${c.id}) [${c.pricing.model}]`);
    }
    if (m.relationships?.length) {
      console.log(`   Peers:        ${m.relationships.length}`);
      for (const r of m.relationships) {
        console.log(`     • ${r.name} (${r.type})`);
      }
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
  const result = validateAgentJSON(json);
  if (result.valid) {
    console.log('✅ agent.json is valid ADP/1.0');
  } else {
    console.log('❌ Validation failed:');
    for (const e of result.errors) console.log(`   ${e}`);
  }
}

// ─── help ───────────────────────────────────────────────

function cmdHelp() {
  console.log(`
🐙 ADP CLI — Agent Discovery Protocol Tool

Commands:
  keygen            Generate Ed25519 key pair
    --output, -o    Output file (default: agent.key)

  dns-gen           Generate DNS records
    --config, -c    agent.json config file
    --domain, -d    Agent domain
    --fingerprint,-f Public key fingerprint
    --well-known,-w Well-Known URL
    --target, -t    SRV target host
    --port, -p      Service port (default: 443)

  agent-json-gen    Generate agent.json from config
    --config, -c    Config file

  landing-page      Generate HTML landing page
    --config, -c    Config file
    --output, -o    Output file (default: index.html)

  discover          Discover an agent by domain
    --domain, -d    Target domain

  validate          Validate agent.json
    --file, -f      Path to agent.json
`);
}

// ─── Dispatch ───────────────────────────────────────────

const commands = { keygen: cmdKeygen, 'dns-gen': cmdDnsGen, 'agent-json-gen': cmdAgentJsonGen, 'landing-page': cmdLandingPage, discover: cmdDiscover, validate: cmdValidate, help: cmdHelp };

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
