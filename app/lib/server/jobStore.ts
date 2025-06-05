// In-memory job store (replace with database in production)
import type { Job, JobDiff } from "~/types/job";

export class JobStore {
  private jobs = new Map<string, Job>();
  private diffs = new Map<string, JobDiff>();
  private logs = new Map<string, string>();

  async listJobs({
    page = 1,
    limit = 20,
    status,
    search,
    author,
  }: {
    page?: number;
    limit?: number;
    status?: string;
    search?: string;
    author?: string;
  } = {}) {
    let jobs = Array.from(this.jobs.values());

    // Filter by status
    if (status) {
      jobs = jobs.filter((job) => job.status === status);
    }

    // Filter by search
    if (search) {
      const searchLower = search.toLowerCase();
      jobs = jobs.filter(
        (job) =>
          job.title.toLowerCase().includes(searchLower) ||
          job.description.toLowerCase().includes(searchLower)
      );
    }

    // Filter by author
    if (author) {
      jobs = jobs.filter((job) => job.author === author);
    }

    // Sort by creation date (newest first)
    jobs.sort(
      (a, b) =>
        new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    );

    // Pagination
    const total = jobs.length;
    const totalPages = Math.ceil(total / limit);
    const offset = (page - 1) * limit;
    const paginatedJobs = jobs.slice(offset, offset + limit);

    return {
      jobs: paginatedJobs,
      pagination: {
        page,
        limit,
        total,
        totalPages,
        hasNext: page < totalPages,
        hasPrev: page > 1,
      },
    };
  }

  async getJob(jobId: string): Promise<Job | null> {
    return this.jobs.get(jobId) || null;
  }

  async createJob(job: Job): Promise<Job> {
    this.jobs.set(job.id, { ...job });
    return job;
  }

  async updateJobStatus(
    jobId: string,
    status: Job["status"],
    changes?: any
  ): Promise<Job | null> {
    const job = this.jobs.get(jobId);
    if (!job) return null;

    const updatedJob: Job = {
      ...job,
      status,
      updatedAt: new Date(),
      ...(changes && { changes }),
    };

    this.jobs.set(jobId, updatedJob);
    return updatedJob;
  }

  async updateJobEnvironment(
    jobId: string,
    environment: Record<string, string>,
    secrets?: Record<string, string>,
    apiJobId?: string
  ): Promise<Job | null> {
    const job = this.jobs.get(jobId);
    if (!job) return null;

    const updatedJob: Job = {
      ...job,
      environment,
      secrets,
      apiJobId,
      updatedAt: new Date(),
    };

    this.jobs.set(jobId, updatedJob);
    return updatedJob;
  }

  async deleteJob(jobId: string): Promise<boolean> {
    const deleted = this.jobs.delete(jobId);
    this.diffs.delete(jobId);
    this.logs.delete(jobId);
    return deleted;
  }

  async setJobDiff(jobId: string, diff: JobDiff): Promise<void> {
    this.diffs.set(jobId, diff);
  }

  async getJobDiff(jobId: string): Promise<JobDiff | null> {
    return this.diffs.get(jobId) || null;
  }

  async setJobLogs(jobId: string, logs: string): Promise<void> {
    this.logs.set(jobId, logs);
    // Also update the job record to include logs
    const job = this.jobs.get(jobId);
    if (job) {
      const updatedJob = { ...job, logs };
      this.jobs.set(jobId, updatedJob);
    }
  }

  async getJobLogs(jobId: string): Promise<string | null> {
    return this.logs.get(jobId) || null;
  }

  async getAllJobs(): Promise<Job[]> {
    return Array.from(this.jobs.values());
  }
}

// Singleton instance
let jobStoreInstance: JobStore | null = null;

export function getJobStore(): JobStore {
  if (!jobStoreInstance) {
    jobStoreInstance = new JobStore();
  }
  return jobStoreInstance;
}
