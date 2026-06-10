// ADP SDK v1.1 — DNS 记录生成模块
// 新增 SVCB + TLSA，TXT/SRV 保留为 fallback

/**
 * 生成 SVCB ServiceMode 记录（主要机制）
 * @param {Object} params
 * @param {string} params.domain        — 例: alice.example.com
 * @param {string} [params.target='.'] — TargetName，默认 "."（自托管）
 * @param {string[]} [params.alpn=['a2a','h2']] — ALPN 协议列表
 * @param {number} [params.port=443]
 * @param {string[]} [params.ipv4hint] — IPv4 地址列表
 * @param {string[]} [params.ipv6hint] — IPv6 地址列表
 * @param {string} [params.bap='a2a']  — Agent 协议标识
 * @param {string} [params.wellKnown='agent.json'] — Well-Known URI 路径
 * @param {string} [params.cap]        — 能力描述符 URI
 * @param {string} [params.capSha256]  — cap 的 SHA-256 摘要
 * @returns {string} 可直接放入 zone file 的 SVCB 记录
 */
export function generateSVCBRecord({
  domain,
  target = '.',
  alpn = ['a2a', 'h2'],
  port = 443,
  ipv4hint,
  ipv6hint,
  bap = 'a2a',
  wellKnown = 'agent.json',
  cap,
  capSha256,
}) {
  const params = [];
  params.push(`alpn="${alpn.join(',')}"`);
  params.push(`port=${port}`);
  if (ipv4hint?.length) params.push(`ipv4hint=${ipv4hint.join(',')}`);
  if (ipv6hint?.length) params.push(`ipv6hint=${ipv6hint.join(',')}`);
  if (bap) params.push(`bap=${bap}`);
  if (wellKnown) params.push(`well-known=${wellKnown}`);
  if (cap) params.push(`cap=${cap}`);
  if (capSha256) params.push(`cap-sha256=${capSha256}`);

  const paramStr = params.join('\n        ');
  return `${domain}.  3600  IN  SVCB  1  ${target}  (\n        ${paramStr}\n    )`;
}

/**
 * 生成 SVCB AliasMode 记录（组织索引）
 * @param {string} domain    — 索引域名，例: _agents.example.com
 * @param {string[]} targets — Agent 域名列表
 */
export function generateSVCBIndexRecord({ domain, targets }) {
  return targets
    .map(t => `${domain}.  3600  IN  SVCB  0  ${t}.`)
    .join('\n');
}

/**
 * 生成 SVCB 记录摘要对象（用于程序化处理）
 * @param {Object} params — 同 generateSVCBRecord
 * @returns {Object} { zone, params, wellKnownUrl }
 */
export function buildSVCBInfo(params) {
  const target = params.target || '.';
  const effectiveDomain = target === '.' ? params.domain : target;
  return {
    zone: generateSVCBRecord(params),
    params: {
      target: effectiveDomain,
      port: params.port || 443,
      alpn: params.alpn || ['a2a', 'h2'],
      bap: params.bap || 'a2a',
      wellKnown: params.wellKnown || 'agent.json',
      ipv4hint: params.ipv4hint || [],
      ipv6hint: params.ipv6hint || [],
      cap: params.cap || null,
      capSha256: params.capSha256 || null,
    },
    wellKnownUrl: `https://${effectiveDomain}/.well-known/${params.wellKnown || 'agent.json'}`,
  };
}

/**
 * 生成 TLSA 记录
 * @param {Object} params
 * @param {string} params.domain
 * @param {number} [params.port=443]
 * @param {string} [params.proto='tcp']
 * @param {string} params.certSha256      — 证书公钥的 SHA-256（hex 编码）
 * @param {number} [params.usage=3]       — 3 = DANE-EE
 * @param {number} [params.selector=1]    — 1 = SPKI
 * @param {number} [params.matchingType=1] — 1 = SHA-256
 * @returns {string}
 */
export function generateTLSARecord({
  domain,
  port = 443,
  proto = 'tcp',
  certSha256,
  usage = 3,
  selector = 1,
  matchingType = 1,
}) {
  if (!certSha256) throw new Error('TLSA record requires certSha256');
  return `_${port}. _${proto}.${domain}.  3600  IN  TLSA  ${usage}  ${selector}  ${matchingType}  (\n    ${certSha256}\n)`;
}

// ═══════════════════════════════════════════════════════════════
// SVCB 解析（发现方使用）
// ═══════════════════════════════════════════════════════════════

/**
 * 解析 DNS SVCB 查询结果
 * @param {Object[]} svcbRecords — DNS 查询返回的 SVCB 记录数组
 *   每条记录 { priority, target, params: { alpn, port, ipv4hint, ipv6hint, bap, 'well-known', cap, 'cap-sha256' } }
 * @returns {Object|null} 优先级最低的 ServiceMode 记录信息
 */
export function parseSVCBRecords(svcbRecords) {
  if (!svcbRecords?.length) return null;

  // 分离 ServiceMode 和 AliasMode
  const serviceModes = svcbRecords.filter(r => r.priority > 0);
  const aliasModes = svcbRecords.filter(r => r.priority === 0);

  if (!serviceModes.length) {
    // 纯 AliasMode — 返回别名列表供递归发现
    return { type: 'alias', targets: aliasModes.map(r => r.target) };
  }

  // 取 priority 最低的 ServiceMode
  const best = serviceModes.sort((a, b) => a.priority - b.priority)[0];
  const p = best.params || {};

  return {
    type: 'service',
    target: best.target || '.',
    port: p.port || 443,
    alpn: parseAlpnParam(p.alpn),
    bap: p.bap || null,
    wellKnown: p['well-known'] || 'agent.json',
    cap: p.cap || null,
    capSha256: p['cap-sha256'] || null,
    ipv4hint: parseHintList(p.ipv4hint),
    ipv6hint: parseHintList(p.ipv6hint),
  };
}

/**
 * 验证 SVCB 记录是否包含 ADP 所需的最小字段
 */
export function validateSVCBInfo(info) {
  const errors = [];
  if (!info) {
    errors.push('No SVCB ServiceMode record found');
  } else if (info.type === 'alias') {
    errors.push('SVCB returned AliasMode only, need ServiceMode');
  } else {
    if (!info.target) errors.push('Missing SVCB target');
    if (!info.alpn?.length) errors.push('Missing ALPN in SVCB');
    if (!info.wellKnown) errors.push('Missing well-known in SVCB');
  }
  return { valid: errors.length === 0, errors, info };
}

// ═══════════════════════════════════════════════════════════════
// TXT + SRV fallback（v1.0 兼容）
// ═══════════════════════════════════════════════════════════════

/**
 * 生成 _agent TXT 记录（fallback）
 */
export function generateTXTRecord({ domain, fingerprint, wellKnown, rel, note }) {
  const wk = wellKnown || `https://${domain}/.well-known/agent.json`;
  const parts = [`v=ADP1.1`, `pk=${fingerprint}`, `wk=${wk}`];
  if (rel) parts.push(`rel=${rel}`);
  if (note) parts.push(`note=${note.slice(0, 64)}`);
  return parts.join('; ');
}

export function generateTXTZoneEntry(params) {
  const content = generateTXTRecord(params);
  return `_agent.${params.domain}.  IN  TXT  "${content}"`;
}

export function generateSRVZoneEntry({
  domain, target, port = 443,
  priority = 10, weight = 5, proto = '_tcp'
}) {
  return `_agent.${proto}.${domain}.  IN  SRV  ${priority} ${weight} ${port} ${target}.`;
}

export function parseTXTRecord(txtStrings) {
  const combined = txtStrings.flat().join('');
  const result = {};
  for (const pair of combined.split(';')) {
    const trimmed = pair.trim();
    const eqIdx = trimmed.indexOf('=');
    if (eqIdx === -1) continue;
    result[trimmed.slice(0, eqIdx)] = trimmed.slice(eqIdx + 1);
  }
  return result;
}

export function validateTXTRecord(parsed) {
  const errors = [];
  if (!parsed.v || !(parsed.v.startsWith('ADP1') || parsed.v.startsWith('ADP/1'))) {
    errors.push(`Unsupported protocol version: ${parsed.v || 'missing'}`);
  }
  if (!parsed.pk || !parsed.pk.startsWith('ed25519:')) {
    errors.push(`Missing or invalid public key fingerprint: ${parsed.pk || 'missing'}`);
  }
  if (!parsed.wk || !parsed.wk.startsWith('https://')) {
    errors.push(`Missing or invalid well-known URL: ${parsed.wk || 'missing'}`);
  }
  return { valid: errors.length === 0, errors, parsed };
}

/**
 * 生成所有 DNS 记录（v1.1 完整包：SVCB + TLSA + fallback TXT/SRV）
 */
export function generateAllDNSRecords(params) {
  const records = {};

  // 主路径：SVCB
  if (params.svcb) {
    records.svcbZone = generateSVCBRecord(params.svcb);
    records.svcbInfo = buildSVCBInfo(params.svcb);
  }

  // 安全：TLSA
  if (params.tlsa) {
    records.tlsaZone = generateTLSARecord({ domain: params.domain, ...params.tlsa });
  }

  // 回退：TXT + SRV
  if (params.fallback !== false) {
    records.txtZone = generateTXTZoneEntry({ domain: params.domain, ...params });
    records.txtContent = generateTXTRecord({ domain: params.domain, ...params });

    if (params.target) {
      records.srvTcpZone = generateSRVZoneEntry({ domain: params.domain, target: params.target, ...params });
    }
  }

  return records;
}

// ─── 辅助 ─────────────────────────────────────────

function parseAlpnParam(alpn) {
  if (!alpn) return [];
  if (Array.isArray(alpn)) return alpn;
  return alpn.split(',');
}

function parseHintList(hint) {
  if (!hint) return [];
  if (Array.isArray(hint)) return hint;
  return hint.split(',');
}
