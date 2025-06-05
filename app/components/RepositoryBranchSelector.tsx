import React from "react";
import { RepositoryPicker } from "./RepositoryPicker";
import { RecentDataService } from "~/lib/recentDataService";

interface RepositoryBranchSelectorProps {
  selectedRepo: string;
  selectedBranch: string;
  showRepoDropdown: boolean;
  showBranchDropdown: boolean;
  recentBranches: any[];
  branchSearchInput: string;
  onRepoDropdownToggle: () => void;
  onBranchDropdownToggle: () => void;
  onRepoSelect: (repoUrl: string, defaultBranch?: string) => void;
  onBranchSelect: (branch: string) => void;
  onBranchSearchChange: (value: string) => void;
  onClose: () => void;
}

export const RepositoryBranchSelector = ({
  selectedRepo,
  selectedBranch,
  showRepoDropdown,
  showBranchDropdown,
  recentBranches,
  branchSearchInput,
  onRepoDropdownToggle,
  onBranchDropdownToggle,
  onRepoSelect,
  onBranchSelect,
  onBranchSearchChange,
  onClose,
}: RepositoryBranchSelectorProps) => {
  return (
    <div className="flex items-center gap-3">
      {/* Repository Dropdown */}
      <div className="relative">
        <button
          onClick={onRepoDropdownToggle}
          className="flex items-center gap-2 rounded-md border border-gray-300 px-3 py-1.5 text-sm text-gray-700 transition-colors hover:bg-gray-100 dark:border-gray-600 dark:text-gray-300 dark:hover:bg-gray-700"
        >
          <i className="fas fa-folder text-xs text-gray-500"></i>
          <span className="max-w-40 truncate" title={selectedRepo}>
            {selectedRepo
              ? selectedRepo.includes("github.com")
                ? selectedRepo.split("/").slice(-2).join("/")
                : selectedRepo
              : "Select repository"}
          </span>
          {/* Show GitHub connection indicator if repo is from GitHub */}
          {selectedRepo?.includes("github.com") && (
            <i
              className="fas fa-link text-xs text-green-500"
              title="GitHub repository - private repos accessible if GitHub is connected"
            ></i>
          )}
          <i className="fas fa-chevron-down text-xs"></i>
        </button>

        {showRepoDropdown && (
          <RepositoryPicker
            selectedRepo={selectedRepo}
            onRepoSelect={onRepoSelect}
            onClose={onClose}
          />
        )}
      </div>

      {/* Branch Dropdown */}
      <div className="relative">
        <button
          onClick={onBranchDropdownToggle}
          className="flex items-center gap-2 rounded-md border border-gray-300 px-3 py-1.5 text-sm text-gray-700 transition-colors hover:bg-gray-100 dark:border-gray-600 dark:text-gray-300 dark:hover:bg-gray-700"
        >
          <i className="fas fa-code-branch text-xs text-gray-500"></i>
          <span>{selectedBranch || "Select branch"}</span>
          <i className="fas fa-chevron-down text-xs"></i>
        </button>

        {showBranchDropdown && (
          <div className="absolute bottom-full left-0 z-10 mb-2 w-64 rounded-lg border border-gray-200 bg-white shadow-lg dark:border-gray-700 dark:bg-gray-800">
            <div className="p-3">
              <input
                type="text"
                placeholder="Type or search branches..."
                value={branchSearchInput}
                onChange={(e) => onBranchSearchChange(e.target.value)}
                onKeyPress={(e) => {
                  if (e.key === "Enter" && branchSearchInput.trim()) {
                    onBranchSelect(branchSearchInput.trim());
                  }
                }}
                className="w-full rounded-md border border-gray-300 bg-gray-50 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 dark:border-gray-600 dark:bg-gray-700"
                autoFocus
              />
              {branchSearchInput.trim() && (
                <div className="mb-2 mt-2">
                  <div
                    className="flex cursor-pointer items-center gap-2 rounded border border-blue-200 bg-blue-50 px-3 py-2 text-sm hover:bg-blue-100 dark:border-blue-700 dark:bg-blue-900/30 dark:hover:bg-blue-900/50"
                    onClick={() => onBranchSelect(branchSearchInput.trim())}
                  >
                    <i className="fas fa-plus text-xs text-blue-600 dark:text-blue-400"></i>
                    <span className="text-blue-700 dark:text-blue-300">
                      Use "{branchSearchInput.trim()}"
                    </span>
                  </div>
                </div>
              )}
              {/* Recent Branches */}
              {recentBranches.length > 0 && (
                <div className="mb-2 border-t border-gray-200 pt-2 dark:border-gray-600">
                  <div className="mb-2 px-1 text-xs text-gray-500 dark:text-gray-400">
                    Recent branches:
                  </div>
                  <div className="max-h-24 overflow-y-auto">
                    {recentBranches
                      .filter(
                        (branch) =>
                          !branchSearchInput ||
                          branch.name
                            .toLowerCase()
                            .includes(branchSearchInput.toLowerCase())
                      )
                      .map((branch) => (
                        <div
                          key={branch.name}
                          className="flex cursor-pointer items-center gap-2 rounded px-3 py-2 text-sm hover:bg-gray-100 dark:hover:bg-gray-700"
                          onClick={() => onBranchSelect(branch.name)}
                        >
                          <i className="fas fa-history text-xs text-blue-500"></i>
                          <span>{branch.name}</span>
                        </div>
                      ))}
                  </div>
                </div>
              )}

              {/* Common Branches */}
              <div className="border-t border-gray-200 pt-2 dark:border-gray-600">
                <div className="mb-2 px-1 text-xs text-gray-500 dark:text-gray-400">
                  Common branches:
                </div>
                <div className="max-h-32 overflow-y-auto">
                  {RecentDataService.getCommonBranches()
                    .filter(
                      (branch) =>
                        !branchSearchInput ||
                        branch
                          .toLowerCase()
                          .includes(branchSearchInput.toLowerCase())
                    )
                    .map((branch) => (
                      <div
                        key={branch}
                        className="flex cursor-pointer items-center gap-2 rounded px-3 py-2 text-sm hover:bg-gray-100 dark:hover:bg-gray-700"
                        onClick={() => onBranchSelect(branch)}
                      >
                        <i className="fas fa-code-branch text-xs"></i>
                        <span>{branch}</span>
                      </div>
                    ))}
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
