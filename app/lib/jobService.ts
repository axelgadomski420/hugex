import { Job, JobDiff, FileDiff } from "~/types/job";

// Mock data store - in real app this would be a database or API
const jobs: Job[] = [];

// Mock diff data
const jobDiffs: Record<string, JobDiff> = {};

export class JobService {
  static async getAllJobs(): Promise<Job[]> {
    // Simulate API delay
    await new Promise((resolve) => setTimeout(resolve, 100));
    return jobs.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
  }

  static async getJob(id: string): Promise<Job | null> {
    await new Promise((resolve) => setTimeout(resolve, 50));
    return jobs.find((job) => job.id === id) || null;
  }

  static async createJob(
    data: Omit<Job, "id" | "createdAt" | "updatedAt">
  ): Promise<Job> {
    await new Promise((resolve) => setTimeout(resolve, 200));

    const newJob: Job = {
      ...data,
      id: String(jobs.length + 1),
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    jobs.unshift(newJob);
    return newJob;
  }

  static async getJobDiff(jobId: string): Promise<JobDiff | null> {
    await new Promise((resolve) => setTimeout(resolve, 150));
    return jobDiffs[jobId] || null;
  }

  static async updateJobStatus(
    jobId: string,
    status: Job["status"]
  ): Promise<Job | null> {
    await new Promise((resolve) => setTimeout(resolve, 100));

    const job = jobs.find((j) => j.id === jobId);
    if (job) {
      job.status = status;
      job.updatedAt = new Date();
      return job;
    }
    return null;
  }
}
