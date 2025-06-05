import React, { useEffect, useState } from "react";
import { useAuth } from "~/lib/authContext";
import { LoginForm } from "./LoginForm";
import { AuthHeader } from "./AuthHeader";
import { ConfigService } from "~/lib/configService";
import { AuthService } from "~/lib/authService";
import { useTheme } from "~/lib/theme";

interface AuthWrapperProps {
  children: React.ReactNode;
}

export const AuthWrapper: React.FC<AuthWrapperProps> = ({ children }) => {
  // Use the centralized auth context instead of local state
  const { authStatus, userInfo, isLoading, login, logout, refreshAuth } =
    useAuth();

  const [executionMode, setExecutionMode] = useState<string | null>(null);
  const [executionModeLoading, setExecutionModeLoading] = useState(true);
  const [autoLoginAttempted, setAutoLoginAttempted] = useState(false);

  // Auto-login effect for development (GitHub only)
  useEffect(() => {
    const attemptGitHubAutoLogin = async () => {
      if (autoLoginAttempted || process.env.NODE_ENV !== "development") {
        return;
      }

      try {
        // Only try GitHub auto-connect if we have a token
        const response = await fetch("/api/auth/github/auto-connect", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
        });

        if (response.ok) {
          const result = await response.json();
          console.log(`✅ GitHub auto-connected using ${result.source}`);
          await refreshAuth();
        }
      } catch (error) {
        // Silently fail - no need to log errors for missing tokens
      } finally {
        setAutoLoginAttempted(true);
      }
    };

    attemptGitHubAutoLogin();
  }, [autoLoginAttempted, refreshAuth]);

  // Check execution mode on component mount
  useEffect(() => {
    const checkExecutionMode = async () => {
      try {
        const modeConfig = await ConfigService.getExecutionMode();
        setExecutionMode(modeConfig.mode);
      } catch (error) {
        console.error("Failed to get execution mode:", error);
        // Default to 'api' if we can't determine the mode
        setExecutionMode("api");
      } finally {
        setExecutionModeLoading(false);
      }
    };

    checkExecutionMode();
  }, []);

  const handleLoginSuccess = async () => {
    console.log("Login successful, refreshing auth status...");
    // Use the context's refreshAuth method
    await refreshAuth();
  };

  const handleLogout = async () => {
    console.log("Logging out...");
    await logout();
  };

  // Show loading state while checking execution mode or auth
  if (isLoading || executionModeLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gray-50 dark:bg-gray-900">
        <div className="text-center">
          {/* <div className="w-16 h-16 bg-blue-600 rounded-full flex items-center justify-center mx-auto mb-4 animate-pulse">
            <span className="text-white text-2xl font-bold">H</span>
          </div> */}
          <div className="mx-auto mb-4 flex flex h-16 h-8 w-16 w-8 animate-pulse items-center items-center justify-center justify-center rounded-full rounded-full">
            <img
              src="https://huggingface.co/front/assets/huggingface_logo-noborder.svg"
              alt="Logo"
              className="w-16 rounded-full"
            />
          </div>
          <p className="text-gray-600 dark:text-gray-400">Loading...</p>
        </div>
      </div>
    );
  }

  // If using Docker execution mode, show simplified auth header
  if (executionMode === "docker") {
    return (
      <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
        <DockerModeHeader />
        {children}
      </div>
    );
  }

  // For API mode, require authentication
  // Show login form if not authenticated
  if (!authStatus.isAuthenticated || !authStatus.hasHuggingFace) {
    return <LoginForm onSuccess={handleLoginSuccess} login={login} />;
  }

  // Show authenticated app for API mode
  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
      <AuthHeader
        authStatus={authStatus}
        userInfo={userInfo}
        onLogout={handleLogout}
      />
      {children}
    </div>
  );
};

// Docker Mode Header Component with GitHub authentication
const DockerModeHeader: React.FC = () => {
  const { theme, setTheme } = useTheme();
  const [dockerAuthStatus, setDockerAuthStatus] = useState({
    hasGitHub: false,
    githubUserInfo: null as any,
  });
  const [showGitHubModal, setShowGitHubModal] = useState(false);
  const [githubConfig, setGithubConfig] = useState<any>(null);

  useEffect(() => {
    // Check GitHub configuration
    checkGitHubConfig();
    // Check current auth status for GitHub
    checkDockerAuthStatus();

    // Listen for window focus to refresh auth status
    const handleFocus = () => {
      checkDockerAuthStatus();
    };

    window.addEventListener("focus", handleFocus);

    return () => {
      window.removeEventListener("focus", handleFocus);
    };
  }, []);

  const checkGitHubConfig = async () => {
    try {
      const response = await fetch("/api/auth/github/config");
      if (response.ok) {
        const config = await response.json();
        setGithubConfig(config);
      } else {
        // Default config if endpoint doesn't exist yet
        setGithubConfig({
          methods: {
            oauth: { available: false, recommended: false },
            pat: { available: true, recommended: true },
          },
          defaultMethod: "pat",
          showBothOptions: false,
          isDevelopment: true,
        });
      }
    } catch (error) {
      console.error("Error checking GitHub config:", error);
      // Default to PAT-only mode
      setGithubConfig({
        methods: {
          oauth: { available: false, recommended: false },
          pat: { available: true, recommended: true },
        },
        defaultMethod: "pat",
        showBothOptions: false,
        isDevelopment: true,
      });
    }
  };

  const checkDockerAuthStatus = async () => {
    try {
      const authStatus = await AuthService.getAuthStatus();
      setDockerAuthStatus({
        hasGitHub: authStatus.hasGitHub || false,
        githubUserInfo: authStatus.githubUserInfo,
      });
    } catch (error) {
      console.error("Error checking Docker auth status:", error);
    }
  };

  const handleGitHubConnect = async (
    method: "oauth" | "pat",
    token?: string
  ) => {
    if (method === "oauth") {
      AuthService.startGitHubOAuth2Login();
      // Refresh auth status after a delay to catch the GitHub connection
      setTimeout(() => {
        checkDockerAuthStatus();
      }, 3000);
    } else if (method === "pat" && token) {
      // Handle PAT connection
      connectWithPAT(token);
    }
  };

  const tryAutoConnectGitHub = async () => {
    try {
      const response = await fetch("/api/auth/github/auto-connect", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
      });

      if (response.ok) {
        const result = await response.json();
        console.log(`✅ GitHub auto-connected using ${result.source}`);
        checkDockerAuthStatus();
        return true;
      }
    } catch (error) {
      console.warn("GitHub auto-connect failed:", error);
    }
    return false;
  };

  const handleGitHubConnectClick = async () => {
    // First try auto-connect with environment variables
    const autoConnected = await tryAutoConnectGitHub();

    // If auto-connect failed, show the manual connection modal
    if (!autoConnected) {
      setShowGitHubModal(true);
    }
  };

  const connectWithPAT = async (token: string) => {
    try {
      const response = await fetch("/api/auth/github/connect-pat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token }),
      });

      if (response.ok) {
        setShowGitHubModal(false);
        checkDockerAuthStatus(); // Refresh the auth status
        alert("✅ GitHub connected successfully!");
      } else {
        const error = await response.json();
        alert(`❌ Failed to connect: ${error.error || "Unknown error"}`);
      }
    } catch (error) {
      console.error("PAT connection failed:", error);
      alert("❌ Connection failed. Please try again.");
    }
  };

  const handleGitHubDisconnect = async () => {
    // Show confirmation dialog
    const confirmed = confirm(
      "Are you sure you want to disconnect GitHub? You will lose access to private repositories until you reconnect."
    );

    if (!confirmed) return;

    try {
      // Clear the GitHub auth by logging out and refreshing
      await AuthService.logout();
      // Refresh the auth status to reflect the change
      checkDockerAuthStatus();
      // Refresh the page to ensure all components update
      window.location.reload();
    } catch (error) {
      console.error("Error disconnecting GitHub:", error);
      alert("Failed to disconnect GitHub. Please try again.");
    }
  };

  return (
    <header className="border-b border-gray-200 bg-white dark:border-gray-700 dark:bg-gray-800">
      <div className="mx-auto max-w-6xl px-4 sm:px-6 lg:px-8">
        <div className="flex h-16 items-center justify-between">
          <div className="flex items-center gap-4">
            <div className="flex items-center">
              <img
                src="https://huggingface.co/front/assets/huggingface_logo-noborder.svg"
                alt="Logo"
                className="mr-3 h-8 w-8 rounded-full"
              />
              <h1 className="text-xl font-semibold text-gray-900 dark:text-gray-100">
                hugex
              </h1>
              <span className="ml-2 rounded-full bg-green-100 px-2 py-1 text-xs text-green-800 dark:bg-green-900 dark:text-green-200">
                Docker Mode
              </span>
            </div>
          </div>

          <div className="flex items-center gap-4">
            {/* Theme Toggle */}
            <div className="flex items-center gap-1 rounded-lg bg-gray-100 p-1 dark:bg-gray-700">
              <button
                onClick={() => setTheme("light")}
                className={`rounded p-1.5 text-xs transition-colors ${
                  theme === "light"
                    ? "bg-white text-gray-900 shadow-sm dark:bg-gray-600 dark:text-gray-100"
                    : "text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-300"
                }`}
                title="Light mode"
              >
                <i className="fas fa-sun"></i>
              </button>
              <button
                onClick={() => setTheme("dark")}
                className={`rounded p-1.5 text-xs transition-colors ${
                  theme === "dark"
                    ? "bg-white text-gray-900 shadow-sm dark:bg-gray-600 dark:text-gray-100"
                    : "text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-300"
                }`}
                title="Dark mode"
              >
                <i className="fas fa-moon"></i>
              </button>
              <button
                onClick={() => setTheme("system")}
                className={`rounded p-1.5 text-xs transition-colors ${
                  theme === "system"
                    ? "bg-white text-gray-900 shadow-sm dark:bg-gray-600 dark:text-gray-100"
                    : "text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-300"
                }`}
                title="System preference"
              >
                <i className="fas fa-desktop"></i>
              </button>
            </div>

            {/* GitHub Connection - ALWAYS SHOW */}
            <div className="group relative">
              {dockerAuthStatus.hasGitHub ? (
                <button className="flex items-center gap-2 text-sm text-gray-600 transition-colors hover:text-gray-900 dark:text-gray-400 dark:hover:text-gray-100">
                  <div className="flex h-6 w-6 items-center justify-center rounded-full bg-green-100 dark:bg-green-900">
                    <svg
                      className="h-3 w-3 text-green-600 dark:text-green-400"
                      fill="currentColor"
                      viewBox="0 0 20 20"
                    >
                      <path
                        fillRule="evenodd"
                        d="M10 0C4.477 0 0 4.484 0 10.017c0 4.425 2.865 8.18 6.839 9.504.5.092.682-.217.682-.483 0-.237-.008-.868-.013-1.703-2.782.605-3.369-1.343-3.369-1.343-.454-1.158-1.11-1.466-1.11-1.466-.908-.62.069-.608.069-.608 1.003.07 1.531 1.032 1.531 1.032.892 1.53 2.341 1.088 2.91.832.092-.647.35-1.088.636-1.338-2.22-.253-4.555-1.113-4.555-4.951 0-1.093.39-1.988 1.029-2.688-.103-.253-.446-1.272.098-2.65 0 0 .84-.27 2.75 1.026A9.564 9.564 0 0110 4.844c.85.004 1.705.115 2.504.337 1.909-1.296 2.747-1.027 2.747-1.027.546 1.379.203 2.398.1 2.651.64.7 1.028 1.595 1.028 2.688 0 3.848-2.339 4.695-4.566 4.942.359.31.678.921.678 1.856 0 1.338-.012 2.419-.012 2.747 0 .268.18.58.688.482A10.019 10.019 0 0020 10.017C20 4.484 15.522 0 10 0z"
                        clipRule="evenodd"
                      />
                    </svg>
                  </div>
                  <span className="text-xs font-medium">
                    {dockerAuthStatus.githubUserInfo?.username || "GitHub"}
                  </span>
                  <svg
                    className="h-4 w-4 flex-shrink-0"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M19 9l-7 7-7-7"
                    />
                  </svg>
                </button>
              ) : (
                <button
                  onClick={handleGitHubConnectClick}
                  className="flex items-center gap-2 rounded-md border border-gray-300 px-3 py-1.5 text-sm text-gray-700 transition-colors hover:bg-gray-50 dark:border-gray-600 dark:text-gray-300 dark:hover:bg-gray-700"
                >
                  <svg
                    className="h-4 w-4"
                    fill="currentColor"
                    viewBox="0 0 20 20"
                  >
                    <path
                      fillRule="evenodd"
                      d="M10 0C4.477 0 0 4.484 0 10.017c0 4.425 2.865 8.18 6.839 9.504.5.092.682-.217.682-.483 0-.237-.008-.868-.013-1.703-2.782.605-3.369-1.343-3.369-1.343-.454-1.158-1.11-1.466-1.11-1.466-.908-.62.069-.608.069-.608 1.003.07 1.531 1.032 1.531 1.032.892 1.53 2.341 1.088 2.91.832.092-.647.35-1.088.636-1.338-2.22-.253-4.555-1.113-4.555-4.951 0-1.093.39-1.988 1.029-2.688-.103-.253-.446-1.272.098-2.65 0 0 .84-.27 2.75 1.026A9.564 9.564 0 0110 4.844c.85.004 1.705.115 2.504.337 1.909-1.296 2.747-1.027 2.747-1.027.546 1.379.203 2.398.1 2.651.64.7 1.028 1.595 1.028 2.688 0 3.848-2.339 4.695-4.566 4.942.359.31.678.921.678 1.856 0 1.338-.012 2.419-.012 2.747 0 .268.18.58.688.482A10.019 10.019 0 0020 10.017C20 4.484 15.522 0 10 0z"
                      clipRule="evenodd"
                    />
                  </svg>
                  Connect GitHub
                </button>
              )}

              {/* Dropdown for connected GitHub */}
              {dockerAuthStatus.hasGitHub && (
                <div className="invisible absolute right-0 top-full z-50 mt-2 w-64 rounded-lg border border-gray-200 bg-white opacity-0 shadow-lg transition-all duration-200 group-hover:visible group-hover:opacity-100 dark:border-gray-700 dark:bg-gray-800">
                  <div className="space-y-3 p-4">
                    <div className="text-xs font-medium uppercase tracking-wide text-gray-500 dark:text-gray-400">
                      GitHub Account
                    </div>

                    <div className="space-y-2">
                      <div className="flex items-center justify-between text-sm">
                        <span className="text-gray-600 dark:text-gray-400">
                          Status:
                        </span>
                        <span className="font-medium text-green-600 dark:text-green-400">
                          Connected
                        </span>
                      </div>

                      {dockerAuthStatus.githubUserInfo && (
                        <>
                          <div className="flex items-center justify-between text-sm">
                            <span className="text-gray-600 dark:text-gray-400">
                              Username:
                            </span>
                            <span className="font-medium text-gray-900 dark:text-gray-100">
                              @{dockerAuthStatus.githubUserInfo.username}
                            </span>
                          </div>
                          {dockerAuthStatus.githubUserInfo.name && (
                            <div className="flex items-center justify-between text-sm">
                              <span className="text-gray-600 dark:text-gray-400">
                                Name:
                              </span>
                              <span className="text-gray-900 dark:text-gray-100">
                                {dockerAuthStatus.githubUserInfo.name}
                              </span>
                            </div>
                          )}
                        </>
                      )}
                    </div>

                    <div className="border-t border-gray-200 pt-3 dark:border-gray-600">
                      <button
                        onClick={handleGitHubDisconnect}
                        className="mb-3 flex w-full items-center rounded px-2 py-2 text-left text-sm text-red-600 transition-colors hover:bg-red-50 hover:text-red-800 dark:text-red-400 dark:hover:bg-red-900/20 dark:hover:text-red-300"
                      >
                        <svg
                          className="mr-2 h-4 w-4"
                          fill="none"
                          stroke="currentColor"
                          viewBox="0 0 24 24"
                        >
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeWidth={2}
                            d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1"
                          />
                        </svg>
                        Disconnect GitHub
                      </button>

                      <p className="text-xs text-gray-500 dark:text-gray-400">
                        Access private repositories for coding tasks
                      </p>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* GitHub Connection Modal */}
      {showGitHubModal && (
        <GitHubConnectionModal
          onClose={() => setShowGitHubModal(false)}
          onConnect={handleGitHubConnect}
          githubConfig={githubConfig}
        />
      )}
    </header>
  );
};

// Simple GitHub Connection Modal Component
const GitHubConnectionModal: React.FC<{
  onClose: () => void;
  onConnect: (method: "oauth" | "pat", token?: string) => void;
  githubConfig: any;
}> = ({ onClose, onConnect, githubConfig }) => {
  const [method, setMethod] = useState<"oauth" | "pat">(
    githubConfig?.defaultMethod || "pat"
  );
  const [patToken, setPATToken] = useState("");
  const [isValidating, setIsValidating] = useState(false);

  const handlePATConnect = async () => {
    if (!patToken.trim()) return;

    setIsValidating(true);
    try {
      // Validate the PAT by making a test API call
      const response = await fetch("/api/auth/github/validate-pat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token: patToken }),
      });

      if (response.ok) {
        onConnect("pat", patToken);
        onClose();
      } else {
        const error = await response.json();
        alert(
          `Invalid GitHub token: ${error.error || "Please check your token and try again."}`
        );
      }
    } catch (error) {
      alert("Failed to validate token. Please try again.");
    } finally {
      setIsValidating(false);
    }
  };

  const oauthAvailable = githubConfig?.methods?.oauth?.available || false;
  const patAvailable = githubConfig?.methods?.pat?.available !== false; // Default to true

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50 p-4">
      <div className="w-full max-w-md rounded-lg bg-white p-6 dark:bg-gray-800">
        <h2 className="mb-4 text-xl font-semibold text-gray-900 dark:text-gray-100">
          Connect GitHub Account
        </h2>

        {/* Method Selection */}
        {oauthAvailable && patAvailable && (
          <div className="mb-4">
            <div className="mb-3 flex space-x-2">
              {oauthAvailable && (
                <button
                  onClick={() => setMethod("oauth")}
                  className={`rounded px-3 py-2 text-sm ${
                    method === "oauth"
                      ? "bg-blue-500 text-white"
                      : "bg-gray-200 text-gray-700 dark:bg-gray-600 dark:text-gray-300"
                  }`}
                >
                  OAuth
                </button>
              )}
              <button
                onClick={() => setMethod("pat")}
                className={`rounded px-3 py-2 text-sm ${
                  method === "pat"
                    ? "bg-blue-500 text-white"
                    : "bg-gray-200 text-gray-700 dark:bg-gray-600 dark:text-gray-300"
                }`}
              >
                Personal Access Token (Recommended)
              </button>
            </div>
          </div>
        )}

        {/* OAuth Method */}
        {method === "oauth" && oauthAvailable && (
          <div>
            <p className="mb-4 text-gray-600 dark:text-gray-400">
              Use GitHub OAuth for secure authentication. This will redirect you
              to GitHub to authorize access to your repositories.
            </p>
            <button
              onClick={() => onConnect("oauth")}
              className="w-full rounded bg-gray-900 px-4 py-2 text-white hover:bg-gray-800"
            >
              Sign in with GitHub
            </button>
          </div>
        )}

        {/* PAT Method */}
        {method === "pat" && (
          <div>
            <p className="mb-3 text-gray-600 dark:text-gray-400">
              Enter a GitHub Personal Access Token with{" "}
              <code className="rounded bg-gray-100 px-1 dark:bg-gray-700">
                repo
              </code>{" "}
              scope.
            </p>
            <div className="mb-3">
              <label className="mb-1 block text-sm font-medium text-gray-900 dark:text-gray-100">
                Personal Access Token
              </label>
              <input
                type="password"
                value={patToken}
                onChange={(e) => setPATToken(e.target.value)}
                placeholder="ghp_xxxxxxxxxxxxxxxxxxxx"
                className="w-full rounded border border-gray-300 px-3 py-2 text-sm dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100"
              />
            </div>
            <div className="mb-4 text-xs text-gray-500 dark:text-gray-400">
              <a
                href="https://github.com/settings/tokens/new?scopes=repo&description=HugeX%20Local%20Development"
                target="_blank"
                rel="noopener noreferrer"
                className="text-blue-500 hover:underline"
              >
                Create a new token here
              </a>{" "}
              with "repo" scope selected.
            </div>
            <button
              onClick={handlePATConnect}
              disabled={!patToken.trim() || isValidating}
              className="w-full rounded bg-green-600 px-4 py-2 text-white hover:bg-green-700 disabled:bg-gray-400"
            >
              {isValidating ? "Validating..." : "Connect with Token"}
            </button>
          </div>
        )}

        {/* OAuth Not Available Warning */}
        {method === "oauth" && !oauthAvailable && (
          <div className="mb-4 rounded bg-amber-50 p-3 text-amber-600 dark:bg-amber-900/20">
            <p className="text-sm">
              OAuth is not configured for this instance. Please use a Personal
              Access Token or ask your administrator to configure GitHub OAuth.
            </p>
          </div>
        )}

        <button
          onClick={onClose}
          className="mt-3 w-full rounded bg-gray-200 px-4 py-2 text-gray-700 hover:bg-gray-300 dark:bg-gray-600 dark:text-gray-300 dark:hover:bg-gray-500"
        >
          Cancel
        </button>
      </div>
    </div>
  );
};
