import { OAUTH_STATE_COOKIE, OAUTH_STATE_COOKIE_PLAIN, encodeOAuthState } from "@shared/const";
import { toast } from "sonner";

export { COOKIE_NAME, ONE_YEAR_MS } from "@shared/const";

// Start the Google OAuth login. Call this from an event handler or effect at
// the moment you want to navigate, e.g. `onClick={() => startLogin()}`.
export const startLogin = () => {
  const clientId = import.meta.env.VITE_GOOGLE_CLIENT_ID;
  if (!clientId) {
    console.error("[OAuth] VITE_GOOGLE_CLIENT_ID is not configured.");
    toast.error("Google Client ID is not configured. Please check .env settings.");
    return;
  }

  const redirectUri = `${window.location.origin}/api/oauth/callback`;
  const isHttps = window.location.protocol === "https:";
  const cookieName = isHttps ? OAUTH_STATE_COOKIE : OAUTH_STATE_COOKIE_PLAIN;
  const cookieAttrs = isHttps
    ? "Path=/; Max-Age=600; SameSite=None; Secure"
    : "Path=/; Max-Age=600; SameSite=Lax";

  const nonce = crypto.randomUUID();
  document.cookie = `${cookieName}=${nonce}; ${cookieAttrs}`;
  const state = encodeOAuthState({ redirectUri, nonce });

  const url = new URL("https://accounts.google.com/o/oauth2/v2/auth");
  url.searchParams.set("client_id", clientId);
  url.searchParams.set("redirect_uri", redirectUri);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("scope", "openid email profile");
  url.searchParams.set("state", state);
  url.searchParams.set("prompt", "select_account");

  window.location.href = url.toString();
};
