/**
 * System prompts index
 * Exports all endpoint-specific prompts
 */

export { authorizationPrompt } from "./authorization.ts";
export { loginPagePrompt } from "./login-page.ts";
export { authenticatePrompt } from "./authenticate.ts";
export { tokenPrompt } from "./token.ts";
export { userinfoPrompt } from "./userinfo.ts";

import { authorizationPrompt } from "./authorization.ts";
import { loginPagePrompt } from "./login-page.ts";
import { authenticatePrompt } from "./authenticate.ts";
import { tokenPrompt } from "./token.ts";
import { userinfoPrompt } from "./userinfo.ts";

/**
 * System prompts for different OIDC operations
 */
export const SYSTEM_PROMPTS = {
  authorization: authorizationPrompt,
  login_page: loginPagePrompt,
  authenticate: authenticatePrompt,
  token: tokenPrompt,
  userinfo: userinfoPrompt,
} as const;

export type OperationType = keyof typeof SYSTEM_PROMPTS;
