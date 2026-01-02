/**
 * In-Memory Database for OIDC IdP
 * Stores clients, users, authorization codes, and tokens
 */

// Types
export interface OIDCClient {
  client_id: string;
  client_secret: string;
  redirect_uris: string[];
  client_name: string;
  grant_types: string[];
  response_types: string[];
  scope: string;
}

export interface User {
  user_id: string;
  username: string;
  password: string;
  email: string;
  name: string;
  given_name: string;
  family_name: string;
}

export interface AuthorizationCode {
  code: string;
  client_id: string;
  user_id: string;
  redirect_uri: string;
  scope: string;
  code_challenge?: string;
  code_challenge_method?: string;
  nonce?: string;
  expires_at: number;
  used: boolean;
}

export interface AccessToken {
  token: string;
  client_id: string;
  user_id: string;
  scope: string;
  expires_at: number;
}

export interface RefreshToken {
  token: string;
  client_id: string;
  user_id: string;
  scope: string;
  expires_at: number;
}

// In-Memory Storage
class MemoryDB {
  private clients: Map<string, OIDCClient> = new Map();
  private users: Map<string, User> = new Map();
  private authorizationCodes: Map<string, AuthorizationCode> = new Map();
  private accessTokens: Map<string, AccessToken> = new Map();
  private refreshTokens: Map<string, RefreshToken> = new Map();

  constructor() {
    this.initializeTestData();
  }

  private initializeTestData(): void {
    // Additional redirect URIs from environment (comma-separated)
    const additionalRedirectUris = Deno.env.get("ADDITIONAL_REDIRECT_URIS")?.split(",").map(u => u.trim()).filter(u => u) || [];

    // Register test clients
    this.clients.set("test-client-1", {
      client_id: "test-client-1",
      client_secret: "test-secret-1",
      redirect_uris: [
        "http://localhost:3000/callback",
        "http://localhost:8080/callback",
        ...additionalRedirectUris,
      ],
      client_name: "Test Application 1",
      grant_types: ["authorization_code", "refresh_token"],
      response_types: ["code"],
      scope: "openid profile email",
    });

    this.clients.set("test-client-2", {
      client_id: "test-client-2",
      client_secret: "test-secret-2",
      redirect_uris: [
        "http://localhost:4000/auth/callback",
        ...additionalRedirectUris,
      ],
      client_name: "Test Application 2",
      grant_types: ["authorization_code"],
      response_types: ["code"],
      scope: "openid profile",
    });

    // Register test users
    this.users.set("user1", {
      user_id: "user1",
      username: "user1",
      password: "password1",
      email: "user1@example.com",
      name: "Test User One",
      given_name: "Test",
      family_name: "User One",
    });

    this.users.set("user2", {
      user_id: "user2",
      username: "user2",
      password: "password2",
      email: "user2@example.com",
      name: "Test User Two",
      given_name: "Test",
      family_name: "User Two",
    });

    this.users.set("admin", {
      user_id: "admin",
      username: "admin",
      password: "admin123",
      email: "admin@example.com",
      name: "Administrator",
      given_name: "Admin",
      family_name: "User",
    });

    console.log("✅ Initialized test data: 2 clients, 3 users");
  }

  // Client operations
  getClient(clientId: string): OIDCClient | undefined {
    return this.clients.get(clientId);
  }

  getAllClients(): OIDCClient[] {
    return Array.from(this.clients.values());
  }

  // User operations
  getUser(userId: string): User | undefined {
    return this.users.get(userId);
  }

  getUserByUsername(username: string): User | undefined {
    return Array.from(this.users.values()).find((u) => u.username === username);
  }

  validateUserCredentials(username: string, password: string): User | null {
    const user = this.getUserByUsername(username);
    if (user && user.password === password) {
      return user;
    }
    return null;
  }

  // Authorization code operations
  saveAuthorizationCode(code: AuthorizationCode): void {
    this.authorizationCodes.set(code.code, code);
  }

  getAuthorizationCode(code: string): AuthorizationCode | undefined {
    return this.authorizationCodes.get(code);
  }

  markAuthorizationCodeAsUsed(code: string): void {
    const authCode = this.authorizationCodes.get(code);
    if (authCode) {
      authCode.used = true;
    }
  }

  deleteAuthorizationCode(code: string): void {
    this.authorizationCodes.delete(code);
  }

  // Access token operations
  saveAccessToken(token: AccessToken): void {
    this.accessTokens.set(token.token, token);
  }

  getAccessToken(token: string): AccessToken | undefined {
    return this.accessTokens.get(token);
  }

  deleteAccessToken(token: string): void {
    this.accessTokens.delete(token);
  }

  // Refresh token operations
  saveRefreshToken(token: RefreshToken): void {
    this.refreshTokens.set(token.token, token);
  }

  getRefreshToken(token: string): RefreshToken | undefined {
    return this.refreshTokens.get(token);
  }

  deleteRefreshToken(token: string): void {
    this.refreshTokens.delete(token);
  }

  // Cleanup expired tokens
  cleanupExpiredTokens(): void {
    const now = Date.now();

    for (const [code, authCode] of this.authorizationCodes) {
      if (authCode.expires_at < now) {
        this.authorizationCodes.delete(code);
      }
    }

    for (const [token, accessToken] of this.accessTokens) {
      if (accessToken.expires_at < now) {
        this.accessTokens.delete(token);
      }
    }

    for (const [token, refreshToken] of this.refreshTokens) {
      if (refreshToken.expires_at < now) {
        this.refreshTokens.delete(token);
      }
    }
  }
}

// Singleton instance
export const db = new MemoryDB();
