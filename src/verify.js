// ADP SDK v1.1 — 验证链模块
//
// 完整信任链：
//   dns-verified → dane-verified → key-verified → peer-verified

import { computeFingerprint } from './crypto.js';

/**
 * 验证 DNS 公钥指纹与 Well-Known 一致
 * 支持 v1.0（TXT pk）和 v1.1（SVCB capSHA256 或 fallback TXT pk）
 *
 * @param {Object} dnsInfo — discoverAgent 返回的 result.dns
 * @param {Object} agentJSON — Well-Known JSON
 */
export function verifyFingerprintChain(dnsInfo, agentJSON) {
  const dnsFingerprint = dnsInfo.publicKey || dnsInfo.capSha256;
  const metaFingerprint = agentJSON.identity?.publicKey?.fingerprint;

  return {
    valid: dnsFingerprint != null && dnsFingerprint === metaFingerprint,
    dnsFingerprint: dnsFingerprint || null,
    metaFingerprint: metaFingerprint || null,
    source: dnsInfo.svcFallback ? 'txt-fallback' : 'svcb',
  };
}

/**
 * 验证 Well-Known 中完整公钥的指纹
 */
export function verifyPublicKeyIntegrity(agentJSON) {
  const pubkey = agentJSON.identity?.publicKey;
  if (!pubkey?.full) {
    return { valid: false, error: 'Full public key not provided in agent.json' };
  }

  try {
    const keyBytes = base64ToBytes(pubkey.full);
    const computed = computeFingerprint(keyBytes);
    return {
      valid: computed === pubkey.fingerprint,
      computed,
      declared: pubkey.fingerprint,
    };
  } catch (e) {
    return { valid: false, error: e.message };
  }
}

/**
 * 验证 TLSA 记录（DANE 级别验证）
 *
 * @param {string[]} tlsaRecords — TLSA 记录数据
 * @param {Object} tlsCert — TLS 证书信息 { spkiSha256, fullChainSha256 }
 * @returns {{ valid: boolean, matched: string|null, errors: string[] }}
 */
export function verifyTLSA(tlsaRecords, tlsCert) {
  if (!tlsaRecords?.length) {
    return { valid: false, matched: null, errors: ['No TLSA records provided'] };
  }
  if (!tlsCert?.spkiSha256) {
    return { valid: false, matched: null, errors: ['No TLS certificate SPKI provided'] };
  }

  for (const record of tlsaRecords) {
    // 解析 TLSA: usage selector matchingType certData
    const parts = record.trim().split(/\s+/);
    if (parts.length < 4) continue;
    const [usage, selector, matchingType, certData] = parts;

    // DANE-EE (3) + SPKI (1) + SHA-256 (1)
    if (usage === '3' && selector === '1' && matchingType === '1') {
      if (certData === tlsCert.spkiSha256) {
        return { valid: true, matched: `3 1 1 ${certData}`, errors: [] };
      }
    }
  }

  return {
    valid: false,
    matched: null,
    errors: [`No TLSA record matching certificate SPKI ${tlsCert.spkiSha256}`],
  };
}

/**
 * 运行完整验证链（三层 → 四层 v1.1）
 *
 * @param {Object} dnsInfo  — discoverAgent 返回的 result.dns
 * @param {Object} agentJSON — Well-Known JSON
 * @param {Object} [tlsCert] — TLS 证书 { spkiSha256 }
 * @returns {{ valid: boolean, trustLevel: string, results: Object[] }}
 */
export function runVerificationChain(dnsInfo, agentJSON, tlsCert = null) {
  const results = [];
  let trustLevel = 'unverified';

  // Step 1: DNS fingerprint → Well-Known
  const r1 = verifyFingerprintChain(dnsInfo, agentJSON);
  results.push({ step: 'fingerprint-chain', ...r1 });
  if (!r1.valid) return { valid: false, trustLevel, results };
  trustLevel = 'dns-verified';

  // Step 2: DANE/TLSA (if available)
  if (dnsInfo.tlsa?.length && tlsCert) {
    const r2 = verifyTLSA(dnsInfo.tlsa, tlsCert);
    results.push({ step: 'tlsa-dane', ...r2 });
    if (r2.valid) trustLevel = 'dane-verified';
  }

  // Step 3: Public key integrity in Well-Known
  const r3 = verifyPublicKeyIntegrity(agentJSON);
  results.push({ step: 'pubkey-integrity', ...r3 });
  if (!r3.valid) return { valid: false, trustLevel, results };
  trustLevel = 'key-verified';

  // Step 4: Protocol version check
  const r4 = {
    step: 'protocol-version',
    valid: agentJSON.protocol === 'ADP/1.0' || agentJSON.protocol === 'ADP/1.1',
    declared: agentJSON.protocol,
  };
  results.push(r4);

  return {
    valid: r1.valid && r3.valid && r4.valid,
    trustLevel,
    results,
  };
}

function base64ToBytes(str) {
  str = str.replace(/-/g, '+').replace(/_/g, '/');
  while (str.length % 4) str += '=';
  const bin = Buffer.from(str, 'base64').toString('binary');
  return new Uint8Array([...bin].map(c => c.charCodeAt(0)));
}
