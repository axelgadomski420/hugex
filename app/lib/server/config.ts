// Enhanced server configuration with GitHub auto-connect
export const serverConfig = {
  // Job execution mode: 'api' for remote execution, 'docker' for local
  EXECUTION_MODE: process.env.EXECUTION_MODE || "api",

  // Docker settings
  DOCKER: {
    IMAGE: process.env.DOCKER_IMAGE || "codex-universal-explore:dev",
    MEMORY_LIMIT: process.env.DOCKER_MEMORY_LIMIT
      ? parseInt(process.env.DOCKER_MEMORY_LIMIT)
      : 512 * 1024 * 1024, // 512MB
    CPU_SHARES: process.env.DOCKER_CPU_SHARES
      ? parseInt(process.env.DOCKER_CPU_SHARES)
      : 512,
    TIMEOUT: process.env.DOCKER_TIMEOUT
      ? parseInt(process.env.DOCKER_TIMEOUT)
      : 2 * 60 * 60 * 1000, // 2 hours
  },

  // Hugging Face API settings
  HUGGINGFACE_API: {
    BASE_URL: "https://huggingface.co/api/jobs/",
    TIMEOUT_SECONDS: 10 * 60, // 10 minutes
    POLL_INTERVAL: 10000, // 10 seconds
    MAX_POLL_ATTEMPTS: 3 * 60, // 3*10 minutes total
  },

  // Repository settings
  REPO: {
    URL: process.env.REPO_URL || "https://github.com/drbh/cleanplate",
    BRANCH: process.env.REPO_BRANCH || "main",
  },

  // Cookie name for authentication
  COOKIE_NAME: "hugex_auth",

  // OAuth2 settings (HuggingFace)
  OAUTH2: {
    PROVIDER_URL: process.env.OPENID_PROVIDER_URL || "https://huggingface.co",
    CLIENT_ID: process.env.OPENID_CLIENT_ID,
    CLIENT_SECRET: process.env.OPENID_CLIENT_SECRET,
    CALLBACK_URL:
      process.env.OPENID_CALLBACK_URL ||
      "http://localhost:3000/api/auth/callback",
    SCOPES: "openid profile jobs-api",
    ENABLED:
      !!(process.env.OPENID_CLIENT_ID && process.env.OPENID_CLIENT_SECRET) ||
      process.env.NODE_ENV === "development",
  },

  // GitHub OAuth2 settings
  GITHUB_OAUTH2: {
    CLIENT_ID: process.env.GITHUB_CLIENT_ID,
    CLIENT_SECRET: process.env.GITHUB_CLIENT_SECRET,
    CALLBACK_URL:
      process.env.GITHUB_CALLBACK_URL ||
      "http://localhost:3000/api/auth/github/callback",
    SCOPES: "repo read:user user:email",
    ENABLED: !!(
      process.env.GITHUB_CLIENT_ID && process.env.GITHUB_CLIENT_SECRET
    ),
  },

  // GitHub PAT settings (simplified)
  GITHUB: {
    OAUTH: {
      CLIENT_ID: process.env.GITHUB_CLIENT_ID,
      CLIENT_SECRET: process.env.GITHUB_CLIENT_SECRET,
      CALLBACK_URL:
        process.env.GITHUB_CALLBACK_URL ||
        "http://localhost:3000/api/auth/github/callback",
      SCOPES: "repo read:user user:email",
      ENABLED: !!(
        process.env.GITHUB_CLIENT_ID &&
        process.env.GITHUB_CLIENT_SECRET &&
        process.env.GITHUB_CLIENT_ID !== "demo-client-id"
      ),
    },

    PAT: {
      ENABLED: process.env.GITHUB_ALLOW_PAT !== "false",
      REQUIRED_SCOPES: ["repo"],
    },

    // Development auto-connect
    DEV_TOKEN: process.env.GH_TOKEN || process.env.GITHUB_TOKEN,

    FEATURES: {
      ALLOW_PAT:
        process.env.NODE_ENV === "development" ||
        process.env.GITHUB_ALLOW_PAT === "true",
      DEFAULT_METHOD: process.env.NODE_ENV === "development" ? "pat" : "oauth",
      SHOW_BOTH_OPTIONS: process.env.GITHUB_SHOW_BOTH_OPTIONS === "true",
    },
  },

  // Development convenience (simplified)
  DEVELOPMENT: {
    OPENAI_API_KEY:
      process.env.NODE_ENV === "development"
        ? process.env.OPENAI_API_KEY
        : null,
    HUGGINGFACE_TOKEN:
      process.env.NODE_ENV === "development"
        ? process.env.HUGGINGFACE_TOKEN || process.env.HF_TOKEN
        : null,
  },
};

// Helper function for GitHub auto-connect
export function getGitHubDevToken() {
  if (process.env.NODE_ENV !== "development") {
    return null;
  }
  return serverConfig.GITHUB.DEV_TOKEN || null;
}

// Helper function to get GitHub auth configuration
export function getGitHubAuthConfig() {
  const { GITHUB } = serverConfig;
  const devToken = getGitHubDevToken();

  return {
    oauthAvailable: GITHUB.OAUTH.ENABLED,
    patAvailable: GITHUB.FEATURES.ALLOW_PAT,
    defaultMethod: GITHUB.FEATURES.DEFAULT_METHOD,
    showBothOptions:
      GITHUB.FEATURES.SHOW_BOTH_OPTIONS ||
      (GITHUB.OAUTH.ENABLED && GITHUB.FEATURES.ALLOW_PAT),
    isDevelopment: process.env.NODE_ENV === "development",
    hasDevToken: !!devToken,
    devTokenSource: devToken
      ? process.env.GH_TOKEN
        ? "GH_TOKEN"
        : "GITHUB_TOKEN"
      : null,
  };
}

export default serverConfig;
