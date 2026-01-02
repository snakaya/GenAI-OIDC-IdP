/**
 * Test OIDC Client (Relying Party)
 * Simple client to test the OIDC IdP
 * Supports both local development and Deno Deploy
 */

// Load .env file only in local development
const isDenoDeploy = Deno.env.get("DENO_DEPLOYMENT_ID") !== undefined;
if (!isDenoDeploy) {
  await import("@std/dotenv/load");
}

import { Application, Router, Context } from "@oak/oak";
import { encodeBase64Url, decodeBase64Url } from "@std/encoding/base64url";

// Configuration from environment variables
const CLIENT_ID = Deno.env.get("CLIENT_ID") || "test-client-1";
const CLIENT_SECRET = Deno.env.get("CLIENT_SECRET") || "test-secret-1";
const IDP_URL = Deno.env.get("IDP_URL") || "http://localhost:9052";
const CLIENT_PORT = parseInt(Deno.env.get("PORT") || "3000");

// Cookie-based session secret (for signing)
const SESSION_SECRET = Deno.env.get("SESSION_SECRET") || "default-session-secret-change-me";

// Get redirect URI dynamically
function getRedirectUri(ctx: Context): string {
  const envRedirectUri = Deno.env.get("REDIRECT_URI");
  if (envRedirectUri) return envRedirectUri;

  // Auto-detect from request URL
  const url = ctx.request.url;
  return `${url.protocol}//${url.host}/callback`;
}

// Get client base URL dynamically
function getClientBaseUrl(ctx: Context): string {
  const url = ctx.request.url;
  return `${url.protocol}//${url.host}`;
}

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

// Simple HMAC signing for cookie data
async function signData(data: string): Promise<string> {
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(SESSION_SECRET),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const signature = await crypto.subtle.sign("HMAC", key, encoder.encode(data));
  return encodeBase64Url(new Uint8Array(signature));
}

async function verifyAndDecodeData(signedData: string): Promise<string | null> {
  try {
    const parts = signedData.split(".");
    if (parts.length !== 2) return null;
    
    const [data, signature] = parts;
    const expectedSignature = await signData(data);
    
    if (signature !== expectedSignature) return null;
    
    const decoder = new TextDecoder();
    return decoder.decode(decodeBase64Url(data));
  } catch {
    return null;
  }
}

async function createSignedCookie(data: object): Promise<string> {
  const json = JSON.stringify(data);
  const encoder = new TextEncoder();
  const encoded = encodeBase64Url(encoder.encode(json));
  const signature = await signData(encoded);
  return `${encoded}.${signature}`;
}

async function parseSignedCookie(cookie: string): Promise<object | null> {
  const decoded = await verifyAndDecodeData(cookie);
  if (!decoded) return null;
  try {
    return JSON.parse(decoded);
  } catch {
    return null;
  }
}

const router = new Router();

// Home page - Start login
router.get("/", async (ctx: Context) => {
  const state = crypto.randomUUID();
  const nonce = crypto.randomUUID();
  const pkce = await generatePKCE();
  const redirectUri = getRedirectUri(ctx);
  const clientBaseUrl = getClientBaseUrl(ctx);

  // Store session data in a signed cookie
  const sessionData = {
    state,
    verifier: pkce.verifier,
    nonce,
    redirectUri,
    createdAt: Date.now(),
  };
  
  const signedCookie = await createSignedCookie(sessionData);
  
  // Set cookie using response header directly to avoid Oak's secure connection check
  // In Deno Deploy, it's always HTTPS even though the internal connection shows as HTTP
  const isSecure = isDenoDeploy || ctx.request.url.protocol === "https:";
  const secureFlag = isSecure ? "; Secure" : "";
  const cookieValue = `oidc_session=${signedCookie}; Path=/; HttpOnly; SameSite=Lax; Max-Age=600${secureFlag}`;
  ctx.response.headers.append("Set-Cookie", cookieValue);

  const authUrl = new URL(`${IDP_URL}/authorize`);
  authUrl.searchParams.set("client_id", CLIENT_ID);
  authUrl.searchParams.set("redirect_uri", redirectUri);
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
      max-width: 500px;
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
      text-align: left;
    }
    .info p { margin-bottom: 0.5rem; color: #666; }
    code {
      background: #e0e0e0;
      padding: 0.2rem 0.4rem;
      border-radius: 4px;
      font-size: 0.75rem;
      word-break: break-all;
    }
  </style>
</head>
<body>
  <div class="container">
    <h1>🔐 Test OIDC Client</h1>
    <p>Click below to login via GenAI OIDC IdP</p>
    <a href="${authUrl.toString()}" class="login-btn">Login with OIDC</a>
    <div class="info">
      <p>🏠 Client: <code>${clientBaseUrl}</code></p>
      <p>🔗 IdP: <code>${IDP_URL}</code></p>
      <p>🔑 Client ID: <code>${CLIENT_ID}</code></p>
      <p>↩️ Redirect: <code>${redirectUri}</code></p>
      <p>🎲 State: <code>${state.slice(0, 8)}...</code></p>
      <p>🔒 PKCE: <code>${pkce.challenge.slice(0, 20)}...</code></p>
    </div>
  </div>
</body>
</html>`;
});

// Callback - Receive authorization code
router.get("/callback", async (ctx: Context) => {
  const url = ctx.request.url;
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const error = url.searchParams.get("error");
  const errorDescription = url.searchParams.get("error_description");

  if (error) {
    ctx.response.headers.set("Content-Type", "text/html; charset=utf-8");
    ctx.response.body = `
<!DOCTYPE html>
<html><head><title>Error</title>
<style>
  body { font-family: 'Segoe UI', sans-serif; padding: 2rem; background: #fee; }
  .container { max-width: 600px; margin: 0 auto; background: white; padding: 2rem; border-radius: 8px; box-shadow: 0 2px 10px rgba(0,0,0,0.1); }
  h1 { color: #c00; }
  pre { background: #f5f5f5; padding: 1rem; border-radius: 4px; overflow-x: auto; }
  a { color: #667eea; }
</style>
</head>
<body>
  <div class="container">
    <h1>❌ Authentication Error</h1>
    <p><strong>Error:</strong> ${error}</p>
    <p><strong>Description:</strong> ${errorDescription || "No description"}</p>
    <a href="/">← Try again</a>
  </div>
</body></html>`;
    return;
  }

  if (!code || !state) {
    ctx.response.status = 400;
    ctx.response.body = "Missing code or state";
    return;
  }

  // Retrieve session from cookie (parse directly from header to avoid Oak's secure check)
  const cookieHeader = ctx.request.headers.get("cookie") || "";
  const sessionCookie = cookieHeader
    .split(";")
    .map(c => c.trim())
    .find(c => c.startsWith("oidc_session="))
    ?.slice("oidc_session=".length);
  if (!sessionCookie) {
    ctx.response.status = 400;
    ctx.response.headers.set("Content-Type", "text/html; charset=utf-8");
    ctx.response.body = `
<!DOCTYPE html>
<html><head><title>Session Error</title>
<style>
  body { font-family: 'Segoe UI', sans-serif; padding: 2rem; background: #ffe; }
  .container { max-width: 600px; margin: 0 auto; background: white; padding: 2rem; border-radius: 8px; }
  h1 { color: #c80; }
  a { color: #667eea; }
</style>
</head>
<body>
  <div class="container">
    <h1>⚠️ Session Cookie Not Found</h1>
    <p>The session cookie was not found. This can happen if:</p>
    <ul>
      <li>Cookies are disabled in your browser</li>
      <li>The session expired (10 minutes)</li>
      <li>You're using a different browser/device</li>
    </ul>
    <a href="/">← Start Over</a>
  </div>
</body></html>`;
    return;
  }

  const session = await parseSignedCookie(sessionCookie) as { state: string; verifier: string; nonce: string; redirectUri: string; createdAt: number } | null;
  
  if (!session) {
    ctx.response.status = 400;
    ctx.response.headers.set("Content-Type", "text/html; charset=utf-8");
    ctx.response.body = `
<!DOCTYPE html>
<html><head><title>Session Error</title>
<style>
  body { font-family: 'Segoe UI', sans-serif; padding: 2rem; background: #ffe; }
  .container { max-width: 600px; margin: 0 auto; background: white; padding: 2rem; border-radius: 8px; }
  h1 { color: #c80; }
  a { color: #667eea; }
</style>
</head>
<body>
  <div class="container">
    <h1>⚠️ Invalid Session</h1>
    <p>The session data could not be verified. Please try again.</p>
    <a href="/">← Start Over</a>
  </div>
</body></html>`;
    return;
  }

  // Verify state matches
  if (session.state !== state) {
    ctx.response.status = 400;
    ctx.response.headers.set("Content-Type", "text/html; charset=utf-8");
    ctx.response.body = `
<!DOCTYPE html>
<html><head><title>State Mismatch</title>
<style>
  body { font-family: 'Segoe UI', sans-serif; padding: 2rem; background: #fee; }
  .container { max-width: 600px; margin: 0 auto; background: white; padding: 2rem; border-radius: 8px; }
  h1 { color: #c00; }
  a { color: #667eea; }
</style>
</head>
<body>
  <div class="container">
    <h1>❌ State Mismatch</h1>
    <p>The state parameter does not match. This could indicate a CSRF attack.</p>
    <a href="/">← Start Over</a>
  </div>
</body></html>`;
    return;
  }

  console.log("📥 Received authorization code:", code);
  console.log("📥 State:", state);
  console.log("📥 Redirect URI:", session.redirectUri);

  // Clear the session cookie by setting it to expire immediately
  const isSecure = isDenoDeploy || ctx.request.url.protocol === "https:";
  const secureFlag = isSecure ? "; Secure" : "";
  ctx.response.headers.append("Set-Cookie", `oidc_session=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0${secureFlag}`);

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
        redirect_uri: session.redirectUri,
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
<html><head><title>Token Error</title>
<style>
  body { font-family: 'Segoe UI', sans-serif; padding: 2rem; background: #fee; }
  .container { max-width: 600px; margin: 0 auto; background: white; padding: 2rem; border-radius: 8px; }
  h1 { color: #c00; }
  pre { background: #f5f5f5; padding: 1rem; border-radius: 4px; overflow-x: auto; }
  a { color: #667eea; }
</style>
</head>
<body>
  <div class="container">
    <h1>❌ Token Exchange Error</h1>
    <pre>${JSON.stringify(tokens, null, 2)}</pre>
    <a href="/">← Try again</a>
  </div>
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
      font-size: 0.8rem;
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
    ctx.response.headers.set("Content-Type", "text/html; charset=utf-8");
    ctx.response.body = `
<!DOCTYPE html>
<html><head><title>Error</title>
<style>
  body { font-family: 'Segoe UI', sans-serif; padding: 2rem; background: #fee; }
  .container { max-width: 600px; margin: 0 auto; background: white; padding: 2rem; border-radius: 8px; }
  h1 { color: #c00; }
  pre { background: #f5f5f5; padding: 1rem; border-radius: 4px; }
  a { color: #667eea; }
</style>
</head>
<body>
  <div class="container">
    <h1>❌ Token Exchange Failed</h1>
    <pre>${err}</pre>
    <a href="/">← Try again</a>
  </div>
</body></html>`;
  }
});

// Health check
router.get("/health", (ctx: Context) => {
  ctx.response.body = { status: "ok", timestamp: new Date().toISOString() };
});

// Create application with proxy support for Deno Deploy
const app = new Application({
  // Trust proxy headers (X-Forwarded-Proto) in Deno Deploy
  proxy: isDenoDeploy,
});
app.use(router.routes());
app.use(router.allowedMethods());

// Start the server
if (isDenoDeploy) {
  console.log("🚀 Starting OIDC Client on Deno Deploy...");
  console.log(`   IdP URL: ${IDP_URL}`);
  console.log(`   Client ID: ${CLIENT_ID}`);
} else {
  console.log(`
╔══════════════════════════════════════════════════════════════╗
║                                                              ║
║   🔐 Test OIDC Client (Relying Party)                       ║
║                                                              ║
║   URL:       http://localhost:${CLIENT_PORT.toString().padEnd(27)}║
║   Client ID: ${CLIENT_ID.padEnd(42)}║
║   IdP:       ${IDP_URL.padEnd(42)}║
║                                                              ║
║   Open http://localhost:${CLIENT_PORT} in your browser            ║
║                                                              ║
╚══════════════════════════════════════════════════════════════╝
`);
}

await app.listen({ port: CLIENT_PORT });
