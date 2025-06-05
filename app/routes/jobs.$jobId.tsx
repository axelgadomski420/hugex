import type {
  LoaderFunctionArgs,
  ActionFunctionArgs,
  MetaFunction,
} from "@remix-run/node";
import { json, redirect } from "@remix-run/node";
import { useLoaderData, useNavigate, useFetcher } from "@remix-run/react";
import { useState, useEffect } from "react";
import { JobService } from "~/lib/jobService.remix";
import { DiffViewer } from "~/components/DiffViewer";
import { LogStream } from "~/components/LogStream";
import { Job, JobDiff } from "~/types/job";
import { formatFullDate } from "~/lib/dateUtils";
import { AuthWrapper } from "~/components/AuthWrapper";
import {
  extractCredentialsFromCookie,
  getEffectiveUsername,
} from "~/lib/server/auth";
import serverConfig from "~/lib/server/config";
import { AIProviderIcon } from "~/components/AIProviderIcons";
import { parseIssueMentions } from "~/lib/githubService";

export { default as ErrorBoundary } from "~/components/ErrorBoundary";

export const meta: MetaFunction<typeof loader> = ({ data }) => {
  return [
    { title: data?.job ? `${data.job.title} - Job Details` : "Job Not Found" },
    { name: "description", content: "View job details and changes" },
  ];
};

export const action = async ({ request, params }: ActionFunctionArgs) => {
  const jobId = params.jobId;
  if (!jobId) {
    throw new Response("Not Found", { status: 404 });
  }

  const formData = await request.formData();
  const intent = formData.get("intent");

  if (intent === "create-pr") {
    const branch = formData.get("branch") as string;
    const title = formData.get("title") as string;
    const description = formData.get("description") as string;
    const baseBranch = formData.get("baseBranch") as string;

    try {
      // Get the authenticated user credentials
      const cookieHeader = request.headers.get("Cookie");
      const credentials = extractCredentialsFromCookie(cookieHeader);

      // Get job and diff data
      const job = await JobService.getJob(jobId);
      const jobDiff = await JobService.getJobDiff(jobId);

      if (!job || !jobDiff || !job.repository?.url) {
        return json(
          { error: "Job, diff, or repository not found" },
          { status: 400 }
        );
      }

      if (!jobDiff.files || jobDiff.files.length === 0) {
        return json({ error: "No changes to commit" }, { status: 400 });
      }

      // Create branch and push changes
      const result = await JobService.createBranchAndPush(
        jobId,
        {
          branch,
          title,
          description,
          baseBranch,
        },
        credentials
      );

      // Generate GitHub PR URL
      let prUrl = null;
      if (job.repository?.url && job.repository.url.includes("github.com")) {
        const repoUrl = job.repository.url.replace(/\.git$/, "");
        prUrl = `${repoUrl}/compare/${branch}?expand=1`;
      }

      return json({
        success: true,
        branch: result.branch,
        commitHash: result.commitHash,
        prUrl,
        message: `Successfully created branch '${branch}' and pushed changes. Commit: ${result.commitHash}`,
      });
    } catch (error) {
      console.error("Failed to create branch and push:", error);
      return json(
        { error: `Failed to create branch: ${error.message}` },
        { status: 500 }
      );
    }
  }

  return json({ error: "Invalid action" }, { status: 400 });
};

export const loader = async ({ request, params }: LoaderFunctionArgs) => {
  const jobId = params.jobId;
  if (!jobId) {
    throw new Response("Not Found", { status: 404 });
  }

  // Get the authenticated user
  const cookieHeader = request.headers.get("Cookie");
  const credentials = extractCredentialsFromCookie(cookieHeader);
  const username = getEffectiveUsername(credentials);

  console.log(`🔍 Job ${jobId} access check:`);
  console.log(`👤 Authenticated username: ${username}`);
  console.log(`🍪 Credentials available:`, {
    hasHfToken: !!credentials?.huggingfaceToken,
    hasGithubToken: !!credentials?.githubToken,
    hasHfUserInfo: !!credentials?.hfUserInfo,
    hasGithubUserInfo: !!credentials?.githubUserInfo,
    executionMode: serverConfig.EXECUTION_MODE,
  });

  const job = await JobService.getJob(jobId);
  if (!job) {
    throw new Response("Not Found", { status: 404 });
  }

  console.log(`📋 Job details:`);
  console.log(`📝 Job author: ${job.author}`);
  console.log(`🏷️ Job status: ${job.status}`);
  console.log(`🔐 Author match: ${job.author === username}`);

  // Check if the job belongs to the authenticated user
  // In Docker mode, allow access if user has any authentication (HF or GitHub)
  if (
    job.author &&
    job.author !== username &&
    !(
      serverConfig.EXECUTION_MODE === "docker" &&
      (credentials.huggingfaceToken || credentials.githubToken)
    )
  ) {
    console.log(
      `❌ Access denied: Job author '${job.author}' !== authenticated user '${username}'`
    );
    throw new Response("Unauthorized - This job belongs to another user", {
      status: 403,
    });
  }

  console.log(`✅ Access granted for job ${jobId}`);

  const jobDiff = await JobService.getJobDiff(jobId);
  const jobLogs = await JobService.getJobLogs(jobId);

  return json({ job, jobDiff, jobLogs });
};

export default function JobDetail() {
  const { job, jobDiff, jobLogs } = useLoaderData<typeof loader>();

  // Pulse animation styles
  const pulseStyle = {
    animation: "pulse 2s cubic-bezier(0.4, 0, 0.6, 1) infinite",
  };
  const navigate = useNavigate();
  const fetcher = useFetcher<typeof action>();
  // Set default tab based on job status - logs for running jobs, diff for completed ones
  const getDefaultTab = (status: Job["status"]): "diff" | "files" | "logs" => {
    if (status === "running" || status === "pending") {
      return "logs"; // Show logs for active jobs
    }
    return "diff"; // Show diff for completed/failed jobs
  };

  const [activeTab, setActiveTab] = useState<"diff" | "files" | "logs">(
    getDefaultTab(job.status)
  );
  const [userHasManuallyChangedTab, setUserHasManuallyChangedTab] =
    useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [lastRefresh, setLastRefresh] = useState<Date>(new Date());
  const [showPRModal, setShowPRModal] = useState(false);
  const [prTitle, setPrTitle] = useState(``);
  const [prDescription, setPrDescription] = useState(``);
  const [prBranch, setPrBranch] = useState(`hugex-${job.id.substring(0, 8)}`);
  const [isHeaderExpanded, setIsHeaderExpanded] = useState(false);

  // Parse issue mentions from job description
  const issueMentions = parseIssueMentions(job.description);

  // Helper function to generate GitHub issue URL
  const getIssueUrl = (issueNumber: number): string | null => {
    if (!job.repository?.url || !job.repository.url.includes("github.com")) {
      return null;
    }
    const baseUrl = job.repository.url.replace(/\.git$/, "").replace(/\/$/, "");
    return `${baseUrl}/issues/${issueNumber}`;
  };

  // Auto-switch tabs when job status changes (only if user hasn't manually changed tabs)
  useEffect(() => {
    if (!userHasManuallyChangedTab) {
      const newDefaultTab = getDefaultTab(job.status);
      setActiveTab(newDefaultTab);
    }
  }, [job.status, userHasManuallyChangedTab]);

  // Create a wrapper function for tab changes to track manual changes
  const handleTabChange = (tab: "diff" | "files" | "logs") => {
    setActiveTab(tab);
    setUserHasManuallyChangedTab(true);
  };

  // Auto-refresh for running jobs (smart refresh that doesn't interrupt log streaming)
  useEffect(() => {
    if (job.status === "running" || job.status === "pending") {
      const interval = setInterval(async () => {
        // If user is watching logs, use gentle background refresh instead of page reload
        if (activeTab === "logs") {
          console.log("Background refresh - user is watching live logs");
          try {
            // Fetch just the job status without reloading the page
            const response = await fetch(`/api/jobs/${job.id}/status`);
            if (response.ok) {
              const statusData = await response.json();
              console.log("Background status update:", statusData.status);
              // The LogStream component will handle status updates via SSE
            }
          } catch (error) {
            console.error("Background refresh failed:", error);
          }
          return;
        }

        // Full page refresh for other tabs
        setRefreshing(true);
        setTimeout(() => {
          window.location.reload();
        }, 1000);
      }, 15000); // Refresh every 15 seconds

      return () => clearInterval(interval);
    }
  }, [job.status, activeTab, job.id]); // Add activeTab and job.id as dependencies

  // Handle fetcher response for PR creation
  useEffect(() => {
    if (fetcher.data && fetcher.state === "idle") {
      if (fetcher.data.error) {
        alert(`Error: ${fetcher.data.error}`);
      } else if (fetcher.data.success) {
        if (fetcher.data.message) {
          alert(fetcher.data.message);
        }
        // Open GitHub PR creation page if URL is available
        if (fetcher.data.prUrl) {
          window.open(fetcher.data.prUrl, "_blank");
        }
        setShowPRModal(false);
      }
    }
  }, [fetcher.data, fetcher.state]);

  // Manual refresh function
  const handleRefresh = async () => {
    setRefreshing(true);
    setLastRefresh(new Date());
    setTimeout(() => {
      window.location.reload();
    }, 500);
  };

  // Function to extract logs excluding the diff portion
  const getLogsWithoutDiff = (fullLogs: string): string => {
    if (!fullLogs) return "";

    // console.log("Full logs:", fullLogs);
    const delimiter =
      "================================================================================";
    const startIndex = fullLogs.indexOf(delimiter);
    console.log("Start index of delimiter:", startIndex);

    if (startIndex !== -1) {
      // Return everything before the first delimiter (which marks start of diff)
      const x = fullLogs.substring(0, startIndex).trim();
      console.log(x);
      return x;
    }

    // If no delimiter found, return the full logs
    return fullLogs;
  };

  // Check if logs were filtered (diff content was removed)
  const hasFilteredContent = (fullLogs: string): boolean => {
    if (!fullLogs) return false;
    const delimiter =
      "================================================================================";
    return fullLogs.indexOf(delimiter) !== -1;
  };

  // Function to parse and colorize terminal output
  const parseTerminalOutput = (text: string) => {
    const lines = text.split("\n");
    return lines.map((line, index) => {
      let className = "text-gray-200"; // Default color
      let content = line;

      // // Error patterns (red)
      // if (line.match(/error|Error|ERROR|fail|Failed|FAILED|exception|Exception|panic/i)) {
      //   className = 'text-red-400';
      // }
      // // Warning patterns (yellow)
      // else if (line.match(/warn|Warning|WARNING|deprecated|DEPRECATED/i)) {
      //   className = 'text-yellow-400';
      // }
      // // Success patterns (green)
      // else if (line.match(/success|Success|SUCCESS|complete|Complete|COMPLETE|done|Done|DONE|✓|✔/i)) {
      //   className = 'text-green-400';
      // }
      // // File paths (cyan)
      // else if (line.match(/\.(js|ts|tsx|jsx|py|go|rs|java|cpp|c|h|css|html|json|yaml|yml|md|txt|log)\b/)) {
      //   className = 'text-cyan-400';
      // }
      // // URLs and HTTP (blue)
      // else if (line.match(/https?:\/\/|HTTP|GET|POST|PUT|DELETE|PATCH/)) {
      //   className = 'text-blue-400';
      // }
      // // Numbers and values (magenta)
      // else if (line.match(/^\s*\d+\s|\b\d+\.\d+\b|\b\d+%\b|\b\d+ms\b|\b\d+s\b/)) {
      //   className = 'text-purple-400';
      // }
      // // Commands and executables (bright blue)
      // else if (line.match(/^\$\s|^>\s|npm |yarn |pnpm |git |docker |node |python |pip |cargo |go |rustc /)) {
      //   className = 'text-blue-300';
      // }
      // // Timestamps (gray)
      // else if (line.match(/\d{4}-\d{2}-\d{2}|\d{2}:\d{2}:\d{2}|\[\d+\]/)) {
      //   className = 'text-gray-400';
      // }
      // // Comments and info (dim)
      // else if (line.match(/^#|^\/\/|^\s*\*|info|Info|INFO/i)) {
      //   className = 'text-gray-400';
      // }

      // get line type
      // const lineType =

      // const parsedLine = JSON.parse(line || "{}")
      // const lineType = parsedLine.type || "text";
      // console.log("Parsed line:", parsedLine);

      const lineIsJson = line.startsWith("{") && line.endsWith("}");

      if (lineIsJson) {
        try {
          const parsedLine = JSON.parse(line);
          // console.log("Parsed line:", parsedLine);
          // console.log("Parsed line:", parsedLine.type);
          const keys = Object.keys(parsedLine);
          // console.log("Parsed line keys:", keys);

          if (parsedLine.type) {
            // console.log(parsedLine.type);
            switch (parsedLine.type) {
              case "message":
                // console.log("Parsed message:", parsedLine);
                const concatText = parsedLine.content
                  .map((t: string) => t.text)
                  .join(" ");
                className = "text-blue-300";
                content = concatText; // parsedLine.content;
                break;
              case "reasoning":
                className = "text-yellow-300";
                content = parsedLine.summary;
                break;
              case "function_call":
                className = "text-green-300";
                content = `${parsedLine.name}: ${parsedLine.arguments}`;
                break;
              case "function_call_output":
                className = "text-purple-300";
                // console.log("Parsed function call output:", parsedLine);
                content = parsedLine.output;
                break;
              default:
                console.warn("Unknown line type:", parsedLine.type);
                className = "text-gray-200"; // Default for unknown types
            }
          } else {
            console.warn("Line does not have a type:", parsedLine);
          }
          //
        } catch (e) {
          console.error("Failed to parse line as JSON:", e);
        }
      } else {
        // console.log("Line is not JSON:", line);
      }

      return (
        <div key={index} className={className}>
          {content}
        </div>
      );
    });
  };

  const getStatusColor = (status: Job["status"]) => {
    switch (status) {
      case "completed":
        return "bg-green-100 text-green-800";
      case "running":
        return "bg-blue-100 text-blue-800";
      case "pending":
        return "bg-yellow-100 text-yellow-800";
      case "failed":
        return "bg-red-100 text-red-800";
      default:
        return "bg-gray-100 text-gray-800";
    }
  };

  const getStatusText = (status: Job["status"]) => {
    switch (status) {
      case "completed":
        return "Completed";
      case "running":
        return "Running";
      case "pending":
        return "Pending";
      case "failed":
        return "Failed";
      default:
        return "Unknown";
    }
  };

  return (
    <AuthWrapper>
      <div className="min-h-screen">
        <div className="mx-auto max-w-6xl px-4 sm:px-6 lg:px-8">
          {/* Page Header */}
          <div className="mb-6 flex items-center justify-between border-b border-gray-200 py-6 dark:border-gray-700">
            <button
              onClick={() => navigate("/")}
              className="flex items-center gap-2 text-gray-600 hover:text-gray-900 dark:text-gray-400 dark:hover:text-gray-100"
            >
              <i className="fas fa-arrow-left"></i>
              <span>Back to Jobs</span>
            </button>

            <div className="flex items-center gap-4">
              {(job.status === "running" || job.status === "pending") && (
                <div className="flex items-center gap-2 rounded-full bg-blue-50 px-3 py-1.5 text-sm text-blue-600 dark:bg-blue-900/20 dark:text-blue-400">
                  <div className="h-1.5 w-1.5 animate-pulse rounded-full bg-blue-500"></div>
                  <span className="font-medium">
                    {activeTab === "logs"
                      ? "Live streaming"
                      : "Auto-refreshing"}
                  </span>
                </div>
              )}

              <button
                onClick={handleRefresh}
                disabled={refreshing}
                className="rounded-lg p-2.5 text-gray-600 transition-colors hover:bg-gray-100 hover:text-gray-900 disabled:opacity-50 dark:text-gray-400 dark:hover:bg-transparent dark:hover:text-gray-100"
                title="Refresh job status"
              >
                <i
                  className={`fas fa-sync-alt ${
                    refreshing ? "animate-spin" : ""
                  }`}
                ></i>
              </button>

              <button
                onClick={() => {
                  setPrTitle(job.title);

                  // Create comprehensive PR description with diff content
                  let description = `${
                    job.description
                  }\n\n---\n\n**Generated by HugeX Job ${job.id.substring(
                    0,
                    8
                  )}**\n\nThis PR contains changes generated automatically. Please review carefully before merging.\n\n`;

                  // Add changes summary if available
                  if (jobDiff && jobDiff.files.length > 0) {
                    description += `## Changes Summary\n\n`;
                    description += `- **Files changed:** ${jobDiff.summary.totalFiles}\n`;
                    description += `- **Additions:** +${jobDiff.summary.totalAdditions}\n`;
                    description += `- **Deletions:** -${jobDiff.summary.totalDeletions}\n\n`;

                    description += `## Modified Files\n\n`;
                    jobDiff.files.forEach((file) => {
                      const statusEmoji =
                        file.status === "added"
                          ? "🆕"
                          : file.status === "deleted"
                            ? "🗑️"
                            : file.status === "modified"
                              ? "✏️"
                              : "🔄";
                      description += `${statusEmoji} **${file.filename}** (${file.status})`;
                      if (file.additions > 0 || file.deletions > 0) {
                        description += ` (+${file.additions}/-${file.deletions})`;
                      }
                      description += `\n`;
                    });

                    jobDiff.files.forEach((file) => {
                      console.log(file);
                      if (file.diff) {
                        description += `### ${file.filename}\n\n`;
                        description += `\`\`\`diff\n${file.diff}\n\`\`\`\n\n`;
                      }
                    });
                  }

                  setPrDescription(description);
                  setShowPRModal(true);
                }}
                disabled={
                  !jobDiff || jobDiff.files.length === 0 || !job.repository?.url
                }
                className="flex items-center gap-2 rounded-lg border border-gray-300 px-4 py-2.5 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50 dark:border-gray-600 dark:text-gray-300 dark:hover:bg-gray-800"
                title={
                  !jobDiff || jobDiff.files.length === 0
                    ? "No changes available"
                    : !job.repository?.url
                      ? "No repository configured"
                      : "Create pull request"
                }
              >
                <i className="fas fa-code-branch"></i>
                Create PR
              </button>

              <button
                onClick={() => {
                  // Create and download patch file with diff data
                  let patchContent = `# Patch for ${
                    job.title
                  }\n# Generated on ${new Date().toISOString()}\n# Status: ${
                    job.status
                  }\n# Repository: ${job.repository?.url || "N/A"}\n# Branch: ${
                    job.branch || "N/A"
                  }\n# Author: ${job.author || "N/A"}\n\n## Description\n${
                    job.description
                  }\n\n`;

                  // Add diff information if available
                  if (jobDiff && jobDiff.files.length > 0) {
                    patchContent += `## Changes Summary\n`;
                    patchContent += `Files changed: ${jobDiff.summary.totalFiles}\n`;
                    patchContent += `Additions: +${jobDiff.summary.totalAdditions}\n`;
                    patchContent += `Deletions: -${jobDiff.summary.totalDeletions}\n\n`;

                    patchContent += `## Modified Files\n`;
                    jobDiff.files.forEach((file) => {
                      patchContent += `### ${file.filename} (${file.status})\n`;
                      if (file.additions > 0)
                        patchContent += `+${file.additions} `;
                      if (file.deletions > 0)
                        patchContent += `-${file.deletions} `;
                      patchContent += `\n\n`;

                      // Add the actual diff content
                      if (file.diff) {
                        patchContent += `\`\`\`diff\n${file.diff}\n\`\`\`\n\n`;
                      }
                    });
                  } else {
                    patchContent += `## No diff data available\n`;
                    patchContent += `This job may still be processing or no changes were generated.\n`;
                  }

                  const blob = new Blob([patchContent], { type: "text/plain" });
                  const url = URL.createObjectURL(blob);
                  const link = document.createElement("a");
                  link.href = url;
                  link.download = `${job.title.replace(
                    /[^a-zA-Z0-9]/g,
                    "_"
                  )}_patch.patch`;
                  document.body.appendChild(link);
                  link.click();
                  document.body.removeChild(link);
                  URL.revokeObjectURL(url);
                }}
                className="flex items-center gap-2 rounded-lg border border-gray-300 px-4 py-2.5 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-50 dark:border-gray-600 dark:text-gray-300 dark:hover:bg-gray-800"
              >
                <i className="fas fa-download"></i>
                Download Patch
              </button>
            </div>
          </div>

          {/* Job Header */}
          <div className="mb-8 rounded-xl border border-gray-200 bg-white shadow-sm dark:border-gray-700 dark:bg-gray-800">
            {/* Compact Header - Always Visible */}
            <div className="border-b border-gray-200 p-6 dark:border-gray-700">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-4">
                  <div className="flex items-center gap-3">
                    <AIProviderIcon
                      tags={job.tags}
                      className="text-gray-600 dark:text-gray-400"
                      size={20}
                    />
                    <h1 className="text-xl font-bold text-gray-900 dark:text-gray-100">
                      {job.title}
                    </h1>
                  </div>
                  <span
                    className={`inline-flex items-center rounded-full px-3 py-1 text-sm font-medium ${
                      job.status === "completed"
                        ? "bg-green-100 text-green-800 dark:bg-green-900/20 dark:text-green-400"
                        : job.status === "running"
                          ? "bg-blue-100 text-blue-800 dark:bg-blue-900/20 dark:text-blue-400"
                          : job.status === "pending"
                            ? "bg-yellow-100 text-yellow-800 dark:bg-yellow-900/20 dark:text-yellow-400"
                            : "bg-red-100 text-red-800 dark:bg-red-900/20 dark:text-red-400"
                    }`}
                  >
                    {getStatusText(job.status)}
                  </span>

                  {/* Quick Changes Summary */}
                  {job.changes && (
                    <div className="flex items-center gap-2 text-sm text-gray-500 dark:text-gray-400">
                      <span className="text-green-600">
                        +{job.changes.additions}
                      </span>
                      <span className="text-red-600">
                        -{job.changes.deletions}
                      </span>
                      <span>{job.changes.files} files</span>
                    </div>
                  )}
                </div>

                <button
                  onClick={() => setIsHeaderExpanded(!isHeaderExpanded)}
                  className="flex items-center gap-2 text-gray-500 transition-colors hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
                >
                  <span className="text-sm font-medium">
                    {isHeaderExpanded ? "Less details" : "More details"}
                  </span>
                  <i
                    className={`fas fa-chevron-down transition-transform ${
                      isHeaderExpanded ? "rotate-180" : ""
                    }`}
                  ></i>
                </button>
              </div>
            </div>

            {/* Expandable Detailed Content */}
            {isHeaderExpanded && (
              <div className="border-b border-gray-200 p-8 dark:border-gray-700">
                <p className="mb-6 text-base leading-relaxed text-gray-600 dark:text-gray-400">
                  {job.description}
                </p>

                {/* Job Information Tables */}
                <div className="space-y-4 lg:grid lg:grid-cols-2 lg:gap-8 lg:space-y-0">
                  {/* Primary Information Table */}
                  <div className="overflow-hidden rounded-lg bg-gray-50 dark:bg-gray-700/30">
                    <table className="w-full">
                      <thead>
                        <tr className="bg-gray-100 dark:bg-gray-700">
                          <th className="px-4 py-3 text-left text-sm font-semibold text-gray-700 dark:text-gray-300">
                            Property
                          </th>
                          <th className="px-4 py-3 text-left text-sm font-semibold text-gray-700 dark:text-gray-300">
                            Value
                          </th>
                        </tr>
                      </thead>
                      <tbody>
                        <tr className="">
                          <td className="px-4 py-3 text-sm">
                            <div className="flex items-center gap-2">
                              <i className="fas fa-hashtag w-4 text-gray-400"></i>
                              <span className="font-medium text-gray-600 dark:text-gray-400">
                                ID
                              </span>
                            </div>
                          </td>
                          <td className="px-4 py-3">
                            <span className="text-sm text-gray-900 dark:text-gray-100">
                              {job.id.substring(0, 8)}...
                            </span>
                          </td>
                        </tr>
                        <tr className="">
                          <td className="px-4 py-3 text-sm">
                            <div className="flex items-center gap-2">
                              <i className="fas fa-cube w-4 text-gray-400"></i>
                              <span className="font-medium text-gray-600 dark:text-gray-400">
                                Container
                              </span>
                            </div>
                          </td>
                          <td className="px-4 py-3">
                            <span className="text-sm text-gray-900 dark:text-gray-100">
                              hugex-job-{job.id.substring(0, 8)}
                            </span>
                          </td>
                        </tr>
                        <tr className="">
                          <td className="px-4 py-3 text-sm">
                            <div className="flex items-center gap-2">
                              <i className="fas fa-clock w-4 text-gray-400"></i>
                              <span className="font-medium text-gray-600 dark:text-gray-400">
                                Created
                              </span>
                            </div>
                          </td>
                          <td className="px-4 py-3">
                            <span className="text-sm text-gray-900 dark:text-gray-100">
                              {formatFullDate(job.createdAt)}
                            </span>
                          </td>
                        </tr>
                        <tr className="">
                          <td className="px-4 py-3 text-sm">
                            <div className="flex items-center gap-2">
                              <i className="fas fa-sync-alt w-4 text-gray-400"></i>
                              <span className="font-medium text-gray-600 dark:text-gray-400">
                                Updated
                              </span>
                            </div>
                          </td>
                          <td className="px-4 py-3">
                            <span className="text-sm text-gray-900 dark:text-gray-100">
                              {formatFullDate(job.updatedAt)}
                            </span>
                          </td>
                        </tr>
                      </tbody>
                    </table>
                  </div>

                  {/* Secondary Information Table */}
                  {(job.author || job.repository?.url || job.branch) && (
                    <div className="overflow-hidden rounded-lg bg-gray-50 dark:bg-gray-700/30">
                      <table className="w-full">
                        <thead>
                          <tr className="bg-gray-100 dark:bg-gray-700">
                            <th className="px-4 py-3 text-left text-sm font-semibold text-gray-700 dark:text-gray-300">
                              Property
                            </th>
                            <th className="px-4 py-3 text-left text-sm font-semibold text-gray-700 dark:text-gray-300">
                              Value
                            </th>
                          </tr>
                        </thead>
                        <tbody>
                          {job.author && (
                            <tr className="">
                              <td className="px-4 py-3 text-sm">
                                <div className="flex items-center gap-2">
                                  <i className="fas fa-user w-4 text-gray-400"></i>
                                  <span className="font-medium text-gray-600 dark:text-gray-400">
                                    Author
                                  </span>
                                </div>
                              </td>
                              <td className="px-4 py-3">
                                <span className="font-medium text-gray-600 dark:text-gray-100">
                                  {job.author}
                                </span>
                              </td>
                            </tr>
                          )}
                          {job.repository?.url && (
                            <tr className="">
                              <td className="px-4 py-3 text-sm">
                                <div className="flex items-center gap-2">
                                  <i className="fas fa-folder w-4 text-gray-400"></i>
                                  <span className="font-medium text-gray-600 dark:text-gray-400">
                                    Repository
                                  </span>
                                </div>
                              </td>
                              <td className="px-4 py-3">
                                <a
                                  href={job.repository.url}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="inline-flex items-center gap-1 text-sm text-blue-600 underline decoration-dotted underline-offset-2 hover:text-blue-800 dark:text-blue-400 dark:hover:text-blue-300"
                                >
                                  <i className="fas fa-external-link-alt text-xs"></i>
                                  {job.repository.url.includes("github.com")
                                    ? job.repository.url
                                        .split("/")
                                        .slice(-2)
                                        .join("/")
                                    : job.repository.url}
                                </a>
                              </td>
                            </tr>
                          )}
                          {job.branch && (
                            <tr className="">
                              <td className="px-4 py-3 text-sm">
                                <div className="flex items-center gap-2">
                                  <i className="fas fa-code-branch w-4 text-gray-400"></i>
                                  <span className="font-medium text-gray-600 dark:text-gray-400">
                                    Branch
                                  </span>
                                </div>
                              </td>
                              <td className="px-4 py-3">
                                <span className="font-medium text-gray-600 dark:text-gray-100">
                                  {job.branch}
                                </span>
                              </td>
                            </tr>
                          )}
                        </tbody>
                      </table>
                    </div>
                  )}

                  {/* Environment Information Table */}
                  {(job.environment &&
                    Object.keys(job.environment).length > 0) ||
                  (job.secrets && Object.keys(job.secrets).length > 0) ? (
                    <div className="overflow-hidden rounded-lg bg-gray-50 dark:bg-gray-700/30 lg:col-span-2">
                      <details className="group">
                        <summary className="flex cursor-pointer items-center justify-between bg-gray-100 px-4 py-3 text-sm font-semibold text-gray-700 transition-colors hover:bg-gray-200 dark:bg-gray-700 dark:text-gray-300 dark:hover:bg-gray-600">
                          <div className="flex items-center gap-2">
                            <i className="fas fa-cog w-4 text-gray-400"></i>
                            <span>Environment & Configuration</span>
                            <span className="ml-2 text-xs text-gray-500 dark:text-gray-400">
                              (
                              {(job.environment
                                ? Object.keys(job.environment).length
                                : 0) +
                                (job.secrets
                                  ? Object.keys(job.secrets).length
                                  : 0)}{" "}
                              items)
                            </span>
                          </div>
                          <i className="fas fa-chevron-down text-gray-400 transition-transform group-open:rotate-180"></i>
                        </summary>

                        <div className="space-y-4 px-4 pb-4 pt-2">
                          {/* Environment Variables */}
                          {job.environment &&
                            Object.keys(job.environment).length > 0 && (
                              <div>
                                <h4 className="mb-2 flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-gray-600 dark:text-gray-400">
                                  <i className="fas fa-terminal text-xs text-gray-400"></i>
                                  Environment Variables (
                                  {Object.keys(job.environment).length})
                                </h4>
                                <div className="space-y-2">
                                  {Object.entries(job.environment).map(
                                    ([key, value]) => (
                                      <div
                                        key={key}
                                        className="flex flex-col gap-2 border-b border-gray-200 py-2 last:border-b-0 dark:border-gray-600 sm:flex-row sm:items-start"
                                      >
                                        <span className="min-w-0 flex-shrink-0 rounded bg-blue-50 px-2 py-1 font-mono text-sm font-medium text-blue-600 dark:bg-blue-900/20 dark:text-blue-400">
                                          {key}
                                        </span>
                                        <span className="flex-1 break-all rounded bg-gray-100 px-2 py-1 font-mono text-sm text-gray-600 dark:bg-gray-600/30 dark:text-gray-300">
                                          {value}
                                        </span>
                                      </div>
                                    )
                                  )}
                                </div>
                              </div>
                            )}

                          {/* Secrets */}
                          {job.secrets &&
                            Object.keys(job.secrets).length > 0 && (
                              <div>
                                <h4 className="mb-2 flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-gray-600 dark:text-gray-400">
                                  <i className="fas fa-lock text-xs text-gray-400"></i>
                                  Secrets ({Object.keys(job.secrets).length})
                                </h4>
                                <div className="space-y-2">
                                  {Object.entries(job.secrets).map(
                                    ([key, value]) => (
                                      <div
                                        key={key}
                                        className="flex flex-col gap-2 border-b border-gray-200 py-2 last:border-b-0 dark:border-gray-600 sm:flex-row sm:items-start"
                                      >
                                        <span className="min-w-0 flex-shrink-0 rounded bg-red-50 px-2 py-1 font-mono text-sm font-medium text-red-600 dark:bg-red-900/20 dark:text-red-400">
                                          {key}
                                        </span>
                                        <span className="flex-1 rounded bg-gray-100 px-2 py-1 font-mono text-sm text-gray-600 dark:bg-gray-600/30 dark:text-gray-300">
                                          {value}
                                        </span>
                                      </div>
                                    )
                                  )}
                                </div>
                                <p className="mt-3 flex items-center gap-1 text-xs text-gray-500 dark:text-gray-400">
                                  <i className="fas fa-info-circle"></i>
                                  Secret values may be masked for security
                                </p>
                              </div>
                            )}
                        </div>
                      </details>
                    </div>
                  ) : null}
                </div>
              </div>
            )}

            {(job.changes || issueMentions.length > 0) && (
              <div className="border-t border-gray-200 bg-gray-50 px-8 py-6 dark:border-gray-700 dark:bg-gray-700/30">
                <div className="flex items-center justify-between">
                  {/* Changes Summary */}
                  {job.changes && (
                    <div className="flex items-center gap-8 text-sm">
                      <div className="flex items-center gap-3">
                        <i className="fas fa-chart-line text-gray-400"></i>
                        <span className="font-medium text-gray-600 dark:text-gray-400">
                          Changes:
                        </span>
                        <div className="flex items-center gap-3">
                          <span className="rounded bg-green-50 px-2 py-1 font-semibold text-green-600 dark:bg-green-900/20">
                            +{job.changes.additions}
                          </span>
                          <span className="rounded bg-red-50 px-2 py-1 font-semibold text-red-600 dark:bg-red-900/20">
                            −{job.changes.deletions}
                          </span>
                        </div>
                      </div>
                      <div className="flex items-center gap-3">
                        <i className="fas fa-file-alt text-gray-400"></i>
                        <span className="font-medium text-gray-600 dark:text-gray-400">
                          Files:
                        </span>
                        <span className="rounded bg-gray-100 px-2 py-1 font-semibold text-gray-900 dark:bg-transparent dark:text-gray-100">
                          {job.changes.files}
                        </span>
                      </div>
                    </div>
                  )}

                  {/* Referenced Issues Pills */}
                  {issueMentions.length > 0 && (
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-medium text-gray-500 dark:text-gray-400">
                        Issues:
                      </span>
                      <div className="flex items-center gap-1.5">
                        {issueMentions.map((mention, index) => {
                          const issueUrl = getIssueUrl(mention.number);
                          return issueUrl ? (
                            <a
                              key={index}
                              href={issueUrl}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="inline-flex items-center gap-1 rounded-full bg-blue-100 px-2 py-1 text-xs text-blue-700 transition-colors hover:bg-blue-200 dark:bg-blue-800 dark:text-blue-200 dark:hover:bg-blue-700"
                              title={`View issue #${mention.number}`}
                            >
                              <i className="fas fa-hashtag text-xs"></i>
                              {mention.number}
                              <i className="fas fa-external-link-alt text-xs opacity-60"></i>
                            </a>
                          ) : (
                            <span
                              key={index}
                              className="inline-flex items-center gap-1 rounded-full bg-gray-100 px-2 py-1 text-xs text-gray-600 dark:bg-transparent dark:text-gray-400"
                              title={`Issue #${mention.number} (repository not linked)`}
                            >
                              <i className="fas fa-hashtag text-xs"></i>
                              {mention.number}
                            </span>
                          );
                        })}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>

          {/* Content Tabs */}
          <div className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm dark:border-gray-700 dark:bg-gray-800">
            <div className="border-b border-gray-200 dark:border-gray-700">
              <nav className="flex">
                <button
                  onClick={() => handleTabChange("diff")}
                  className={`border-b-2 px-6 py-4 text-sm font-medium transition-colors ${
                    activeTab === "diff"
                      ? "border-blue-500 text-blue-600 dark:text-blue-400"
                      : "border-transparent text-gray-500 hover:border-gray-300 hover:text-gray-700 dark:text-gray-400 dark:hover:border-gray-600 dark:hover:text-gray-300"
                  }`}
                >
                  <span className="flex items-center gap-2">
                    Diff
                    {(job.status === "completed" || job.status === "failed") &&
                      !userHasManuallyChangedTab && (
                        <span
                          className="h-1.5 w-1.5 animate-pulse rounded-full bg-blue-500"
                          title="Recommended for completed jobs"
                        ></span>
                      )}
                  </span>
                </button>
                <button
                  onClick={() => handleTabChange("files")}
                  className={`border-b-2 px-6 py-4 text-sm font-medium transition-colors ${
                    activeTab === "files"
                      ? "border-blue-500 text-blue-600 dark:text-blue-400"
                      : "border-transparent text-gray-500 hover:border-gray-300 hover:text-gray-700 dark:text-gray-400 dark:hover:border-gray-600 dark:hover:text-gray-300"
                  }`}
                >
                  Files
                </button>
                <button
                  onClick={() => handleTabChange("logs")}
                  className={`border-b-2 px-6 py-4 text-sm font-medium transition-colors ${
                    activeTab === "logs"
                      ? "border-blue-500 text-blue-600 dark:text-blue-400"
                      : "border-transparent text-gray-500 hover:border-gray-300 hover:text-gray-700 dark:text-gray-400 dark:hover:border-gray-600 dark:hover:text-gray-300"
                  }`}
                >
                  <span className="flex items-center gap-2">
                    Logs
                    {(job.status === "running" || job.status === "pending") &&
                      !userHasManuallyChangedTab && (
                        <span
                          className="h-1.5 w-1.5 animate-pulse rounded-full bg-blue-500"
                          title="Recommended for running jobs"
                        ></span>
                      )}
                  </span>
                </button>
              </nav>
            </div>

            <div className="p-8">
              {activeTab === "diff" && (
                <div>
                  {jobDiff ? (
                    <DiffViewer files={jobDiff.files} />
                  ) : (
                    <div className="py-12 text-center text-gray-500 dark:text-gray-400">
                      <div className="mb-4">
                        <i className="fas fa-file-alt text-6xl text-gray-300 dark:text-gray-600"></i>
                      </div>
                      <p
                        className="mb-2 text-lg font-medium"
                        style={pulseStyle}
                      >
                        No changes available
                      </p>
                      <p className="text-sm" style={pulseStyle}>
                        {job.status === "pending"
                          ? "Job is pending - changes will appear when processing starts"
                          : job.status === "running"
                            ? "Job is running - changes will appear when completed"
                            : job.status === "failed"
                              ? "Job failed - no changes were generated"
                              : "This job completed without generating a diff"}
                      </p>
                    </div>
                  )}
                </div>
              )}

              {activeTab === "files" && (
                <div>
                  {jobDiff && jobDiff.files.length > 0 ? (
                    <div className="space-y-4">
                      <div className="mb-4 text-sm text-gray-600 dark:text-gray-400">
                        {jobDiff.summary.totalFiles} files changed,{" "}
                        <span className="text-green-600">
                          {jobDiff.summary.totalAdditions} additions
                        </span>
                        ,{" "}
                        <span className="text-red-600">
                          {jobDiff.summary.totalDeletions} deletions
                        </span>
                      </div>

                      <div className="divide-y divide-gray-200 dark:divide-gray-700">
                        {jobDiff.files.map((file, index) => (
                          <div
                            key={index}
                            className="py-4 first:pt-0 last:pb-0"
                          >
                            <div className="flex items-center justify-between">
                              <div className="flex items-center gap-3">
                                <div
                                  className={`h-2 w-2 rounded-full ${
                                    file.status === "added"
                                      ? "bg-green-500"
                                      : file.status === "deleted"
                                        ? "bg-red-500"
                                        : file.status === "modified"
                                          ? "bg-blue-500"
                                          : "bg-purple-500"
                                  }`}
                                ></div>
                                <span className="font-mono text-sm text-gray-900 dark:text-gray-100">
                                  {file.filename}
                                </span>
                                {file.status === "renamed" &&
                                  file.oldFilename && (
                                    <span className="text-xs text-gray-500 dark:text-gray-400">
                                      (renamed from {file.oldFilename})
                                    </span>
                                  )}
                              </div>
                              <div className="flex items-center gap-3 text-sm">
                                {file.additions > 0 && (
                                  <span className="text-green-600">
                                    +{file.additions}
                                  </span>
                                )}
                                {file.deletions > 0 && (
                                  <span className="text-red-600">
                                    −{file.deletions}
                                  </span>
                                )}
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  ) : (
                    <div className="py-12 text-center text-gray-500 dark:text-gray-400">
                      <p style={pulseStyle}>No files to display</p>
                    </div>
                  )}
                </div>
              )}

              {activeTab === "logs" && (
                <div>
                  {job.status === "running" || job.status === "pending" ? (
                    // Use real-time streaming for active jobs
                    <LogStream
                      jobId={job.id}
                      className="rounded-lg border border-gray-200 dark:border-gray-700"
                    />
                  ) : jobLogs ? (
                    // Show static logs for completed/failed jobs
                    <div className="overflow-hidden rounded-lg bg-gray-900">
                      <div className="flex items-center justify-between border-b border-gray-700 bg-gray-800 px-4 py-2">
                        <div className="flex items-center gap-2">
                          <i className="fas fa-terminal text-green-400"></i>
                          <span className="text-sm font-medium text-gray-300">
                            Execution Logs
                          </span>
                          {hasFilteredContent(jobLogs) && (
                            <span className="rounded bg-yellow-400/10 px-2 py-1 text-xs text-yellow-400">
                              Diff excluded
                            </span>
                          )}
                        </div>
                        <button
                          onClick={() => {
                            const logContent = getLogsWithoutDiff(jobLogs);
                            navigator.clipboard.writeText(logContent);
                          }}
                          className="flex items-center gap-1 text-xs text-gray-400 hover:text-gray-200"
                          title="Copy logs to clipboard"
                        >
                          <i className="fas fa-copy"></i>
                          Copy
                        </button>
                      </div>
                      <div className="max-h-[600px] overflow-auto p-4">
                        <div className="whitespace-pre-wrap break-words font-mono text-sm leading-relaxed">
                          {parseTerminalOutput(getLogsWithoutDiff(jobLogs))}
                        </div>
                      </div>
                    </div>
                  ) : (
                    <div className="py-12 text-center text-gray-500 dark:text-gray-400">
                      <div className="mb-4">
                        <i className="fas fa-terminal text-6xl text-gray-300 dark:text-gray-600"></i>
                      </div>
                      <p
                        className="mb-2 text-lg font-medium"
                        style={pulseStyle}
                      >
                        No logs available
                      </p>
                      <p className="text-sm" style={pulseStyle}>
                        {job.status === "pending"
                          ? "Job is pending - logs will appear when processing starts"
                          : job.status === "running"
                            ? "Job is running - logs will appear as processing continues"
                            : job.status === "failed"
                              ? "Job failed - check if any logs were generated before failure"
                              : "This job completed without generating logs"}
                      </p>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* PR Creation Modal */}
        {showPRModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50 p-4">
            <div className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-xl border border-gray-200 bg-white shadow-xl dark:border-gray-700 dark:bg-gray-800">
              <div className="border-b border-gray-200 p-6 dark:border-gray-700">
                <div className="flex items-center justify-between">
                  <h2 className="text-xl font-semibold text-gray-900 dark:text-gray-100">
                    Create Pull Request
                  </h2>
                  <button
                    onClick={() => setShowPRModal(false)}
                    className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
                  >
                    <i className="fas fa-times"></i>
                  </button>
                </div>
              </div>

              <div className="space-y-6 p-6">
                <div>
                  <label className="mb-2 block text-sm font-medium text-gray-700 dark:text-gray-300">
                    Branch Name
                  </label>
                  <input
                    type="text"
                    value={prBranch}
                    onChange={(e) => setPrBranch(e.target.value)}
                    className="w-full rounded-md border border-gray-300 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500 dark:border-gray-600 dark:bg-transparent dark:text-gray-100"
                    placeholder="feature/my-changes"
                  />
                </div>

                <div>
                  <label className="mb-2 block text-sm font-medium text-gray-700 dark:text-gray-300">
                    Pull Request Title
                  </label>
                  <input
                    type="text"
                    value={prTitle}
                    onChange={(e) => setPrTitle(e.target.value)}
                    className="w-full rounded-md border border-gray-300 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500 dark:border-gray-600 dark:bg-transparent dark:text-gray-100"
                    placeholder="Enter PR title"
                  />
                </div>

                <div>
                  <label className="mb-2 block text-sm font-medium text-gray-700 dark:text-gray-300">
                    Description
                  </label>
                  <textarea
                    value={prDescription}
                    onChange={(e) => setPrDescription(e.target.value)}
                    rows={8}
                    className="w-full rounded-md border border-gray-300 px-3 py-2 font-mono text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 dark:border-gray-600 dark:bg-transparent dark:text-gray-100"
                    placeholder="Describe the changes in this PR"
                  />
                </div>

                {jobDiff && (
                  <div className="rounded-lg bg-gray-50 p-4 dark:bg-gray-700/30">
                    <h3 className="mb-2 text-sm font-medium text-gray-700 dark:text-gray-300">
                      Changes Summary
                    </h3>
                    <div className="text-sm text-gray-600 dark:text-gray-400">
                      <div className="mb-2 flex items-center gap-4">
                        <span>{jobDiff.summary.totalFiles} files changed</span>
                        <span className="text-green-600">
                          +{jobDiff.summary.totalAdditions} additions
                        </span>
                        <span className="text-red-600">
                          -{jobDiff.summary.totalDeletions} deletions
                        </span>
                      </div>
                      <div className="space-y-1">
                        {jobDiff.files.slice(0, 5).map((file, index) => (
                          <div key={index} className="flex items-center gap-2">
                            <div
                              className={`h-2 w-2 rounded-full ${
                                file.status === "added"
                                  ? "bg-green-500"
                                  : file.status === "deleted"
                                    ? "bg-red-500"
                                    : file.status === "modified"
                                      ? "bg-blue-500"
                                      : "bg-purple-500"
                              }`}
                            ></div>
                            <span className="font-mono text-xs">
                              {file.filename}
                            </span>
                          </div>
                        ))}
                        {jobDiff.files.length > 5 && (
                          <div className="text-xs text-gray-500">
                            ...and {jobDiff.files.length - 5} more files
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                )}
              </div>

              <div className="flex items-center justify-end gap-3 border-t border-gray-200 p-6 dark:border-gray-700">
                <button
                  onClick={() => setShowPRModal(false)}
                  className="rounded-lg px-4 py-2 text-gray-700 transition-colors hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-transparent"
                >
                  Cancel
                </button>
                <button
                  onClick={() => {
                    const formData = new FormData();
                    formData.append("intent", "create-pr");
                    formData.append("branch", prBranch);
                    formData.append("title", prTitle);
                    formData.append("description", prDescription);
                    formData.append("baseBranch", job.branch || "main");

                    fetcher.submit(formData, { method: "post" });
                  }}
                  disabled={
                    !prTitle.trim() ||
                    !prBranch.trim() ||
                    fetcher.state === "submitting"
                  }
                  className="flex items-center gap-2 rounded-lg border border-gray-300 px-6 py-2 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50 dark:border-gray-600 dark:text-gray-300 dark:hover:bg-gray-800"
                >
                  <i
                    className={`fas ${
                      fetcher.state === "submitting"
                        ? "fa-spinner fa-spin"
                        : "fa-code-branch"
                    }`}
                  ></i>
                  {fetcher.state === "submitting"
                    ? "Creating Branch..."
                    : "Create Branch & Push"}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </AuthWrapper>
  );
}
