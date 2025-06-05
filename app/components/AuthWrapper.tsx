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
  const [githubOAuth2Available, setGithubOAuth2Available] = useState(false);

  useEffect(() => {
    // Check GitHub OAuth2 availability
    AuthService.isGitHubOAuth2Available().then(setGithubOAuth2Available);

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

  const handleGitHubConnect = () => {
    AuthService.startGitHubOAuth2Login();

    // Refresh auth status after a delay to catch the GitHub connection
    setTimeout(() => {
      checkDockerAuthStatus();
    }, 3000);
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

            {/* GitHub Connection */}
            {githubOAuth2Available && (
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
                    onClick={handleGitHubConnect}
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
            )}
          </div>
        </div>
      </div>
    </header>
  );
};
