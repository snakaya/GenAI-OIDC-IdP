# GenAI OIDC Identity Provider

🤖 A proof-of-concept OIDC Identity Provider that delegates core logic to an LLM (Large Language Model).

## Overview

This project takes an experimental approach where the main processing of an OIDC (OpenID Connect) Identity Provider is delegated to OpenAI's LLM via Function Calling.

- **Framework**: Oak (Deno)
- **LLM**: OpenAI gpt-5-mini
- **Authentication**: Username/Password
- **PKCE**: Supported (S256 and plain)

### Features

- 🧠 **LLM-Driven**: Authentication logic, validation, and login page generation are handled by LLM
- 🔐 **PKCE Support**: S256 and plain methods
- 🎨 **Dynamic UI Generation**: Login pages are generated in real-time by LLM
- 🛠️ **Function Calling**: Security functions like JWT signing are provided as Tools

## Setup

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
OPENAI_API_KEY=sk-your-openai-api-key
PORT=9052
ISSUER=http://localhost:9052
JWT_SECRET=your-super-secret-key
```

### Running

Development mode (with hot reload):

```bash
deno task dev
```

Production mode:

```bash
deno task start
```

## Testing with the Test Client

A test OIDC client (Relying Party) is included for testing.

**Terminal 1** - Start the IdP server:
```bash
deno task dev
```

**Terminal 2** - Start the test client:
```bash
deno task client
```

Then open `http://localhost:3000` in your browser and click "Login with OIDC".

## Endpoints

| Method | Path | Description |
|--------|------|-------------|
| GET | `/.well-known/openid-configuration` | OpenID Connect Discovery |
| GET | `/authorize` | Authorization Endpoint |
| POST | `/authorize/callback` | Login Form Submission |
| POST | `/token` | Token Endpoint |
| GET/POST | `/userinfo` | UserInfo Endpoint |
| GET | `/health` | Health Check |

## Test Accounts

### Clients

| Client ID | Client Secret | Redirect URIs |
|-----------|---------------|---------------|
| test-client-1 | test-secret-1 | http://localhost:3000/callback, http://localhost:8080/callback |
| test-client-2 | test-secret-2 | http://localhost:4000/auth/callback |

### Users

| Username | Password | Email |
|----------|----------|-------|
| user1 | password1 | user1@example.com |
| user2 | password2 | user2@example.com |
| admin | admin123 | admin@example.com |

## Usage Examples

### Start Authorization Flow

Open the following URL in a browser:

```
http://localhost:9052/authorize?
  client_id=test-client-1&
  redirect_uri=http://localhost:3000/callback&
  response_type=code&
  scope=openid%20profile%20email&
  state=random-state-value&
  code_challenge=YOUR_CODE_CHALLENGE&
  code_challenge_method=S256
```

### Token Exchange

```bash
curl -X POST http://localhost:9052/token \
  -H "Content-Type: application/x-www-form-urlencoded" \
  -d "grant_type=authorization_code" \
  -d "code=YOUR_AUTH_CODE" \
  -d "redirect_uri=http://localhost:3000/callback" \
  -d "client_id=test-client-1" \
  -d "client_secret=test-secret-1" \
  -d "code_verifier=YOUR_CODE_VERIFIER"
```

### Get User Info

```bash
curl http://localhost:9052/userinfo \
  -H "Authorization: Bearer YOUR_ACCESS_TOKEN"
```

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                      OIDC Client (RP)                       │
└──────────────────────────┬──────────────────────────────────┘
                           │
                           ▼
┌─────────────────────────────────────────────────────────────┐
│                   Oak Web Server (Deno)                     │
│  ┌─────────────────────────────────────────────────────────┐│
│  │                    OIDC Routes                          ││
│  │  /authorize  /token  /userinfo  /.well-known/*         ││
│  └──────────────────────────┬──────────────────────────────┘│
│                             │                               │
│  ┌──────────────────────────▼──────────────────────────────┐│
│  │                   OpenAI LLM Module                     ││
│  │                                                         ││
│  │  • Authorization request validation                     ││
│  │  • Dynamic login page generation                        ││
│  │  • User authentication processing                       ││
│  │  • Token exchange processing                            ││
│  │  • User info retrieval                                  ││
│  └──────────────────────────┬──────────────────────────────┘│
│                             │                               │
│  ┌────────────────┐  ┌──────▼─────────┐  ┌────────────────┐ │
│  │  Memory DB     │  │  JWT Tools     │  │  OpenAI API    │ │
│  │  (Clients,     │  │  (Sign/Verify) │  │  (gpt-5-mini)  │ │
│  │   Users,       │  │                │  │                │ │
│  │   Tokens)      │  │                │  │                │ │
│  └────────────────┘  └────────────────┘  └────────────────┘ │
└─────────────────────────────────────────────────────────────┘
```

## LLM Tools

Tools used with OpenAI Function Calling:

### JWT/Crypto Tools
- `generate_authorization_code` - Generate authorization code
- `generate_access_token` - Generate access token
- `generate_refresh_token` - Generate refresh token
- `create_id_token` - Create and sign ID Token (JWT)
- `verify_pkce_challenge` - Verify PKCE challenge

### Database Tools
- `get_client` - Get client information
- `validate_user_credentials` - Validate credentials
- `get_user` - Get user information
- `save_authorization_code` - Save authorization code
- `get_authorization_code` - Get authorization code
- `mark_authorization_code_used` - Mark code as used
- `save_access_token` - Save access token
- `get_access_token` - Get access token

## Project Structure

```
GenAI-OIDC-IdP/
├── deno.json                 # Deno config & dependencies
├── main.ts                   # Main server
├── test-client.ts            # Test OIDC client (RP)
├── env.example               # Environment variables template
├── README.md                 # Documentation
└── src/
    ├── db/
    │   └── memory.ts         # In-memory DB (clients, users, tokens)
    ├── llm/
    │   └── openai.ts         # OpenAI API integration & Function Calling
    ├── routes/
    │   └── oidc.ts           # OIDC endpoints
    └── tools/
        └── jwt.ts            # JWT signing & PKCE verification tools
```

## Deploying to Deno Deploy

### 1. Create a project on Deno Deploy

Go to [dash.deno.com](https://dash.deno.com) and create a new project.

### 2. Set environment variables

In the project settings, add the following environment variables:

| Variable | Description |
|----------|-------------|
| `OPENAI_API_KEY` | Your OpenAI API key |
| `JWT_SECRET` | Secret key for JWT signing |
| `ISSUER` | (Optional) Your deploy URL, e.g., `https://your-project.deno.dev` |

### 3. Deploy

**Option A: Deploy via GitHub integration**

Link your GitHub repository in Deno Deploy dashboard. It will auto-deploy on push.

Entry point: `main.ts`

**Option B: Deploy via CLI**

```bash
# Install deployctl
deno install -Arf jsr:@deno/deployctl

# Deploy
deployctl deploy --project=your-project-name main.ts
```

### 4. Update test client redirect URIs

After deploying, add your Deno Deploy URL to the client's redirect URIs in `src/db/memory.ts`:

```typescript
redirect_uris: [
  "http://localhost:3000/callback",
  "https://your-project.deno.dev/callback"
],
```

## Caveats

⚠️ **This is a Proof of Concept project**

- Not intended for production use
- In-memory DB means data is lost on restart (and on each Deno Deploy instance)
- Uses HS256 signing (RS256 recommended for production)
- LLM dependency introduces latency
- Each request incurs OpenAI API costs

## License

MIT License
