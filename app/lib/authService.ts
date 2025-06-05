// Authentication service for API key management
export interface ApiCredentials {
  openaiApiKey: string;
  huggingfaceToken: string;
  githubToken?: string;
  hfUserInfo: HFUserInfo;
  githubUserInfo?: GitHubUserInfo;
}

export interface AuthStatus {
  isAuthenticated: boolean;
  hasOpenAI: boolean;
  hasHuggingFace: boolean;
  hasGitHub?: boolean;
  expiresAt?: Date;
  hfUserInfo?: HFUserInfo;
  githubUserInfo?: GitHubUserInfo;
}

export interface HFUserInfo {
  username: string;
  fullName: string;
  avatarUrl: string;
}

export interface GitHubUserInfo {
  username: string;
  name?: string;
  email?: string;
  avatar_url?: string;
}

export class AuthService {
  private static readonly API_ENDPOINT = "/api/auth";
  private static readonly CONFIG_ENDPOINT = "/api/auth/config";

  // Check if user is authenticated by calling backend
  static async getAuthStatus(): Promise<AuthStatus> {
    try {
      const response = await fetch(this.API_ENDPOINT, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        credentials: "include", // Include cookies in request
        body: JSON.stringify({ action: "verify" }),
      });

      if (!response.ok) {
        throw new Error(`Auth verification failed: ${response.status}`);
      }

      const result = await response.json();

      return {
        isAuthenticated: result.isAuthenticated || false,
        hasOpenAI: result.hasOpenAI || false,
        hasHuggingFace: result.hasHuggingFace || false,
        hasGitHub: result.hasGitHub || false,
        expiresAt: result.expiresAt ? new Date(result.expiresAt) : undefined,
        hfUserInfo: result.hfUserInfo,
        githubUserInfo: result.githubUserInfo,
      };
    } catch (error) {
      console.error("Failed to get auth status:", error);
      return {
        isAuthenticated: false,
        hasOpenAI: false,
        hasHuggingFace: false,
        hasGitHub: false,
        hfUserInfo: undefined,
        githubUserInfo: undefined,
      };
    }
  }

  // Authenticate via backend action
  static async authenticate(credentials: {
    openaiApiKey?: string;
    huggingfaceToken?: string;
  }): Promise<{ success: boolean; error?: string; hfUserInfo?: HFUserInfo }> {
    try {
      // Validate credentials format on client side first
      if (!this.validateCredentials(credentials)) {
        return { success: false, error: "Invalid credentials format" };
      }

      const response = await fetch(this.API_ENDPOINT, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        credentials: "include", // Include cookies in request
        body: JSON.stringify({
          action: "authenticate",
          credentials,
        }),
      });

      const result = await response.json();

      if (!response.ok) {
        return {
          success: false,
          error: result.error || `Authentication failed: ${response.status}`,
        };
      }

      return {
        success: true,
        hfUserInfo: result.hfUserInfo,
      };
    } catch (error) {
      console.error("Authentication request failed:", error);
      return {
        success: false,
        error: "Network error during authentication",
      };
    }
  }

  // Get stored credentials and verify the caller with existing auth path
  static async getCredentials(): Promise<ApiCredentials | null> {
    if (typeof window === "undefined") return null;

    // Use the existing verify endpoint to check authentication
    try {
      // First, get auth status which verifies the cookie is valid
      const status = await this.getAuthStatus();

      if (!status.isAuthenticated) {
        console.log("AuthService.getCredentials: Not authenticated");
        return null;
      }

      const userInfo = status.hfUserInfo || null;

      // Since we're getting credentials through the auth status,
      // we don't need to decrypt anything here - just return the user info
      return {
        openaiApiKey: "", // OpenAI key is handled as a regular secret now
        huggingfaceToken: "", // Token is verified server-side, not needed client-side
        hfUserInfo: userInfo || {
          username: "",
          fullName: "",
          avatarUrl: "",
        },
      };
    } catch (error) {
      console.error("Failed to get credentials:", error);
      return null;
    }
  }

  // Check if OAuth2 is available
  static async isOAuth2Available(): Promise<boolean> {
    try {
      const response = await fetch(this.CONFIG_ENDPOINT);
      if (response.ok) {
        const config = await response.json();
        return config.oauth2Enabled || false;
      }
    } catch (error) {
      console.error("Failed to check OAuth2 availability:", error);
    }
    return false;
  }

  // Check if GitHub OAuth2 is available
  static async isGitHubOAuth2Available(): Promise<boolean> {
    try {
      const response = await fetch(this.CONFIG_ENDPOINT);
      if (response.ok) {
        const config = await response.json();
        return config.githubOAuth2Enabled || false;
      }
    } catch (error) {
      console.error("Failed to check GitHub OAuth2 availability:", error);
    }
    return false;
  }

  // Start OAuth2 login flow (HuggingFace)
  static startOAuth2Login(returnTo?: string): void {
    const params = new URLSearchParams();
    if (returnTo) {
      params.set("returnTo", returnTo);
    }
    window.location.href = `/api/auth/login?${params.toString()}`;
  }

  // Start GitHub OAuth2 login flow
  static startGitHubOAuth2Login(returnTo?: string): void {
    const params = new URLSearchParams();
    if (returnTo) {
      params.set("returnTo", returnTo);
    }

    // Open GitHub OAuth in a popup window
    const popup = window.open(
      `/api/auth/github/login?${params.toString()}`,
      "github-oauth",
      "width=600,height=700,scrollbars=yes,resizable=yes"
    );

    // Simply refresh the page in 3 seconds
    setTimeout(() => {
      window.location.reload();
    }, 3000);

    // if (!popup) {
    //   alert("Popup blocked. Please allow popups for GitHub OAuth.");
    //   return;
    // }

    // // Listen for the popup to close
    // const checkClosed = setInterval(() => {
    //   if (popup?.closed) {
    //     clearInterval(checkClosed);
    //     console.log("GitHub OAuth popup closed, refreshing auth status...");
    //     // Wait a moment for cookies to be set, then refresh the page
    //     setTimeout(() => {
    //       window.location.reload();
    //     }, 500);
    //   }
    // }, 1000);

    // // Handle popup messages for error cases
    // const handleMessage = (event: MessageEvent) => {
    //   if (event.origin !== window.location.origin) return;

    //   if (event.data.type === "GITHUB_OAUTH2_ERROR") {
    //     popup.close();
    //     clearInterval(checkClosed);
    //     alert("GitHub authentication failed: " + event.data.error);
    //   }
    // };

    // window.addEventListener("message", handleMessage);

    // // Cleanup message listener when popup closes
    // const originalInterval = checkClosed;
    // const cleanupInterval = setInterval(() => {
    //   if (popup?.closed) {
    //     window.removeEventListener("message", handleMessage);
    //     clearInterval(cleanupInterval);
    //   }
    // }, 1000);
  }

  // Logout via backend action
  static async logout(): Promise<boolean> {
    try {
      const response = await fetch(this.API_ENDPOINT, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        credentials: "include", // Include cookies in request
        body: JSON.stringify({ action: "logout" }),
      });

      return response.ok;
    } catch (error) {
      console.error("Logout request failed:", error);
      return false;
    }
  }

  // Validate credential format (client-side validation)
  private static validateCredentials(credentials: {
    openaiApiKey?: string;
    huggingfaceToken?: string;
  }): boolean {
    // OpenAI API key validation (starts with sk-) - optional
    if (
      credentials.openaiApiKey &&
      !credentials.openaiApiKey.startsWith("sk-")
    ) {
      return false;
    }

    // HuggingFace token validation (starts with hf_) - required
    if (
      !credentials.huggingfaceToken ||
      !credentials.huggingfaceToken.startsWith("hf_")
    ) {
      return false;
    }

    return true;
  }

  // // Extend session by re-authenticating with existing credentials
  // static async extendSession(): Promise<boolean> {
  //   const credentials = this.getCredentials();
  //   if (!credentials) return false;

  //   const result = await this.authenticate({
  //     openaiApiKey: credentials.openaiApiKey,
  //     huggingfaceToken: credentials.huggingfaceToken,
  //   });

  //   return result.success;
  // }

  // // Convenience method for checking auth status synchronously (from cookie)
  // static getAuthStatusSync(): AuthStatus {
  //   if (typeof window === "undefined") {
  //     return {
  //       isAuthenticated: false,
  //       hasOpenAI: false,
  //       hasHuggingFace: false,
  //     };
  //   }

  //   const cookie = document.cookie;
  //   if (!cookie) {
  //     return {
  //       isAuthenticated: false,
  //       hasOpenAI: false,
  //       hasHuggingFace: false,
  //     };
  //   }

  //   try {
  //     const data = JSON.parse(atob(cookie));
  //     const now = new Date();
  //     const expiresAt = new Date(data.expiresAt);

  //     if (now > expiresAt) {
  //       return {
  //         isAuthenticated: false,
  //         hasOpenAI: false,
  //         hasHuggingFace: false,
  //       };
  //     }

  //     return {
  //       isAuthenticated: true,
  //       hasOpenAI: !!data.hasOpenAI,
  //       hasHuggingFace: !!data.hasHuggingFace,
  //       expiresAt,
  //     };
  //   } catch (error) {
  //     console.error("Failed to parse auth cookie:", error);
  //     return {
  //       isAuthenticated: false,
  //       hasOpenAI: false,
  //       hasHuggingFace: false,
  //     };
  //   }
  // }
}
