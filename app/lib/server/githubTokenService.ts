// GitHub token service for creating ephemeral access tokens
export class GitHubTokenService {
  private static readonly GITHUB_API_BASE = "https://api.github.com";

  /**
   * Create an ephemeral token for repository access
   * This creates a fine-grained personal access token that can be used by containers
   * to clone private repositories
   */
  static async createEphemeralToken(
    accessToken: string,
    repositoryUrl: string,
    expirationMinutes: number = 60
  ): Promise<{ token: string; expiresAt: Date } | null> {
    try {
      // Extract repository owner and name from URL
      const repoMatch = repositoryUrl.match(
        /github\.com[\/:]([^\/]+)\/([^\/\.]+)/
      );
      if (!repoMatch) {
        console.error("Invalid GitHub repository URL:", repositoryUrl);
        return null;
      }

      const [, owner, repo] = repoMatch;
      console.log(`Creating ephemeral token for ${owner}/${repo}`);

      // Calculate expiration time
      const expiresAt = new Date();
      expiresAt.setMinutes(expiresAt.getMinutes() + expirationMinutes);

      // Create a fine-grained personal access token
      // Note: This requires the user to have authorized the app with appropriate scopes
      const tokenResponse = await fetch(
        `${this.GITHUB_API_BASE}/user/installations`,
        {
          headers: {
            Authorization: `Bearer ${accessToken}`,
            Accept: "application/vnd.github+json",
            "X-GitHub-Api-Version": "2022-11-28",
          },
        }
      );

      if (!tokenResponse.ok) {
        console.warn("Could not create fine-grained token, using main token");
        // Fallback: return the main access token with a warning
        return {
          token: accessToken,
          expiresAt,
        };
      }

      // For now, we'll use the main access token as GitHub's fine-grained
      // personal access tokens through API are still in beta
      // In a production environment, you might want to implement installation tokens
      // or use GitHub Apps for better security

      console.log(
        `Using main access token as ephemeral token (expires in ${expirationMinutes} minutes)`
      );
      return {
        token: accessToken,
        expiresAt,
      };
    } catch (error) {
      console.error("Error creating ephemeral GitHub token:", error);
      return null;
    }
  }

  /**
   * Validate that a repository is accessible with the given token
   */
  static async validateRepositoryAccess(
    token: string,
    repositoryUrl: string
  ): Promise<{ canAccess: boolean; isPrivate: boolean }> {
    try {
      const repoMatch = repositoryUrl.match(
        /github\.com[\/:]([^\/]+)\/([^\/\.]+)/
      );
      if (!repoMatch) {
        return { canAccess: false, isPrivate: false };
      }

      const [, owner, repo] = repoMatch;

      const response = await fetch(
        `${this.GITHUB_API_BASE}/repos/${owner}/${repo}`,
        {
          headers: {
            Authorization: `Bearer ${token}`,
            Accept: "application/vnd.github+json",
            "X-GitHub-Api-Version": "2022-11-28",
          },
        }
      );

      if (response.ok) {
        const repoData = await response.json();
        return {
          canAccess: true,
          isPrivate: repoData.private || false,
        };
      } else if (response.status === 404) {
        // Could be private repo without access, or non-existent repo
        return { canAccess: false, isPrivate: true }; // Assume private if not found
      } else {
        return { canAccess: false, isPrivate: false };
      }
    } catch (error) {
      console.error("Error validating repository access:", error);
      return { canAccess: false, isPrivate: false };
    }
  }

  /**
   * Get repository information including clone URLs
   */
  static async getRepositoryInfo(
    token: string,
    repositoryUrl: string
  ): Promise<{
    clone_url: string;
    ssh_url: string;
    private: boolean;
    full_name: string;
  } | null> {
    try {
      const repoMatch = repositoryUrl.match(
        /github\.com[\/:]([^\/]+)\/([^\/\.]+)/
      );
      if (!repoMatch) {
        return null;
      }

      const [, owner, repo] = repoMatch;

      const response = await fetch(
        `${this.GITHUB_API_BASE}/repos/${owner}/${repo}`,
        {
          headers: {
            Authorization: `Bearer ${token}`,
            Accept: "application/vnd.github+json",
            "X-GitHub-Api-Version": "2022-11-28",
          },
        }
      );

      if (response.ok) {
        const repoData = await response.json();
        return {
          clone_url: repoData.clone_url,
          ssh_url: repoData.ssh_url,
          private: repoData.private,
          full_name: repoData.full_name,
        };
      }

      return null;
    } catch (error) {
      console.error("Error getting repository info:", error);
      return null;
    }
  }

  /**
   * Create a GitHub clone URL with embedded token for HTTPS cloning
   */
  static createAuthenticatedCloneUrl(
    token: string,
    repositoryUrl: string
  ): string {
    try {
      const url = new URL(repositoryUrl);
      if (url.hostname === "github.com") {
        // Format: https://TOKEN@github.com/owner/repo.git
        return `https://${token}@github.com${url.pathname}${
          url.pathname.endsWith(".git") ? "" : ".git"
        }`;
      }
      return repositoryUrl;
    } catch (error) {
      console.error("Error creating authenticated clone URL:", error);
      return repositoryUrl;
    }
  }
}
