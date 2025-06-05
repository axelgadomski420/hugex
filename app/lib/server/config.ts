// Server configuration
export const serverConfig = {
  // Job execution mode: 'api' for remote execution, 'docker' for local
  EXECUTION_MODE: process.env.EXECUTION_MODE || "api",

  // Docker settings
  DOCKER: {
    IMAGE: process.env.DOCKER_IMAGE || "codex-universal-explore:dev", // Default to local dev image
    MEMORY_LIMIT: process.env.DOCKER_MEMORY_LIMIT
      ? parseInt(process.env.DOCKER_MEMORY_LIMIT)
      : 512 * 1024 * 1024, // 512MB
    CPU_SHARES: process.env.DOCKER_CPU_SHARES
      ? parseInt(process.env.DOCKER_CPU_SHARES)
      : 512,
    TIMEOUT: process.env.DOCKER_TIMEOUT
      ? parseInt(process.env.DOCKER_TIMEOUT)
      : 2 * 60 * 60 * 1000, // 2 hours (same as API timeout)
  },

  // Hugging Face API settings
  HUGGINGFACE_API: {
    BASE_URL: "https://huggingface.co/api/jobs/",
    // Note: TOKEN is provided by users at runtime through the UI
    TIMEOUT_SECONDS: 10 * 60, // 10 minutes
    POLL_INTERVAL: 10000, // 10 seconds
    MAX_POLL_ATTEMPTS: 3 * 60, // 3*10 minutes total
  },

  // Repository settings (configurable via environment variables)
  REPO: {
    URL: process.env.REPO_URL || "https://github.com/drbh/cleanplate", // Default repo, override with REPO_URL env var
    BRANCH: process.env.REPO_BRANCH || "main", // Default branch, override with REPO_BRANCH env var
  },

  // Cookie name for authentication
  COOKIE_NAME: "hugex_auth",

  // OAuth2 settings
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
      process.env.NODE_ENV === "development", // Enable in development for demo
  },

  // GitHub OAuth2 settings
  GITHUB_OAUTH2: {
    CLIENT_ID: process.env.GITHUB_CLIENT_ID,
    CLIENT_SECRET: process.env.GITHUB_CLIENT_SECRET,
    CALLBACK_URL:
      process.env.GITHUB_CALLBACK_URL ||
      "http://localhost:3000/api/auth/github/callback",
    SCOPES: "repo read:user user:email", // repo for private repo access, read:user for profile, user:email for email
    ENABLED: !!(
      process.env.GITHUB_CLIENT_ID && process.env.GITHUB_CLIENT_SECRET
    ),
  },
};

// Note: API keys (OpenAI, Hugging Face) are provided by users at runtime through the UI
// No server startup validation needed for these credentials

export default serverConfig;
