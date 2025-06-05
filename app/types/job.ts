export interface Job {
  id: string;
  title: string;
  description: string;
  status: "pending" | "running" | "completed" | "failed";
  createdAt: Date;
  updatedAt: Date;
  branch?: string;
  author?: string;
  tags?: string[];
  repository?: {
    url: string;
    branch?: string;
  };
  changes?: {
    additions: number;
    deletions: number;
    files: number;
  };
  logs?: string;
  environment?: Record<string, string>;
  secrets?: Record<string, string>;
  apiJobId?: string;
}

export interface FileDiff {
  filename: string;
  status: "added" | "modified" | "deleted" | "renamed";
  additions: number;
  deletions: number;
  patch: string;
  diff: string; // Alias for patch, both contain the same diff content
  oldFilename?: string;
}

export interface JobDiff {
  jobId: string;
  files: FileDiff[];
  summary: {
    totalAdditions: number;
    totalDeletions: number;
    totalFiles: number;
  };
}
