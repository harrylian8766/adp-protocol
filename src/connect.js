// ADP SDK — Agent 间连接客户端
// 建立 WSS 连接，签名验证，消息收发

import { sign, verify } from './crypto.js';

/**
 * Agent 连接实例
 */
export class AgentConnection {
  constructor(wsUrl, options = {}) {
    this.url = wsUrl;
    this.privateKey = options.privateKey || null;
    this.publicKey = options.publicKey || null;
    this.remoteFingerprint = options.remoteFingerprint || null;
    this.agentId = options.agentId || 'unknown';
    this.remoteAgentId = options.remoteAgentId || null;
    this.ws = null;
    this.listeners = new Map();
    this.trustLevel = 'unverified';
  }

  /**
   * 建立连接
   */
  async connect() {
    this.ws = new WebSocket(this.url, 'adp-v1');

    return new Promise((resolve, reject) => {
      this.ws.onopen = () => {
        // 发送握手消息
        if (this.privateKey) {
          this._sendHandshake();
        }
        resolve();
      };

      this.ws.onerror = (err) => reject(err);
      this.ws.onclose = (ev) => this._emit('close', ev);
      this.ws.onmessage = (ev) => this._handleMessage(ev);
    });
  }

  /**
   * 发送消息
   * @param {Object} body — 消息体
   * @param {string} type — chat|task|swarm|system
   * @returns {Promise<string>} 消息 ID
   */
  async send(body, type = 'chat') {
    const msg = {
      id: crypto.randomUUID(),
      from: `agent:${this.agentId}`,
      to: `agent:${this.remoteAgentId}`,
      type,
      timestamp: new Date().toISOString(),
      body: typeof body === 'string'
        ? { content: body, contentType: 'text/plain' }
        : body,
    };

    // 签名
    if (this.privateKey) {
      const payload = JSON.stringify(msg.body);
      msg.signature = await sign(this.privateKey, payload);
    }

    this.ws.send(JSON.stringify(msg));
    return msg.id;
  }

  /**
   * 监听事件
   * @param {'message'|'close'|'error'|'verified'} event
   * @param {Function} handler
   */
  on(event, handler) {
    if (!this.listeners.has(event)) this.listeners.set(event, []);
    this.listeners.get(event).push(handler);
  }

  async close() {
    if (this.ws) this.ws.close();
  }

  // ─── 内部方法 ──────────────────────────────────────────

  async _sendHandshake() {
    const handshake = {
      id: crypto.randomUUID(),
      from: `agent:${this.agentId}`,
      to: `agent:${this.remoteAgentId}`,
      type: 'system',
      timestamp: new Date().toISOString(),
      body: {
        action: 'handshake',
        protocol: 'ADP/1.0',
        publicKey: this.publicKey || null,
      },
    };
    const payload = JSON.stringify(handshake.body);
    handshake.signature = await sign(this.privateKey, payload);
    this.ws.send(JSON.stringify(handshake));
  }

  async _handleMessage(event) {
    try {
      const msg = JSON.parse(event.data);

      // 验证签名
      if (msg.signature && this.remoteFingerprint) {
        const payload = JSON.stringify(msg.body);
        const remotePubkey = this._remotePubkey; // 从 well-known 获取
        if (remotePubkey) {
          const valid = await verify(remotePubkey, payload, msg.signature);
          if (valid && this.trustLevel !== 'peer-verified') {
            this.trustLevel = 'key-verified';
            this._emit('verified', { trustLevel: 'key-verified' });
          }
        }
      }

      this._emit('message', msg);
    } catch (err) {
      this._emit('error', err);
    }
  }

  _emit(event, data) {
    const handlers = this.listeners.get(event) || [];
    for (const h of handlers) h(data);
  }
}
