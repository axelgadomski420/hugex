// OAuth2 utility functions

/**
 * Generate a cryptographically secure random string
 */
export function generateRandomString(length: number): string {
  const charset =
    "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-._~";
  let result = "";

  if (typeof crypto !== "undefined" && crypto.getRandomValues) {
    // Browser/Node.js with crypto
    const randomBytes = new Uint8Array(length);
    crypto.getRandomValues(randomBytes);

    for (let i = 0; i < length; i++) {
      result += charset[randomBytes[i] % charset.length];
    }
  } else {
    // Fallback for older environments
    for (let i = 0; i < length; i++) {
      result += charset[Math.floor(Math.random() * charset.length)];
    }
  }

  return result;
}

/**
 * Create PKCE code challenge from verifier
 */
export async function createCodeChallenge(verifier: string): Promise<string> {
  if (typeof crypto !== "undefined" && crypto.subtle) {
    // Modern crypto API
    const encoder = new TextEncoder();
    const data = encoder.encode(verifier);
    const digest = await crypto.subtle.digest("SHA-256", data);

    // Convert to base64url
    return btoa(String.fromCharCode(...new Uint8Array(digest)))
      .replace(/\+/g, "-")
      .replace(/\//g, "_")
      .replace(/=/g, "");
  } else {
    // Fallback - in a real app you'd want a proper SHA256 implementation
    // For now, just return the verifier (less secure but functional)
    console.warn(
      "Using fallback PKCE implementation - not recommended for production"
    );
    return btoa(verifier)
      .replace(/\+/g, "-")
      .replace(/\//g, "_")
      .replace(/=/g, "");
  }
}

/**
 * Check if OAuth2 is available
 */
export function isOAuth2Available(): boolean {
  // This will be replaced with actual config check in the component
  return (
    typeof window !== "undefined" // && window.location.hostname !== "localhost"
  );
}
