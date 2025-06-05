import { Job } from "~/types/job";
import { formatRelativeDate } from "~/lib/dateUtils";
import { AIProviderIcon } from "~/components/AIProviderIcons";
import { parseIssueMentions } from "~/lib/githubService";
import { KNOWN_ENVIRONMENTS } from "~/components/ConfigurationPanel";
import { JobEnvironmentViewer } from "~/components/JobEnvironmentViewer";
import { HuggingFaceIcon } from "~/components/icons";
import { useState } from "react";

// find the KNOWN_ENVIRONMENTS where the image matches the job's docker image from environment
export const getEnvironment = (job: Job) => {
  // Look for Docker image in job environment or use a default detection method
  const dockerImage =
    job.environment?.DOCKER_IMAGE ||
    (job.environment &&
      Object.values(job.environment).find(
        (val) =>
          typeof val === "string" &&
          val.includes(":") &&
          (val.includes("drbh/") || val.includes("/"))
      ));

  if (!dockerImage) return null;

  console.log("getEnvironment", { job, dockerImage });
  const env = KNOWN_ENVIRONMENTS.find((env) => env.image === dockerImage);
  return env;
};

interface JobListItemProps {
  job: Job;
  onClick: (job: Job) => void;
}

const StatusBadge = ({ status }: { status: Job["status"] }) => {
  const statusConfig = {
    pending: {
      color:
        "bg-yellow-100 text-yellow-800 dark:bg-yellow-900/20 dark:text-yellow-400",
      text: "Pending",
    },
    running: {
      color: "bg-blue-100 text-blue-800 dark:bg-blue-900/20 dark:text-blue-400",
      text: "Running",
    },
    completed: {
      color:
        "bg-green-100 text-green-800 dark:bg-green-900/20 dark:text-green-400",
      text: "Completed",
    },
    failed: {
      color: "bg-red-100 text-red-800 dark:bg-red-900/20 dark:text-red-400",
      text: "Failed",
    },
  };

  const config = statusConfig[status];

  return (
    <span
      className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${config.color}`}
    >
      {config.text}
    </span>
  );
};

export const JobListItem = ({ job, onClick }: JobListItemProps) => {
  const [showEnvironmentViewer, setShowEnvironmentViewer] = useState(false);

  const getChangesDisplay = () => {
    if (!job.changes) return null;

    const { additions, deletions } = job.changes;
    return (
      <div className="flex items-center gap-2 text-sm">
        {additions > 0 && <span className="text-green-600">+{additions}</span>}
        {deletions > 0 && <span className="text-red-600">−{deletions}</span>}
      </div>
    );
  };

  // Check if job has issue references
  const issueMentions = parseIssueMentions(job.description);
  const hasIssueReferences = issueMentions.length > 0;

  return (
    <div
      className="cursor-pointer border-b border-gray-200 px-4 py-4 transition-colors hover:bg-gray-50 dark:border-gray-700 dark:hover:bg-gray-700/50"
      onClick={() => onClick(job)}
    >
      <div className="flex items-start justify-between">
        <div className="min-w-0 flex-1">
          <div className="mb-2 flex items-center gap-3">
            <div className="flex items-center gap-2">
              <AIProviderIcon
                tags={job.tags}
                className="text-gray-600 dark:text-gray-400"
                size={16}
              />
              <h3 className="truncate text-sm font-medium text-gray-900 dark:text-gray-100">
                {job.title}
              </h3>
              {hasIssueReferences && (
                <div className="flex items-center gap-1 rounded border border-blue-200 bg-blue-50 px-1.5 py-0.5 text-xs text-blue-700 dark:border-blue-700 dark:bg-blue-900/30 dark:text-blue-300">
                  <i className="fas fa-link text-xs"></i>
                  <span>
                    {issueMentions.length} issue
                    {issueMentions.length > 1 ? "s" : ""}
                  </span>
                </div>
              )}
            </div>
            <StatusBadge status={job.status} />
          </div>

          <p className="mb-2 overflow-hidden text-sm text-gray-600 dark:text-gray-400">
            {job.description}
          </p>

          <div className="flex items-center gap-4 text-xs text-gray-500 dark:text-gray-500">
            {/* <span className="flex items-center gap-1">
              <i className="fas fa-hashtag"></i>
              {job.id.substring(0, 8)}
            </span> */}
            <span className="flex items-center gap-1">
              <i className="fas fa-clock"></i>
              {formatRelativeDate(job.createdAt)}
            </span>
            {/* {job.author && (
              <span className="flex items-center gap-1">
                <i className="fas fa-user"></i>
                by {job.author}
              </span>
            )} */}
            {job.repository?.url && (
              <span className="flex max-w-32 items-center gap-1 truncate">
                <i className="fas fa-folder"></i>
                {job.repository.url.includes("github.com")
                  ? job.repository.url.split("/").slice(-2).join("/")
                  : job.repository.url}
              </span>
            )}
            {job.branch && (
              <span className="flex items-center gap-1">
                <i className="fas fa-code-branch"></i>
                {job.branch}
              </span>
            )}
            {job.tags && (
              <span className="flex items-center gap-1">
                <i className="fas fa-tag"></i>
                {job.tags.join(", ")}
              </span>
            )}
            {/* {job.environment && Object.keys(job.environment).length > 0 && (
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  setShowEnvironmentViewer(true);
                }}
                className="flex items-center gap-1 text-blue-600 dark:text-blue-400 hover:text-blue-800 dark:hover:text-blue-300 transition-colors"
                title={`View environment details: ${Object.keys(job.environment).join(', ')}`}
              >
                <i className="fas fa-cog"></i>
                {Object.keys(job.environment).length} env vars
              </button>
            )} */}

            {job.environment && job.environment.LLM_MODEL && (
              <span className="flex items-center gap-1">
                <AIProviderIcon
                  tags={[
                    job.environment.LLM_PROVIDER === "openai"
                      ? "chatgpt"
                      : job.environment.LLM_PROVIDER === "anthropic"
                        ? "claude"
                        : job.environment.LLM_PROVIDER,
                  ]}
                  className="text-gray-600 dark:text-gray-400"
                  size={16}
                />
                {job.environment.LLM_MODEL}
              </span>
            )}
            {job.apiJobId && (
              <span
                className="flex items-center gap-1"
                title="Hugging Face API Job ID"
              >
                <HuggingFaceIcon
                  size={14}
                  className="text-gray-600 dark:text-gray-400"
                />
                {job.apiJobId.substring(0, 8)}...
              </span>
            )}
            {/* <span className="flex items-center gap-1" title="Container name">
              <i className="fas fa-cube"></i>
              hugex-job-{job.id.substring(0, 8)}
            </span> */}
          </div>
        </div>

        <div className="ml-4 flex items-center gap-3">
          {getChangesDisplay()}
          <i className="fas fa-chevron-right text-gray-400 dark:text-gray-500"></i>
        </div>
      </div>
    </div>
  );
};
