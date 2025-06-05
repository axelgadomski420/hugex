import React from "react";

interface WelcomeModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const WelcomeModal: React.FC<WelcomeModalProps> = ({
  isOpen,
  onClose,
}) => {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-black bg-opacity-50 p-4">
      <div className="my-8 flex max-h-[calc(100vh-4rem)] w-full max-w-lg flex-col rounded-lg border border-gray-300 bg-white shadow-2xl dark:border-gray-700 dark:bg-gray-800">
        {/* Header */}
        <div className="flex-shrink-0 border-b border-gray-200 p-6 dark:border-gray-700">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-gray-100 dark:bg-gray-700">
                <img
                  src="https://huggingface.co/front/assets/huggingface_logo-noborder.svg"
                  alt="hugex"
                  className="h-5 w-5"
                />
              </div>
              <div>
                <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
                  Getting Started with Hugex
                </h2>
                <p className="text-sm text-gray-500 dark:text-gray-400">
                  AI-powered coding assistant
                </p>
              </div>
            </div>
            <button
              onClick={onClose}
              className="text-gray-400 transition-colors hover:text-gray-600 dark:hover:text-gray-300"
            >
              <svg
                className="h-5 w-5"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M6 18L18 6M6 6l12 12"
                />
              </svg>
            </button>
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 space-y-5 overflow-y-auto p-6">
          {/* Environment Setup */}
          <div>
            <div className="mb-3 flex items-center gap-3">
              <div className="flex h-6 w-6 items-center justify-center rounded-full bg-gray-900 text-xs font-semibold text-white dark:bg-gray-100 dark:text-gray-900">
                1
              </div>
              <h3 className="font-medium text-gray-900 dark:text-gray-100">
                Setup Environment
              </h3>
            </div>
            <div className="ml-9 space-y-2 text-sm">
              <p className="text-gray-600 dark:text-gray-300">
                Go to <strong>Environment</strong> tab to configure:
              </p>
              <ul className="space-y-1 text-gray-600 dark:text-gray-400">
                <li className="flex items-center gap-2">
                  <span className="h-1 w-1 rounded-full bg-gray-400"></span>
                  Select a Docker image for your agent, we default to
                  drbh/codex-universal-explore:dev
                </li>
                <li className="flex items-center gap-2">
                  <span className="h-1 w-1 rounded-full bg-gray-400"></span>
                  Adjust environment/secrets as needed and steup any custom
                  prompts
                </li>
              </ul>
            </div>
          </div>

          {/* GitHub Integration */}
          <div>
            <div className="mb-3 flex items-center gap-3">
              <div className="flex h-6 w-6 items-center justify-center rounded-full bg-gray-900 text-xs font-semibold text-white dark:bg-gray-100 dark:text-gray-900">
                2
              </div>
              <h3 className="font-medium text-gray-900 dark:text-gray-100">
                Connect GitHub
              </h3>
            </div>
            <div className="ml-9 space-y-2 text-sm">
              <p className="text-gray-600 dark:text-gray-300">
                Automatic repository access and Git operations:
              </p>
              <ul className="space-y-1 text-gray-600 dark:text-gray-400">
                <li className="flex items-center gap-2">
                  <span className="h-1 w-1 rounded-full bg-gray-400"></span>
                  Browse repositories and branches
                </li>
                <li className="flex items-center gap-2">
                  <span className="h-1 w-1 rounded-full bg-gray-400"></span>
                  Create commits and pull requests
                </li>
                <li className="flex items-center gap-2">
                  <span className="h-1 w-1 rounded-full bg-gray-400"></span>
                  Reference issues (e.g., "fix issue #123")
                </li>
              </ul>
            </div>
          </div>

          {/* Create Tasks */}
          <div>
            <div className="mb-3 flex items-center gap-3">
              <div className="flex h-6 w-6 items-center justify-center rounded-full bg-gray-900 text-xs font-semibold text-white dark:bg-gray-100 dark:text-gray-900">
                3
              </div>
              <h3 className="font-medium text-gray-900 dark:text-gray-100">
                Create Coding Tasks
              </h3>
            </div>
            <div className="ml-9 space-y-2 text-sm">
              <p className="text-gray-600 dark:text-gray-300">
                Describe what to build, select repo/branch, click{" "}
                <strong>Code</strong>:
              </p>
              <div className="space-y-1 text-xs italic text-gray-500 dark:text-gray-400">
                <div>"Add search functionality to homepage"</div>
                <div>"Fix login validation bug"</div>
                <div>"Create REST API for user data"</div>
                <div>"Implement dark mode toggle"</div>
              </div>
            </div>
          </div>

          {/* Pro Tips */}
          <div className="rounded-lg bg-gray-50 p-4 dark:bg-gray-700">
            <h4 className="mb-2 text-sm font-medium text-gray-900 dark:text-gray-100">
              💡 Pro Tips
            </h4>
            <ul className="space-y-1 text-xs text-gray-600 dark:text-gray-400">
              <li className="flex items-start gap-2">
                <span className="mt-1.5 h-1 w-1 flex-shrink-0 rounded-full bg-gray-400"></span>
                <span>
                  Reference GitHub issues by number for automatic context
                </span>
              </li>
              <li className="flex items-start gap-2">
                <span className="mt-1.5 h-1 w-1 flex-shrink-0 rounded-full bg-gray-400"></span>
                <span>
                  Use custom templates in Environment for consistent coding
                  style
                </span>
              </li>
              {/* <li className="flex items-start gap-2">
                <span className="mt-1.5 h-1 w-1 flex-shrink-0 rounded-full bg-gray-400"></span>
                <span>Monitor job progress on Hugging Face jobs dashboard</span>
              </li> */}
            </ul>
          </div>
        </div>

        {/* Footer */}
        <div className="flex-shrink-0 border-t border-gray-200 bg-gray-50 px-6 py-4 dark:border-gray-700 dark:bg-gray-700/50">
          <button
            onClick={onClose}
            className="w-full rounded-md bg-gray-900 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-gray-800 dark:bg-gray-100 dark:text-gray-100 dark:hover:bg-gray-200"
          >
            Get Started
          </button>
        </div>
      </div>
    </div>
  );
};
