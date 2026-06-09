// ADP SDK — Well-Known agent.json 构建器

/**
 * 构建完整的 agent.json 元数据对象
 * @param {Object} config
 * @returns {Object} 符合 ADP v1.0 的 agent.json
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
    generator = 'adp-sdk/1.0.0',
  } = config;

  const baseUrl = `https://${domain}`;
  const defaultEndpoints = {
    discovery: `${baseUrl}/`,
    wellKnown: `${baseUrl}/.well-known/agent.json`,
    chat: `wss://${domain}/agent/chat`,
    tasks: `${baseUrl}/agent/tasks`,
    swarm: `${baseUrl}/agent/swarm`,
  };

  return {
    $schema: 'https://agent-discovery.org/schemas/1.0/agent.json',
    protocol: 'ADP/1.0',
    identity: {
      id: `agent:${domain}`,
      domain,
      name,
      owner,
      created: new Date().toISOString(),
      publicKey: {
        algorithm: 'ed25519',
        fingerprint: publicKey.fingerprint,
        full: publicKey.full || null,
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
    relationships,
    security: {
      tlsRequired: true,
      minProtocolVersion: 'ADP/1.0',
      authMethods: ['pubkey'],
      rateLimit: { requestsPerMinute: 60, burstSize: 10 },
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
 * 验证 agent.json 的最小必需字段
 */
export function validateAgentJSON(json) {
  const errors = [];
  if (json.protocol !== 'ADP/1.0') {
    errors.push(`Expected protocol ADP/1.0, got ${json.protocol}`);
  }
  if (!json.identity?.id) errors.push('Missing identity.id');
  if (!json.identity?.publicKey?.fingerprint) errors.push('Missing identity.publicKey.fingerprint');
  if (!json.endpoints || Object.keys(json.endpoints).length === 0) {
    errors.push('Missing endpoints');
  }
  if (!json.capabilities || json.capabilities.length === 0) {
    errors.push('At least one capability required');
  }
  return { valid: errors.length === 0, errors };
}
