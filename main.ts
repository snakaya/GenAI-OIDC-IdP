/**
 * GenAI OIDC Identity Provider
 * A proof-of-concept OIDC IdP powered by OpenAI LLM
 */

// Load .env file only in local development (not in Deno Deploy)
const isDenoDeploy = Deno.env.get("DENO_DEPLOYMENT_ID") !== undefined;
if (!isDenoDeploy) {
  await import("@std/dotenv/load");
}

import { Application } from "@oak/oak";
import oidcRouter from "./src/routes/oidc.ts";
import { db } from "./src/db/memory.ts";

const PORT = parseInt(Deno.env.get("PORT") || "8000");
const ISSUER = Deno.env.get("ISSUER") || (isDenoDeploy ? "" : `http://localhost:${PORT}`);
const TEST_CLIENT_URL = Deno.env.get("TEST_CLIENT_URL") || (isDenoDeploy ? "" : "http://localhost:3000");
const OPENAI_MODEL = Deno.env.get("OPENAI_MODEL") || "gpt-5-mini";

// Log environment info on startup
console.log("🔧 Environment:");
console.log("   DENO_DEPLOYMENT_ID:", Deno.env.get("DENO_DEPLOYMENT_ID") || "(not set - local)");
console.log("   ISSUER:", ISSUER || "(auto-detect)");
console.log("   ADDITIONAL_REDIRECT_URIS:", Deno.env.get("ADDITIONAL_REDIRECT_URIS") || "(not set)");

// Log registered clients
const testClient = db.getClient("test-client-1");
if (testClient) {
  console.log("📋 test-client-1 registered redirect_uris:", testClient.redirect_uris);
}

// Initialize the application
const app = new Application();

// Logger middleware
app.use(async (ctx, next) => {
  const start = Date.now();
  await next();
  const ms = Date.now() - start;
  console.log(`${ctx.request.method} ${ctx.request.url.pathname} - ${ctx.response.status} (${ms}ms)`);
});

// CORS middleware for development
app.use(async (ctx, next) => {
  ctx.response.headers.set("Access-Control-Allow-Origin", "*");
  ctx.response.headers.set("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  ctx.response.headers.set("Access-Control-Allow-Headers", "Authorization, Content-Type");

  if (ctx.request.method === "OPTIONS") {
    ctx.response.status = 204;
    return;
  }

  await next();
});

// Error handling middleware
app.use(async (ctx, next) => {
  try {
    await next();
  } catch (err) {
    console.error("❌ Unhandled error:", err);
    ctx.response.status = 500;
    ctx.response.body = {
      error: "server_error",
      error_description: "An unexpected error occurred",
    };
  }
});

// Health check endpoint
app.use(async (ctx, next) => {
  if (ctx.request.url.pathname === "/health") {
    ctx.response.status = 200;
    ctx.response.body = { status: "ok", timestamp: new Date().toISOString() };
    return;
  }
  await next();
});

// Root endpoint - shows IdP info
app.use(async (ctx, next) => {
  if (ctx.request.url.pathname === "/") {
    ctx.response.headers.set("Content-Type", "text/html; charset=utf-8");
    ctx.response.body = `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>GenAI OIDC Identity Provider</title>
  <style>
    * {
      margin: 0;
      padding: 0;
      box-sizing: border-box;
    }
    body {
      font-family: 'Segoe UI', system-ui, sans-serif;
      background: linear-gradient(135deg, #1a1a2e 0%, #16213e 50%, #0f3460 100%);
      min-height: 100vh;
      display: flex;
      align-items: center;
      justify-content: center;
      color: #e0e0e0;
    }
    .container {
      background: rgba(255, 255, 255, 0.05);
      backdrop-filter: blur(10px);
      border-radius: 20px;
      padding: 3rem;
      max-width: 600px;
      width: 90%;
      box-shadow: 0 8px 32px rgba(0, 0, 0, 0.3);
      border: 1px solid rgba(255, 255, 255, 0.1);
    }
    h1 {
      color: #00d4ff;
      font-size: 2rem;
      margin-bottom: 0.5rem;
      text-shadow: 0 0 20px rgba(0, 212, 255, 0.3);
    }
    .subtitle {
      color: #888;
      font-size: 0.9rem;
      margin-bottom: 2rem;
    }
    .badge {
      display: inline-block;
      background: linear-gradient(90deg, #00d4ff, #7c3aed);
      color: white;
      padding: 0.3rem 0.8rem;
      border-radius: 20px;
      font-size: 0.75rem;
      font-weight: 600;
      margin-left: 0.5rem;
      text-transform: uppercase;
    }
    h2 {
      color: #fff;
      font-size: 1.1rem;
      margin: 1.5rem 0 1rem;
      padding-bottom: 0.5rem;
      border-bottom: 1px solid rgba(255, 255, 255, 0.1);
    }
    .endpoint {
      display: flex;
      align-items: center;
      padding: 0.8rem;
      background: rgba(0, 0, 0, 0.2);
      border-radius: 8px;
      margin-bottom: 0.5rem;
      transition: all 0.2s;
    }
    .endpoint:hover {
      background: rgba(0, 212, 255, 0.1);
      transform: translateX(5px);
    }
    .method {
      background: #7c3aed;
      color: white;
      padding: 0.2rem 0.5rem;
      border-radius: 4px;
      font-size: 0.7rem;
      font-weight: 600;
      margin-right: 1rem;
      min-width: 45px;
      text-align: center;
    }
    .method.post {
      background: #10b981;
    }
    .path {
      color: #00d4ff;
      font-family: 'Consolas', monospace;
      font-size: 0.9rem;
    }
    .clients, .users {
      background: rgba(0, 0, 0, 0.2);
      border-radius: 8px;
      padding: 1rem;
    }
    .item {
      padding: 0.5rem 0;
      border-bottom: 1px solid rgba(255, 255, 255, 0.05);
    }
    .item:last-child {
      border-bottom: none;
    }
    .item-name {
      color: #00d4ff;
      font-weight: 600;
    }
    .item-detail {
      color: #888;
      font-size: 0.8rem;
      margin-top: 0.2rem;
    }
    .try-it {
      margin-top: 1.5rem;
      padding: 1.5rem;
      background: linear-gradient(135deg, rgba(0, 212, 255, 0.1), rgba(124, 58, 237, 0.1));
      border-radius: 12px;
      text-align: center;
      border: 1px solid rgba(0, 212, 255, 0.2);
    }
    .try-it h3 {
      color: #00d4ff;
      margin-bottom: 0.5rem;
    }
    .try-it p {
      color: #888;
      font-size: 0.85rem;
      margin-bottom: 1rem;
    }
    .try-btn {
      display: inline-block;
      background: linear-gradient(135deg, #00d4ff, #7c3aed);
      color: white;
      padding: 0.8rem 2rem;
      border-radius: 8px;
      text-decoration: none;
      font-weight: 600;
      transition: all 0.2s;
      box-shadow: 0 4px 15px rgba(0, 212, 255, 0.3);
    }
    .try-btn:hover {
      transform: translateY(-2px);
      box-shadow: 0 6px 20px rgba(0, 212, 255, 0.4);
      text-decoration: none;
    }
    .footer {
      margin-top: 2rem;
      text-align: center;
      color: #666;
      font-size: 0.8rem;
    }
    a {
      color: #00d4ff;
      text-decoration: none;
    }
    a:hover {
      text-decoration: underline;
    }
  </style>
</head>
<body>
  <div class="container">
    <h1>🤖 GenAI OIDC IdP<span class="badge">PoC</span></h1>
    <p class="subtitle">OpenID Connect Identity Provider powered by LLM</p>

    <h2>📡 Endpoints</h2>
    <div class="endpoint">
      <span class="method">GET</span>
      <a href="/.well-known/openid-configuration" class="path">/.well-known/openid-configuration</a>
    </div>
    <div class="endpoint">
      <span class="method">GET</span>
      <span class="path">/authorize</span>
    </div>
    <div class="endpoint">
      <span class="method post">POST</span>
      <span class="path">/token</span>
    </div>
    <div class="endpoint">
      <span class="method">GET</span>
      <span class="path">/userinfo</span>
    </div>

    <h2>🔐 Test Clients</h2>
    <div class="clients">
      <div class="item">
        <div class="item-name">test-client-1</div>
        <div class="item-detail">Secret: test-secret-1 | Redirect: localhost:3000, localhost:8080</div>
      </div>
      <div class="item">
        <div class="item-name">test-client-2</div>
        <div class="item-detail">Secret: test-secret-2 | Redirect: localhost:4000</div>
      </div>
    </div>

    <h2>👤 Test Users</h2>
    <div class="users">
      <div class="item">
        <div class="item-name">user1</div>
        <div class="item-detail">Password: password1 | Email: user1@example.com</div>
      </div>
      <div class="item">
        <div class="item-name">user2</div>
        <div class="item-detail">Password: password2 | Email: user2@example.com</div>
      </div>
      <div class="item">
        <div class="item-name">admin</div>
        <div class="item-detail">Password: admin123 | Email: admin@example.com</div>
      </div>
    </div>

    ${TEST_CLIENT_URL ? `
    <div class="try-it">
      <h3>🚀 Try It Now!</h3>
      <p>Experience the LLM-powered OIDC authentication flow</p>
      <a href="${TEST_CLIENT_URL}" class="try-btn" target="_blank">Open Test Client</a>
    </div>
    ` : ""}

    <div class="footer">
      <p>Issuer: <code>${ISSUER}</code></p>
      <p>Model: ${OPENAI_MODEL}</p>
    </div>
  </div>
</body>
</html>`;
    return;
  }
  await next();
});

// OIDC routes
app.use(oidcRouter.routes());
app.use(oidcRouter.allowedMethods());

// Start cleanup interval for expired tokens
setInterval(() => {
  db.cleanupExpiredTokens();
}, 60000); // Every minute

// Start the server
if (isDenoDeploy) {
  // Deno Deploy uses Deno.serve automatically via Oak
  console.log("🚀 Starting on Deno Deploy...");
  console.log(`   Issuer: ${ISSUER || "(auto-detected)"}`);
  console.log(`   Model: ${OPENAI_MODEL}`);
} else {
  console.log(`
╔══════════════════════════════════════════════════════════════╗
║                                                              ║
║   🤖 GenAI OIDC Identity Provider                           ║
║                                                              ║
║   Issuer:  ${ISSUER.padEnd(46)}║
║   Port:    ${PORT.toString().padEnd(46)}║
║   Model:   ${OPENAI_MODEL.padEnd(46)}║
║                                                              ║
║   Endpoints:                                                 ║
║   • GET  /.well-known/openid-configuration                   ║
║   • GET  /authorize                                          ║
║   • POST /authorize/callback                                 ║
║   • POST /token                                              ║
║   • GET  /userinfo                                           ║
║                                                              ║
╚══════════════════════════════════════════════════════════════╝
`);
}

await app.listen({ port: PORT });
