// ADP SDK — DNS 记录生成模块

/**
 * 生成 _agent TXT 记录
 * @param {Object} params
 * @param {string} params.domain       — 例: alice.agent
 * @param {string} params.fingerprint  — 公钥指纹: ed25519:abc123...
 * @param {string} [params.wellKnown]  — Well-Known URL，默认 https://{domain}/.well-known/agent.json
 * @param {string} [params.rel]        — 链接关系，逗号分隔
 * @param {string} [params.note]       — 人类可读描述，最多 64 字符
 * @returns {string} DNS TXT 记录内容
 */
export function generateTXTRecord({ domain, fingerprint, wellKnown, rel, note }) {
  const wk = wellKnown || `https://${domain}/.well-known/agent.json`;
  const parts = [
    `v=ADP1`,
    `pk=${fingerprint}`,
    `wk=${wk}`
  ];
  if (rel) parts.push(`rel=${rel}`);
  if (note) parts.push(`note=${note.slice(0, 64)}`);
  return parts.join('; ');
}

/**
 * 生成完整的 _agent TXT DNS zone 条目
 * @returns {string} 可直接放入 zone file 的记录
 */
export function generateTXTZoneEntry(params) {
  const content = generateTXTRecord(params);
  return `_agent.${params.domain}.  IN  TXT  "${content}"`;
}

/**
 * 生成 _agent SRV DNS zone 条目
 * @param {Object} params
 * @param {string} params.domain
 * @param {string} params.target   — 目标 FQDN
 * @param {number} [params.port=443]
 * @param {number} [params.priority=10]
 * @param {number} [params.weight=5]
 * @param {string} [params.proto='_tcp'] — _tcp or _tls
 * @returns {string} DNS SRV zone 条目
 */
export function generateSRVZoneEntry({
  domain, target, port = 443,
  priority = 10, weight = 5, proto = '_tcp'
}) {
  return `_agent.${proto}.${domain}.  IN  SRV  ${priority} ${weight} ${port} ${target}.`;
}

/**
 * 生成所有 DNS 记录（TXT + SRV）
 */
export function generateAllDNSRecords(params) {
  return {
    txt: generateTXTRecord(params),
    txtZone: generateTXTZoneEntry(params),
    srvTcpZone: generateSRVZoneEntry(params),
    srvTlsZone: params.proto !== '_tcp' ? null : generateSRVZoneEntry({ ...params, proto: '_tls' }),
  };
}

/**
 * 解析 DNS TXT 记录字符串
 * @param {string[]} txtStrings — DNS 查询返回的 TXT 数组
 * @returns {Object} { v, pk, wk, rel, note }
 */
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

/**
 * 验证 TXT 记录协议版本
 */
export function validateTXTRecord(parsed) {
  const errors = [];
  if (!parsed.v || !parsed.v.startsWith('ADP')) {
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
