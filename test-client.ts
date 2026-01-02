/**
 * Test OIDC Client (Relying Party)
 * Simple client to test the OIDC IdP
 */

import { Application, Router } from "@oak/oak";
import { encodeBase64Url } from "@std/encoding/base64url";

const CLIENT_ID = "test-client-1";
const CLIENT_SECRET = "test-secret-1";
const REDIRECT_URI = "http://localhost:3000/callback";
const IDP_URL = "http://localhost:9052";
const CLIENT_PORT = 3000;

// Generate PKCE code verifier and challenge
async function generatePKCE(): Promise<{ verifier: string; challenge: string }> {
  const array = new Uint8Array(32);
  crypto.getRandomValues(array);
  const verifier = encodeBase64Url(array);

  const encoder = new TextEncoder();
  const data = encoder.encode(verifier);
  const hashBuffer = await crypto.subtle.digest("SHA-256", data);
  const challenge = encodeBase64Url(new Uint8Array(hashBuffer));

  return { verifier, challenge };
}

// Store PKCE verifier and state in memory (for demo purposes)
const sessions: Map<string, { verifier: string; nonce: string }> = new Map();

const router = new Router();

// Home page - Start login
router.get("/", async (ctx) => {
  const state = crypto.randomUUID();
  const nonce = crypto.randomUUID();
  const pkce = await generatePKCE();

  // Save session
  sessions.set(state, { verifier: pkce.verifier, nonce });

  const authUrl = new URL(`${IDP_URL}/authorize`);
  authUrl.searchParams.set("client_id", CLIENT_ID);
  authUrl.searchParams.set("redirect_uri", REDIRECT_URI);
  authUrl.searchParams.set("response_type", "code");
  authUrl.searchParams.set("scope", "openid profile email");
  authUrl.searchParams.set("state", state);
  authUrl.searchParams.set("nonce", nonce);
  authUrl.searchParams.set("code_challenge", pkce.challenge);
  authUrl.searchParams.set("code_challenge_method", "S256");

  ctx.response.headers.set("Content-Type", "text/html; charset=utf-8");
  ctx.response.body = `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Test OIDC Client</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      font-family: 'Segoe UI', system-ui, sans-serif;
      background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
      min-height: 100vh;
      display: flex;
      align-items: center;
      justify-content: center;
    }
    .container {
      background: white;
      border-radius: 16px;
      padding: 3rem;
      box-shadow: 0 10px 40px rgba(0,0,0,0.2);
      text-align: center;
      max-width: 400px;
    }
    h1 { color: #333; margin-bottom: 1rem; }
    p { color: #666; margin-bottom: 2rem; }
    .login-btn {
      display: inline-block;
      background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
      color: white;
      padding: 1rem 2rem;
      border-radius: 8px;
      text-decoration: none;
      font-weight: 600;
      transition: transform 0.2s, box-shadow 0.2s;
    }
    .login-btn:hover {
      transform: translateY(-2px);
      box-shadow: 0 5px 20px rgba(102, 126, 234, 0.4);
    }
    .info {
      margin-top: 2rem;
      padding: 1rem;
      background: #f5f5f5;
      border-radius: 8px;
      font-size: 0.85rem;
      color: #888;
    }
    code {
      background: #e0e0e0;
      padding: 0.2rem 0.4rem;
      border-radius: 4px;
      font-size: 0.8rem;
    }
  </style>
</head>
<body>
  <div class="container">
    <h1>🔐 Test OIDC Client</h1>
    <p>Click below to login via GenAI OIDC IdP</p>
    <a href="${authUrl.toString()}" class="login-btn">Login with OIDC</a>
    <div class="info">
      <p>State: <code>${state.slice(0, 8)}...</code></p>
      <p>PKCE Challenge: <code>${pkce.challenge.slice(0, 20)}...</code></p>
    </div>
  </div>
</body>
</html>`;
});

// Callback - Receive authorization code
router.get("/callback", async (ctx) => {
  const url = ctx.request.url;
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const error = url.searchParams.get("error");
  const errorDescription = url.searchParams.get("error_description");

  if (error) {
    ctx.response.headers.set("Content-Type", "text/html; charset=utf-8");
    ctx.response.body = `
<!DOCTYPE html>
<html><head><title>Error</title></head>
<body style="font-family: sans-serif; padding: 2rem;">
  <h1>❌ Authentication Error</h1>
  <p><strong>Error:</strong> ${error}</p>
  <p><strong>Description:</strong> ${errorDescription || "No description"}</p>
  <a href="/">Try again</a>
</body></html>`;
    return;
  }

  if (!code || !state) {
    ctx.response.status = 400;
    ctx.response.body = "Missing code or state";
    return;
  }

  // Retrieve session
  const session = sessions.get(state);
  if (!session) {
    ctx.response.status = 400;
    ctx.response.body = "Invalid state - session not found";
    return;
  }

  console.log("📥 Received authorization code:", code);
  console.log("📥 State:", state);
  console.log("📥 Code verifier:", session.verifier);

  // Exchange code for tokens
  try {
    const tokenResponse = await fetch(`${IDP_URL}/token`, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({
        grant_type: "authorization_code",
        code: code,
        redirect_uri: REDIRECT_URI,
        client_id: CLIENT_ID,
        client_secret: CLIENT_SECRET,
        code_verifier: session.verifier,
      }),
    });

    const tokens = await tokenResponse.json();
    console.log("📥 Token response:", tokens);

    if (tokens.error) {
      ctx.response.headers.set("Content-Type", "text/html; charset=utf-8");
      ctx.response.body = `
<!DOCTYPE html>
<html><head><title>Token Error</title></head>
<body style="font-family: sans-serif; padding: 2rem;">
  <h1>❌ Token Exchange Error</h1>
  <pre>${JSON.stringify(tokens, null, 2)}</pre>
  <a href="/">Try again</a>
</body></html>`;
      return;
    }

    // Fetch userinfo
    const userinfoResponse = await fetch(`${IDP_URL}/userinfo`, {
      headers: {
        Authorization: `Bearer ${tokens.access_token}`,
      },
    });

    const userinfo = await userinfoResponse.json();
    console.log("📥 Userinfo:", userinfo);

    // Clean up session
    sessions.delete(state);

    // Display success
    ctx.response.headers.set("Content-Type", "text/html; charset=utf-8");
    ctx.response.body = `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Login Successful</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      font-family: 'Segoe UI', system-ui, sans-serif;
      background: linear-gradient(135deg, #11998e 0%, #38ef7d 100%);
      min-height: 100vh;
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 2rem;
    }
    .container {
      background: white;
      border-radius: 16px;
      padding: 2rem;
      box-shadow: 0 10px 40px rgba(0,0,0,0.2);
      max-width: 700px;
      width: 100%;
    }
    h1 { color: #11998e; margin-bottom: 1rem; }
    h2 { color: #333; margin: 1.5rem 0 0.5rem; font-size: 1.1rem; }
    pre {
      background: #1a1a2e;
      color: #00ff88;
      padding: 1rem;
      border-radius: 8px;
      overflow-x: auto;
      font-size: 0.85rem;
    }
    .user-card {
      background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
      color: white;
      padding: 1.5rem;
      border-radius: 12px;
      margin-bottom: 1rem;
    }
    .user-card h3 { margin-bottom: 0.5rem; }
    .user-card p { opacity: 0.9; }
    a {
      display: inline-block;
      margin-top: 1rem;
      color: #667eea;
      text-decoration: none;
    }
    a:hover { text-decoration: underline; }
  </style>
</head>
<body>
  <div class="container">
    <h1>✅ Login Successful!</h1>
    
    <div class="user-card">
      <h3>${userinfo.name || userinfo.sub}</h3>
      <p>${userinfo.email || "No email"}</p>
    </div>

    <h2>📋 User Info</h2>
    <pre>${JSON.stringify(userinfo, null, 2)}</pre>

    <h2>🔑 Tokens</h2>
    <pre>${JSON.stringify({
      access_token: tokens.access_token?.slice(0, 30) + "...",
      token_type: tokens.token_type,
      expires_in: tokens.expires_in,
      id_token: tokens.id_token?.slice(0, 50) + "...",
      scope: tokens.scope,
    }, null, 2)}</pre>

    <h2>🎫 ID Token (decoded)</h2>
    <pre>${(() => {
      try {
        const parts = tokens.id_token?.split(".");
        if (parts && parts.length === 3) {
          const payload = JSON.parse(atob(parts[1]));
          return JSON.stringify(payload, null, 2);
        }
        return "Unable to decode";
      } catch {
        return "Unable to decode";
      }
    })()}</pre>

    <a href="/">← Start Over</a>
  </div>
</body>
</html>`;
  } catch (err) {
    console.error("Token exchange error:", err);
    ctx.response.status = 500;
    ctx.response.body = `Token exchange failed: ${err}`;
  }
});

const app = new Application();
app.use(router.routes());
app.use(router.allowedMethods());

console.log(`
╔══════════════════════════════════════════════════════════════╗
║                                                              ║
║   🔐 Test OIDC Client (Relying Party)                       ║
║                                                              ║
║   URL:       http://localhost:${CLIENT_PORT}                          ║
║   Client ID: ${CLIENT_ID}                              ║
║   IdP:       ${IDP_URL}                           ║
║                                                              ║
║   Open http://localhost:${CLIENT_PORT} in your browser            ║
║                                                              ║
╚══════════════════════════════════════════════════════════════╝
`);

await app.listen({ port: CLIENT_PORT });
