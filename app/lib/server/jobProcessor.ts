import { ApiJobExecutor } from "./processors/ApiJobExecutor";
import { DockerJobExecutor } from "./processors/DockerJobExecutor";
import { JobExecutor } from "./processors/JobExecutor";
import { JobStore } from "./jobStore";
import serverConfig from "./config";
import type { Job } from "~/types/job";

// JobProcessor supports both API and Docker execution modes
export class JobProcessor {
  private executor: JobExecutor;
  private currentMode: string;

  constructor(mode?: string) {
    this.currentMode = mode || serverConfig.EXECUTION_MODE;
    this.executor = this.createExecutor(this.currentMode);
  }

  private createExecutor(mode: string): JobExecutor {
    switch (mode) {
      case "docker":
        return new DockerJobExecutor();
      case "api":
      default:
        return new ApiJobExecutor();
    }
  }

  async processJob(jobId: string, jobStore: JobStore, credentials: any) {
    try {
      // Update status to running
      await jobStore.updateJobStatus(jobId, "running");

      // Get job data for context
      const job = await jobStore.getJob(jobId);

      // Execute the job using the API executor with credentials
      const result = await this.executor.execute(jobId, job, credentials);

      // Store the environment and secrets used for this job
      if (result.environment || result.secrets || result.apiJobId) {
        await jobStore.updateJobEnvironment(
          jobId,
          result.environment || {},
          result.secrets
            ? Object.keys(result.secrets).reduce(
                (acc, key) => {
                  acc[key] = "***"; // Mask secret values for security
                  return acc;
                },
                {} as Record<string, string>
              )
            : {},
          result.apiJobId
        );
      }

      // Store the full output logs (before extracting diff)
      if (result.output) {
        await jobStore.setJobLogs(jobId, result.output);
      }

      // Store the diff
      await jobStore.setJobDiff(jobId, result.diff);

      // Update status to completed with changes
      await jobStore.updateJobStatus(jobId, "completed", {
        additions: result.diff.summary.totalAdditions,
        deletions: result.diff.summary.totalDeletions,
        files: result.diff.summary.totalFiles,
      });

      console.log(
        `✅ Job ${jobId} completed successfully via ${this.currentMode}`
      );
      return result;
    } catch (error) {
      console.error(
        `❌ Job ${jobId} failed in ${this.currentMode} mode:`,
        error
      );
      await jobStore.updateJobStatus(jobId, "failed");
      throw error;
    }
  }

  async createBranchAndPush(options: {
    repositoryUrl: string;
    branch: string;
    baseBranch: string;
    title: string;
    description: string;
    files: any[];
    credentials?: any;
  }): Promise<{ branch: string; commitHash: string }> {
    try {
      // Use the API executor to create branch and push changes
      const result = await this.executor.createBranchAndPush(options);
      return result;
    } catch (error) {
      console.error("Failed to create branch and push:", error);
      throw error;
    }
  }

  // Method to switch execution mode
  switchExecutionMode(mode: string) {
    if (mode !== this.currentMode && (mode === "api" || mode === "docker")) {
      this.currentMode = mode;
      this.executor = this.createExecutor(mode);
      console.log(`🔄 Switched execution mode to: ${mode}`);
    } else if (mode !== "api" && mode !== "docker") {
      console.warn(
        `Invalid execution mode: ${mode}. Valid modes are 'api' and 'docker'.`
      );
    }
  }

  // Get current execution mode
  getExecutionMode(): string {
    return this.currentMode;
  }
}

// Singleton instance
let jobProcessorInstance: JobProcessor | null = null;

export function getJobProcessor(): JobProcessor {
  if (!jobProcessorInstance) {
    jobProcessorInstance = new JobProcessor();
  }
  return jobProcessorInstance;
}
