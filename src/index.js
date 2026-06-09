// ADP SDK — 入口
// 统一导出所有模块

export { generateKeyPair, computeFingerprint, sign, verify, exportKey, importKey } from './crypto.js';
export { generateTXTRecord, generateTXTZoneEntry, generateSRVZoneEntry, generateAllDNSRecords, parseTXTRecord, validateTXTRecord } from './dns-records.js';
export { buildAgentJSON, validateAgentJSON } from './agent-json.js';
export { generateLandingPage } from './landing-page.js';
export { discoverAgent, discoverAgents } from './discover.js';
export { AgentConnection } from './connect.js';
export { verifyFingerprintChain, verifyPublicKeyIntegrity, runVerificationChain } from './verify.js';
