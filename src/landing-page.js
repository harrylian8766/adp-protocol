// ADP SDK — Agent Landing Page 生成器
// 生成符合 ADP 规范的 HTML 发现页

/**
 * 生成 Agent 的 HTML Landing Page
 * @param {Object} agentJSON — 完整的 agent.json 对象
 * @returns {string} HTML 文档
 */
export function generateLandingPage(agentJSON) {
  const { identity, capabilities, endpoints, interfaces, relationships } = agentJSON;
  const styles = getStyles();

  const capCards = capabilities.map(c => `
    <div class="capability-card">
      <h3>${esc(c.name)}</h3>
      <p>${esc(c.description)}</p>
      <div class="cap-tags">
        <span class="tag input">📥 ${c.input.join(', ')}</span>
        <span class="tag output">📤 ${c.output.join(', ')}</span>
        ${c.pricing.model !== 'free' ? `<span class="tag price">💰 ${c.pricing.model}</span>` : ''}
      </div>
    </div>
  `).join('\n');

  const peerList = relationships?.length
    ? relationships.map(r => `<li>🤝 ${esc(r.name)} (${r.type}: ${r.id})${r.trust ? ` — ${r.trust}` : ''}</li>`).join('\n')
    : '<li>No peers yet</li>';

  return `<!DOCTYPE html>
<html lang="zh">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta name="agent-id" content="${esc(identity.id)}">
  <meta name="agent-protocol" content="ADP/1.0">
  <meta name="agent-fingerprint" content="${esc(identity.publicKey.fingerprint)}">
  <title>${esc(identity.name)} — ${esc(identity.id)}</title>
  <script type="application/ld+json">
${JSON.stringify(agentJSON, null, 2)}
  </script>
  ${styles}
</head>
<body>
  <div class="container">
    <header>
      <div class="status-dot online"></div>
      <h1>${esc(identity.name)}</h1>
      <p class="agent-id">${esc(identity.id)}</p>
      <p class="owner">by ${esc(identity.owner)}</p>
    </header>

    <section class="card">
      <h2>🔑 Identity</h2>
      <table class="info-table">
        <tr><td>Protocol</td><td>ADP/1.0</td></tr>
        <tr><td>Key Algorithm</td><td>Ed25519</td></tr>
        <tr><td>Fingerprint</td><td><code>${esc(identity.publicKey.fingerprint)}</code></td></tr>
      </table>
    </section>

    <section class="card">
      <h2>🎯 Capabilities</h2>
      <div class="capabilities">
        ${capCards}
      </div>
    </section>

    <section class="card">
      <h2>🔗 Endpoints</h2>
      <div class="endpoint-list">
        ${Object.entries(endpoints).map(([name, url]) => `
        <div class="endpoint">
          <span class="endpoint-name">${esc(name)}</span>
          <code>${esc(url)}</code>
        </div>
        `).join('\n')}
      </div>
    </section>

    <section class="card">
      <h2>🤝 Relationships</h2>
      <ul>${peerList}</ul>
    </section>

    <section class="card connect-section">
      <h2>🚀 Connect to this Agent</h2>
      <p>Use the ADP SDK to connect:</p>
      <pre><code>import { discoverAgent } from 'adp-sdk';
const agent = await discoverAgent('${esc(identity.domain)}');</code></pre>
      <p>Or connect directly via WebSocket:</p>
      <pre><code>${esc(endpoints.chat)}</code></pre>
    </section>

    <footer>
      <p>Powered by <strong>ADP (Agent Discovery Protocol) v1.0</strong></p>
      <p>Generated at ${new Date().toISOString()}</p>
    </footer>
  </div>
</body>
</html>`;
}

function esc(str) {
  if (!str) return '';
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function getStyles() {
  return `<style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      font-family: system-ui, -apple-system, sans-serif;
      background: #0d1117; color: #c9d1d9;
      line-height: 1.6;
    }
    .container { max-width: 800px; margin: 0 auto; padding: 40px 20px; }
    header { text-align: center; margin-bottom: 40px; }
    .status-dot {
      width: 12px; height: 12px; border-radius: 50%; margin: 0 auto 12px;
    }
    .status-dot.online { background: #3fb950; box-shadow: 0 0 8px rgba(63,185,80,0.5); }
    h1 { font-size: 32px; color: #f0f6fc; margin-bottom: 4px; }
    .agent-id { color: #58a6ff; font-size: 14px; margin-bottom: 4px; }
    .owner { color: #8b949e; font-size: 14px; }
    .card {
      background: #161b22; border: 1px solid #30363d;
      border-radius: 8px; padding: 24px; margin-bottom: 20px;
    }
    .card h2 { font-size: 18px; color: #f0f6fc; margin-bottom: 16px; }
    .info-table { width: 100%; border-collapse: collapse; }
    .info-table td { padding: 8px 12px; border-bottom: 1px solid #21262d; }
    .info-table td:first-child { color: #8b949e; width: 150px; }
    .info-table code { color: #58a6ff; font-size: 12px; }
    .capabilities { display: grid; grid-template-columns: repeat(auto-fill, minmax(250px, 1fr)); gap: 16px; }
    .capability-card {
      background: #0d1117; border: 1px solid #30363d;
      border-radius: 6px; padding: 16px;
    }
    .capability-card h3 { color: #f0f6fc; margin-bottom: 8px; font-size: 16px; }
    .capability-card p { color: #8b949e; font-size: 13px; margin-bottom: 12px; }
    .cap-tags { display: flex; flex-wrap: wrap; gap: 6px; }
    .tag { font-size: 11px; padding: 2px 8px; border-radius: 12px; background: #21262d; color: #8b949e; }
    .tag.price { background: #1a3a2a; color: #3fb950; }
    .endpoint-list { display: flex; flex-direction: column; gap: 12px; }
    .endpoint { display: flex; align-items: center; gap: 16px; }
    .endpoint-name {
      font-size: 13px; color: #8b949e; min-width: 80px; text-transform: uppercase;
    }
    .endpoint code { color: #58a6ff; font-size: 13px; word-break: break-all; }
    ul { list-style: none; }
    li { padding: 6px 0; color: #8b949e; font-size: 14px; }
    .connect-section p { color: #8b949e; margin-bottom: 12px; }
    pre {
      background: #0d1117; border: 1px solid #30363d;
      border-radius: 6px; padding: 12px; overflow-x: auto;
      margin-bottom: 12px;
    }
    pre code { color: #c9d1d9; font-size: 13px; }
    footer { text-align: center; margin-top: 40px; padding-top: 20px; border-top: 1px solid #21262d; color: #484f58; font-size: 13px; }
  </style>`;
}
