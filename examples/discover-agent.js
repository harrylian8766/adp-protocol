#!/usr/bin/env node
// ADP Discover Example — 发现并连接一个 Agent
// 用法：node examples/discover-agent.js alice.agent

import { discoverAgent } from '../src/discover.js';
import dns from 'node:dns/promises';

const domain = process.argv[2];

if (!domain) {
  console.log('Usage: node examples/discover-agent.js <domain>');
  console.log('Example: node examples/discover-agent.js alice.agent');
  process.exit(1);
}

async function main() {
  console.log(`🔍 Discovering Agent: ${domain}...\n`);
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

  const result = await discoverAgent(domain, {
    dnsResolveTxt: async (name) => {
      try {
        const records = await dns.resolveTxt(name);
        return records;
      } catch (e) {
        throw new Error(`DNS lookup failed: ${e.message}`);
      }
    },
    dnsResolveSrv: async (name) => {
      try { return await dns.resolveSrv(name); }
      catch (_) { return []; }
    },
    fetch: globalThis.fetch,
  });

  console.log('\n📊 Discovery Result:\n');
  console.log(`   Trust Level:    ${result.trustLevel}`);
  
  if (result.errors.length > 0) {
    console.log(`   ❌ Errors:`);
    for (const e of result.errors) console.log(`      • ${e}`);
    return;
  }

  if (result.txt) {
    console.log('\n   📝 DNS TXT:');
    console.log(`      Protocol:    ${result.txt.v}`);
    console.log(`      Fingerprint: ${result.txt.pk}`);
    console.log(`      Well-Known:  ${result.txt.wk}`);
    if (result.txt.rel) console.log(`      Relations:   ${result.txt.rel}`);
    if (result.txt.note) console.log(`      Note:        ${result.txt.note}`);
  }

  if (result.srv?.length) {
    console.log('\n   📡 DNS SRV:');
    for (const s of result.srv) {
      console.log(`      ${s.target}:${s.port} (p=${s.priority} w=${s.weight})`);
    }
  }

  if (result.meta) {
    const m = result.meta;
    console.log('\n   🤖 Agent Identity:');
    console.log(`      Name:        ${m.identity.name}`);
    console.log(`      ID:          ${m.identity.id}`);
    console.log(`      Owner:       ${m.identity.owner}`);
    console.log(`      Created:     ${m.identity.created}`);

    console.log('\n   🎯 Capabilities:');
    for (const c of m.capabilities) {
      console.log(`      • ${c.name}`);
      console.log(`        ID: ${c.id} | IO: ${c.input.join(',')} → ${c.output.join(',')}`);
      console.log(`        Pricing: ${c.pricing.model}${c.pricing.details ? ` (${c.pricing.details})` : ''}`);
    }

    console.log('\n   🔗 Endpoints:');
    for (const [name, url] of Object.entries(m.endpoints)) {
      console.log(`      ${name.padEnd(12)} ${url}`);
    }

    if (m.relationships?.length) {
      console.log('\n   🤝 Relationships:');
      for (const r of m.relationships) {
        console.log(`      ${r.type.padEnd(10)} ${r.name} (${r.id})${r.trust ? ` [${r.trust}]` : ''}`);
      }
    }

    console.log('\n   🔒 Security:');
    console.log(`      TLS:         ${m.security.tlsRequired}`);
    console.log(`      Auth:        ${m.security.authMethods.join(', ')}`);

    console.log('\n   📊 Availability:');
    console.log(`      Status:      ${m.availability.status}`);
    if (m.availability.uptime) console.log(`      Uptime:      ${m.availability.uptime}`);
  }

  console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log(`✅ Discovery complete. Trust level: ${result.trustLevel}`);
}

main().catch(err => {
  console.error('❌ Discovery failed:', err.message);
  process.exit(1);
});
