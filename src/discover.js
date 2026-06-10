// ADP SDK v1.1 — Agent 发现客户端
// 实现三层递进发现：SVCB-first → [TLSA] → Well-Known → DANE → key verify
//
// 信任等级链：
//   unverified → dns-verified → dane-verified → key-verified → peer-verified

import { parseSVCBRecords, validateSVCBInfo, parseTXTRecord, validateTXTRecord } from './dns-records.js';
import { validateAgentJSON } from './agent-json.js';

/**
 * 发现一个 Agent（完整三层流程，SVCB-first）
 *
 * @param {string} domain — 例: alice.example.com
 * @param {Object} [options]
 * @param {function} [options.dnsResolveSVCB] — DNS SVCB 解析
 * @param {function} [options.dnsResolveTLSA] — DNS TLSA 解析
 * @param {function} [options.dnsResolveTxt]  — DNS TXT 解析（fallback）
 * @param {function} [options.dnsResolveSrv]  — DNS SRV 解析（fallback）
 * @param {function} [options.dnsResolveA]    — DNS A 解析
 * @param {function} [options.dnsResolveAAAA] — DNS AAAA 解析
 * @param {function} [options.fetch]          — HTTP fetch
 * @param {boolean} [options.verifyTLSA=true] — 是否验证 TLSA/DANE
 * @returns {Promise<Object>} { domain, dns, meta, trustLevel, errors }
 */
export async function discoverAgent(domain, options = {}) {
  const fetcher = options.fetch || globalThis.fetch;
  const verifyTLSA = options.verifyTLSA !== false;

  const result = {
    domain,
    dns: null,        // 解析后的 DNS 信息
    meta: null,       // Well-Known JSON
    trustLevel: 'unverified',
    fallbackUsed: false,
    errors: [],
  };

  // ─── Layer 1: SVCB 查询（主要路径）──────────────────
  const svcbResolver = options.dnsResolveSVCB;
  if (svcbResolver) {
    try {
      const svcbRecords = await svcbResolver(domain);
      const parsed = parseSVCBRecords(svcbRecords);
      const validation = validateSVCBInfo(parsed);

      if (validation.valid && parsed.type === 'service') {
        result.dns = parsed;
        result.trustLevel = 'dns-verified';
      } else if (parsed?.type === 'alias') {
        result.dns = parsed;
        result.errors.push('SVCB returned AliasMode only; attempting fallback');
      }
    } catch (err) {
      // SVCB failed — will try fallback
      result.errors.push(`SVCB query failed: ${err.message}`);
    }
  }

  // ─── Layer 1b: SVCB 失败 → TXT + SRV 回退 ──────────
  if (!result.dns || result.dns.type === 'alias') {
    try {
      const fallbackResult = await fallbackDiscovery(domain, options);
      if (fallbackResult) {
        result.dns = fallbackResult;
        result.trustLevel = 'dns-verified';
        result.fallbackUsed = true;
      }
    } catch (err) {
      result.errors.push(`Fallback discovery failed: ${err.message}`);
      return result;
    }
  }

  if (!result.dns || !result.dns.wellKnown) {
    result.errors.push('No usable DNS discovery data');
    return result;
  }

  // ─── Layer 1c: TLSA / DANE 验证 ────────────────────
  if (verifyTLSA) {
    const tlsaResolver = options.dnsResolveTLSA;
    if (tlsaResolver) {
      try {
        const targetHost = result.dns.target === '.' ? domain : result.dns.target;
        const tlsaRecords = await tlsaResolver(`_${result.dns.port}._tcp.${targetHost}`);
        if (tlsaRecords?.length) {
          result.dns.tlsa = tlsaRecords;
          // 实际 DANE 验证在 TLS 连接时进行
          // 此处仅记录 TLSA 记录存在
        }
      } catch (_) {
        // TLSA is optional, non-fatal
      }
    }
  }

  // ─── Layer 2: Well-Known JSON ──────────────────────
  const metaUrl = resolveWellKnownUrl(result.dns, domain);
  try {
    const response = await fetcher(metaUrl, {
      headers: { 'Accept': 'application/json' },
      redirect: 'follow',
    });
    if (!response.ok) {
      result.errors.push(`Well-Known fetch failed: HTTP ${response.status}`);
      return result;
    }
    const meta = await response.json();
    const metaValidation = validateAgentJSON(meta);
    if (!metaValidation.valid) {
      result.errors.push(...metaValidation.errors);
      return result;
    }
    result.meta = meta;
  } catch (err) {
    result.errors.push(`Well-Known fetch failed: ${err.message}`);
    return result;
  }

  // ─── 公钥指纹验证 ──────────────────────────────────
  const dnsFingerprint = result.dns.publicKey || result.dns.capSha256;
  const metaFingerprint = result.meta.identity?.publicKey?.fingerprint;

  if (dnsFingerprint && metaFingerprint && dnsFingerprint !== metaFingerprint) {
    result.errors.push(
      `Public key fingerprint mismatch: DNS=${dnsFingerprint} meta=${metaFingerprint}`
    );
    return result;
  }

  result.trustLevel = 'key-verified';

  // ─── 标记 DANE 可用 ────────────────────────────────
  if (result.dns.tlsa?.length) {
    result.daneAvailable = true;
  }

  return result;
}

/**
 * SVCB 不可用时的 TXT + SRV 回退
 */
async function fallbackDiscovery(domain, options) {
  const txtResolver = options.dnsResolveTxt;
  const srvResolver = options.dnsResolveSrv;
  if (!txtResolver) return null;

  const txtRecords = await txtResolver(`_agent.${domain}`);
  const parsed = parseTXTRecord(txtRecords);
  const validation = validateTXTRecord(parsed);
  if (!validation.valid) throw new Error(validation.errors.join('; '));

  // 使用 wk URL 中的 host 作为 target
  let target = parsed.wk ? new URL(parsed.wk).hostname : domain;
  let port = 443;

  if (srvResolver) {
    try {
      const srvRecords = await srvResolver(`_agent._tcp.${domain}`);
      if (srvRecords?.length) {
        const best = srvRecords.sort((a, b) => a.priority - b.priority || a.weight - b.weight)[0];
        target = best.name.replace(/\.$/, '');
        port = best.port;
      }
    } catch (_) {}
  }

  return {
    type: 'service',
    target,
    port,
    alpn: parsed.alpn ? [parsed.alpn] : [],
    bap: parsed.bap || null,
    publicKey: parsed.pk,
    wellKnown: parsed.wk,
    svcFallback: true,
  };
}

/**
 * 解析 Well-Known URL
 */
function resolveWellKnownUrl(dns, domain) {
  // fallback 模式 wk 已经是一个完整 URL
  if (typeof dns.wellKnown === 'string' && dns.wellKnown.startsWith('https://')) {
    return dns.wellKnown;
  }
  // SVCB 模式：组合
  const target = dns.target === '.' ? domain : dns.target;
  return `https://${target}/.well-known/${dns.wellKnown || 'agent.json'}`;
}

/**
 * 批量发现
 */
export async function discoverAgents(domains, options = {}) {
  return Promise.all(domains.map(d => discoverAgent(d, options)));
}

/**
 * 获取信任等级描述
 */
export function trustLevelDescription(level) {
  const map = {
    'unverified':    'No verification performed',
    'dns-verified':  'DNS record obtained (SVCB or TXT fallback)',
    'dane-verified': 'TLS endpoint authenticated via DANE/TLSA',
    'key-verified':  'Public key fingerprint matches DNS record',
    'peer-verified': 'Bidirectional signature handshake complete',
  };
  return map[level] || 'Unknown trust level';
}
