# GenAI OIDC Identity Provider

🤖 A proof-of-concept OIDC Identity Provider that delegates core logic to an LLM (Large Language Model).

## Overview

This project takes an experimental approach where the main processing of an OIDC (OpenID Connect) Identity Provider is delegated to OpenAI's LLM via Function Calling.

- **Framework**: Oak (Deno)
- **LLM**: OpenAI (configurable, default: gpt-5-mini)
- **Authentication**: Username/Password
- **PKCE**: Supported (S256 and plain)
- **Deployment**: Local development & Deno Deploy

### Features

- 🧠 **LLM-Driven**: Authentication logic, validation, and login page generation are handled by LLM
- 🔐 **PKCE Support**: S256 and plain methods
- 🎨 **Dynamic UI Generation**: Login pages are generated in real-time by LLM
- 🛠️ **Function Calling**: Security functions like JWT signing are provided as Tools
- ☁️ **Deno Deploy Ready**: Works on Deno Deploy with cookie-based sessions
- ⏳ **Loading States**: Animated loading screens while AI generates content

## Quick Start

### Prerequisites

- [Deno](https://deno.land/) v2.0 or higher
- OpenAI API key

### Installation

1. Clone the repository

```bash
git clone https://github.com/your-repo/GenAI-OIDC-IdP.git
cd GenAI-OIDC-IdP
```

2. Configure environment variables

```bash
cp env.example .env
```

Edit `.env` file:

```env
# Required
OPENAI_API_KEY=sk-your-openai-api-key
JWT_SECRET=your-super-secret-key

# IdP Configuration
PORT=9052
ISSUER=http://localhost:9052
OPENAI_MODEL=gpt-4o

# Client Configuration
CLIENT_PORT=3000
IDP_URL=http://localhost:9052
```

### Running Locally

**Terminal 1** - Start the IdP server (port 9052):
```bash
deno task dev
```

**Terminal 2** - Start the test client (port 3000):
```bash
deno task client
```

Then open `http://localhost:3000` in your browser and click "Login with OIDC".

### Test Credentials

| Username | Password |
|----------|----------|
| user1 | password1 |
| user2 | password2 |
| admin | admin123 |

## User Experience Flow

```
┌─────────────────────────────────────────────────────────────────┐
│  1. User clicks "Login with OIDC" on Client                    │
└─────────────────────────┬───────────────────────────────────────┘
                          ▼
┌─────────────────────────────────────────────────────────────────┐
│  2. Loading Screen: "🤖 AI is generating your login page..."   │
│     (Animated spinner, shown immediately)                       │
└─────────────────────────┬───────────────────────────────────────┘
                          ▼
┌─────────────────────────────────────────────────────────────────┐
│  3. LLM generates custom login page                            │
│     (Dark theme, modern UI, unique each time)                   │
└─────────────────────────┬───────────────────────────────────────┘
                          ▼
┌─────────────────────────────────────────────────────────────────┐
│  4. User enters credentials and submits                        │
└─────────────────────────┬───────────────────────────────────────┘
                          ▼
┌─────────────────────────────────────────────────────────────────┐
│  5. Loading Overlay: "🤖 AI is authenticating..."              │
│     (Full-page overlay with spinner)                            │
└─────────────────────────┬───────────────────────────────────────┘
                          ▼
┌─────────────────────────────────────────────────────────────────┐
│  6. LLM validates credentials, generates tokens                │
└─────────────────────────┬───────────────────────────────────────┘
                          ▼
┌─────────────────────────────────────────────────────────────────┐
│  7. Redirect to Client with authorization code                 │
└─────────────────────────────────────────────────────────────────┘
```

## Endpoints

| Method | Path | Description |
|--------|------|-------------|
| GET | `/.well-known/openid-configuration` | OpenID Connect Discovery |
| GET | `/authorize` | Authorization Endpoint (shows loading, then login) |
| GET | `/authorize/login-form` | Login form generator (called by loading page) |
| POST | `/authorize/callback` | Login Form Submission |
| POST | `/token` | Token Endpoint |
| GET/POST | `/userinfo` | UserInfo Endpoint |
| GET | `/health` | Health Check |

## Test Accounts

### Registered Clients

| Client ID | Client Secret | Redirect URIs |
|-----------|---------------|---------------|
| test-client-1 | test-secret-1 | http://localhost:3000/callback, http://localhost:8080/callback |
| test-client-2 | test-secret-2 | http://localhost:4000/auth/callback |

> **Note**: Additional redirect URIs can be added via `ADDITIONAL_REDIRECT_URIS` environment variable.

### Test Users

| Username | Password | Email |
|----------|----------|-------|
| user1 | password1 | user1@example.com |
| user2 | password2 | user2@example.com |
| admin | admin123 | admin@example.com |

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                      OIDC Client (RP)                       │
│                    (test-client.ts)                         │
└──────────────────────────┬──────────────────────────────────┘
                           │
                           ▼
┌─────────────────────────────────────────────────────────────┐
│                   Oak Web Server (Deno)                     │
│                       (main.ts)                             │
│  ┌─────────────────────────────────────────────────────────┐│
│  │                    OIDC Routes                          ││
│  │  /authorize  /token  /userinfo  /.well-known/*         ││
│  └──────────────────────────┬──────────────────────────────┘│
│                             │                               │
│  ┌──────────────────────────▼──────────────────────────────┐│
│  │                   OpenAI LLM Module                     ││
│  │                                                         ││
│  │  • Authorization request validation                     ││
│  │  • Dynamic login page generation (with loading states)  ││
│  │  • User authentication processing                       ││
│  │  • Token exchange processing                            ││
│  │  • User info retrieval                                  ││
│  └──────────────────────────┬──────────────────────────────┘│
│                             │                               │
│  ┌────────────────┐  ┌──────▼─────────┐  ┌────────────────┐ │
│  │  Memory DB     │  │  JWT Tools     │  │  OpenAI API    │ │
│  │  (Clients,     │  │  (Sign/Verify) │  │  (configurable)│ │
│  │   Users,       │  │                │  │                │ │
│  │   Tokens)      │  │                │  │                │ │
│  └────────────────┘  └────────────────┘  └────────────────┘ │
└─────────────────────────────────────────────────────────────┘
```

## LLM Tools (Function Calling)

### JWT/Crypto Tools
| Tool | Description |
|------|-------------|
| `generate_authorization_code` | Generate secure authorization code |
| `generate_access_token` | Generate access token |
| `generate_refresh_token` | Generate refresh token |
| `create_id_token` | Create and sign ID Token (JWT with HS256) |
| `verify_pkce_challenge` | Verify PKCE code challenge |

### Database Tools
| Tool | Description |
|------|-------------|
| `get_client` | Get registered client information |
| `validate_user_credentials` | Validate username/password |
| `get_user` | Get user profile information |
| `save_authorization_code` | Store authorization code |
| `get_authorization_code` | Retrieve authorization code |
| `mark_authorization_code_used` | Mark code as consumed |
| `save_access_token` | Store access token |
| `get_access_token` | Retrieve and validate access token |

## Project Structure

```
GenAI-OIDC-IdP/
├── deno.json                 # Deno config & dependencies
├── main.ts                   # IdP server entry point
├── test-client.ts            # Test OIDC client (RP)
├── env.example               # Environment variables template
├── README.md                 # Documentation
├── .gitignore
└── src/
    ├── db/
    │   └── memory.ts         # In-memory DB (clients, users, tokens)
    ├── llm/
    │   └── openai.ts         # OpenAI API integration & Function Calling
    ├── routes/
    │   └── oidc.ts           # OIDC endpoints (with loading screens)
    └── tools/
        └── jwt.ts            # JWT signing & PKCE verification tools
```

## Environment Variables

### IdP Server (main.ts)

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `OPENAI_API_KEY` | ✅ | - | Your OpenAI API key |
| `OPENAI_MODEL` | ❌ | `gpt-5-mini` | LLM model to use |
| `PORT` | ❌ | `9052` | Server port |
| `ISSUER` | ❌ | auto-detect | Issuer URL |
| `JWT_SECRET` | ✅ | - | Secret key for JWT signing |
| `ADDITIONAL_REDIRECT_URIS` | ❌ | - | Comma-separated redirect URIs |
| `TEST_CLIENT_URL` | ❌ | - | Test client URL (shown on top page) |

### Test Client (test-client.ts)

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `IDP_URL` | ❌ | `http://localhost:9052` | IdP URL |
| `CLIENT_PORT` | ❌ | `3000` | Client server port |
| `CLIENT_ID` | ❌ | `test-client-1` | OIDC client ID |
| `CLIENT_SECRET` | ❌ | `test-secret-1` | OIDC client secret |
| `SESSION_SECRET` | ❌ | auto-generated | Cookie signing secret |

## Deploying to Deno Deploy

### IdP Deployment

1. **Create a project** at [dash.deno.com](https://dash.deno.com)

2. **Set environment variables**:

| Variable | Required | Description |
|----------|----------|-------------|
| `OPENAI_API_KEY` | ✅ | Your OpenAI API key |
| `OPENAI_MODEL` | ❌ | LLM model (default: `gpt-5-mini`) |
| `JWT_SECRET` | ✅ | Secret key for JWT signing |
| `ISSUER` | ❌ | Your deploy URL (auto-detected) |
| `ADDITIONAL_REDIRECT_URIS` | ❌ | Comma-separated redirect URIs |
| `TEST_CLIENT_URL` | ❌ | Test client URL (shown on top page) |

3. **Deploy**:

```bash
# Via CLI
deno install -Arf jsr:@deno/deployctl
deployctl deploy --project=your-idp-project main.ts

# Or link GitHub repo in dashboard (Entry point: main.ts)
```

### Client Deployment

1. **Create another project** at [dash.deno.com](https://dash.deno.com)

2. **Set environment variables**:

| Variable | Required | Description |
|----------|----------|-------------|
| `IDP_URL` | ✅ | IdP URL, e.g., `https://your-idp.deno.dev` |
| `CLIENT_ID` | ❌ | Client ID (default: `test-client-1`) |
| `CLIENT_SECRET` | ❌ | Client secret (default: `test-secret-1`) |
| `SESSION_SECRET` | ❌ | Cookie signing secret |

3. **Deploy**:

```bash
deployctl deploy --project=your-client-project test-client.ts
```

4. **Update IdP redirect URIs**:

Add to IdP's `ADDITIONAL_REDIRECT_URIS`:
```
https://your-client.deno.dev/callback
```

### Example Configuration

**IdP** (`genai-oidc-idp.deno.dev`):
```
OPENAI_API_KEY=sk-...
OPENAI_MODEL=gpt-4o
JWT_SECRET=super-secret-key
ADDITIONAL_REDIRECT_URIS=https://genai-oidc-client.deno.dev/callback
TEST_CLIENT_URL=https://genai-oidc-client.deno.dev
```

**Client** (`genai-oidc-client.deno.dev`):
```
IDP_URL=https://genai-oidc-idp.deno.dev
```

## Usage Examples

### Authorization Flow (Browser)

```
https://your-idp.deno.dev/authorize?
  client_id=test-client-1&
  redirect_uri=https://your-client.deno.dev/callback&
  response_type=code&
  scope=openid%20profile%20email&
  state=random-state&
  code_challenge=YOUR_CODE_CHALLENGE&
  code_challenge_method=S256
```

### Token Exchange (API)

```bash
curl -X POST https://your-idp.deno.dev/token \
  -H "Content-Type: application/x-www-form-urlencoded" \
  -d "grant_type=authorization_code" \
  -d "code=YOUR_AUTH_CODE" \
  -d "redirect_uri=https://your-client.deno.dev/callback" \
  -d "client_id=test-client-1" \
  -d "client_secret=test-secret-1" \
  -d "code_verifier=YOUR_CODE_VERIFIER"
```

### Get User Info (API)

```bash
curl https://your-idp.deno.dev/userinfo \
  -H "Authorization: Bearer YOUR_ACCESS_TOKEN"
```

## Caveats

⚠️ **This is a Proof of Concept project**

| Limitation | Description |
|------------|-------------|
| **Not for Production** | Security not hardened for real-world use |
| **In-Memory Database** | Data lost on restart/redeploy |
| **HS256 Signing** | RS256 recommended for production |
| **LLM Latency** | Each request calls OpenAI API (loading screens help UX) |
| **API Costs** | Every authentication incurs OpenAI charges |
| **Session Handling** | Cookie-based (works across Deno Deploy instances) |

## License

MIT License
