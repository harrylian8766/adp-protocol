// ADP SDK v1.1 — 入口
// 统一导出所有模块

export {
  generateKeyPair,
  computeFingerprint,
  sign, verify,
  exportKey, importKey
} from './crypto.js';

export {
  // SVCB (v1.1 新增)
  generateSVCBRecord,
  generateSVCBIndexRecord,
  buildSVCBInfo,
  parseSVCBRecords,
  validateSVCBInfo,
  // TLSA (v1.1 新增)
  generateTLSARecord,
  // TXT + SRV (v1.0 兼容 / v1.1 fallback)
  generateTXTRecord,
  generateTXTZoneEntry,
  generateSRVZoneEntry,
  parseTXTRecord,
  validateTXTRecord,
  // 全量生成
  generateAllDNSRecords,
} from './dns-records.js';

export {
  buildAgentJSON,
  validateAgentJSON,
} from './agent-json.js';

export {
  generateLandingPage,
} from './landing-page.js';

export {
  discoverAgent,
  discoverAgents,
  trustLevelDescription,
} from './discover.js';

export {
  AgentConnection,
} from './connect.js';

export {
  verifyFingerprintChain,
  verifyPublicKeyIntegrity,
  runVerificationChain,
} from './verify.js';
