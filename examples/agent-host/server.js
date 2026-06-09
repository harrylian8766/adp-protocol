#!/usr/bin/env node
// ADP Agent Host — 完整的 Agent 托管服务器示例
// 提供服务：Well-Known 端点、HTML 发现页、WebSocket 通信

import express from 'express';
import { WebSocketServer, WebSocket } from 'ws';
import { createServer } from 'node:http';
import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { buildAgentJSON } from '../../src/agent-json.js';
import { generateLandingPage } from '../../src/landing-page.js';

const port = parseInt(process.argv[process.argv.indexOf('--port') + 1]) || 3000;
const domain = process.env.AGENT_DOMAIN || 'localhost:3000';

const configPath = resolve(process.argv.find(a => a.endsWith('.json')) || 'examples/agent-host/agent.json');
const config = JSON.parse(readFileSync(configPath, 'utf8'));
const agentJSON = buildAgentJSON({ ...config, domain });

const app = express();
const server = createServer(app);
const wss = new WebSocketServer({ server });

// ─── Routes ─────────────────────────────────────────────

// Landing Page (Human-friendly)
app.get('/', (_req, res) => {
  res.type('html').send(generateLandingPage(agentJSON));
});

// Well-Known (Machine-readable)
app.get('/.well-known/agent.json', (_req, res) => {
  res.json(agentJSON);
});

// Agent API
app.get('/agent/', (_req, res) => {
  res.json({
    status: 'online',
    agent: agentJSON.identity.id,
    endpoints: agentJSON.endpoints,
  });
});

// ─── WebSocket (Agent Chat) ─────────────────────────────

const peers = new Map(); // sessionId → { ws, agentId, publicKey }

wss.on('connection', (ws) => {
  const sessionId = crypto.randomUUID();
  console.log(`🔗 New connection: ${sessionId}`);

  ws.on('message', (data) => {
    try {
      const msg = JSON.parse(data.toString());
      console.log(`📨 [${msg.type}] from ${msg.from}: ${msg.body?.content?.slice(0, 80)}...`);

      if (msg.type === 'system' && msg.body?.action === 'handshake') {
        // Handle handshake
        peers.set(sessionId, {
          ws,
          agentId: msg.from,
          publicKey: msg.body.publicKey,
        });
        ws.send(JSON.stringify({
          id: crypto.randomUUID(),
          from: agentJSON.identity.id,
          to: msg.from,
          type: 'system',
          timestamp: new Date().toISOString(),
          body: { action: 'handshake_ack', protocol: 'ADP/1.0', agent: agentJSON.identity },
        }));
        console.log(`✅ Handshake complete with ${msg.from}`);
        return;
      }

      // Echo / relay message
      if (msg.type === 'chat') {
        ws.send(JSON.stringify({
          id: crypto.randomUUID(),
          from: agentJSON.identity.id,
          to: msg.from,
          type: 'chat',
          timestamp: new Date().toISOString(),
          body: {
            content: `<div class="agent-response"><p>👋 Hello from ${agentJSON.identity.name}!</p><p>Received: ${msg.body?.content?.slice(0, 100)}</p><form><input placeholder="Ask me anything..."><button type="submit">Send</button></form></div>`,
            contentType: 'text/html',
            structuredData: {
              '@context': 'https://schema.org',
              '@type': 'Message',
              'text': `Echo: ${msg.body?.content?.slice(0, 100)}`,
            },
          },
        }));
      }
    } catch (err) {
      console.error('Message error:', err.message);
    }
  });

  ws.on('close', () => {
    peers.delete(sessionId);
    console.log(`🔌 Connection closed: ${sessionId}`);
  });
});

// ─── Start ──────────────────────────────────────────────

server.listen(port, () => {
  console.log(`\n🐙 Agent Host running on http://localhost:${port}`);
  console.log(`   Domain:       ${domain}`);
  console.log(`   Agent ID:     ${agentJSON.identity.id}`);
  console.log(`   Landing Page: http://localhost:${port}/`);
  console.log(`   Well-Known:   http://localhost:${port}/.well-known/agent.json`);
  console.log(`   Chat (WSS):   ws://localhost:${port}/agent/chat`);
  console.log(`   Capabilities: ${agentJSON.capabilities.map(c => c.name).join(', ')}\n`);
});
