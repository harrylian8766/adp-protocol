// ADP SDK — 密码学模块
// Ed25519 密钥生成、签名、验证（使用 Node.js 原生 crypto）

import crypto from 'node:crypto';

/**
 * 生成 Ed25519 密钥对
 */
export async function generateKeyPair() {
  const { publicKey, privateKey } = crypto.generateKeyPairSync('ed25519', {
    publicKeyEncoding: { type: 'spki', format: 'der' },
    privateKeyEncoding: { type: 'pkcs8', format: 'der' },
  });
  const pubBytes = new Uint8Array(publicKey.slice(publicKey.length - 32)); // raw 32-byte key
  const privBytes = new Uint8Array(privateKey.slice(privateKey.length - 32)); // raw 32-byte seed
  const fingerprint = computeFingerprint(pubBytes);
  return { publicKey: pubBytes, privateKey: privBytes, fingerprint };
}

/**
 * 计算公钥指纹 (SHA256, base64url)
 */
export function computeFingerprint(publicKey) {
  const hash = crypto.createHash('sha256').update(publicKey).digest();
  return `ed25519:${bytesToBase64url(hash)}`;
}

/**
 * 签名消息
 */
export async function sign(privateKey, message) {
  const key = crypto.createPrivateKey({
    key: Buffer.from(privateKey),
    format: 'der',
    type: 'pkcs8',
  });
  // Ed25519 keys: the raw seed needs to be wrapped in PKCS8 for Node.js
  // For simplicity, use the raw key approach
  const msgBytes = typeof message === 'string'
    ? Buffer.from(message, 'utf8')
    : Buffer.from(message);

  // Derive full key from seed
  const fullKey = crypto.createPrivateKey({
    key: exportPrivateKeyPKCS8(privateKey),
    format: 'der',
    type: 'pkcs8',
  });

  const sig = crypto.sign(null, msgBytes, fullKey);
  return bytesToBase64url(new Uint8Array(sig));
}

/**
 * 验证签名
 */
export async function verify(publicKey, message, signature) {
  const key = crypto.createPublicKey({
    key: exportPublicKeySPKI(publicKey),
    format: 'der',
    type: 'spki',
  });
  const msgBytes = typeof message === 'string'
    ? Buffer.from(message, 'utf8')
    : Buffer.from(message);
  const sigBytes = Buffer.from(base64urlToBytes(signature));
  return crypto.verify(null, msgBytes, key, sigBytes);
}

/**
 * 导出密钥为 base64url 字符串
 */
export function exportKey(keyBytes) {
  return bytesToBase64url(keyBytes);
}

/**
 * 从 base64url 字符串导入密钥
 */
export function importKey(encoded) {
  return base64urlToBytes(encoded);
}

// ─── PKCS8 / SPKI encoding helpers ──────────────────────

function exportPrivateKeyPKCS8(seed32) {
  // Ed25519 PKCS8 prefix
  const prefix = new Uint8Array([
    0x30, 0x2e, 0x02, 0x01, 0x00,
    0x30, 0x05, 0x06, 0x03, 0x2b, 0x65, 0x70,
    0x04, 0x22, 0x04, 0x20,
  ]);
  const full = new Uint8Array(prefix.length + seed32.length);
  full.set(prefix);
  full.set(seed32, prefix.length);
  return full;
}

function exportPublicKeySPKI(pubKey32) {
  // Ed25519 SPKI prefix
  const prefix = new Uint8Array([
    0x30, 0x2a, 0x30, 0x05, 0x06, 0x03, 0x2b, 0x65, 0x70,
    0x03, 0x21, 0x00,
  ]);
  const full = new Uint8Array(prefix.length + pubKey32.length);
  full.set(prefix);
  full.set(pubKey32, prefix.length);
  return full;
}

// ─── Base64url ───────────────────────────────────────────

function bytesToBase64url(bytes) {
  return Buffer.from(bytes).toString('base64url');
}

function base64urlToBytes(str) {
  return new Uint8Array(Buffer.from(str, 'base64url'));
}
