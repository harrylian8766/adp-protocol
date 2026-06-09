// ADP SDK — 验证链模块

import { computeFingerprint } from './crypto.js';

/**
 * 完整公钥验证链
 * DNS TXT → Well-Known → 运行时消息
 */

/**
 * 验证 DNS 公钥指纹与 Well-Known 一致
 */
export function verifyFingerprintChain(txtParsed, agentJSON) {
  const dnsFingerprint = txtParsed.pk;
  const metaFingerprint = agentJSON.identity?.publicKey?.fingerprint;

  return {
    valid: dnsFingerprint === metaFingerprint,
    dnsFingerprint,
    metaFingerprint,
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
 * 运行完整验证链（三层）
 */
export function runVerificationChain(txtParsed, agentJSON) {
  const results = [];

  // Verify 1: Fingerprint chain
  const r1 = verifyFingerprintChain(txtParsed, agentJSON);
  results.push({ step: 'fingerprint-chain', ...r1 });
  if (!r1.valid) return { valid: false, results };

  // Verify 2: Public key integrity
  const r2 = verifyPublicKeyIntegrity(agentJSON);
  results.push({ step: 'pubkey-integrity', ...r2 });
  if (!r2.valid) return { valid: false, results };

  // Verify 3: Protocol version
  const r3 = {
    step: 'protocol-version',
    valid: agentJSON.protocol === 'ADP/1.0',
    declared: agentJSON.protocol,
  };
  results.push(r3);

  return {
    valid: r1.valid && r2.valid && r3.valid,
    results,
  };
}

function base64ToBytes(str) {
  str = str.replace(/-/g, '+').replace(/_/g, '/');
  while (str.length % 4) str += '=';
  const bin = atob(str);
  return new Uint8Array([...bin].map(c => c.charCodeAt(0)));
}
