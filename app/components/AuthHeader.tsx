import React, { useState, useEffect, useRef } from "react";
import { AuthService, AuthStatus } from "~/lib/authService";
import { useTheme } from "~/lib/theme";
import { ApiKeyModal } from "~/components/ApiKeyModal";

interface AuthHeaderProps {
  authStatus: AuthStatus;
  onLogout: () => void;
  userInfo?: {
    username: string;
    fullName: string;
    avatarUrl: string;
  } | null;
}

export const AuthHeader: React.FC<AuthHeaderProps> = ({
  authStatus,
  onLogout,
  userInfo: externalUserInfo,
}) => {
  const { theme, setTheme, resolvedTheme } = useTheme();
  const [userInfo, setUserInfo] = useState<{
    username: string;
    fullName: string;
    avatarUrl: string;
  } | null>(externalUserInfo || null);
  const [githubOAuth2Available, setGithubOAuth2Available] = useState(false);
  const [isApiKeyModalOpen, setIsApiKeyModalOpen] = useState(false);

  const prevAuthStatusRef = useRef(authStatus);

  // Update user info when external userInfo changes or auth status changes
  useEffect(() => {
    // Check GitHub OAuth2 availability
    AuthService.isGitHubOAuth2Available().then(setGithubOAuth2Available);

    const prevAuthStatus = prevAuthStatusRef.current;
    const hasChanged =
      prevAuthStatus.isAuthenticated !== authStatus.isAuthenticated ||
      prevAuthStatus.hasHuggingFace !== authStatus.hasHuggingFace;

    if (hasChanged) {
      console.log("AuthHeader: Auth status actually changed:", {
        from: {
          isAuthenticated: prevAuthStatus.isAuthenticated,
          hasHuggingFace: prevAuthStatus.hasHuggingFace,
        },
        to: {
          isAuthenticated: authStatus.isAuthenticated,
          hasHuggingFace: authStatus.hasHuggingFace,
        },
      });
    }

    prevAuthStatusRef.current = authStatus;

    // If external userInfo is provided, use it
    if (externalUserInfo) {
      setUserInfo(externalUserInfo);
      return;
    }

    // If auth status has user info, use it directly
    if (authStatus.hfUserInfo) {
      console.log(
        "AuthHeader: Using user info from auth status:",
        authStatus.hfUserInfo
      );
      setUserInfo(authStatus.hfUserInfo);
      return;
    }

    // Only fetch if authenticated, otherwise clear user info
    if (!authStatus.isAuthenticated) {
      setUserInfo(null);
      return;
    }

    // Fallback: Use the async getCredentials method if external userInfo is not provided
    const fetchUserInfo = async () => {
      try {
        const credentials = await AuthService.getCredentials();

        if (credentials?.hfUserInfo) {
          console.log(
            "AuthHeader: Setting user info from credentials:",
            credentials.hfUserInfo
          );
          setUserInfo(credentials.hfUserInfo);
        } else {
          console.log("AuthHeader: No user info found in credentials");
          setUserInfo(null);
        }
      } catch (error) {
        console.error("Error fetching credentials:", error);
        setUserInfo(null);
      }
    };

    fetchUserInfo();
  }, [
    authStatus.isAuthenticated,
    authStatus.hasHuggingFace,
    authStatus.hfUserInfo,
    externalUserInfo,
  ]); // Include externalUserInfo and authStatus.hfUserInfo in dependencies

  // // Also check immediately on mount and periodically
  // useEffect(() => {
  //   const checkUserInfo = async () => {
  //     try {
  //       const credentials = await AuthService.getCredentials();
  //       if (credentials?.hfUserInfo && !userInfo) {
  //         console.log(
  //           "AuthHeader: Found user info on check:",
  //           credentials.hfUserInfo
  //         );
  //         setUserInfo(credentials.hfUserInfo);
  //       }
  //     } catch (error) {
  //       console.error("Error in periodic user info check:", error);
  //     }
  //   };

  //   // Check immediately
  //   checkUserInfo();

  //   // Check every 2 seconds for the first 10 seconds after mount
  //   // This helps catch cases where the cookie takes time to be set
  //   const interval = setInterval(checkUserInfo, 2000);
  //   setTimeout(() => clearInterval(interval), 10000);

  //   return () => clearInterval(interval);
  // }, [userInfo]);

  const handleLogout = async () => {
    await AuthService.logout();
    setUserInfo(null);
    onLogout();
  };

  const formatExpiryTime = (expiresAt?: Date) => {
    if (!expiresAt) return "";

    const now = new Date();
    const diff = expiresAt.getTime() - now.getTime();
    const days = Math.floor(diff / (1000 * 60 * 60 * 24));
    const hours = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));

    if (days > 0) return `${days}d ${hours}h`;
    if (hours > 0) return `${hours}h`;
    return "< 1h";
  };

  const displayName = userInfo?.username || userInfo?.fullName || "User";

  return (
    <div className="border-b border-gray-200 bg-white dark:border-gray-700 dark:bg-gray-800">
      <div className="mx-auto max-w-6xl px-4 sm:px-6 lg:px-8">
        <div className="flex h-16 items-center justify-between">
          <div className="flex items-center gap-4">
            <div className="flex h-8 w-8 items-center justify-center rounded-full">
              <img
                src="https://huggingface.co/front/assets/huggingface_logo-noborder.svg"
                alt="Logo"
                className="w-7 rounded-full md:mr-2"
              />
            </div>
            <h1 className="text-xl font-semibold text-gray-900 dark:text-gray-100">
              Hugex
            </h1>
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

            {/* User Menu */}
            <div className="group relative">
              <button className="flex items-center gap-2 text-sm text-gray-600 transition-colors hover:text-gray-900 dark:text-gray-400 dark:hover:text-gray-100">
                <span className="max-w-32 truncate" title={displayName}>
                  {displayName}
                </span>
                <div className="flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-full bg-gray-100">
                  {userInfo?.avatarUrl ? (
                    <img
                      src={userInfo.avatarUrl}
                      alt={displayName}
                      className="h-6 w-6 rounded-full"
                      onError={(e) => {
                        // Fallback to checkmark if avatar fails to load
                        (e.target as HTMLImageElement).style.display = "none";
                      }}
                    />
                  ) : (
                    <svg
                      className="h-3 w-3 text-white"
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M5 13l4 4L19 7"
                      />
                    </svg>
                  )}
                </div>
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

              {/* Dropdown Menu */}
              <div className="invisible absolute right-0 top-full z-50 mt-2 w-64 rounded-lg border border-gray-200 bg-white opacity-0 shadow-lg transition-all duration-200 group-hover:visible group-hover:opacity-100 dark:border-gray-700 dark:bg-gray-800">
                <div className="space-y-3 p-4">
                  <div className="text-xs font-medium uppercase tracking-wide text-gray-500 dark:text-gray-400">
                    Session Info
                  </div>

                  <div className="space-y-2">
                    {userInfo && (
                      <>
                        <div className="flex items-center justify-between text-sm">
                          <span className="text-gray-600 dark:text-gray-400">
                            User:
                          </span>
                          <span className="max-w-32 truncate font-medium text-gray-900 dark:text-gray-100">
                            {displayName}
                          </span>
                        </div>
                        {userInfo.fullName &&
                          userInfo.fullName !== userInfo.username && (
                            <div className="flex items-center justify-between text-sm">
                              <span className="text-gray-600 dark:text-gray-400">
                                Name:
                              </span>
                              <span className="max-w-32 truncate text-gray-900 dark:text-gray-100">
                                {userInfo.fullName}
                              </span>
                            </div>
                          )}
                      </>
                    )}

                    <div className="flex items-center justify-between text-sm">
                      <span className="text-gray-600 dark:text-gray-400">
                        Status:
                      </span>
                      <span className="font-medium text-green-600 dark:text-green-400">
                        Active
                      </span>
                    </div>

                    {authStatus.expiresAt && (
                      <div className="flex items-center justify-between text-sm">
                        <span className="text-gray-600 dark:text-gray-400">
                          Expires in:
                        </span>
                        <span className="font-medium text-gray-900 dark:text-gray-100">
                          {formatExpiryTime(authStatus.expiresAt)}
                        </span>
                      </div>
                    )}

                    {/* GitHub Connection Status */}
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-gray-600 dark:text-gray-400">
                        GitHub:
                      </span>
                      <div className="flex items-center gap-2">
                        {authStatus.hasGitHub ? (
                          <>
                            <span className="font-medium text-green-600 dark:text-green-400">
                              Connected
                            </span>
                            {authStatus.githubUserInfo && (
                              <span className="text-xs text-gray-500 dark:text-gray-400">
                                @{authStatus.githubUserInfo.username}
                              </span>
                            )}
                          </>
                        ) : (
                          <span className="text-gray-500 dark:text-gray-400">
                            Not connected
                          </span>
                        )}
                      </div>
                    </div>
                  </div>

                  <div className="border-t border-gray-200 pt-3 dark:border-gray-600">
                    {/* GitHub Account Actions */}
                    {githubOAuth2Available && (
                      <>
                        {authStatus.hasGitHub ? (
                          <button
                            onClick={() => {
                              // For now, just show that it's connected
                              // In a full implementation, you might want to add a disconnect option
                              alert(
                                "GitHub account is connected. Private repositories are now accessible."
                              );
                            }}
                            className="flex w-full items-center rounded px-2 py-2 text-left text-sm text-gray-700 transition-colors hover:bg-gray-100 hover:text-gray-900 dark:text-gray-300 dark:hover:bg-gray-700 dark:hover:text-gray-100"
                          >
                            <svg
                              className="mr-2 h-4 w-4"
                              fill="currentColor"
                              viewBox="0 0 20 20"
                            >
                              <path
                                fillRule="evenodd"
                                d="M10 0C4.477 0 0 4.484 0 10.017c0 4.425 2.865 8.18 6.839 9.504.5.092.682-.217.682-.483 0-.237-.008-.868-.013-1.703-2.782.605-3.369-1.343-3.369-1.343-.454-1.158-1.11-1.466-1.11-1.466-.908-.62.069-.608.069-.608 1.003.07 1.531 1.032 1.531 1.032.892 1.53 2.341 1.088 2.91.832.092-.647.35-1.088.636-1.338-2.22-.253-4.555-1.113-4.555-4.951 0-1.093.39-1.988 1.029-2.688-.103-.253-.446-1.272.098-2.65 0 0 .84-.27 2.75 1.026A9.564 9.564 0 0110 4.844c.85.004 1.705.115 2.504.337 1.909-1.296 2.747-1.027 2.747-1.027.546 1.379.203 2.398.1 2.651.64.7 1.028 1.595 1.028 2.688 0 3.848-2.339 4.695-4.566 4.942.359.31.678.921.678 1.856 0 1.338-.012 2.419-.012 2.747 0 .268.18.58.688.482A10.019 10.019 0 0020 10.017C20 4.484 15.522 0 10 0z"
                                clipRule="evenodd"
                              />
                            </svg>
                            GitHub Connected
                          </button>
                        ) : (
                          <button
                            onClick={() => AuthService.startGitHubOAuth2Login()}
                            className="flex w-full items-center rounded px-2 py-2 text-left text-sm text-gray-700 transition-colors hover:bg-gray-100 hover:text-gray-900 dark:text-gray-300 dark:hover:bg-gray-700 dark:hover:text-gray-100"
                          >
                            <svg
                              className="mr-2 h-4 w-4"
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

                        <div className="px-2 py-1">
                          <p className="text-xs text-gray-500 dark:text-gray-400">
                            {authStatus.hasGitHub
                              ? "Access private repositories for coding tasks"
                              : "Connect to access private repositories"}
                          </p>
                        </div>
                      </>
                    )}

                    {/* API Key Management */}
                    <button
                      onClick={() => setIsApiKeyModalOpen(true)}
                      className="flex w-full items-center rounded px-2 py-2 text-left text-sm text-gray-700 transition-colors hover:bg-gray-100 hover:text-gray-900 dark:text-gray-300 dark:hover:bg-gray-700 dark:hover:text-gray-100"
                    >
                      <i className="fas fa-key mr-2 h-4 w-4"></i>
                      API Key
                    </button>
                    {/* <button
                      onClick={() => AuthService.extendSession()}
                      className="w-full text-left text-sm text-gray-700 dark:text-gray-300 hover:text-gray-900 dark:hover:text-gray-100 py-2 px-2 rounded hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors flex items-center"
                    >
                      <i className="fas fa-sync-alt mr-2"></i>Extend Session
                    </button> */}

                    <button
                      onClick={handleLogout}
                      className="flex w-full items-center rounded px-2 py-2 text-left text-sm text-red-600 transition-colors hover:bg-red-50 hover:text-red-800 dark:text-red-400 dark:hover:bg-red-900/20 dark:hover:text-red-300"
                    >
                      <i className="fas fa-sign-out-alt mr-2"></i>Sign Out
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* API Key Modal */}
      <ApiKeyModal
        isOpen={isApiKeyModalOpen}
        onClose={() => setIsApiKeyModalOpen(false)}
      />
    </div>
  );
};
