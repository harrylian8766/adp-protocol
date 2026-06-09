// ADP SDK — Agent 发现客户端
// 实现三层递进发现：DNS TXT → SRV → Well-Known → 验证

import { validateTXTRecord, parseTXTRecord } from './dns-records.js';
import { validateAgentJSON } from './agent-json.js';
import { computeFingerprint, importKey } from './crypto.js';

/**
 * 发现一个 Agent（完整三层流程）
 * @param {string} domain — 例: alice.agent
 * @param {Object} [options]
 * @param {function} [options.dnsResolveTxt] — 注入 DNS TXT 解析函数（Node.js 用 dns.promises.resolveTxt）
 * @param {function} [options.dnsResolveSrv] — 注入 DNS SRV 解析函数
 * @param {function} [options.fetch] — 注入 HTTP fetch 函数
 * @returns {Promise<Object>} { domain, txt, srv, meta, trustLevel }
 */
export async function discoverAgent(domain, options = {}) {
  const resolver = options.dnsResolveTxt || defaultTxtResolver;
  const srvResolver = options.dnsResolveSrv || defaultSrvResolver;
  const fetcher = options.fetch || globalThis.fetch;

  const result = {
    domain,
    txt: null,
    srv: null,
    meta: null,
    trustLevel: 'unverified',
    errors: [],
  };

  // ─── Layer 1: DNS TXT ───────────────────────────────
  try {
    const txtRecords = await resolver(`_agent.${domain}`);
    const parsed = parseTXTRecord(txtRecords);
    const validation = validateTXTRecord(parsed);
    if (!validation.valid) {
      result.errors.push(...validation.errors);
      return result;
    }
    result.txt = parsed;
    result.trustLevel = 'dns-verified';
  } catch (err) {
    result.errors.push(`DNS TXT lookup failed: ${err.message}`);
    return result;
  }

  // ─── Layer 1b: DNS SRV ──────────────────────────────
  try {
    const srvRecords = await srvResolver(`_agent._tcp.${domain}`);
    if (srvRecords?.length) {
      result.srv = srvRecords.map(r => ({
        priority: r.priority,
        weight: r.weight,
        port: r.port,
        target: r.name,
      }));
    }
  } catch (_) {
    // SRV is optional, non-fatal
  }

  // ─── Layer 2: Well-Known ────────────────────────────
  try {
    const wkUrl = result.txt.wk;
    const response = await fetcher(wkUrl, { headers: { 'Accept': 'application/json' } });
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

    // 验证公钥指纹一致性
    const metaFingerprint = meta.identity?.publicKey?.fingerprint;
    if (metaFingerprint !== result.txt.pk) {
      result.errors.push(
        `Public key fingerprint mismatch: DNS=${result.txt.pk} meta=${metaFingerprint}`
      );
      return result;
    }

    result.meta = meta;
    result.trustLevel = 'key-verified';
  } catch (err) {
    result.errors.push(`Well-Known fetch failed: ${err.message}`);
  }

  return result;
}

/**
 * 批量发现多个 Agent
 * @param {string[]} domains
 * @param {Object} options — 同 discoverAgent
 * @returns {Promise<Object[]>}
 */
export async function discoverAgents(domains, options = {}) {
  return Promise.all(domains.map(d => discoverAgent(d, options)));
}

// ─── 默认解析器（空实现，需注入） ──────────────────────────

async function defaultTxtResolver(name) {
  throw new Error('No DNS TXT resolver configured. Inject via options.dnsResolveTxt');
}

async function defaultSrvResolver(name) {
  throw new Error('No DNS SRV resolver configured. Inject via options.dnsResolveSrv');
}
