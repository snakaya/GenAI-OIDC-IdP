/**
 * OpenAI API Integration Module
 * Handles all LLM interactions for OIDC IdP operations
 */

import OpenAI from "openai";
import { jwtTools, executeToolCall } from "../tools/jwt.ts";
import { db } from "../db/memory.ts";

const getOpenAIClient = (): OpenAI => {
  return new OpenAI({
    apiKey: Deno.env.get("OPENAI_API_KEY"),
  });
};

const MODEL = "gpt-5-mini";

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
        ["generate_authorization_code", "generate_access_token", "generate_refresh_token", "create_id_token", "verify_pkce_challenge"].includes(
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
 * System prompts for different OIDC operations
 */
const SYSTEM_PROMPTS = {
  authorization: `You are an OIDC Identity Provider authorization handler.
Your job is to process authorization requests according to OAuth 2.0 and OpenID Connect specifications.

When handling an authorization request:
1. First, call get_client tool with the provided client_id
2. If the client is not found (found=false), return error "unauthorized_client"
3. If the client is found, check if the provided redirect_uri is in the client's redirect_uris array
   - The redirect_uri must EXACTLY match one of the URIs in the redirect_uris array
   - If it matches ANY URI in the array, the redirect_uri is valid
4. Validate the response_type is "code"
5. Validate the scope contains "openid"
6. If PKCE parameters (code_challenge) are present, that's fine - just validate they exist

IMPORTANT: When checking redirect_uri, compare the EXACT string from the request against EACH URI in the client's redirect_uris array. If ANY match, it's valid.

If validation fails, return JSON:
{"valid": false, "error": "<error_code>", "error_description": "<description>"}

If validation succeeds, return JSON:
{"valid": true, "client_name": "<client_name from client object>", "requested_scope": "<scope>"}

Always respond with valid JSON only, no markdown or extra text.`,

  login_page: `You are an OIDC Identity Provider login page generator.
Generate a beautiful, modern login HTML page with the following requirements:

1. Clean, professional design with a modern aesthetic
2. Form with username and password fields
3. Submit button
4. Display the client application name that's requesting access
5. Show the requested permissions/scopes
6. Include proper CSRF protection (include a hidden field with the provided state)
7. Use inline CSS for styling (no external stylesheets)
8. The form should POST to /authorize/callback
9. Include hidden fields for: client_id, redirect_uri, scope, state, nonce, code_challenge, code_challenge_method, response_type

Make the page visually appealing with:
- Modern color scheme
- Subtle gradients or shadows
- Proper typography
- Responsive design
- Good UX practices

Return ONLY the HTML content, no markdown code blocks.`,

  authenticate: `You are an OIDC Identity Provider authentication handler.
Your job is to authenticate users and generate authorization codes.

When handling authentication:
1. First, validate user credentials using validate_user_credentials tool with the provided username and password
2. If credentials are invalid (valid=false), return an error immediately
3. If credentials are valid (valid=true), you will receive the user object with user_id
4. Generate an authorization code using generate_authorization_code tool
5. Save the authorization code using save_authorization_code tool with:
   - code: the generated authorization code
   - client_id: from the request
   - user_id: from the validated user object
   - redirect_uri: from the request
   - scope: from the request
   - code_challenge: from the request (if provided)
   - code_challenge_method: from the request (if provided)
   - nonce: from the request (if provided)
6. Construct the redirect URL by appending query parameters to redirect_uri:
   - code: the authorization code
   - state: from the request

If authentication fails, return JSON:
{"success": false, "error": "invalid_credentials", "error_description": "Invalid username or password"}

If authentication succeeds, return JSON:
{"success": true, "redirect_url": "<redirect_uri>?code=<authorization_code>&state=<state>"}

IMPORTANT: Always respond with valid JSON only, no markdown or extra text.`,

  token: `You are an OIDC Identity Provider token endpoint handler.
Your job is to exchange authorization codes for tokens according to OAuth 2.0 and OpenID Connect specifications.

When handling a token request with grant_type=authorization_code:
1. Get the authorization code data using get_authorization_code tool
2. Validate the code exists and is not expired or used
3. Validate the client_id matches
4. Validate the redirect_uri matches
5. If PKCE was used, verify the code_verifier using verify_pkce_challenge tool
6. Mark the code as used using mark_authorization_code_used tool
7. Generate access_token using generate_access_token tool
8. Create id_token using create_id_token tool
9. Save the access token using save_access_token tool
10. Return the token response

Token response should include:
- access_token
- token_type: "Bearer"
- expires_in: 3600
- id_token
- scope

If validation fails, return JSON error:
- error: error code
- error_description: description

Always respond with valid JSON only.`,

  userinfo: `You are an OIDC Identity Provider userinfo endpoint handler.
Your job is to return user claims based on the access token and granted scopes.

When handling a userinfo request:
1. Get the access token data using get_access_token tool
2. Validate the token exists and is not expired
3. Get user information using get_user tool
4. Return claims based on the granted scope:
   - openid: sub (always included)
   - profile: name, given_name, family_name
   - email: email

If token is invalid or expired, return JSON error:
- error: "invalid_token"
- error_description: description

Otherwise return the user claims as JSON.
Always respond with valid JSON only.`,
};

export type OperationType = keyof typeof SYSTEM_PROMPTS;

/**
 * Call OpenAI with tools and handle tool calls
 */
export async function callLLM(
  operation: OperationType,
  userMessage: string
): Promise<string> {
  const openai = getOpenAIClient();

  console.log(`🤖 [${operation}] Calling LLM...`);
  console.log(`🤖 [${operation}] User message:`, userMessage.slice(0, 200) + "...");

  const messages: OpenAI.Chat.Completions.ChatCompletionMessageParam[] = [
    { role: "system", content: SYSTEM_PROMPTS[operation] },
    { role: "user", content: userMessage },
  ];

  let response = await openai.chat.completions.create({
    model: MODEL,
    messages,
    tools: allTools,
    tool_choice: "auto",
  });

  // Handle tool calls in a loop
  while (response.choices[0].message.tool_calls) {
    const assistantMessage = response.choices[0].message;
    messages.push(assistantMessage);

    console.log(`🔧 [${operation}] Tool calls:`, assistantMessage.tool_calls?.map((tc: { function: { name: string } }) => tc.function.name));

    const toolResults = await processToolCalls(assistantMessage.tool_calls);
    
    // Log tool results for debugging
    for (const result of toolResults) {
      console.log(`🔧 [${operation}] Tool result:`, result.content.slice(0, 300));
    }
    
    messages.push(...toolResults);

    response = await openai.chat.completions.create({
      model: MODEL,
      messages,
      tools: allTools,
      tool_choice: "auto",
    });
  }
  
  const finalResponse = response.choices[0].message.content || "";
  console.log(`🤖 [${operation}] LLM response:`, finalResponse.slice(0, 500));

  return finalResponse;
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

  return await callLLM("login_page", prompt);
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
  return JSON.parse(result);
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
  return JSON.parse(result);
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
  return JSON.parse(result);
}

/**
 * Process userinfo request
 */
export async function processUserinfo(accessToken: string): Promise<Record<string, unknown>> {
  const prompt = `Get user information for access token: ${accessToken}`;

  const result = await callLLM("userinfo", prompt);
  return JSON.parse(result);
}
