// ADP SDK v1.1 — Well-Known agent.json 构建器

/**
 * 构建完整的 agent.json 元数据对象
 * @param {Object} config
 * @param {string} config.domain
 * @param {string} config.name
 * @param {string} config.owner
 * @param {string} [config.version='1.0.0']      — Agent 自身版本
 * @param {Object} config.publicKey               — { fingerprint, algorithm, full }
 * @param {Object[]} [config.capabilities=[]]
 * @param {Object} [config.endpoints]             — 自定义端点覆盖
 * @param {Object[]} [config.relationships=[]]
 * @param {Object} [config.policies={}]
 * @param {Object} [config.availability={}]
 * @param {Object} [config.dns={}]               — v1.1 新增：DNS 验证信息
 * @param {string} [config.generator='adp-sdk/1.1.0']
 * @returns {Object} 符合 ADP v1.1 的 agent.json
 */
export function buildAgentJSON(config) {
  const {
    domain,
    name,
    owner,
    version = '1.0.0',
    publicKey,
    capabilities = [],
    endpoints: customEndpoints = {},
    relationships = [],
    policies = {},
    availability = {},
    dns = {},
    generator = 'adp-sdk/1.1.0',
  } = config;

  const baseUrl = `https://${domain}`;
  const defaultEndpoints = {
    discovery: `${baseUrl}/`,
    wellKnown: `${baseUrl}/.well-known/agent.json`,
    chat: `wss://${domain}/agent/chat`,
    tasks: `${baseUrl}/agent/tasks`,
    swarm: `${baseUrl}/agent/swarm`,
    webhook: `${baseUrl}/agent/webhook`,
  };

  return {
    $schema: 'https://raw.githubusercontent.com/harrylian8766/adp-protocol/main/schemas/v1.1/agent.json',
    protocol: 'ADP/1.1',
    identity: {
      id: `agent:${domain}`,
      domain,
      name,
      owner,
      created: new Date().toISOString(),
      publicKey: {
        algorithm: publicKey.algorithm || 'ed25519',
        fingerprint: publicKey.fingerprint,
        full: publicKey.full || null,
        proof: publicKey.proof || null,
      },
    },
    endpoints: { ...defaultEndpoints, ...customEndpoints },
    capabilities: capabilities.map(c => ({
      id: c.id,
      name: c.name,
      description: c.description || '',
      input: c.input || ['text'],
      output: c.output || ['text'],
      interfaces: c.interfaces || ['chat'],
      languages: c.languages || ['en'],
      pricing: c.pricing || { model: 'free', details: null },
    })),
    interfaces: {
      html: `${baseUrl}/`,
      api: `${baseUrl}/agent/`,
      chat: `wss://${domain}/agent/chat`,
    },
    relationships: relationships.map(r => ({
      type: r.type || 'peer',
      id: r.id,
      name: r.name,
      trust: r.trust || null,
      since: r.since || null,
    })),
    security: {
      tlsRequired: true,
      minProtocolVersion: 'ADP/1.1',
      authMethods: dns.tlsaRecord ? ['pubkey', 'dane'] : ['pubkey'],
      rateLimit: { requestsPerMinute: 60, burstSize: 10 },
    },
    dns: {
      svcbRecord: dns.svcbRecord || domain,
      tlsaRecord: dns.tlsaRecord || null,
      dnssec: dns.dnssec || false,
    },
    policies: {
      privacy: policies.privacy || `${baseUrl}/policies/privacy`,
      terms: policies.terms || `${baseUrl}/policies/terms`,
      dataRetention: policies.dataRetention || '7 days',
      thirdPartySharing: policies.thirdPartySharing || false,
    },
    availability: {
      status: availability.status || 'unknown',
      uptime: availability.uptime || null,
      maintenanceWindow: availability.maintenanceWindow || null,
    },
    meta: {
      updated: new Date().toISOString(),
      version,
      generator,
      documentation: config.documentation || null,
    },
  };
}

/**
 * 验证 agent.json
 * @param {Object} json
 * @param {string} [expectedVersion='ADP/1.1'] — v1.0 和 v1.1 都支持
 * @returns {{ valid: boolean, errors: string[] }}
 */
export function validateAgentJSON(json, expectedVersion = null) {
  const errors = [];

  // 协议版本兼容检查：v1.0 → v1.1 平滑过渡
  const protocol = json.protocol;
  const validVersions = expectedVersion
    ? [expectedVersion]
    : ['ADP/1.0', 'ADP/1.1'];
  if (!validVersions.includes(protocol)) {
    errors.push(`Expected protocol ${validVersions.join(' or ')}, got ${protocol}`);
  }

  // 必需身份字段
  if (!json.identity?.id) errors.push('Missing identity.id');
  if (!json.identity?.domain) errors.push('Missing identity.domain');
  if (!json.identity?.name) errors.push('Missing identity.name');
  if (!json.identity?.publicKey?.fingerprint) {
    errors.push('Missing identity.publicKey.fingerprint');
  }
  if (json.identity?.publicKey?.algorithm !== 'ed25519') {
    errors.push('Unsupported key algorithm, expected ed25519');
  }

  // 必需端点
  if (!json.endpoints || Object.keys(json.endpoints).length === 0) {
    errors.push('Missing endpoints');
  }
  if (json.endpoints && !json.endpoints.wellKnown) {
    errors.push('Missing endpoints.wellKnown');
  }

  // 必需能力
  if (!json.capabilities || json.capabilities.length === 0) {
    errors.push('At least one capability required');
  }

  // 必需安全块
  if (json.protocol === 'ADP/1.1') {
    if (!json.security?.tlsRequired) {
      errors.push('ADP/1.1 requires security.tlsRequired: true');
    }
    if (json.dns && json.dns.dnssec && !json.dns.svcbRecord) {
      errors.push('dns.dnssec=true requires dns.svcbRecord');
    }
  }

  return { valid: errors.length === 0, errors };
}
