import { Job, JobDiff, FileDiff } from "~/types/job";
import { getJobStore } from "~/lib/server/jobStore";
import { getJobProcessor } from "~/lib/server/jobProcessor";

// Server-side job service that uses the jobStore directly
// This is much more efficient than making HTTP requests within the same process
export class JobService {
  private static jobStore = getJobStore();
  private static jobProcessor = getJobProcessor();

  static async getAllJobs(
    options: {
      page?: number;
      limit?: number;
      status?: string;
      search?: string;
      author?: string;
    } = {}
  ): Promise<{
    jobs: Job[];
    pagination: {
      page: number;
      limit: number;
      total: number;
      totalPages: number;
      hasNext: boolean;
      hasPrev: boolean;
    };
  }> {
    try {
      const {
        page = 1,
        limit = 20,
        status = "all",
        search = "",
        author,
      } = options;

      const pageNum = parseInt(String(page));
      const limitNum = Math.min(parseInt(String(limit)), 100);

      const result = await this.jobStore.listJobs({
        page: pageNum,
        limit: limitNum,
        status: status === "all" ? undefined : status,
        search: search || undefined,
        author: author || undefined,
      });

      return result;
    } catch (error) {
      console.error("Error listing jobs:", error);
      return {
        jobs: [],
        pagination: {
          page: 1,
          limit: 20,
          total: 0,
          totalPages: 0,
          hasNext: false,
          hasPrev: false,
        },
      };
    }
  }

  static async getJob(id: string): Promise<Job | null> {
    try {
      return await this.jobStore.getJob(id);
    } catch (error) {
      console.error("Failed to fetch job:", error);
      return null;
    }
  }

  static async createJob(
    data: Omit<Job, "id" | "createdAt" | "updatedAt">
  ): Promise<Job> {
    try {
      const job: Job = {
        ...data,
        id: this.generateId(),
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      console.log("Creating job:", job);

      await this.jobStore.createJob(job);

      // show credentials
      // console.log("API Credentials:", req.apiCredentials);

      // Need to process the job
      // this.jobProcessor.processJob(job.id, this.jobStore);

      // jobProcessor
      //   .processJob(job.id, this.jobStore, req.apiCredentials)
      //   .catch((error) => {
      //     console.error(`Failed to process job ${job.id}:`, error);
      //   });

      return job;
    } catch (error) {
      console.error("Failed to create job:", error);
      throw error;
    }
  }

  static async getJobDiff(jobId: string): Promise<JobDiff | null> {
    try {
      return await this.jobStore.getJobDiff(jobId);
    } catch (error) {
      console.error("Failed to fetch job diff:", error);
      return null;
    }
  }

  static async setJobDiff(jobId: string, diff: JobDiff): Promise<void> {
    try {
      await this.jobStore.setJobDiff(jobId, diff);
    } catch (error) {
      console.error("Failed to set job diff:", error);
      throw error;
    }
  }

  static async getJobLogs(jobId: string): Promise<string | null> {
    try {
      return await this.jobStore.getJobLogs(jobId);
    } catch (error) {
      console.error("Failed to fetch job logs:", error);
      return null;
    }
  }

  static async setJobLogs(jobId: string, logs: string): Promise<void> {
    try {
      await this.jobStore.setJobLogs(jobId, logs);
    } catch (error) {
      console.error("Failed to set job logs:", error);
      throw error;
    }
  }

  static async updateJobStatus(
    jobId: string,
    status: Job["status"],
    changes?: any
  ): Promise<Job | null> {
    try {
      return await this.jobStore.updateJobStatus(jobId, status, changes);
    } catch (error) {
      console.error("Failed to update job status:", error);
      return null;
    }
  }

  static async deleteJob(jobId: string): Promise<boolean> {
    try {
      return await this.jobStore.deleteJob(jobId);
    } catch (error) {
      console.error("Failed to delete job:", error);
      return false;
    }
  }

  // Utility method to generate unique IDs
  private static generateId(): string {
    return Math.random().toString(36).substring(2) + Date.now().toString(36);
  }

  // Health check method - since we're using in-memory store, we can always return true
  static async checkHealth(): Promise<boolean> {
    try {
      // Simple health check - try to list jobs
      await this.jobStore.listJobs({ limit: 1 });
      return true;
    } catch (error) {
      console.error("Health check failed:", error);
      return false;
    }
  }

  // Batch operations for efficiency
  static async getMultipleJobs(ids: string[]): Promise<(Job | null)[]> {
    try {
      const promises = ids.map((id) => this.jobStore.getJob(id));
      return await Promise.all(promises);
    } catch (error) {
      console.error("Failed to fetch multiple jobs:", error);
      return ids.map(() => null);
    }
  }

  static async getJobsByStatus(
    status: Job["status"],
    author?: string
  ): Promise<Job[]> {
    try {
      const result = await this.jobStore.listJobs({
        status,
        author,
        limit: 1000, // Get all jobs with this status
      });
      return result.jobs;
    } catch (error) {
      console.error("Failed to fetch jobs by status:", error);
      return [];
    }
  }

  // Search functionality
  static async searchJobs(
    query: string,
    options: {
      page?: number;
      limit?: number;
      status?: string;
      author?: string;
    } = {}
  ): Promise<{
    jobs: Job[];
    pagination: {
      page: number;
      limit: number;
      total: number;
      totalPages: number;
      hasNext: boolean;
      hasPrev: boolean;
    };
  }> {
    try {
      return await this.getAllJobs({
        ...options,
        search: query,
      });
    } catch (error) {
      console.error("Failed to search jobs:", error);
      return {
        jobs: [],
        pagination: {
          page: 1,
          limit: 20,
          total: 0,
          totalPages: 0,
          hasNext: false,
          hasPrev: false,
        },
      };
    }
  }

  static async createBranchAndPush(
    jobId: string,
    options: {
      branch: string;
      title: string;
      description: string;
      baseBranch: string;
    },
    credentials?: any
  ): Promise<{ branch: string; commitHash: string }> {
    try {
      const job = await this.getJob(jobId);
      const jobDiff = await this.getJobDiff(jobId);

      if (!job || !jobDiff || !job.repository?.url) {
        throw new Error("Job, diff, or repository not found");
      }

      if (!jobDiff.files || jobDiff.files.length === 0) {
        throw new Error("No changes to commit");
      }

      // Use the job processor to create branch and push changes
      const result = await this.jobProcessor.createBranchAndPush({
        repositoryUrl: job.repository.url,
        branch: options.branch,
        baseBranch: options.baseBranch,
        title: options.title,
        description: options.description,
        files: jobDiff.files,
        credentials,
      });

      return result;
    } catch (error) {
      console.error("Failed to create branch and push:", error);
      throw error;
    }
  }

  // Statistics and analytics
  static async getJobStats(): Promise<{
    total: number;
    byStatus: Record<string, number>;
    recent: Job[];
  }> {
    try {
      const allJobsResult = await this.jobStore.listJobs({ limit: 1000 });
      const allJobs = allJobsResult.jobs;

      const byStatus: Record<string, number> = {};
      allJobs.forEach((job) => {
        byStatus[job.status] = (byStatus[job.status] || 0) + 1;
      });

      // Get 5 most recent jobs
      const recent = allJobs.slice(0, 5);

      return {
        total: allJobs.length,
        byStatus,
        recent,
      };
    } catch (error) {
      console.error("Failed to get job stats:", error);
      return {
        total: 0,
        byStatus: {},
        recent: [],
      };
    }
  }
}
