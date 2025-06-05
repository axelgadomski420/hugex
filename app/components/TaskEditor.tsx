import React, { useState, useEffect, useRef } from "react";
import {
  GitHubService,
  parseIssueMentions,
  type GitHubIssue,
  type IssueMention,
} from "~/lib/githubService";
import { IssueEnhancer } from "~/lib/issueEnhancer";
import {
  IssuePill,
  IssueAutocomplete,
  IssuePopover,
  IssueHoverPopover,
} from "./IssueComponents";

interface TaskEditorProps {
  taskInput: string;
  onTaskInputChange: (value: string) => void;
  onKeyPress: (e: React.KeyboardEvent) => void;
  onSubmit?: () => void; // New optional prop for Cmd+Enter submission
  selectedRepo: string;
  templateText: string;
}

export const TaskEditor = ({
  taskInput,
  onTaskInputChange,
  onKeyPress,
  onSubmit,
  selectedRepo,
  templateText,
}: TaskEditorProps) => {
  // Refs for better positioning
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  // GitHub Issues State
  const [issuePopover, setIssuePopover] = useState<{
    issue: GitHubIssue;
    position: { x: number; y: number };
  } | null>(null);

  const [issueAutocomplete, setIssueAutocomplete] = useState<{
    issues: GitHubIssue[];
    position: { x: number; y: number };
    searchTerm: string;
  } | null>(null);

  const [loadingIssues, setLoadingIssues] = useState<Set<number>>(new Set());
  const [autocompleteTimeout, setAutocompleteTimeout] =
    useState<NodeJS.Timeout | null>(null);
  const [loadedIssues, setLoadedIssues] = useState<Map<number, GitHubIssue>>(
    new Map()
  );
  const [hoveredIssue, setHoveredIssue] = useState<number | null>(null);
  const [hoverPosition, setHoverPosition] = useState<{
    x: number;
    y: number;
  } | null>(null);

  // Cleanup timeout on unmount
  useEffect(() => {
    return () => {
      if (autocompleteTimeout) {
        clearTimeout(autocompleteTimeout);
      }
    };
  }, [autocompleteTimeout]);

  // Clear local state when repository changes
  useEffect(() => {
    setLoadedIssues(new Map());
    setLoadingIssues(new Set());
  }, [selectedRepo]);

  // Parse issue mentions from task input
  const issueMentions = parseIssueMentions(taskInput);

  // Calculate pill positions using a canvas for precise text measurement
  const calculatePillPositions = () => {
    const textarea = textareaRef.current;
    if (!textarea) return [];

    const style = window.getComputedStyle(textarea);
    const font = `${style.fontSize} ${style.fontFamily}`;
    const lineHeight =
      parseInt(style.lineHeight) || parseInt(style.fontSize) * 1.2;
    const paddingLeft = parseInt(style.paddingLeft) || 0;
    const paddingTop = parseInt(style.paddingTop) || 0;

    // Create canvas for text measurement
    const canvas = document.createElement("canvas");
    const ctx = canvas.getContext("2d");
    if (!ctx) return [];
    ctx.font = font;

    return issueMentions.map((mention) => {
      const textBeforeMention = taskInput.substring(0, mention.startIndex);
      const lines = textBeforeMention.split("\n");
      const lineIndex = lines.length - 1;
      const charIndexInLine = lines[lines.length - 1].length;

      // Measure the exact width of text before the mention on the current line
      const textBeforeOnLine = lines[lineIndex];
      const xOffset = ctx.measureText(textBeforeOnLine).width;

      // Measure the exact width of the mention text
      const mentionText = `#${mention.number}`;
      const mentionWidth = ctx.measureText(mentionText).width;

      return {
        issueNumber: mention.number,
        position: {
          left: paddingLeft + xOffset,
          top: paddingTop + lineIndex * lineHeight,
          width: mentionWidth,
          height: lineHeight,
        },
      };
    });
  };

  // Auto-load issues when mentioned
  useEffect(() => {
    if (!selectedRepo) return;

    // Get unique issue numbers that need to be loaded
    const issueNumbersToLoad = issueMentions
      .map((mention) => mention.number)
      .filter(
        (number) => !loadedIssues.has(number) && !loadingIssues.has(number)
      );

    // Remove duplicates
    const uniqueIssueNumbers = [...new Set(issueNumbersToLoad)];

    if (uniqueIssueNumbers.length === 0) return;

    // Mark all issues as loading
    setLoadingIssues((prev) => {
      const newSet = new Set(prev);
      uniqueIssueNumbers.forEach((number) => newSet.add(number));
      return newSet;
    });

    // Load all issues concurrently
    const loadIssues = async () => {
      const repoUrl = selectedRepo.includes("github.com")
        ? selectedRepo
        : `https://github.com/${selectedRepo}`;

      const loadPromises = uniqueIssueNumbers.map(async (issueNumber) => {
        try {
          const issue = await GitHubService.getIssue(repoUrl, issueNumber);
          return { issueNumber, issue, error: null };
        } catch (error) {
          console.warn(`Failed to load issue #${issueNumber}:`, error);
          return { issueNumber, issue: null, error };
        }
      });

      const results = await Promise.allSettled(loadPromises);

      // Update loaded issues
      setLoadedIssues((prev) => {
        const newMap = new Map(prev);
        results.forEach((result) => {
          if (result.status === "fulfilled" && result.value.issue) {
            newMap.set(result.value.issueNumber, result.value.issue);
          }
        });
        return newMap;
      });

      // Remove from loading set
      setLoadingIssues((prev) => {
        const newSet = new Set(prev);
        uniqueIssueNumbers.forEach((number) => newSet.delete(number));
        return newSet;
      });
    };

    loadIssues();
  }, [issueMentions, selectedRepo]);

  // Handle # symbol for issue autocomplete
  const handleTaskInputChange = async (value: string) => {
    onTaskInputChange(value);

    // Clear existing timeout
    if (autocompleteTimeout) {
      clearTimeout(autocompleteTimeout);
    }

    // Check if user typed # at the end
    const textarea = textareaRef.current;
    if (!textarea) return;

    const cursorPosition = textarea.selectionStart || 0;
    const textBeforeCursor = value.substring(0, cursorPosition);
    const hashMatch = textBeforeCursor.match(/#(\d*)$/);

    if (hashMatch && selectedRepo) {
      const searchTerm = hashMatch[1];

      // Debounce the API call
      const timeout = setTimeout(async () => {
        try {
          const repoUrl = selectedRepo.includes("github.com")
            ? selectedRepo
            : `https://github.com/${selectedRepo}`;

          const issues = await GitHubService.getRepositoryIssues(
            repoUrl,
            searchTerm
          );

          if (issues.length >= 0) {
            const rect = textarea.getBoundingClientRect();
            const style = window.getComputedStyle(textarea);
            const lineHeight = parseInt(style.lineHeight) || 24;

            // Calculate cursor position
            const textBeforeCursor = value.substring(0, cursorPosition);
            const lines = textBeforeCursor.split("\n");
            const yOffset = (lines.length - 1) * lineHeight;

            setIssueAutocomplete({
              issues,
              position: {
                x: rect.left + 10,
                y: rect.top + yOffset + lineHeight + 10,
              },
              searchTerm,
            });
          }
        } catch (error) {
          console.warn("Failed to fetch issues for autocomplete:", error);
        }
      }, 300);

      setAutocompleteTimeout(timeout);
    } else {
      setIssueAutocomplete(null);
    }
  };

  // Handle issue selection from autocomplete
  const handleIssueSelect = (issue: GitHubIssue) => {
    const textarea = textareaRef.current;
    if (!textarea) return;

    const cursorPosition = textarea.selectionStart || 0;
    const currentValue = taskInput;
    const textBeforeCursor = currentValue.substring(0, cursorPosition);
    const textAfterCursor = currentValue.substring(cursorPosition);

    // Replace the # part with the full issue reference
    const hashMatch = textBeforeCursor.match(/#(\d*)$/);
    if (hashMatch) {
      const beforeHash = textBeforeCursor.substring(0, hashMatch.index);
      const newValue = `${beforeHash}#${issue.number}${textAfterCursor}`;

      onTaskInputChange(newValue);

      // Set cursor position after the issue number
      requestAnimationFrame(() => {
        const newCursorPos = beforeHash.length + `#${issue.number}`.length;
        textarea.setSelectionRange(newCursorPos, newCursorPos);
        textarea.focus();
      });
    }

    setIssueAutocomplete(null);
  };

  // Render issue pills
  const renderIssuePills = () => {
    const pillPositions = calculatePillPositions();

    return pillPositions.map((pillData, index) => {
      const issue = loadedIssues.get(pillData.issueNumber);
      const isLoading = loadingIssues.has(pillData.issueNumber);

      if (!issue && !isLoading) return null;

      return (
        <IssuePill
          key={`pill-${pillData.issueNumber}`}
          issue={issue}
          isLoading={isLoading}
          position={pillData.position}
          onHover={(e) => {
            if (issue) {
              setHoveredIssue(issue.number);
              setHoverPosition({ x: e.clientX, y: e.clientY });
            }
          }}
          onLeave={() => {
            setHoveredIssue(null);
            setHoverPosition(null);
          }}
          onClick={(e) => {
            if (issue) {
              e.preventDefault();
              e.stopPropagation();
              setIssuePopover({
                issue,
                position: { x: e.clientX, y: e.clientY },
              });
            }
          }}
        />
      );
    });
  };

  // Render text with transparent issue mentions
  const renderTextWithTransparentIssues = () => {
    if (issueMentions.length === 0) {
      return taskInput;
    }

    const parts = [];
    let lastIndex = 0;

    issueMentions.forEach((mention, index) => {
      // Add text before mention
      if (mention.startIndex > lastIndex) {
        parts.push(
          <span key={`text-${index}`}>
            {taskInput.substring(lastIndex, mention.startIndex)}
          </span>
        );
      }

      // Add transparent mention (so pills show through)
      parts.push(
        <span
          key={`mention-${index}`}
          // className="text-transparent select-none"
          className="select-none py-8"
        >
          #{mention.number}
        </span>
      );

      lastIndex = mention.endIndex;
    });

    // Add remaining text
    if (lastIndex < taskInput.length) {
      parts.push(<span key="text-end">{taskInput.substring(lastIndex)}</span>);
    }

    return parts;
  };

  return (
    <>
      <div className="rounded-lg bg-white shadow-sm dark:bg-gray-800">
        {/* Textarea with Issue Pills Overlay */}
        <div className="relative px-6 pt-6" ref={containerRef}>
          {/* Background textarea for functionality */}
          <textarea
            ref={textareaRef}
            placeholder="Describe a task to create (use #123 to reference GitHub issues)..."
            value={taskInput}
            onChange={(e) => handleTaskInputChange(e.target.value)}
            onKeyPress={onKeyPress}
            className={`relative z-10 h-32 w-full resize-none bg-transparent text-base leading-relaxed focus:outline-none ${
              issueMentions.length > 0
                ? "text-transparent caret-gray-900 dark:caret-gray-100"
                : "text-gray-900 dark:text-gray-100"
            } placeholder-gray-400 dark:placeholder-gray-500`}
            rows={6}
            onKeyDown={(e) => {
              if (e.key === "Escape" && issueAutocomplete) {
                e.preventDefault();
                setIssueAutocomplete(null);
              }
              // Handle Cmd+Enter (Mac) or Ctrl+Enter (Windows/Linux) for submission
              if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
                e.preventDefault();
                // Call the onSubmit handler if provided, otherwise fall back to onKeyPress
                if (onSubmit) {
                  onSubmit();
                } else {
                  // Create a synthetic KeyboardEvent to maintain compatibility with existing onKeyPress handler
                  const syntheticEvent = {
                    ...e,
                    key: "Enter",
                    preventDefault: () => e.preventDefault(),
                    stopPropagation: () => e.stopPropagation(),
                  } as React.KeyboardEvent;
                  onKeyPress(syntheticEvent);
                }
              }
            }}
            onBlur={(e) => {
              setTimeout(() => {
                if (
                  !document.querySelector("[data-issue-autocomplete]:hover")
                ) {
                  setIssueAutocomplete(null);
                }
              }, 150);
            }}
          />

          {/* Text overlay with transparent issue mentions */}
          {issueMentions.length > 0 && (
            <div className="z-15 pointer-events-none absolute inset-6 whitespace-pre-wrap text-base leading-relaxed text-gray-900 dark:text-gray-100">
              {renderTextWithTransparentIssues()}
            </div>
          )}

          {/* Issue Pills Overlay */}
          {issueMentions.length > 0 && (
            <div className="pointer-events-none absolute inset-6 z-20">
              <div className="relative h-full w-full">{renderIssuePills()}</div>
            </div>
          )}
        </div>

        {/* Footer with template indicator, repo link, and issue enhancement preview */}
        <div className="flex items-center justify-between rounded-b-lg px-4 py-3">
          <div className="flex flex-wrap items-center gap-0">
            {/* Repository Link */}
            {selectedRepo && (
              <button
                onClick={() => {
                  const repoUrl = selectedRepo.includes("github.com")
                    ? selectedRepo
                    : `https://github.com/${selectedRepo}`;
                  window.open(repoUrl, "_blank", "noopener,noreferrer");
                }}
                className="rounded p-1.5 text-gray-400 transition-colors hover:text-gray-600 dark:hover:text-gray-300"
                title={`Open ${selectedRepo.replace(
                  /^https:\/\/github\.com\//,
                  ""
                )} on GitHub`}
              >
                <i className="fab fa-github" style={{ fontSize: "14px" }}></i>
              </button>
            )}
            {templateText && templateText.trim() && (
              <div
                className="cursor-help rounded p-1.5 text-gray-400 transition-colors hover:text-gray-600 dark:hover:text-gray-300"
                title={`Template: ${templateText}`}
              >
                <i className="fas fa-magic" style={{ fontSize: "14px" }}></i>
              </div>
            )}

            {/* Show issue enhancement preview */}
            {issueMentions.length > 0 && (
              <button
                onClick={() => {
                  const repoUrl = selectedRepo.includes("github.com")
                    ? selectedRepo
                    : `https://github.com/${selectedRepo}/issues`;
                  window.open(repoUrl, "_blank", "noopener,noreferrer");
                }}
                className="rounded p-1.5 text-gray-400 transition-colors hover:text-gray-600 dark:hover:text-gray-300"
                title={`Open ${selectedRepo.replace(
                  /^https:\/\/github\.com\//,
                  ""
                )} on GitHub`}
              >
                <i className="fas fa-hashtag" style={{ fontSize: "14px" }}></i>
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Issue Pills Hover Popover */}
      {hoveredIssue && loadedIssues.has(hoveredIssue) && hoverPosition && (
        <IssueHoverPopover
          issue={loadedIssues.get(hoveredIssue)!}
          position={hoverPosition}
        />
      )}

      {/* Issue Popover */}
      {issuePopover && (
        <IssuePopover
          issue={issuePopover.issue}
          position={issuePopover.position}
          onClose={() => setIssuePopover(null)}
        />
      )}

      {/* Issue Autocomplete */}
      {issueAutocomplete && (
        <IssueAutocomplete
          issues={issueAutocomplete.issues}
          position={issueAutocomplete.position}
          searchTerm={issueAutocomplete.searchTerm}
          onSelect={handleIssueSelect}
          onClose={() => setIssueAutocomplete(null)}
        />
      )}
    </>
  );
};
