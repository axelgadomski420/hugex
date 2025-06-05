// GitHub Issue Types
export interface GitHubIssue {
  id: number;
  number: number;
  title: string;
  body: string;
  state: "open" | "closed";
  user: {
    login: string;
    avatar_url: string;
  };
  labels: Array<{
    name: string;
    color: string;
  }>;
  created_at: string;
  updated_at: string;
}

export interface GitHubUser {
  login: string;
  id: number;
  avatar_url: string;
  name: string;
  email?: string;
  bio?: string;
  company?: string;
  location?: string;
  public_repos: number;
  followers: number;
  following: number;
}

export interface IssueMention {
  number: number;
  startIndex: number;
  endIndex: number;
}

export interface AuthenticationStatus {
  isAuthenticated: boolean;
  user?: GitHubUser;
  scopes?: string[];
  rateLimit?: {
    limit: number;
    remaining: number;
    reset: number;
  };
}

// GitHub API Service
export class GitHubService {
  private static issueCache = new Map<string, GitHubIssue>();
  private static repositoryIssuesCache = new Map<
    string,
    { data: GitHubIssue[]; timestamp: number }
  >();
  private static pendingRequests = new Map<string, Promise<any>>();
  private static failedRequests = new Map<
    string,
    { count: number; lastAttempt: number }
  >();
  private static readonly BASE_URL = "https://api.github.com";
  private static readonly CACHE_TTL = 5 * 60 * 1000; // 5 minutes
  private static readonly MAX_RETRY_ATTEMPTS = 3;
  private static readonly RETRY_BACKOFF_TIME = 10 * 60 * 1000; // 10 minutes

  // Authentication properties
  private static authToken: string | null = null;
  private static authenticatedUser: GitHubUser | null = null;
  private static authScopes: string[] = [];

  // Authentication methods
  static setAuthToken(token: string): void {
    this.authToken = token;
    // Clear caches when authentication changes as rate limits and access may differ
    this.clearAllCaches();
  }

  static clearAuth(): void {
    this.authToken = null;
    this.authenticatedUser = null;
    this.authScopes = [];
    // Clear caches when authentication is removed
    this.clearAllCaches();
  }

  static isAuthenticated(): boolean {
    return this.authToken !== null;
  }

  static getAuthToken(): string | null {
    return this.authToken;
  }

  static async getAuthenticatedUser(): Promise<GitHubUser | null> {
    if (!this.isAuthenticated()) {
      return null;
    }

    // Return cached user if available
    if (this.authenticatedUser) {
      return this.authenticatedUser;
    }

    try {
      const response = await this.makeAuthenticatedRequest("/user");
      if (response.ok) {
        const user: GitHubUser = await response.json();
        this.authenticatedUser = user;
        return user;
      }
    } catch (error) {
      console.warn("Failed to fetch authenticated user:", error);
    }

    return null;
  }

  static async getAuthenticationStatus(): Promise<AuthenticationStatus> {
    if (!this.isAuthenticated()) {
      return { isAuthenticated: false };
    }

    try {
      const user = await this.getAuthenticatedUser();
      const rateLimit = await this.getRateLimit();

      return {
        isAuthenticated: true,
        user: user || undefined,
        scopes: this.authScopes.length > 0 ? this.authScopes : undefined,
        rateLimit,
      };
    } catch (error) {
      console.warn("Failed to get authentication status:", error);
      return { isAuthenticated: true }; // Token exists but might have limited info
    }
  }

  static async getRateLimit(): Promise<
    { limit: number; remaining: number; reset: number } | undefined
  > {
    try {
      const response = await this.makeRequest("/rate_limit");
      if (response.ok) {
        const data = await response.json();
        return {
          limit: data.rate.limit,
          remaining: data.rate.remaining,
          reset: data.rate.reset,
        };
      }
    } catch (error) {
      console.warn("Failed to fetch rate limit:", error);
    }
    return undefined;
  }

  // Enhanced request methods with authentication
  private static async makeRequest(
    endpoint: string,
    options: RequestInit = {}
  ): Promise<Response> {
    const url = endpoint.startsWith("http")
      ? endpoint
      : `${this.BASE_URL}${endpoint}`;

    const headers: HeadersInit = {
      Accept: "application/vnd.github+json",
      "X-GitHub-Api-Version": "2022-11-28",
      ...options.headers,
    };

    // Add authentication header if token is available
    if (this.authToken) {
      headers["Authorization"] = `Bearer ${this.authToken}`;
    }

    return fetch(url, {
      ...options,
      headers,
    });
  }

  private static async makeAuthenticatedRequest(
    endpoint: string,
    options: RequestInit = {}
  ): Promise<Response> {
    if (!this.isAuthenticated()) {
      throw new Error("Authentication required for this request");
    }
    return this.makeRequest(endpoint, options);
  }

  // Enhanced issue fetching with authentication
  static async getIssue(
    repoUrl: string,
    issueNumber: number
  ): Promise<GitHubIssue | null> {
    const cacheKey = `${repoUrl}#${issueNumber}`;

    // Check cache first
    if (this.issueCache.has(cacheKey)) {
      return this.issueCache.get(cacheKey)!;
    }

    // Check if this request has failed too many times
    if (this.shouldSkipFailedRequest(cacheKey)) {
      return null;
    }

    // Check if request is already pending to avoid duplicate requests
    if (this.pendingRequests.has(cacheKey)) {
      try {
        return await this.pendingRequests.get(cacheKey);
      } catch (error) {
        return null;
      }
    }

    // Create and store the promise
    const requestPromise = this.fetchIssue(repoUrl, issueNumber);
    this.pendingRequests.set(cacheKey, requestPromise);

    try {
      const issue = await requestPromise;
      if (issue) {
        this.issueCache.set(cacheKey, issue);
        // Clear any previous failure record on success
        this.failedRequests.delete(cacheKey);
      } else {
        // Track failed request (404 or other issues)
        this.trackFailedRequest(cacheKey);
      }
      return issue;
    } catch (error) {
      console.warn("Failed to fetch GitHub issue:", error);
      this.trackFailedRequest(cacheKey);
      return null;
    } finally {
      this.pendingRequests.delete(cacheKey);
    }
  }

  private static async fetchIssue(
    repoUrl: string,
    issueNumber: number
  ): Promise<GitHubIssue | null> {
    const repoPath = this.extractRepoPath(repoUrl);
    if (!repoPath) return null;

    const response = await this.makeRequest(
      `/repos/${repoPath}/issues/${issueNumber}`
    );

    if (!response.ok) {
      if (response.status === 404) return null;
      throw new Error(`GitHub API error: ${response.status}`);
    }

    const issue: GitHubIssue = await response.json();
    return issue;
  }

  static async getRepositoryIssues(
    repoUrl: string,
    query?: string,
    options?: {
      state?: "open" | "closed" | "all";
      sort?: "created" | "updated" | "comments";
      direction?: "asc" | "desc";
      per_page?: number;
      page?: number;
    }
  ): Promise<GitHubIssue[]> {
    const cacheKey = `${repoUrl}:${query || ""}:${JSON.stringify(options || {})}`;

    // Check cache with TTL
    if (this.repositoryIssuesCache.has(cacheKey)) {
      const cached = this.repositoryIssuesCache.get(cacheKey)!;
      if (Date.now() - cached.timestamp < this.CACHE_TTL) {
        return cached.data;
      }
      // Remove expired cache
      this.repositoryIssuesCache.delete(cacheKey);
    }

    // Check if this request has failed too many times
    if (this.shouldSkipFailedRequest(cacheKey)) {
      return [];
    }

    // Check if request is already pending
    if (this.pendingRequests.has(cacheKey)) {
      try {
        return await this.pendingRequests.get(cacheKey);
      } catch (error) {
        return [];
      }
    }

    // Create and store the promise
    const requestPromise = this.fetchRepositoryIssues(repoUrl, query, options);
    this.pendingRequests.set(cacheKey, requestPromise);

    try {
      const issues = await requestPromise;

      // Cache the results with timestamp
      this.repositoryIssuesCache.set(cacheKey, {
        data: issues,
        timestamp: Date.now(),
      });

      // Also cache individual issues
      issues.forEach((issue) => {
        const issueCacheKey = `${repoUrl}#${issue.number}`;
        if (!this.issueCache.has(issueCacheKey)) {
          this.issueCache.set(issueCacheKey, issue);
        }
      });

      // Clear any previous failure record on success
      this.failedRequests.delete(cacheKey);

      return issues;
    } catch (error) {
      console.warn("Failed to fetch repository issues:", error);
      this.trackFailedRequest(cacheKey);
      return [];
    } finally {
      this.pendingRequests.delete(cacheKey);
    }
  }

  private static async fetchRepositoryIssues(
    repoUrl: string,
    query?: string,
    options?: {
      state?: "open" | "closed" | "all";
      sort?: "created" | "updated" | "comments";
      direction?: "asc" | "desc";
      per_page?: number;
      page?: number;
    }
  ): Promise<GitHubIssue[]> {
    const repoPath = this.extractRepoPath(repoUrl);
    if (!repoPath) return [];

    // Build query parameters
    const params = new URLSearchParams({
      state: options?.state || "open",
      sort: options?.sort || "created",
      direction: options?.direction || "desc",
      per_page: (options?.per_page || 10).toString(),
      page: (options?.page || 1).toString(),
    });

    const url = `/repos/${repoPath}/issues?${params.toString()}`;
    const response = await this.makeRequest(url);

    if (!response.ok) return [];

    const issues = await response.json();

    // Filter by number if query is provided
    if (query && query.trim()) {
      const queryNum = query.trim();
      return issues.filter((issue: GitHubIssue) =>
        issue.number.toString().startsWith(queryNum)
      );
    }

    return issues;
  }

  // New authenticated methods
  static async createIssue(
    repoUrl: string,
    title: string,
    body?: string,
    labels?: string[]
  ): Promise<GitHubIssue | null> {
    if (!this.isAuthenticated()) {
      throw new Error("Authentication required to create issues");
    }

    const repoPath = this.extractRepoPath(repoUrl);
    if (!repoPath) return null;

    try {
      const response = await this.makeAuthenticatedRequest(
        `/repos/${repoPath}/issues`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            title,
            body: body || "",
            labels: labels || [],
          }),
        }
      );

      if (!response.ok) {
        throw new Error(`Failed to create issue: ${response.status}`);
      }

      const issue: GitHubIssue = await response.json();

      // Add to cache
      const cacheKey = `${repoUrl}#${issue.number}`;
      this.issueCache.set(cacheKey, issue);

      // Clear repository issues cache to force refresh
      this.clearRepositoryCache(repoUrl);

      return issue;
    } catch (error) {
      console.error("Failed to create issue:", error);
      return null;
    }
  }

  static async updateIssue(
    repoUrl: string,
    issueNumber: number,
    updates: {
      title?: string;
      body?: string;
      state?: "open" | "closed";
      labels?: string[];
    }
  ): Promise<GitHubIssue | null> {
    if (!this.isAuthenticated()) {
      throw new Error("Authentication required to update issues");
    }

    const repoPath = this.extractRepoPath(repoUrl);
    if (!repoPath) return null;

    try {
      const response = await this.makeAuthenticatedRequest(
        `/repos/${repoPath}/issues/${issueNumber}`,
        {
          method: "PATCH",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify(updates),
        }
      );

      if (!response.ok) {
        throw new Error(`Failed to update issue: ${response.status}`);
      }

      const issue: GitHubIssue = await response.json();

      // Update cache
      const cacheKey = `${repoUrl}#${issue.number}`;
      this.issueCache.set(cacheKey, issue);

      // Clear repository issues cache to force refresh
      this.clearRepositoryCache(repoUrl);

      return issue;
    } catch (error) {
      console.error("Failed to update issue:", error);
      return null;
    }
  }

  static async addComment(
    repoUrl: string,
    issueNumber: number,
    body: string
  ): Promise<boolean> {
    if (!this.isAuthenticated()) {
      throw new Error("Authentication required to add comments");
    }

    const repoPath = this.extractRepoPath(repoUrl);
    if (!repoPath) return false;

    try {
      const response = await this.makeAuthenticatedRequest(
        `/repos/${repoPath}/issues/${issueNumber}/comments`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ body }),
        }
      );

      return response.ok;
    } catch (error) {
      console.error("Failed to add comment:", error);
      return false;
    }
  }

  // Method to clear cache for a specific repository (useful when switching repos)
  static clearRepositoryCache(repoUrl: string): void {
    const keysToDelete: string[] = [];

    // Clear issue cache for this repo
    this.issueCache.forEach((_, key) => {
      if (key.startsWith(repoUrl)) {
        keysToDelete.push(key);
      }
    });

    keysToDelete.forEach((key) => this.issueCache.delete(key));

    // Clear repository issues cache for this repo
    const repoKeysToDelete: string[] = [];
    this.repositoryIssuesCache.forEach((_, key) => {
      if (key.startsWith(repoUrl)) {
        repoKeysToDelete.push(key);
      }
    });

    repoKeysToDelete.forEach((key) => this.repositoryIssuesCache.delete(key));

    // Clear failed requests for this repo
    const failedKeysToDelete: string[] = [];
    this.failedRequests.forEach((_, key) => {
      if (key.startsWith(repoUrl)) {
        failedKeysToDelete.push(key);
      }
    });

    failedKeysToDelete.forEach((key) => this.failedRequests.delete(key));
  }

  // Method to clear all caches
  static clearAllCaches(): void {
    this.issueCache.clear();
    this.repositoryIssuesCache.clear();
    this.pendingRequests.clear();
    this.failedRequests.clear();
  }

  // Helper method to check if a failed request should be skipped
  private static shouldSkipFailedRequest(cacheKey: string): boolean {
    const failureInfo = this.failedRequests.get(cacheKey);
    if (!failureInfo) return false;

    // If we've exceeded max attempts
    if (failureInfo.count >= this.MAX_RETRY_ATTEMPTS) {
      // Check if enough time has passed for a retry
      const timeSinceLastAttempt = Date.now() - failureInfo.lastAttempt;
      if (timeSinceLastAttempt < this.RETRY_BACKOFF_TIME) {
        return true; // Skip this request
      }
      // Reset the failure count after backoff period
      this.failedRequests.delete(cacheKey);
    }

    return false;
  }

  // Helper method to track failed requests
  private static trackFailedRequest(cacheKey: string): void {
    const existing = this.failedRequests.get(cacheKey);
    if (existing) {
      this.failedRequests.set(cacheKey, {
        count: existing.count + 1,
        lastAttempt: Date.now(),
      });
    } else {
      this.failedRequests.set(cacheKey, {
        count: 1,
        lastAttempt: Date.now(),
      });
    }
  }

  // Debug method to get cache statistics
  static getCacheStats(): {
    issuesCached: number;
    repositorySearchesCached: number;
    failedRequests: number;
    pendingRequests: number;
    isAuthenticated: boolean;
    authenticatedUser?: string;
  } {
    return {
      issuesCached: this.issueCache.size,
      repositorySearchesCached: this.repositoryIssuesCache.size,
      failedRequests: this.failedRequests.size,
      pendingRequests: this.pendingRequests.size,
      isAuthenticated: this.isAuthenticated(),
      authenticatedUser: this.authenticatedUser?.login,
    };
  }

  private static extractRepoPath(url: string): string | null {
    const match = url.match(/github\.com\/([\w\-\.]+\/[\w\-\.]+)/);
    return match ? match[1].replace(".git", "") : null;
  }
}

// Utility functions
export const parseIssueMentions = (text: string): IssueMention[] => {
  const mentions: IssueMention[] = [];
  const regex = /#(\d+)/g;
  let match;

  while ((match = regex.exec(text)) !== null) {
    mentions.push({
      number: parseInt(match[1], 10),
      startIndex: match.index,
      endIndex: match.index + match[0].length,
    });
  }

  return mentions;
};
