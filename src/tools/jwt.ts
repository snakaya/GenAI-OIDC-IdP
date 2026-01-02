/**
 * JWT Signing Tools for OpenAI Function Calling
 * Provides cryptographic signing capabilities that LLM can use
 */

import { encodeBase64Url } from "@std/encoding/base64url";

// JWT Secret from environment
const getJwtSecret = (): string => {
  return Deno.env.get("JWT_SECRET") || "default-secret-change-me";
};

// Global issuer - can be set dynamically for Deno Deploy
let currentIssuer: string | null = null;

export const setIssuer = (issuer: string): void => {
  currentIssuer = issuer;
};

const getIssuer = (): string => {
  return currentIssuer || Deno.env.get("ISSUER") || "http://localhost:8000";
};

/**
 * Create HMAC-SHA256 signature
 */
async function hmacSha256(key: Uint8Array, data: Uint8Array): Promise<Uint8Array> {
  const cryptoKey = await crypto.subtle.importKey(
    "raw",
    key,
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const signature = await crypto.subtle.sign("HMAC", cryptoKey, data);
  return new Uint8Array(signature);
}

/**
 * Generate a cryptographically secure random string
 */
export function generateRandomString(length: number = 32): string {
  const array = new Uint8Array(length);
  crypto.getRandomValues(array);
  return encodeBase64Url(array);
}

/**
 * Generate authorization code
 */
export function generateAuthorizationCode(): string {
  return generateRandomString(32);
}

/**
 * Generate access token
 */
export function generateAccessToken(): string {
  return generateRandomString(48);
}

/**
 * Generate refresh token
 */
export function generateRefreshToken(): string {
  return generateRandomString(64);
}

/**
 * Sign a JWT with HS256
 */
export async function signJwt(payload: Record<string, unknown>): Promise<string> {
  const header = {
    alg: "HS256",
    typ: "JWT",
  };

  const now = Math.floor(Date.now() / 1000);
  const fullPayload = {
    iss: getIssuer(),
    iat: now,
    ...payload,
  };

  const encoder = new TextEncoder();
  const headerB64 = encodeBase64Url(encoder.encode(JSON.stringify(header)));
  const payloadB64 = encodeBase64Url(encoder.encode(JSON.stringify(fullPayload)));

  const signingInput = `${headerB64}.${payloadB64}`;
  const secret = encoder.encode(getJwtSecret());
  const signature = await hmacSha256(secret, encoder.encode(signingInput));
  const signatureB64 = encodeBase64Url(signature);

  return `${headerB64}.${payloadB64}.${signatureB64}`;
}

/**
 * Create ID Token
 */
export async function createIdToken(params: {
  sub: string;
  aud: string;
  nonce?: string;
  auth_time?: number;
  expiresIn?: number;
}): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  const payload: Record<string, unknown> = {
    sub: params.sub,
    aud: params.aud,
    exp: now + (params.expiresIn || 3600),
    auth_time: params.auth_time || now,
  };

  if (params.nonce) {
    payload.nonce = params.nonce;
  }

  return await signJwt(payload);
}

/**
 * Verify PKCE code challenge
 */
export async function verifyCodeChallenge(
  codeVerifier: string,
  codeChallenge: string,
  method: string = "S256"
): Promise<boolean> {
  if (method === "plain") {
    return codeVerifier === codeChallenge;
  }

  if (method === "S256") {
    const encoder = new TextEncoder();
    const data = encoder.encode(codeVerifier);
    const hashBuffer = await crypto.subtle.digest("SHA-256", data);
    const hashArray = new Uint8Array(hashBuffer);
    const computedChallenge = encodeBase64Url(hashArray);
    return computedChallenge === codeChallenge;
  }

  return false;
}

/**
 * Tool definitions for OpenAI Function Calling
 */
export const jwtTools = [
  {
    type: "function" as const,
    function: {
      name: "generate_authorization_code",
      description: "Generate a secure authorization code for the OAuth2 authorization code flow",
      parameters: {
        type: "object",
        properties: {},
        required: [],
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "generate_access_token",
      description: "Generate a secure access token",
      parameters: {
        type: "object",
        properties: {},
        required: [],
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "generate_refresh_token",
      description: "Generate a secure refresh token",
      parameters: {
        type: "object",
        properties: {},
        required: [],
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "create_id_token",
      description: "Create and sign an OIDC ID Token (JWT)",
      parameters: {
        type: "object",
        properties: {
          sub: {
            type: "string",
            description: "Subject identifier (user ID)",
          },
          aud: {
            type: "string",
            description: "Audience (client ID)",
          },
          nonce: {
            type: "string",
            description: "Nonce value from authorization request (optional)",
          },
          expires_in: {
            type: "number",
            description: "Token expiration time in seconds (default: 3600)",
          },
        },
        required: ["sub", "aud"],
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "verify_pkce_challenge",
      description: "Verify PKCE code challenge against code verifier",
      parameters: {
        type: "object",
        properties: {
          code_verifier: {
            type: "string",
            description: "The code verifier from token request",
          },
          code_challenge: {
            type: "string",
            description: "The code challenge from authorization request",
          },
          code_challenge_method: {
            type: "string",
            description: "The challenge method (S256 or plain)",
            enum: ["S256", "plain"],
          },
        },
        required: ["code_verifier", "code_challenge", "code_challenge_method"],
      },
    },
  },
];

/**
 * Execute a tool call from OpenAI
 */
export async function executeToolCall(
  toolName: string,
  args: Record<string, unknown>
): Promise<unknown> {
  switch (toolName) {
    case "generate_authorization_code":
      return { code: generateAuthorizationCode() };

    case "generate_access_token":
      return { access_token: generateAccessToken() };

    case "generate_refresh_token":
      return { refresh_token: generateRefreshToken() };

    case "create_id_token": {
      const idToken = await createIdToken({
        sub: args.sub as string,
        aud: args.aud as string,
        nonce: args.nonce as string | undefined,
        expiresIn: args.expires_in as number | undefined,
      });
      return { id_token: idToken };
    }

    case "verify_pkce_challenge": {
      const isValid = await verifyCodeChallenge(
        args.code_verifier as string,
        args.code_challenge as string,
        args.code_challenge_method as string
      );
      return { valid: isValid };
    }

    default:
      throw new Error(`Unknown tool: ${toolName}`);
  }
}
