import React, { useEffect } from "react";
import type { GitHubIssue } from "~/lib/githubService";

// Simple Issue Pill that matches the exact text size
export const IssuePill = ({
  issue,
  isLoading,
  position,
  onHover,
  onLeave,
  onClick,
}: {
  issue?: GitHubIssue;
  isLoading?: boolean;
  position: { left: number; top: number; width: number; height: number };
  onHover: (e: React.MouseEvent) => void;
  onLeave: () => void;
  onClick: (e: React.MouseEvent) => void;
}) => {
  if (isLoading) {
    return (
      <span
        className="pointer-events-none absolute flex items-center justify-center rounded bg-gray-100 dark:bg-gray-700"
        style={{
          left: position.left,
          top: position.top,
          width: position.width,
          height: position.height,
        }}
      >
        <i className="fas fa-spinner fa-spin text-xs text-gray-500"></i>
      </span>
    );
  }

  if (!issue) return null;

  return (
    <span
      className={`pointer-events-auto absolute flex cursor-pointer items-center justify-center rounded transition-all duration-200 ${
        issue.state === "open"
          ? "bg-green-100 hover:bg-green-200 dark:bg-green-900/30 dark:hover:bg-green-900/50"
          : "bg-purple-100 hover:bg-purple-200 dark:bg-purple-900/30 dark:hover:bg-purple-900/50"
      }`}
      style={{
        left: position.left,
        top: position.top,
        width: position.width,
        height: position.height,
      }}
      onMouseEnter={onHover}
      onMouseLeave={onLeave}
      onClick={onClick}
      title={`#${issue.number}: ${issue.title}`}
    />
  );
};

// Utility function for safe popover positioning
const getSafePosition = (
  targetX: number,
  targetY: number,
  elementWidth: number,
  elementHeight: number,
  offset = 10
) => {
  const viewportWidth = window.innerWidth;
  const viewportHeight = window.innerHeight;
  const scrollY = window.scrollY;

  let x = targetX;
  let y = targetY + offset;

  // Adjust horizontal position if element would overflow
  if (x + elementWidth > viewportWidth) {
    x = Math.max(10, viewportWidth - elementWidth - 10);
  }

  // Adjust vertical position if element would overflow
  if (y + elementHeight > viewportHeight + scrollY) {
    y = Math.max(scrollY + 10, targetY - elementHeight - offset);
  }

  return { x, y };
};

// Issue Popover Component
export const IssuePopover = ({
  issue,
  position,
  onClose,
}: {
  issue: GitHubIssue;
  position: { x: number; y: number };
  onClose: () => void;
}) => {
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as Element;
      if (!target.closest("[data-issue-popover]")) {
        onClose();
      }
    };

    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        onClose();
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    document.addEventListener("keydown", handleEscape);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      document.removeEventListener("keydown", handleEscape);
    };
  }, [onClose]);

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
    });
  };

  const truncateBody = (body: string) => {
    return body.length > 200 ? body.substring(0, 200) + "..." : body;
  };

  const popoverWidth = 320;
  const popoverHeight = 300;
  const safePosition = getSafePosition(
    position.x,
    position.y,
    popoverWidth,
    popoverHeight
  );

  return (
    <div
      data-issue-popover
      className="fixed z-[9999] rounded-lg border border-gray-200 bg-white shadow-xl dark:border-gray-700 dark:bg-gray-800"
      style={{
        left: safePosition.x,
        top: safePosition.y,
        width: popoverWidth,
        maxHeight: popoverHeight,
      }}
    >
      <div className="p-4">
        <div className="mb-3 flex items-start justify-between">
          <div className="flex items-center gap-2">
            <span
              className={`inline-flex items-center rounded-full px-2 py-1 text-xs font-medium ${
                issue.state === "open"
                  ? "bg-green-100 text-green-800 dark:bg-green-900/20 dark:text-green-400"
                  : "bg-purple-100 text-purple-800 dark:bg-purple-900/20 dark:text-purple-400"
              }`}
            >
              <i
                className={`fas ${issue.state === "open" ? "fa-circle-dot" : "fa-check-circle"} mr-1`}
              ></i>
              {issue.state}
            </span>
            <span className="text-sm text-gray-500 dark:text-gray-400">
              #{issue.number}
            </span>
          </div>
          <button
            onClick={onClose}
            className="p-1 text-gray-400 transition-colors hover:text-gray-600 dark:hover:text-gray-200"
            aria-label="Close popover"
          >
            <i className="fas fa-times text-sm"></i>
          </button>
        </div>

        <h3 className="mb-2 font-semibold leading-tight text-gray-900 dark:text-white">
          {issue.title}
        </h3>

        <div className="mb-3 flex items-center gap-2">
          <img
            src={issue.user.avatar_url}
            alt={issue.user.login}
            className="h-5 w-5 rounded-full"
          />
          <span className="text-sm text-gray-600 dark:text-gray-400">
            {issue.user.login} opened {formatDate(issue.created_at)}
          </span>
        </div>

        {issue.labels.length > 0 && (
          <div className="mb-3 flex flex-wrap gap-1">
            {issue.labels.slice(0, 3).map((label) => (
              <span
                key={label.name}
                className="inline-flex items-center rounded-full px-2 py-1 text-xs font-medium"
                style={{
                  backgroundColor: `#${label.color}20`,
                  color: `#${label.color}`,
                  borderColor: `#${label.color}40`,
                }}
              >
                {label.name}
              </span>
            ))}
            {issue.labels.length > 3 && (
              <span className="text-xs text-gray-500 dark:text-gray-400">
                +{issue.labels.length - 3} more
              </span>
            )}
          </div>
        )}

        {issue.body && (
          <div className="max-h-32 overflow-y-auto border-t border-gray-200 pt-3 text-sm text-gray-700 dark:border-gray-600 dark:text-gray-300">
            <p className="whitespace-pre-wrap">{truncateBody(issue.body)}</p>
          </div>
        )}

        <div className="mt-3 border-t border-gray-200 pt-3 dark:border-gray-600">
          <a
            href={issue.html_url}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 text-sm text-blue-600 transition-colors hover:text-blue-800 dark:text-blue-400 dark:hover:text-blue-300"
          >
            <i className="fab fa-github text-xs"></i>
            View on GitHub
            <i className="fas fa-external-link-alt text-xs"></i>
          </a>
        </div>
      </div>
    </div>
  );
};

// Issue Autocomplete Component
export const IssueAutocomplete = ({
  issues,
  position,
  onSelect,
  onClose,
  searchTerm,
}: {
  issues: GitHubIssue[];
  position: { x: number; y: number };
  onSelect: (issue: GitHubIssue) => void;
  onClose: () => void;
  searchTerm: string;
}) => {
  const [selectedIndex, setSelectedIndex] = React.useState(0);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      switch (event.key) {
        case "ArrowDown":
          event.preventDefault();
          setSelectedIndex((prev) => Math.min(prev + 1, issues.length - 1));
          break;
        case "ArrowUp":
          event.preventDefault();
          setSelectedIndex((prev) => Math.max(prev - 1, 0));
          break;
        case "Enter":
          event.preventDefault();
          if (issues[selectedIndex]) onSelect(issues[selectedIndex]);
          break;
        case "Escape":
          event.preventDefault();
          onClose();
          break;
      }
    };

    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [issues, selectedIndex, onSelect, onClose]);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as Element;
      if (!target.closest("[data-issue-autocomplete]")) {
        onClose();
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [onClose]);

  // Reset selected index when issues change
  useEffect(() => {
    setSelectedIndex(0);
  }, [issues]);

  const autocompleteWidth = 400;
  const autocompleteHeight = Math.min(issues.length * 60 + 60, 320);
  const safePosition = getSafePosition(
    position.x,
    position.y,
    autocompleteWidth,
    autocompleteHeight,
    5
  );

  if (issues.length === 0) {
    return (
      <div
        data-issue-autocomplete
        className="fixed z-[9998] rounded-lg border border-gray-200 bg-white shadow-xl dark:border-gray-700 dark:bg-gray-800"
        style={{
          left: safePosition.x,
          top: safePosition.y,
          width: autocompleteWidth,
        }}
      >
        <div className="p-4 text-center text-sm text-gray-500 dark:text-gray-400">
          No issues found {searchTerm && `matching "${searchTerm}"`}
          <div className="mt-1 text-xs text-gray-400">
            Type issue number or search terms
          </div>
        </div>
      </div>
    );
  }

  return (
    <div
      data-issue-autocomplete
      className="fixed z-[9998] max-h-80 overflow-y-auto rounded-lg border border-gray-200 bg-white shadow-xl dark:border-gray-700 dark:bg-gray-800"
      style={{
        left: safePosition.x,
        top: safePosition.y,
        width: autocompleteWidth,
      }}
    >
      <div className="p-2">
        <div className="mb-2 px-2 text-xs text-gray-500 dark:text-gray-400">
          GitHub Issues {searchTerm && `matching "${searchTerm}"`}
        </div>
        {issues.map((issue, index) => (
          <div
            key={issue.id}
            className={`flex cursor-pointer items-center gap-3 rounded-md px-3 py-2 ${
              index === selectedIndex
                ? "bg-blue-50 dark:bg-blue-900/20"
                : "hover:bg-gray-50 dark:hover:bg-gray-700"
            }`}
            onMouseDown={(e) => {
              e.preventDefault();
              onSelect(issue);
            }}
            onMouseEnter={() => setSelectedIndex(index)}
          >
            <span
              className={`text-xs ${issue.state === "open" ? "text-green-600 dark:text-green-400" : "text-purple-600 dark:text-purple-400"}`}
            >
              <i
                className={`fas ${issue.state === "open" ? "fa-circle-dot" : "fa-check-circle"}`}
              ></i>
            </span>
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <span className="truncate text-sm font-medium text-gray-900 dark:text-white">
                  {issue.title}
                </span>
                <span className="text-xs text-gray-500 dark:text-gray-400">
                  #{issue.number}
                </span>
              </div>
              <div className="text-xs text-gray-600 dark:text-gray-400">
                by {issue.user.login}
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

// Simple Issue Pills Hover Component
export const IssueHoverPopover = ({
  issue,
  position,
}: {
  issue: GitHubIssue;
  position: { x: number; y: number };
}) => {
  const popoverWidth = 250;
  const popoverHeight = 100;
  const safePosition = getSafePosition(
    position.x,
    position.y,
    popoverWidth,
    popoverHeight,
    10
  );

  return (
    <div
      className="pointer-events-none fixed z-[9999] rounded-lg border border-gray-200 bg-white p-3 shadow-lg dark:border-gray-700 dark:bg-gray-800"
      style={{
        left: safePosition.x,
        top: safePosition.y,
        width: popoverWidth,
      }}
    >
      <div className="mb-2 flex items-center gap-2">
        <span
          className={`inline-flex items-center rounded-full px-2 py-1 text-xs font-medium ${
            issue.state === "open"
              ? "bg-green-100 text-green-800 dark:bg-green-900/20 dark:text-green-400"
              : "bg-purple-100 text-purple-800 dark:bg-purple-900/20 dark:text-purple-400"
          }`}
        >
          <i
            className={`fas ${issue.state === "open" ? "fa-circle-dot" : "fa-check-circle"} mr-1`}
          ></i>
          {issue.state}
        </span>
        <span className="text-sm text-gray-500 dark:text-gray-400">
          #{issue.number}
        </span>
      </div>
      <h4 className="mb-1 line-clamp-2 text-sm font-semibold text-gray-900 dark:text-white">
        {issue.title}
      </h4>
      <div className="flex items-center gap-2 text-xs text-gray-600 dark:text-gray-400">
        <img
          src={issue.user.avatar_url}
          alt={issue.user.login}
          className="h-4 w-4 rounded-full"
        />
        <span>{issue.user.login}</span>
      </div>
    </div>
  );
};
