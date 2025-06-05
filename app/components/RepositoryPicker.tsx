import React, { useState, useEffect } from "react";
import { RecentDataService } from "~/lib/recentDataService";
import type { GitHubRepository } from "~/lib/githubAPIService";
import { AuthService } from "~/lib/authService";

interface RepositoryPickerProps {
  selectedRepo: string;
  onRepoSelect: (repo: string, defaultBranch?: string) => void;
  onClose: () => void;
}

export const RepositoryPicker: React.FC<RepositoryPickerProps> = ({
  selectedRepo,
  onRepoSelect,
  onClose,
}) => {
  const [searchInput, setSearchInput] = useState("");
  const [recentRepos, setRecentRepos] = useState<any[]>([]);
  const [githubRepos, setGithubRepos] = useState<GitHubRepository[]>([]);
  const [loadingGithubRepos, setLoadingGithubRepos] = useState(false);
  const [isGithubConnected, setIsGithubConnected] = useState(false);

  useEffect(() => {
    // Load recent repositories
    setRecentRepos(RecentDataService.getRecentRepositories());

    // Check GitHub connection and fetch repos
    checkGitHubConnection();
  }, []);

  const checkGitHubConnection = async () => {
    try {
      const authStatus = await AuthService.getAuthStatus();
      console.log("🔍 Repository Picker - Auth Status:", {
        isAuthenticated: authStatus.isAuthenticated,
        hasHuggingFace: authStatus.hasHuggingFace,
        hasGitHub: authStatus.hasGitHub,
        hfUserInfo: !!authStatus.hfUserInfo,
        githubUserInfo: !!authStatus.githubUserInfo,
      });

      const isConnected = authStatus.hasGitHub || false;
      setIsGithubConnected(isConnected);

      console.log(`🔗 GitHub connected: ${isConnected}`);

      if (isConnected) {
        fetchGitHubRepositories();
      }
    } catch (error) {
      console.error("Error checking GitHub connection:", error);
      setIsGithubConnected(false);
    }
  };

  const fetchGitHubRepositories = async (searchQuery?: string) => {
    if (loadingGithubRepos) return;

    setLoadingGithubRepos(true);
    try {
      const params = new URLSearchParams();
      if (searchQuery) {
        params.set("search", searchQuery);
      }

      const response = await fetch(`/api/github/repositories?${params}`);
      const data = await response.json();

      if (response.ok) {
        setGithubRepos(data.repositories || []);
      } else {
        console.error("Failed to fetch GitHub repositories:", data.error);
        setGithubRepos([]);
      }
    } catch (error) {
      console.error("Error fetching GitHub repositories:", error);
      setGithubRepos([]);
    } finally {
      setLoadingGithubRepos(false);
    }
  };

  const handleSearch = (value: string) => {
    setSearchInput(value);

    // Debounce GitHub search
    if (isGithubConnected && value.trim()) {
      const timeoutId = setTimeout(() => {
        fetchGitHubRepositories(value);
      }, 300);
      return () => clearTimeout(timeoutId);
    }
  };

  const handleRepoSelect = (repoUrl: string, defaultBranch?: string) => {
    onRepoSelect(repoUrl, defaultBranch);
    RecentDataService.setSelectedRepository(repoUrl);
    setRecentRepos(RecentDataService.getRecentRepositories());

    // Auto-set default branch if available
    if (defaultBranch) {
      RecentDataService.setSelectedBranch(defaultBranch);
    }

    onClose();
  };

  const handleManualEntry = () => {
    if (searchInput.trim()) {
      handleRepoSelect(searchInput.trim());
      setSearchInput("");
    }
  };

  return (
    <div className="absolute bottom-full left-0 z-10 mb-2 max-h-96 w-80 overflow-hidden rounded-lg border border-gray-200 bg-white shadow-lg dark:border-gray-700 dark:bg-gray-800">
      {/* Search Input */}
      <div className="border-b border-gray-200 p-3 dark:border-gray-600">
        <input
          type="text"
          placeholder="Type or search repositories..."
          value={searchInput}
          onChange={(e) => handleSearch(e.target.value)}
          onKeyPress={(e) => {
            if (e.key === "Enter" && searchInput.trim()) {
              handleManualEntry();
            }
          }}
          className="w-full rounded-md border border-gray-300 bg-gray-50 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 dark:border-gray-600 dark:bg-gray-700"
          autoFocus
        />

        {/* Manual entry option */}
        {searchInput.trim() && (
          <div className="mt-2">
            <div
              className="flex cursor-pointer items-center gap-2 rounded border border-blue-200 bg-blue-50 px-3 py-2 text-sm hover:bg-blue-100 dark:border-blue-700 dark:bg-blue-900/30 dark:hover:bg-blue-900/50"
              onClick={handleManualEntry}
            >
              <i className="fas fa-plus text-xs text-blue-600 dark:text-blue-400"></i>
              <span className="text-blue-700 dark:text-blue-300">
                Use "{searchInput.trim()}"
              </span>
            </div>
          </div>
        )}
      </div>

      <div className="max-h-80 overflow-y-auto">
        {console.log("🎨 Repository Picker Render:", {
          isGithubConnected,
          githubRepos: githubRepos.length,
          loadingGithubRepos,
        })}

        {/* My GitHub Repositories */}
        {isGithubConnected && (
          <div className="border-b border-gray-200 dark:border-gray-600">
            <div className="bg-gray-50 px-3 py-2 dark:bg-gray-700">
              <div className="flex items-center gap-2 text-xs font-medium uppercase tracking-wide text-gray-600 dark:text-gray-400">
                <svg
                  className="h-3 w-3"
                  fill="currentColor"
                  viewBox="0 0 20 20"
                >
                  <path
                    fillRule="evenodd"
                    d="M10 0C4.477 0 0 4.484 0 10.017c0 4.425 2.865 8.18 6.839 9.504.5.092.682-.217.682-.483 0-.237-.008-.868-.013-1.703-2.782.605-3.369-1.343-3.369-1.343-.454-1.158-1.11-1.466-1.11-1.466-.908-.62.069-.608.069-.608 1.003.07 1.531 1.032 1.531 1.032.892 1.53 2.341 1.088 2.91.832.092-.647.35-1.088.636-1.338-2.22-.253-4.555-1.113-4.555-4.951 0-1.093.39-1.988 1.029-2.688-.103-.253-.446-1.272.098-2.65 0 0 .84-.27 2.75 1.026A9.564 9.564 0 0110 4.844c.85.004 1.705.115 2.504.337 1.909-1.296 2.747-1.027 2.747-1.027.546 1.379.203 2.398.1 2.651.64.7 1.028 1.595 1.028 2.688 0 3.848-2.339 4.695-4.566 4.942.359.31.678.921.678 1.856 0 1.338-.012 2.419-.012 2.747 0 .268.18.58.688.482A10.019 10.019 0 0020 10.017C20 4.484 15.522 0 10 0z"
                    clipRule="evenodd"
                  />
                </svg>
                My GitHub
                {loadingGithubRepos && (
                  <i className="fas fa-spinner fa-spin text-xs"></i>
                )}
              </div>
            </div>

            {loadingGithubRepos ? (
              <div className="px-3 py-4 text-center text-sm text-gray-500 dark:text-gray-400">
                <i className="fas fa-spinner fa-spin mr-2"></i>
                Loading repositories...
              </div>
            ) : githubRepos.length > 0 ? (
              <div className="max-h-48 overflow-y-auto">
                {githubRepos
                  .filter(
                    (repo) =>
                      !searchInput ||
                      repo.name
                        .toLowerCase()
                        .includes(searchInput.toLowerCase()) ||
                      repo.full_name
                        .toLowerCase()
                        .includes(searchInput.toLowerCase()) ||
                      (repo.description &&
                        repo.description
                          .toLowerCase()
                          .includes(searchInput.toLowerCase()))
                  )
                  .slice(0, 20)
                  .map((repo) => (
                    <div
                      key={repo.id}
                      className="cursor-pointer border-b border-gray-100 px-3 py-2 last:border-b-0 hover:bg-gray-100 dark:border-gray-700 dark:hover:bg-gray-700"
                      onClick={() =>
                        handleRepoSelect(repo.clone_url, repo.default_branch)
                      }
                    >
                      <div className="flex items-start gap-2">
                        <div className="mt-0.5 flex items-center gap-1">
                          {repo.private ? (
                            <i
                              className="fas fa-lock text-xs text-yellow-500"
                              title="Private repository"
                            ></i>
                          ) : (
                            <i
                              className="fas fa-unlock text-xs text-green-500"
                              title="Public repository"
                            ></i>
                          )}
                          {repo.fork && (
                            <i
                              className="fas fa-code-branch text-xs text-gray-400"
                              title="Forked repository"
                            ></i>
                          )}
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="truncate text-sm font-medium text-gray-900 dark:text-gray-100">
                            {repo.name}
                          </div>
                          <div className="truncate text-xs text-gray-500 dark:text-gray-400">
                            {repo.full_name}
                          </div>
                          {repo.description && (
                            <div className="mt-1 truncate text-xs text-gray-400 dark:text-gray-500">
                              {repo.description}
                            </div>
                          )}
                          <div className="mt-1 flex items-center gap-2">
                            {repo.language && (
                              <span className="rounded bg-gray-200 px-1.5 py-0.5 text-xs dark:bg-gray-600">
                                {repo.language}
                              </span>
                            )}
                            {repo.stargazers_count > 0 && (
                              <span className="flex items-center gap-1 text-xs text-gray-400">
                                <i className="fas fa-star text-yellow-400"></i>
                                {repo.stargazers_count}
                              </span>
                            )}
                            <span className="text-xs text-gray-400">
                              {repo.default_branch}
                            </span>
                          </div>
                        </div>
                      </div>
                    </div>
                  ))}
              </div>
            ) : (
              <div className="px-3 py-3 text-center text-sm text-gray-500 dark:text-gray-400">
                {searchInput
                  ? "No repositories found"
                  : "No repositories available"}
              </div>
            )}
          </div>
        )}

        {/* Recent Repositories */}
        <div>
          <div className="bg-gray-50 px-3 py-2 dark:bg-gray-700">
            <div className="text-xs font-medium uppercase tracking-wide text-gray-600 dark:text-gray-400">
              Recent Repositories
            </div>
          </div>
          <div className="max-h-32 overflow-y-auto">
            {recentRepos.length === 0 ? (
              <div className="px-3 py-2 text-sm italic text-gray-500 dark:text-gray-400">
                No recent repositories. Enter a repository name above.
              </div>
            ) : (
              recentRepos
                .filter(
                  (repo) =>
                    !searchInput ||
                    repo.name.toLowerCase().includes(searchInput.toLowerCase())
                )
                .map((repo) => (
                  <div
                    key={repo.url}
                    className="flex cursor-pointer items-center gap-2 px-3 py-2 text-sm hover:bg-gray-100 dark:hover:bg-gray-700"
                    onClick={() => handleRepoSelect(repo.url)}
                  >
                    <i className="fas fa-history text-xs text-gray-400"></i>
                    <span className="truncate">{repo.name}</span>
                  </div>
                ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
