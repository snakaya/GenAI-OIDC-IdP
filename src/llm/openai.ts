/**
 * OpenAI API Integration Module
 * Handles all LLM interactions for OIDC IdP operations
 */

import OpenAI from "openai";
import { jwtTools, executeToolCall } from "../tools/jwt.ts";
import { db } from "../db/memory.ts";
import { SYSTEM_PROMPTS, type OperationType } from "./prompts/index.ts";

const getOpenAIClient = (): OpenAI => {
  return new OpenAI({
    apiKey: Deno.env.get("OPENAI_API_KEY"),
  });
};

// LLM model can be configured via environment variable
const MODEL = Deno.env.get("OPENAI_MODEL") || "gpt-5-mini";

/**
 * Database access tools for the LLM
 */
const dbTools = [
  {
    type: "function" as const,
    function: {
      name: "get_client",
      description: "Get OIDC client information by client_id",
      parameters: {
        type: "object",
        properties: {
          client_id: {
            type: "string",
            description: "The client identifier",
          },
        },
        required: ["client_id"],
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "validate_user_credentials",
      description: "Validate username and password, returns user info if valid",
      parameters: {
        type: "object",
        properties: {
          username: {
            type: "string",
            description: "The username",
          },
          password: {
            type: "string",
            description: "The password",
          },
        },
        required: ["username", "password"],
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "get_user",
      description: "Get user information by user_id",
      parameters: {
        type: "object",
        properties: {
          user_id: {
            type: "string",
            description: "The user identifier",
          },
        },
        required: ["user_id"],
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "save_authorization_code",
      description: "Save an authorization code to the database",
      parameters: {
        type: "object",
        properties: {
          code: {
            type: "string",
            description: "The authorization code",
          },
          client_id: {
            type: "string",
            description: "The client identifier",
          },
          user_id: {
            type: "string",
            description: "The user identifier",
          },
          redirect_uri: {
            type: "string",
            description: "The redirect URI",
          },
          scope: {
            type: "string",
            description: "The requested scope",
          },
          code_challenge: {
            type: "string",
            description: "PKCE code challenge (optional)",
          },
          code_challenge_method: {
            type: "string",
            description: "PKCE code challenge method (optional)",
          },
          nonce: {
            type: "string",
            description: "Nonce value (optional)",
          },
          expires_in_seconds: {
            type: "number",
            description: "Expiration time in seconds (default: 600)",
          },
        },
        required: ["code", "client_id", "user_id", "redirect_uri", "scope"],
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "get_authorization_code",
      description: "Get authorization code data from the database",
      parameters: {
        type: "object",
        properties: {
          code: {
            type: "string",
            description: "The authorization code",
          },
        },
        required: ["code"],
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "mark_authorization_code_used",
      description: "Mark an authorization code as used",
      parameters: {
        type: "object",
        properties: {
          code: {
            type: "string",
            description: "The authorization code",
          },
        },
        required: ["code"],
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "save_access_token",
      description: "Save an access token to the database",
      parameters: {
        type: "object",
        properties: {
          token: {
            type: "string",
            description: "The access token",
          },
          client_id: {
            type: "string",
            description: "The client identifier",
          },
          user_id: {
            type: "string",
            description: "The user identifier",
          },
          scope: {
            type: "string",
            description: "The granted scope",
          },
          expires_in_seconds: {
            type: "number",
            description: "Expiration time in seconds (default: 3600)",
          },
        },
        required: ["token", "client_id", "user_id", "scope"],
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "get_access_token",
      description: "Get access token data from the database",
      parameters: {
        type: "object",
        properties: {
          token: {
            type: "string",
            description: "The access token",
          },
        },
        required: ["token"],
      },
    },
  },
];

/**
 * Execute a database tool call
 */
function executeDbToolCall(
  toolName: string,
  args: Record<string, unknown>
): unknown {
  switch (toolName) {
    case "get_client": {
      const client = db.getClient(args.client_id as string);
      if (client) {
        // Don't expose client_secret in response
        const { client_secret: _, ...safeClient } = client;
        return { found: true, client: safeClient };
      }
      return { found: false };
    }

    case "validate_user_credentials": {
      const user = db.validateUserCredentials(
        args.username as string,
        args.password as string
      );
      if (user) {
        const { password: _, ...safeUser } = user;
        return { valid: true, user: safeUser };
      }
      return { valid: false };
    }

    case "get_user": {
      const user = db.getUser(args.user_id as string);
      if (user) {
        const { password: _, ...safeUser } = user;
        return { found: true, user: safeUser };
      }
      return { found: false };
    }

    case "save_authorization_code": {
      const expiresIn = (args.expires_in_seconds as number) || 600;
      db.saveAuthorizationCode({
        code: args.code as string,
        client_id: args.client_id as string,
        user_id: args.user_id as string,
        redirect_uri: args.redirect_uri as string,
        scope: args.scope as string,
        code_challenge: args.code_challenge as string | undefined,
        code_challenge_method: args.code_challenge_method as string | undefined,
        nonce: args.nonce as string | undefined,
        expires_at: Date.now() + expiresIn * 1000,
        used: false,
      });
      return { saved: true };
    }

    case "get_authorization_code": {
      const authCode = db.getAuthorizationCode(args.code as string);
      if (authCode) {
        return { found: true, authorization_code: authCode };
      }
      return { found: false };
    }

    case "mark_authorization_code_used": {
      db.markAuthorizationCodeAsUsed(args.code as string);
      return { marked: true };
    }

    case "save_access_token": {
      const expiresIn = (args.expires_in_seconds as number) || 3600;
      db.saveAccessToken({
        token: args.token as string,
        client_id: args.client_id as string,
        user_id: args.user_id as string,
        scope: args.scope as string,
        expires_at: Date.now() + expiresIn * 1000,
      });
      return { saved: true };
    }

    case "get_access_token": {
      const accessToken = db.getAccessToken(args.token as string);
      if (accessToken) {
        const isExpired = accessToken.expires_at < Date.now();
        return { found: true, expired: isExpired, access_token: accessToken };
      }
      return { found: false };
    }

    default:
      throw new Error(`Unknown DB tool: ${toolName}`);
  }
}

/**
 * All available tools
 */
const allTools = [...jwtTools, ...dbTools];

/**
 * Tools grouped by endpoint/operation
 * Each endpoint only receives the tools it needs
 */
const toolsByOperation: Record<OperationType, typeof allTools> = {
  // Authorization: needs client lookup only
  authorization: dbTools.filter(t => t.function.name === "get_client"),
  
  // Login page: no tools needed (just generates HTML)
  login_page: [],
  
  // Authenticate: needs user validation and authorization code creation
  authenticate: [
    ...dbTools.filter(t => t.function.name === "validate_user_credentials"),
    ...jwtTools.filter(t => t.function.name === "create_authorization_code"),
  ],
  
  // Token: needs code verification, PKCE verification, token generation, and token storage
  token: [
    ...jwtTools.filter(t => 
      ["verify_authorization_code", "verify_pkce_challenge", "generate_access_token", "create_id_token"].includes(t.function.name)
    ),
    ...dbTools.filter(t => t.function.name === "save_access_token"),
  ],
  
  // Userinfo: needs token lookup and user lookup
  userinfo: dbTools.filter(t => 
    ["get_access_token", "get_user"].includes(t.function.name)
  ),
};

/**
 * Process tool calls from OpenAI response
 */
async function processToolCalls(
  toolCalls: OpenAI.Chat.Completions.ChatCompletionMessageToolCall[]
): Promise<{ tool_call_id: string; role: "tool"; content: string }[]> {
  const results = await Promise.all(
    toolCalls.map(async (toolCall) => {
      const args = JSON.parse(toolCall.function.arguments);
      let result: unknown;

      // Check if it's a JWT tool or DB tool
      if (
        ["create_authorization_code", "verify_authorization_code", "generate_authorization_code", "generate_access_token", "generate_refresh_token", "create_id_token", "verify_pkce_challenge"].includes(
          toolCall.function.name
        )
      ) {
        result = await executeToolCall(toolCall.function.name, args);
      } else {
        result = executeDbToolCall(toolCall.function.name, args);
      }

      return {
        tool_call_id: toolCall.id,
        role: "tool" as const,
        content: JSON.stringify(result),
      };
    })
  );

  return results;
}

/**
 * Retry configuration
 */
const MAX_RETRIES = 3;
const RETRY_DELAY_MS = 1000;

/**
 * Sleep helper for retry delays
 */
const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

/**
 * Check if error is retryable (network/connection errors)
 */
function isRetryableError(error: unknown): boolean {
  if (error instanceof Error) {
    const message = error.message.toLowerCase();
    return (
      message.includes("connection") ||
      message.includes("dns") ||
      message.includes("network") ||
      message.includes("timeout") ||
      message.includes("econnrefused") ||
      message.includes("enotfound")
    );
  }
  return false;
}

/**
 * Call OpenAI with retry logic
 */
async function callOpenAIWithRetry(
  openai: OpenAI,
  params: OpenAI.Chat.Completions.ChatCompletionCreateParamsNonStreaming,
  operation: string
): Promise<OpenAI.Chat.Completions.ChatCompletion> {
  let lastError: unknown;
  
  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      return await openai.chat.completions.create(params);
    } catch (error) {
      lastError = error;
      
      if (isRetryableError(error) && attempt < MAX_RETRIES) {
        const delay = RETRY_DELAY_MS * attempt; // Exponential backoff
        console.log(`⚠️ [${operation}] Connection error, retrying in ${delay}ms (attempt ${attempt}/${MAX_RETRIES})...`);
        await sleep(delay);
      } else {
        throw error;
      }
    }
  }
  
  throw lastError;
}

/**
 * Result of LLM call including tool results
 */
export interface LLMCallResult {
  response: string;
  toolResults: Record<string, unknown>;
}

/**
 * Call OpenAI with tools and handle tool calls
 */
export async function callLLM(
  operation: OperationType,
  userMessage: string
): Promise<LLMCallResult> {
  const openai = getOpenAIClient();

  // Get operation-specific tools
  const operationTools = toolsByOperation[operation];
  const hasTools = operationTools.length > 0;

  // Store tool results for later use
  const collectedToolResults: Record<string, unknown> = {};

  console.log(`🤖 [${operation}] Calling LLM...`);
  console.log(`🤖 [${operation}] System prompt: ${SYSTEM_PROMPTS[operation].slice(0, 100)}...`);
  console.log(`🤖 [${operation}] Available tools: ${hasTools ? operationTools.map(t => t.function.name).join(", ") : "(none)"}`);
  console.log(`🤖 [${operation}] User message:`, userMessage.slice(0, 200) + "...");

  const messages: OpenAI.Chat.Completions.ChatCompletionMessageParam[] = [
    { role: "system", content: SYSTEM_PROMPTS[operation] },
    { role: "user", content: userMessage },
  ];

  // Only include tools if the operation has any
  const requestParams: OpenAI.Chat.Completions.ChatCompletionCreateParamsNonStreaming = {
    model: MODEL,
    messages,
  };

  if (hasTools) {
    requestParams.tools = operationTools;
    requestParams.tool_choice = "auto";
  }

  let response = await callOpenAIWithRetry(openai, requestParams, operation);

  // Handle tool calls in a loop (only if tools are available)
  while (hasTools && response.choices[0].message.tool_calls) {
    const assistantMessage = response.choices[0].message;
    messages.push(assistantMessage);

    const toolCallNames = assistantMessage.tool_calls?.map((tc: { function: { name: string } }) => tc.function.name) || [];
    console.log(`🔧 [${operation}] Tool calls:`, toolCallNames);

    const toolResults = await processToolCalls(assistantMessage.tool_calls!);
    
    // Log tool results and collect them for later use
    for (let i = 0; i < toolResults.length; i++) {
      const result = toolResults[i];
      const toolName = toolCallNames[i];
      console.log(`🔧 [${operation}] Tool result:`, result.content.slice(0, 300));
      
      // Store tool result by tool name
      try {
        collectedToolResults[toolName] = JSON.parse(result.content);
      } catch {
        collectedToolResults[toolName] = result.content;
      }
    }
    
    messages.push(...toolResults);

    response = await callOpenAIWithRetry(openai, {
      model: MODEL,
      messages,
      tools: operationTools,
      tool_choice: "auto",
    }, operation);
  }
  
  const finalResponse = response.choices[0].message.content || "";
  console.log(`🤖 [${operation}] LLM response:`, finalResponse.slice(0, 500));

  return {
    response: finalResponse,
    toolResults: collectedToolResults,
  };
}

/**
 * Generate login page HTML
 */
export async function generateLoginPage(params: {
  client_id: string;
  client_name: string;
  redirect_uri: string;
  scope: string;
  state: string;
  nonce?: string;
  code_challenge?: string;
  code_challenge_method?: string;
  response_type: string;
  error?: string;
}): Promise<string> {
  const prompt = `Generate a login page for:
- Client Application: ${params.client_name}
- Client ID: ${params.client_id}
- Requested Scopes: ${params.scope}
- Redirect URI: ${params.redirect_uri}
- State: ${params.state}
- Nonce: ${params.nonce || ""}
- Code Challenge: ${params.code_challenge || ""}
- Code Challenge Method: ${params.code_challenge_method || ""}
- Response Type: ${params.response_type}
${params.error ? `- Error to display: ${params.error}` : ""}

Remember to include all these as hidden form fields.`;

  const result = await callLLM("login_page", prompt);
  return result.response;
}

/**
 * Process authorization request validation
 */
export async function processAuthorizationRequest(params: {
  client_id: string;
  redirect_uri: string;
  response_type: string;
  scope: string;
  state?: string;
  nonce?: string;
  code_challenge?: string;
  code_challenge_method?: string;
}): Promise<{ valid: boolean; error?: string; error_description?: string; client_name?: string; requested_scope?: string }> {
  const prompt = `Validate this authorization request:
- client_id: ${params.client_id}
- redirect_uri: ${params.redirect_uri}
- response_type: ${params.response_type}
- scope: ${params.scope}
- state: ${params.state || ""}
- nonce: ${params.nonce || ""}
- code_challenge: ${params.code_challenge || ""}
- code_challenge_method: ${params.code_challenge_method || ""}`;

  const result = await callLLM("authorization", prompt);
  return JSON.parse(result.response);
}

/**
 * Process user authentication
 */
export async function processAuthentication(params: {
  username: string;
  password: string;
  client_id: string;
  redirect_uri: string;
  scope: string;
  state: string;
  nonce?: string;
  code_challenge?: string;
  code_challenge_method?: string;
}): Promise<{ success: boolean; redirect_url?: string; error?: string; error_description?: string }> {
  const prompt = `Authenticate user and generate authorization code:
- username: ${params.username}
- password: ${params.password}
- client_id: ${params.client_id}
- redirect_uri: ${params.redirect_uri}
- scope: ${params.scope}
- state: ${params.state}
- nonce: ${params.nonce || ""}
- code_challenge: ${params.code_challenge || ""}
- code_challenge_method: ${params.code_challenge_method || ""}`;

  const result = await callLLM("authenticate", prompt);
  
  // Parse LLM response
  let llmResult: { success: boolean; code_created?: boolean; error?: string; error_description?: string };
  try {
    llmResult = JSON.parse(result.response);
  } catch {
    console.error("Failed to parse LLM response:", result.response);
    return { success: false, error: "server_error", error_description: "Failed to parse authentication response" };
  }
  
  // If authentication failed, return the error
  if (!llmResult.success) {
    return {
      success: false,
      error: llmResult.error || "invalid_credentials",
      error_description: llmResult.error_description || "Authentication failed",
    };
  }
  
  // Get authorization code from tool results
  const codeResult = result.toolResults["create_authorization_code"] as { code?: string } | undefined;
  if (!codeResult?.code) {
    console.error("Authorization code not found in tool results:", result.toolResults);
    return { success: false, error: "server_error", error_description: "Failed to generate authorization code" };
  }
  
  // Build redirect URL with code and state
  const redirectUrl = new URL(params.redirect_uri);
  redirectUrl.searchParams.set("code", codeResult.code);
  redirectUrl.searchParams.set("state", params.state);
  
  return {
    success: true,
    redirect_url: redirectUrl.toString(),
  };
}

/**
 * Process token exchange
 */
export async function processTokenExchange(params: {
  grant_type: string;
  code: string;
  redirect_uri: string;
  client_id: string;
  client_secret?: string;
  code_verifier?: string;
}): Promise<Record<string, unknown>> {
  const prompt = `Process token exchange request:
- grant_type: ${params.grant_type}
- code: ${params.code}
- redirect_uri: ${params.redirect_uri}
- client_id: ${params.client_id}
- client_secret: ${params.client_secret || ""}
- code_verifier: ${params.code_verifier || ""}`;

  const result = await callLLM("token", prompt);
  return JSON.parse(result.response);
}

/**
 * Process userinfo request
 */
export async function processUserinfo(accessToken: string): Promise<Record<string, unknown>> {
  const prompt = `Get user information for access token: ${accessToken}`;

  const result = await callLLM("userinfo", prompt);
  return JSON.parse(result.response);
}
