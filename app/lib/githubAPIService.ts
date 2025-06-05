// GitHub API service for fetching user repositories
export class GitHubAPIService {
  private static readonly GITHUB_API_BASE = "https://api.github.com";

  /**
   * Fetch user's repositories from GitHub
   */
  static async getUserRepositories(
    token: string,
    options: {
      type?: "all" | "owner" | "member";
      sort?: "created" | "updated" | "pushed" | "full_name";
      direction?: "asc" | "desc";
      per_page?: number;
      page?: number;
    } = {}
  ): Promise<GitHubRepository[]> {
    try {
      const params = new URLSearchParams({
        type: options.type || "all",
        sort: options.sort || "updated",
        direction: options.direction || "desc",
        per_page: String(options.per_page || 100),
        page: String(options.page || 1),
      });

      const response = await fetch(
        `${this.GITHUB_API_BASE}/user/repos?${params}`,
        {
          headers: {
            Authorization: `Bearer ${token}`,
            Accept: "application/vnd.github+json",
            "X-GitHub-Api-Version": "2022-11-28",
          },
        }
      );

      if (!response.ok) {
        console.error("Failed to fetch GitHub repositories:", response.status);
        return [];
      }

      const repos = await response.json();
      return repos.map((repo: any) => ({
        id: repo.id,
        name: repo.name,
        full_name: repo.full_name,
        description: repo.description,
        private: repo.private,
        fork: repo.fork,
        clone_url: repo.clone_url,
        ssh_url: repo.ssh_url,
        html_url: repo.html_url,
        language: repo.language,
        stargazers_count: repo.stargazers_count,
        updated_at: repo.updated_at,
        pushed_at: repo.pushed_at,
        default_branch: repo.default_branch,
        owner: {
          login: repo.owner.login,
          avatar_url: repo.owner.avatar_url,
        },
      }));
    } catch (error) {
      console.error("Error fetching GitHub repositories:", error);
      return [];
    }
  }

  /**
   * Search user's repositories
   */
  static async searchUserRepositories(
    token: string,
    query: string,
    username?: string
  ): Promise<GitHubRepository[]> {
    try {
      if (!query.trim()) {
        return [];
      }

      const searchQuery = username ? `${query} user:${username}` : query;

      const params = new URLSearchParams({
        q: searchQuery,
        sort: "updated",
        order: "desc",
        per_page: "50",
      });

      const response = await fetch(
        `${this.GITHUB_API_BASE}/search/repositories?${params}`,
        {
          headers: {
            Authorization: `Bearer ${token}`,
            Accept: "application/vnd.github+json",
            "X-GitHub-Api-Version": "2022-11-28",
          },
        }
      );

      if (!response.ok) {
        console.error("Failed to search GitHub repositories:", response.status);
        return [];
      }

      const data = await response.json();
      return data.items.map((repo: any) => ({
        id: repo.id,
        name: repo.name,
        full_name: repo.full_name,
        description: repo.description,
        private: repo.private,
        fork: repo.fork,
        clone_url: repo.clone_url,
        ssh_url: repo.ssh_url,
        html_url: repo.html_url,
        language: repo.language,
        stargazers_count: repo.stargazers_count,
        updated_at: repo.updated_at,
        pushed_at: repo.pushed_at,
        default_branch: repo.default_branch,
        owner: {
          login: repo.owner.login,
          avatar_url: repo.owner.avatar_url,
        },
      }));
    } catch (error) {
      console.error("Error searching GitHub repositories:", error);
      return [];
    }
  }

  /**
   * Get repository branches
   */
  static async getRepositoryBranches(
    token: string,
    owner: string,
    repo: string
  ): Promise<GitHubBranch[]> {
    try {
      const response = await fetch(
        `${this.GITHUB_API_BASE}/repos/${owner}/${repo}/branches`,
        {
          headers: {
            Authorization: `Bearer ${token}`,
            Accept: "application/vnd.github+json",
            "X-GitHub-Api-Version": "2022-11-28",
          },
        }
      );

      if (!response.ok) {
        console.error("Failed to fetch repository branches:", response.status);
        return [];
      }

      const branches = await response.json();
      return branches.map((branch: any) => ({
        name: branch.name,
        commit: {
          sha: branch.commit.sha,
          url: branch.commit.url,
        },
        protected: branch.protected,
      }));
    } catch (error) {
      console.error("Error fetching repository branches:", error);
      return [];
    }
  }
}

export interface GitHubRepository {
  id: number;
  name: string;
  full_name: string;
  description: string | null;
  private: boolean;
  fork: boolean;
  clone_url: string;
  ssh_url: string;
  html_url: string;
  language: string | null;
  stargazers_count: number;
  updated_at: string;
  pushed_at: string;
  default_branch: string;
  owner: {
    login: string;
    avatar_url: string;
  };
}

export interface GitHubBranch {
  name: string;
  commit: {
    sha: string;
    url: string;
  };
  protected: boolean;
}
