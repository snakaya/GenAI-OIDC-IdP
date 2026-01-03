/**
 * OIDC Routes
 * Implements Authorization, Token, and Userinfo endpoints
 */

import { Router, Context } from "@oak/oak";
import {
  processAuthorizationRequest,
  generateLoginPage,
  processAuthentication,
  processTokenExchange,
  processUserinfo,
} from "../llm/openai.ts";
import { setIssuer } from "../tools/jwt.ts";

const router = new Router();

/**
 * Get issuer URL (from env or auto-detect from request)
 */
function getIssuer(ctx: Context): string {
  const envIssuer = Deno.env.get("ISSUER");
  if (envIssuer) return envIssuer;

  // Auto-detect from request URL (for Deno Deploy)
  const url = ctx.request.url;
  return `${url.protocol}//${url.host}`;
}

/**
 * Middleware to set issuer dynamically from request URL
 */
router.use(async (ctx: Context, next) => {
  const issuer = getIssuer(ctx);
  setIssuer(issuer);
  await next();
});

/**
 * Authorization Endpoint - GET /authorize
 * Shows loading screen immediately, then loads LLM-generated login form
 */
router.get("/authorize", (ctx: Context) => {
  const url = ctx.request.url;
  const queryString = url.search;

  console.log("📥 Authorization request - showing loading screen");

  // Return loading page immediately
  ctx.response.headers.set("Content-Type", "text/html; charset=utf-8");
  ctx.response.body = `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Loading... - GenAI OIDC IdP</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
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
      text-align: center;
      padding: 3rem;
    }
    .logo {
      font-size: 4rem;
      margin-bottom: 1.5rem;
      animation: pulse 2s ease-in-out infinite;
    }
    @keyframes pulse {
      0%, 100% { transform: scale(1); opacity: 1; }
      50% { transform: scale(1.1); opacity: 0.8; }
    }
    h1 {
      color: #00d4ff;
      font-size: 1.5rem;
      margin-bottom: 0.5rem;
      text-shadow: 0 0 20px rgba(0, 212, 255, 0.3);
    }
    .subtitle {
      color: #888;
      font-size: 0.9rem;
      margin-bottom: 2rem;
    }
    .loader {
      display: flex;
      justify-content: center;
      gap: 0.5rem;
      margin-bottom: 2rem;
    }
    .loader span {
      width: 12px;
      height: 12px;
      background: linear-gradient(135deg, #00d4ff, #7c3aed);
      border-radius: 50%;
      animation: bounce 1.4s ease-in-out infinite;
    }
    .loader span:nth-child(1) { animation-delay: 0s; }
    .loader span:nth-child(2) { animation-delay: 0.2s; }
    .loader span:nth-child(3) { animation-delay: 0.4s; }
    .loader span:nth-child(4) { animation-delay: 0.6s; }
    @keyframes bounce {
      0%, 80%, 100% { transform: translateY(0); }
      40% { transform: translateY(-15px); }
    }
    .status {
      color: #00d4ff;
      font-size: 0.85rem;
      padding: 0.8rem 1.5rem;
      background: rgba(0, 212, 255, 0.1);
      border-radius: 20px;
      display: inline-block;
      border: 1px solid rgba(0, 212, 255, 0.2);
    }
    .status-icon {
      display: inline-block;
      margin-right: 0.5rem;
      animation: spin 1s linear infinite;
    }
    @keyframes spin {
      from { transform: rotate(0deg); }
      to { transform: rotate(360deg); }
    }
    .error-container {
      display: none;
      background: rgba(255, 0, 0, 0.1);
      border: 1px solid rgba(255, 0, 0, 0.3);
      border-radius: 12px;
      padding: 1.5rem;
      margin-top: 2rem;
      color: #ff6b6b;
    }
    .error-container h2 {
      color: #ff6b6b;
      margin-bottom: 0.5rem;
    }
    #login-content {
      display: none;
    }
  </style>
</head>
<body>
  <div class="container" id="loading-container">
    <div class="logo">🤖</div>
    <h1>GenAI OIDC Identity Provider</h1>
    <p class="subtitle">Preparing your secure login experience...</p>
    <div class="loader">
      <span></span>
      <span></span>
      <span></span>
      <span></span>
    </div>
    <div class="status">
      <span class="status-icon">⚙️</span>
      <span id="status-text">AI is generating your login page...</span>
    </div>
    <div class="error-container" id="error-container">
      <h2>⚠️ Error</h2>
      <p id="error-message"></p>
      <p style="margin-top: 1rem;"><a href="javascript:location.reload()" style="color: #00d4ff;">Try again</a></p>
    </div>
  </div>
  <div id="login-content"></div>

  <script>
    const statusText = document.getElementById('status-text');
    const loadingContainer = document.getElementById('loading-container');
    const loginContent = document.getElementById('login-content');
    const errorContainer = document.getElementById('error-container');
    const errorMessage = document.getElementById('error-message');

    // Animate status messages
    const messages = [
      'AI is generating your login page...',
      'Crafting a secure experience...',
      'Almost ready...',
    ];
    let msgIndex = 0;
    const messageInterval = setInterval(() => {
      msgIndex = (msgIndex + 1) % messages.length;
      statusText.textContent = messages[msgIndex];
    }, 2000);

    // Fetch the actual login form
    fetch('/authorize/login-form${queryString}')
      .then(response => {
        if (!response.ok) {
          return response.json().then(err => { throw err; });
        }
        return response.text();
      })
      .then(html => {
        clearInterval(messageInterval);
        // Replace entire page with login form
        document.open();
        document.write(html);
        document.close();
      })
      .catch(error => {
        clearInterval(messageInterval);
        loadingContainer.querySelector('.loader').style.display = 'none';
        loadingContainer.querySelector('.status').style.display = 'none';
        errorContainer.style.display = 'block';
        errorMessage.textContent = error.error_description || error.message || 'An unexpected error occurred';
      });
  </script>
</body>
</html>`;
});

/**
 * Login Form Generator - GET /authorize/login-form
 * Generates the actual login form via LLM (called by loading page)
 */
router.get("/authorize/login-form", async (ctx: Context) => {
  const url = ctx.request.url;
  const params = {
    client_id: url.searchParams.get("client_id") || "",
    redirect_uri: url.searchParams.get("redirect_uri") || "",
    response_type: url.searchParams.get("response_type") || "",
    scope: url.searchParams.get("scope") || "",
    state: url.searchParams.get("state") || "",
    nonce: url.searchParams.get("nonce") || undefined,
    code_challenge: url.searchParams.get("code_challenge") || undefined,
    code_challenge_method: url.searchParams.get("code_challenge_method") || undefined,
  };

  console.log("📥 Login form request:", params);

  try {
    // Let LLM validate the authorization request
    const validation = await processAuthorizationRequest(params);

    if (!validation.valid) {
      // Return error as JSON for the loading page to handle
      ctx.response.status = 400;
      ctx.response.headers.set("Content-Type", "application/json");
      ctx.response.body = {
        error: validation.error || "invalid_request",
        error_description: validation.error_description || "Authorization request validation failed",
      };
      return;
    }

    // Generate login page via LLM
    const loginHtml = await generateLoginPage({
      client_id: params.client_id,
      client_name: validation.client_name || params.client_id,
      redirect_uri: params.redirect_uri,
      scope: validation.requested_scope || params.scope,
      state: params.state,
      nonce: params.nonce,
      code_challenge: params.code_challenge,
      code_challenge_method: params.code_challenge_method,
      response_type: params.response_type,
    });

    ctx.response.headers.set("Content-Type", "text/html; charset=utf-8");
    ctx.response.body = loginHtml;
  } catch (error) {
    console.error("❌ Login form generation error:", error);
    ctx.response.status = 500;
    ctx.response.headers.set("Content-Type", "application/json");
    ctx.response.body = {
      error: "server_error",
      error_description: "An internal error occurred while generating the login page",
    };
  }
});

/**
 * Authorization Callback - POST /authorize/callback
 * Handles login form submission
 */
router.post("/authorize/callback", async (ctx: Context) => {
  try {
    const body = await ctx.request.body.formData();

    const params = {
      username: body.get("username") as string || "",
      password: body.get("password") as string || "",
      client_id: body.get("client_id") as string || "",
      redirect_uri: body.get("redirect_uri") as string || "",
      scope: body.get("scope") as string || "",
      state: body.get("state") as string || "",
      nonce: body.get("nonce") as string || undefined,
      code_challenge: body.get("code_challenge") as string || undefined,
      code_challenge_method: body.get("code_challenge_method") as string || undefined,
    };

    console.log("📥 Authentication request for user:", params.username);

    // Let LLM process authentication
    const result = await processAuthentication(params);

    if (!result.success) {
      // Re-render login page with error
      const loginHtml = await generateLoginPage({
        client_id: params.client_id,
        client_name: params.client_id,
        redirect_uri: params.redirect_uri,
        scope: params.scope,
        state: params.state,
        nonce: params.nonce,
        code_challenge: params.code_challenge,
        code_challenge_method: params.code_challenge_method,
        response_type: "code",
        error: result.error_description || "Invalid credentials",
      });

      ctx.response.headers.set("Content-Type", "text/html; charset=utf-8");
      ctx.response.body = loginHtml;
      return;
    }

    // Redirect to client with authorization code
    console.log("✅ Authentication successful, redirecting to:", result.redirect_url);
    ctx.response.redirect(result.redirect_url!);
  } catch (error) {
    console.error("❌ Authentication error:", error);
    ctx.response.status = 500;
    ctx.response.body = {
      error: "server_error",
      error_description: "An internal error occurred",
    };
  }
});

/**
 * Token Endpoint - POST /token
 * Exchanges authorization code for tokens
 */
router.post("/token", async (ctx: Context) => {
  try {
    const contentType = ctx.request.headers.get("content-type") || "";
    let params: Record<string, string> = {};

    if (contentType.includes("application/x-www-form-urlencoded")) {
      const body = await ctx.request.body.formData();
      for (const [key, value] of body.entries()) {
        params[key] = value as string;
      }
    } else if (contentType.includes("application/json")) {
      params = await ctx.request.body.json();
    }

    // Check for Basic Auth
    const authHeader = ctx.request.headers.get("Authorization");
    if (authHeader && authHeader.startsWith("Basic ")) {
      const base64Credentials = authHeader.slice(6);
      const credentials = atob(base64Credentials);
      const [clientId, clientSecret] = credentials.split(":");
      params.client_id = params.client_id || clientId;
      params.client_secret = params.client_secret || clientSecret;
    }

    console.log("📥 Token request:", { ...params, client_secret: "[REDACTED]" });

    // Let LLM process token exchange
    const result = await processTokenExchange({
      grant_type: params.grant_type || "",
      code: params.code || "",
      redirect_uri: params.redirect_uri || "",
      client_id: params.client_id || "",
      client_secret: params.client_secret,
      code_verifier: params.code_verifier,
    });

    if (result.error) {
      ctx.response.status = 400;
      ctx.response.headers.set("Content-Type", "application/json");
      ctx.response.body = result;
      return;
    }

    console.log("✅ Token issued successfully");
    ctx.response.headers.set("Content-Type", "application/json");
    ctx.response.headers.set("Cache-Control", "no-store");
    ctx.response.headers.set("Pragma", "no-cache");
    ctx.response.body = result;
  } catch (error) {
    console.error("❌ Token error:", error);
    ctx.response.status = 500;
    ctx.response.headers.set("Content-Type", "application/json");
    ctx.response.body = {
      error: "server_error",
      error_description: "An internal error occurred",
    };
  }
});

/**
 * Userinfo Endpoint - GET /userinfo
 * Returns user claims based on access token
 */
router.get("/userinfo", async (ctx: Context) => {
  try {
    const authHeader = ctx.request.headers.get("Authorization");

    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      ctx.response.status = 401;
      ctx.response.headers.set("WWW-Authenticate", 'Bearer error="invalid_token"');
      ctx.response.body = {
        error: "invalid_token",
        error_description: "Missing or invalid access token",
      };
      return;
    }

    const accessToken = authHeader.slice(7);
    console.log("📥 Userinfo request with token:", accessToken.slice(0, 10) + "...");

    // Let LLM process userinfo request
    const result = await processUserinfo(accessToken);

    if (result.error) {
      ctx.response.status = 401;
      ctx.response.headers.set("WWW-Authenticate", `Bearer error="${result.error}"`);
      ctx.response.body = result;
      return;
    }

    console.log("✅ Userinfo returned successfully");
    ctx.response.headers.set("Content-Type", "application/json");
    ctx.response.body = result;
  } catch (error) {
    console.error("❌ Userinfo error:", error);
    ctx.response.status = 500;
    ctx.response.body = {
      error: "server_error",
      error_description: "An internal error occurred",
    };
  }
});

/**
 * Userinfo Endpoint - POST /userinfo (alternative)
 */
router.post("/userinfo", async (ctx: Context) => {
  // Delegate to GET handler logic
  const authHeader = ctx.request.headers.get("Authorization");

  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    ctx.response.status = 401;
    ctx.response.headers.set("WWW-Authenticate", 'Bearer error="invalid_token"');
    ctx.response.body = {
      error: "invalid_token",
      error_description: "Missing or invalid access token",
    };
    return;
  }

  const accessToken = authHeader.slice(7);

  try {
    const result = await processUserinfo(accessToken);

    if (result.error) {
      ctx.response.status = 401;
      ctx.response.headers.set("WWW-Authenticate", `Bearer error="${result.error}"`);
      ctx.response.body = result;
      return;
    }

    ctx.response.headers.set("Content-Type", "application/json");
    ctx.response.body = result;
  } catch (error) {
    console.error("❌ Userinfo error:", error);
    ctx.response.status = 500;
    ctx.response.body = {
      error: "server_error",
      error_description: "An internal error occurred",
    };
  }
});

/**
 * OpenID Configuration - GET /.well-known/openid-configuration
 */
router.get("/.well-known/openid-configuration", (ctx: Context) => {
  const issuer = getIssuer(ctx);

  ctx.response.headers.set("Content-Type", "application/json");
  ctx.response.body = {
    issuer,
    authorization_endpoint: `${issuer}/authorize`,
    token_endpoint: `${issuer}/token`,
    userinfo_endpoint: `${issuer}/userinfo`,
    jwks_uri: `${issuer}/.well-known/jwks.json`,
    response_types_supported: ["code"],
    subject_types_supported: ["public"],
    id_token_signing_alg_values_supported: ["HS256"],
    scopes_supported: ["openid", "profile", "email"],
    token_endpoint_auth_methods_supported: ["client_secret_basic", "client_secret_post"],
    claims_supported: ["sub", "name", "given_name", "family_name", "email"],
    code_challenge_methods_supported: ["S256", "plain"],
    grant_types_supported: ["authorization_code", "refresh_token"],
  };
});

/**
 * JWKS Endpoint - GET /.well-known/jwks.json
 * Note: For HS256, JWKS is not typically exposed, but we include a placeholder
 */
router.get("/.well-known/jwks.json", (ctx: Context) => {
  ctx.response.headers.set("Content-Type", "application/json");
  ctx.response.body = {
    keys: [],
  };
});

export default router;
