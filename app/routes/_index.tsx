import type { MetaFunction, LoaderFunctionArgs } from "@remix-run/node";
import { json } from "@remix-run/node";
import { useLoaderData, useNavigate, useSearchParams } from "@remix-run/react";
import { useState, useEffect } from "react";
import { JobService } from "~/lib/jobService.remix";
import { Job } from "~/types/job";
import { JobListItem } from "~/components/JobListItem";
import { ConfigurationPanel } from "~/components/ConfigurationPanel";
import { AuthWrapper } from "~/components/AuthWrapper";
import { extractCredentialsFromCookie } from "~/lib/server/auth";
import { ConfigService, DEFAULT_TEMPLATE } from "~/lib/configService";
import { RecentDataService } from "~/lib/recentDataService";
import { AuthService } from "~/lib/authService";
import type { GitHubRepository } from "~/lib/githubAPIService";
import { TaskEditor } from "~/components/TaskEditor";
import { RepositoryBranchSelector } from "~/components/RepositoryBranchSelector";
import { IssueEnhancer } from "~/lib/issueEnhancer";
import { WelcomeModal } from "~/components/WelcomeModal";
import {
  getFromLocalStorage,
  setToLocalStorage,
  STORAGE_KEYS,
} from "~/lib/autoSaveService";

export const meta: MetaFunction = () => {
  return [
    { title: "Jobs - What are we coding next?" },
    { name: "description", content: "Manage your coding jobs and tasks" },
  ];
};

export const loader = async ({ request }: LoaderFunctionArgs) => {
  // Get the authenticated user
  const cookieHeader = request.headers.get("Cookie");
  const credentials = extractCredentialsFromCookie(cookieHeader);
  const username = credentials?.hfUserInfo?.username;

  // Only show jobs from the authenticated user
  try {
    const result = await JobService.getAllJobs({ author: username });
    const jobs = result.jobs;
    console.log(
      `Loaded ${jobs.length} jobs for user ${username || "anonymous"}`
    );
    return json({ jobs, username });
  } catch (error) {
    console.error("Error loading jobs:", error);
    return json({ jobs: [], username: null });
  }
};

export default function Index() {
  const { jobs, username } = useLoaderData<typeof loader>();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [taskInput, setTaskInput] = useState("");
  const [showRepoDropdown, setShowRepoDropdown] = useState(false);
  const [showBranchDropdown, setShowBranchDropdown] = useState(false);
  const [selectedRepo, setSelectedRepo] = useState("");
  const [selectedBranch, setSelectedBranch] = useState("");
  const [recentRepos, setRecentRepos] = useState<any[]>([]);
  const [recentBranches, setRecentBranches] = useState<any[]>([]);
  const [repoSearchInput, setRepoSearchInput] = useState("");
  const [branchSearchInput, setBranchSearchInput] = useState("");
  const [activeTab, setActiveTab] = useState("tasks");
  const [authError, setAuthError] = useState<string | null>(null);
  const [templateText, setTemplateText] = useState("");
  const [isEnhancing, setIsEnhancing] = useState(false);
  const [showWelcomeModal, setShowWelcomeModal] = useState(false);

  // Initialize data from localStorage on client-side
  useEffect(() => {
    if (typeof window === "undefined") return; // Skip on server-side

    // Load persisted selections
    const savedRepo = RecentDataService.getSelectedRepository();
    const savedBranch = RecentDataService.getSelectedBranch();
    const savedRecentRepos = RecentDataService.getRecentRepositories();
    const savedRecentBranches = RecentDataService.getRecentBranches();

    setSelectedRepo(savedRepo);
    setSelectedBranch(savedBranch);
    setRecentRepos(savedRecentRepos);
    setRecentBranches(savedRecentBranches);

    // Load template text
    const savedTemplateText = getFromLocalStorage(
      STORAGE_KEYS.templateText,
      DEFAULT_TEMPLATE
    );
    setTemplateText(savedTemplateText);

    // Check if user has seen welcome modal
    const hasSeenWelcome = getFromLocalStorage(STORAGE_KEYS.welcomeSeen, false);
    if (!hasSeenWelcome) {
      setShowWelcomeModal(true);
    }

    // Check for OAuth2 error
    const urlParams = new URLSearchParams(window.location.search);
    const error = urlParams.get("error");
    if (error) {
      setAuthError(decodeURIComponent(error));
      // Clear error from URL after showing it
      urlParams.delete("error");
      const newUrl =
        window.location.pathname +
        (urlParams.toString() ? "?" + urlParams.toString() : "");
      window.history.replaceState({}, "", newUrl);
    }
  }, []);

  // Listen for template text changes
  useEffect(() => {
    if (typeof window === "undefined") return;

    const handleStorageChange = (e: StorageEvent) => {
      if (e.key === STORAGE_KEYS.templateText) {
        setTemplateText(e.newValue || "");
      }
    };

    window.addEventListener("storage", handleStorageChange);

    // Also check for changes when tab becomes active
    const handleVisibilityChange = () => {
      if (!document.hidden) {
        const currentTemplate = getFromLocalStorage(
          STORAGE_KEYS.templateText,
          DEFAULT_TEMPLATE
        );
        if (currentTemplate !== templateText) {
          setTemplateText(currentTemplate);
        }
      }
    };

    document.addEventListener("visibilitychange", handleVisibilityChange);

    return () => {
      window.removeEventListener("storage", handleStorageChange);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, [templateText]);

  // Auto-save template text immediately (no debouncing for typing)
  useEffect(() => {
    if (typeof window === "undefined") return;
    if (templateText !== undefined) {
      setToLocalStorage(STORAGE_KEYS.templateText, templateText, false); // Immediate save
    }
  }, [templateText]);

  // Check if required secrets are configured for current Docker image
  const checkRequiredSecrets = async () => {
    try {
      const dockerConfig = await ConfigService.getDockerConfig();

      // Define required secrets for specific images
      const requiredSecrets: Record<string, string[]> = {
        "drbh/codex-universal-explore:8": ["OPENAI_API_KEY"],
      };

      const required = requiredSecrets[dockerConfig.image] || [];
      const missing = required.filter(
        (secret) => !dockerConfig.secrets[secret]
      );

      return { missing, image: dockerConfig.image };
    } catch (error) {
      console.error("Failed to check required secrets:", error);
      return { missing: [], image: "unknown" };
    }
  };

  useEffect(() => {
    if (process.env.NODE_ENV !== "development") return;

    fetch("/api/auth/dev-env")
      .then((res) => res.json())
      .then((data) => {
        const { openaiKey, huggingfaceToken } = data;
        if (!openaiKey && !huggingfaceToken) return;

        ConfigService.getDockerConfig().then((dockerConfig) => {
          const newSecrets = { ...dockerConfig.secrets };

          if (openaiKey) {
            console.log("🔧 Pre‐populating OpenAI API key");
            newSecrets.OPENAI_API_KEY = openaiKey;
          }
          if (huggingfaceToken) {
            console.log("🔧 Pre‐populating HuggingFace token");
            newSecrets.HUGGINGFACE_TOKEN = huggingfaceToken;
          }

          // Only update if there’s something new
          const changed =
            (openaiKey && dockerConfig.secrets.OPENAI_API_KEY !== openaiKey) ||
            (huggingfaceToken &&
              dockerConfig.secrets.HUGGINGFACE_TOKEN !== huggingfaceToken);

          if (changed) {
            ConfigService.updateDockerConfig({
              ...dockerConfig,
              secrets: newSecrets,
            });
            console.log("Docker config updated with dev secrets.");
          }
        });
      })
      .catch(() => {
        console.log("No dev‐env variables found.");
      });
  }, []);

  // Get template instruction from localStorage with auto-save
  const getTemplateInstruction = () => {
    try {
      if (typeof window === "undefined") return ""; // Skip on server-side
      const templateText = getFromLocalStorage(
        STORAGE_KEYS.templateText,
        DEFAULT_TEMPLATE
      );
      console.log("Retrieved template text:", templateText); // Debug log
      return templateText && templateText.trim() ? ` ${templateText}` : "";
    } catch (error) {
      console.error("Failed to get template instruction:", error);
      return "";
    }
  };

  const handleJobClick = (job: Job) => {
    navigate(`/jobs/${job.id}`);
  };

  const handleCreateJob = async (
    jobData: Omit<Job, "id" | "createdAt" | "updatedAt">
  ) => {
    try {
      console.log("Creating job with data:", jobData);

      // call the /api/jobs endpoint to create a new job
      const response = await fetch("/api/jobs", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(jobData),
      });
      if (!response.ok) {
        throw new Error("Failed to create job");
      }
      const newJob = await response.json();
      console.log("New job created:", newJob);

      // Refresh the page to show the new job
      window.location.reload();
    } catch (error) {
      console.error("Failed to create job:", error);
      alert("Failed to create job. Please try again.");
    }
  };

  const handleQuickCreate = () => {
    if (taskInput.trim()) {
      setIsCreateModalOpen(true);
    }
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && taskInput.trim()) {
      handleQuickCreate();
    }
  };

  const getJobCounts = () => {
    const completed = jobs.filter((job) => job.status === "completed").length;
    const running = jobs.filter((job) => job.status === "running").length;
    const pending = jobs.filter((job) => job.status === "pending").length;
    const failed = jobs.filter((job) => job.status === "failed").length;

    return { completed, running, pending, failed };
  };

  const { completed, running, pending, failed } = getJobCounts();

  const handleCodePress = async () => {
    if (!taskInput.trim()) {
      alert("Please enter a task description");
      return;
    }

    if (!selectedRepo.trim()) {
      alert("Please select a repository");
      return;
    }

    if (!selectedBranch.trim()) {
      alert("Please select a branch");
      return;
    }

    // Check for required secrets
    const { missing, image } = await checkRequiredSecrets();
    if (missing.length > 0) {
      alert(
        `Missing required secrets for ${image}: ${missing.join(
          ", "
        )}. Please configure them in the Environment tab.`
      );
      return;
    }

    try {
      // Show loading state
      setIsEnhancing(true);

      // Enhance the job with issue details
      const enhancedJob = await IssueEnhancer.enhanceJobWithIssueDetails(
        taskInput.trim(),
        selectedRepo
      );

      console.log(
        "Enhanced job with issue details:",
        JSON.stringify(enhancedJob, null, 2)
      );

      // Apply template instruction if enabled
      const templateInstruction = getTemplateInstruction();
      const finalDescription = `${enhancedJob.description} ${templateInstruction}`;

      console.log("Enhanced job:", {
        originalDescription: taskInput.trim(),
        enhancedTitle: enhancedJob.title,
        enhancedDescription: enhancedJob.description,
        referencedIssues: enhancedJob.referencedIssues.length,
        issueDetails: enhancedJob.referencedIssues.map((issue) => ({
          number: issue.number,
          title: issue.title,
          state: issue.state,
        })),
        finalDescription,
      });

      // Create job with enhanced details
      handleCreateJob({
        title: enhancedJob.title,
        description: finalDescription,
        branch: selectedBranch,
        status: "pending",
        author: username,
        repository: {
          url: selectedRepo.includes("github.com")
            ? selectedRepo
            : `https://github.com/${selectedRepo}`,
          branch: selectedBranch,
        },
      });
    } catch (error) {
      setIsEnhancing(false);
      console.error("Failed to enhance job with issue details:", error);

      // Fallback to original behavior if enhancement fails
      const templateInstruction = getTemplateInstruction();
      const enhancedDescription = `${taskInput.trim()} ${templateInstruction}`;

      handleCreateJob({
        title:
          taskInput.trim().length > 50
            ? taskInput.trim().substring(0, 50)
            : taskInput.trim(),
        description: enhancedDescription,
        branch: selectedBranch,
        status: "pending",
        author: username,
        repository: {
          url: selectedRepo.includes("github.com")
            ? selectedRepo
            : `https://github.com/${selectedRepo}`,
          branch: selectedBranch,
        },
      });
    } finally {
      setIsEnhancing(false);
    }
  };

  const handleRepoSelect = (repoUrl: string, defaultBranch?: string) => {
    setSelectedRepo(repoUrl);
    setRecentRepos(RecentDataService.getRecentRepositories());
    if (defaultBranch) {
      setSelectedBranch(defaultBranch);
      setRecentBranches(RecentDataService.getRecentBranches());
    }
    setRepoSearchInput("");
    setShowRepoDropdown(false);
  };

  const handleBranchSelect = (branchName: string) => {
    setSelectedBranch(branchName);
    RecentDataService.setSelectedBranch(branchName);
    setRecentBranches(RecentDataService.getRecentBranches());
    setBranchSearchInput("");
    setShowBranchDropdown(false);
  };

  const handleCloseDropdowns = () => {
    setShowRepoDropdown(false);
    setShowBranchDropdown(false);
    setRepoSearchInput("");
    setBranchSearchInput("");
  };

  const handleCloseWelcomeModal = () => {
    setShowWelcomeModal(false);
    setToLocalStorage(STORAGE_KEYS.welcomeSeen, true, true);
  };

  return (
    <AuthWrapper>
      <div className="min-h-[calc(100vh-5rem)]">
        {/* OAuth2 Error Alert */}
        {authError && (
          <div className="mx-auto max-w-6xl px-4 pt-4 sm:px-6 lg:px-8">
            <div className="mb-4 rounded-lg border border-red-200 bg-red-50 p-4 dark:border-red-800 dark:bg-red-900/20">
              <div className="flex items-center gap-3">
                <svg
                  className="h-5 w-5 flex-shrink-0 text-red-600 dark:text-red-400"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
                  />
                </svg>
                <div>
                  <h3 className="text-sm font-medium text-red-800 dark:text-red-300">
                    Authentication Error
                  </h3>
                  <p className="mt-1 text-sm text-red-700 dark:text-red-300">
                    {authError}
                  </p>
                </div>
                <button
                  onClick={() => setAuthError(null)}
                  className="ml-auto text-red-600 hover:text-red-800 dark:text-red-400 dark:hover:text-red-200"
                >
                  <svg
                    className="h-4 w-4"
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
          </div>
        )}

        {/* Tab Navigation */}
        <div className="border-b border-gray-200 bg-white dark:border-gray-700 dark:bg-gray-800">
          <div className="mx-auto max-w-6xl px-4 sm:px-6 lg:px-8">
            <nav className="flex space-x-8">
              <button
                onClick={() => {
                  setActiveTab("tasks");
                  // Refresh template text when switching to tasks tab
                  if (typeof window !== "undefined") {
                    const currentTemplate = localStorage.getItem(
                      "hugex_template_text"
                    );
                    setTemplateText(currentTemplate || "");
                  }
                }}
                className={`border-b-2 px-1 py-4 text-sm font-medium ${
                  activeTab === "tasks"
                    ? "border-blue-500 text-blue-600 dark:text-blue-400"
                    : "border-transparent text-gray-500 hover:border-gray-300 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-300"
                }`}
              >
                <i className="fas fa-tasks mr-2"></i>
                Tasks
              </button>
              <button
                onClick={() => setActiveTab("config")}
                className={`border-b-2 px-1 py-4 text-sm font-medium ${
                  activeTab === "config"
                    ? "border-blue-500 text-blue-600 dark:text-blue-400"
                    : "border-transparent text-gray-500 hover:border-gray-300 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-300"
                }`}
              >
                <i className="fas fa-cog mr-2"></i>
                Environment
              </button>
            </nav>
          </div>
        </div>

        <div className="mx-auto max-w-6xl px-4 py-8 sm:px-6 lg:px-8">
          {activeTab === "tasks" && (
            <>
              {/* Page Title */}
              <div className="mb-8">
                <h1 className="mb-4 text-3xl font-bold text-gray-900 dark:text-gray-400">
                  What are we building next?
                </h1>

                {/* Task Input Card */}
                <div className="mb-6 border border-gray-200 dark:border-gray-700">
                  <TaskEditor
                    taskInput={taskInput}
                    onTaskInputChange={setTaskInput}
                    onKeyPress={handleKeyPress}
                    onSubmit={handleCodePress}
                    selectedRepo={selectedRepo}
                    templateText={templateText}
                  />

                  {/* Footer with dropdowns and buttons */}
                  <div className="flex items-center justify-between rounded-lg bg-white px-4 pb-3 dark:bg-gray-800">
                    <RepositoryBranchSelector
                      selectedRepo={selectedRepo}
                      selectedBranch={selectedBranch}
                      showRepoDropdown={showRepoDropdown}
                      showBranchDropdown={showBranchDropdown}
                      recentBranches={recentBranches}
                      branchSearchInput={branchSearchInput}
                      onRepoDropdownToggle={() =>
                        setShowRepoDropdown(!showRepoDropdown)
                      }
                      onBranchDropdownToggle={() =>
                        setShowBranchDropdown(!showBranchDropdown)
                      }
                      onRepoSelect={handleRepoSelect}
                      onBranchSelect={handleBranchSelect}
                      onBranchSearchChange={setBranchSearchInput}
                      onClose={handleCloseDropdowns}
                    />

                    <div className="flex items-center gap-3">
                      <button
                        disabled
                        className="cursor-not-allowed px-4 py-2 text-sm font-medium text-gray-600 transition-colors hover:text-gray-800 dark:text-gray-400 dark:hover:text-gray-200"
                      >
                        Ask
                      </button>
                      <button
                        onClick={handleCodePress}
                        disabled={
                          !taskInput.trim() ||
                          !selectedRepo.trim() ||
                          !selectedBranch.trim() ||
                          isEnhancing
                        }
                        className="flex items-center gap-2 rounded-md bg-gray-800 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-gray-900 disabled:cursor-not-allowed disabled:opacity-50 dark:bg-gray-600 dark:hover:bg-gray-700"
                      >
                        {isEnhancing && (
                          <i className="fas fa-spinner fa-spin text-xs"></i>
                        )}
                        {isEnhancing ? "Processing..." : "Code"}
                      </button>
                    </div>
                  </div>
                </div>

                {/* Status Tabs */}
                <div className="flex gap-8 text-sm">
                  <div className="flex items-center gap-2">
                    <span className="font-medium text-gray-900 dark:text-gray-100">
                      Tasks ({jobs.length})
                    </span>
                  </div>
                </div>
              </div>

              {/* Link to https://huggingface.co/settings/jobs */}
              <div className="mb-4">
                <a
                  href="https://huggingface.co/settings/jobs"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-sm text-blue-600 hover:underline"
                >
                  View all jobs on Hugging Face
                </a>
              </div>

              {/* Jobs List */}
              <div className="overflow-hidden rounded-lg border border-gray-200 bg-white dark:border-gray-700 dark:bg-gray-800">
                <div className="divide-y divide-gray-200 dark:divide-gray-700">
                  {jobs.length === 0 ? (
                    <div className="py-12 text-center text-gray-500 dark:text-gray-400">
                      <div className="mb-4">
                        <i className="fas fa-tasks text-6xl text-gray-300 dark:text-gray-600"></i>
                      </div>
                      <p className="mb-2 text-lg font-medium">No jobs yet</p>
                      <p className="text-sm">
                        Describe a task above and click "Code" to get started
                      </p>
                    </div>
                  ) : (
                    jobs.map((job) => (
                      <JobListItem
                        key={job.id}
                        job={job}
                        onClick={handleJobClick}
                      />
                    ))
                  )}
                </div>
              </div>
            </>
          )}

          {activeTab === "config" && (
            <div>
              <h1 className="mb-6 text-3xl font-bold text-gray-900 dark:text-gray-400">
                Environment
              </h1>

              {/* Configuration Panel */}
              <div className="rounded-lg border border-gray-200 bg-white dark:border-gray-700 dark:bg-gray-800">
                <ConfigurationPanel
                  onConfigChange={() => {
                    console.log("Configuration updated");
                    // Refresh template text when config changes
                    if (typeof window !== "undefined") {
                      const currentTemplate = localStorage.getItem(
                        "hugex_template_text"
                      );
                      setTemplateText(currentTemplate || "");
                    }
                  }}
                />
              </div>
            </div>
          )}
        </div>

        {/* Click outside to close dropdowns */}
        {(showRepoDropdown || showBranchDropdown) && (
          <div className="fixed inset-0 z-0" onClick={handleCloseDropdowns} />
        )}

        {/* Welcome Modal */}
        <WelcomeModal
          isOpen={showWelcomeModal}
          onClose={handleCloseWelcomeModal}
        />
      </div>
    </AuthWrapper>
  );
}
