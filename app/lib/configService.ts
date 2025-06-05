// Configuration endpoint for repository settings
import { AuthService } from "./authService";

export const DEFAULT_TEMPLATE =
  "List the current directory. To complete the user task, make a short actionable todo list for yourself before making changes to the codebase.";

export interface DockerConfig {
  image: string;
  environment: Record<string, string>;
  secrets: Record<string, string>;
}

export class ConfigService {
  // Use relative URLs since we're now integrated with Remix

  // Helper method to get headers with basic content type
  private static getAuthHeaders(): HeadersInit {
    return {
      "Content-Type": "application/json",
    };
  }

  // Helper method for fetch with credentials
  private static async fetchWithCredentials(
    input: RequestInfo,
    init?: RequestInit
  ): Promise<Response> {
    try {
      const response = await fetch(input, {
        credentials: "include", // This is crucial for sending cookies
        ...init,
        headers: {
          ...this.getAuthHeaders(),
          ...(init?.headers || {}),
        },
      });

      return response;
    } catch (error) {
      console.error("Fetch failed:", error);
      throw error;
    }
  }

  static async getRepoConfig(): Promise<{
    url: string;
    branch?: string;
    message?: string;
  }> {
    try {
      const response = await this.fetchWithCredentials(
        `/api/config/repository`
      );
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      const data = await response.json();
      console.warn("Repository configuration is deprecated:", data.message);
      return data;
    } catch (error) {
      console.error("Failed to fetch repo config (deprecated):", error);
      // Return default
      return {
        url: "https://github.com/drbh/cleanplate",
        branch: "main",
        message:
          "Repository configuration is deprecated. Use per-job repository selection.",
      };
    }
  }

  static async updateRepoConfig(config: {
    url: string;
    branch?: string;
  }): Promise<{ url: string; branch?: string; message: string }> {
    try {
      console.warn(
        "Repository configuration update ignored (deprecated):",
        config
      );
      const response = await this.fetchWithCredentials(
        `/api/config/repository`,
        {
          method: "PUT",
          body: JSON.stringify(config),
        }
      );

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(
          errorData.error?.message || `HTTP error! status: ${response.status}`
        );
      }

      return await response.json();
    } catch (error) {
      console.error("Failed to update repo config (deprecated):", error);
      throw error;
    }
  }

  static async getExecutionMode(): Promise<{
    mode: string;
    available: string[];
    message?: string;
  }> {
    try {
      const response = await this.fetchWithCredentials(
        `/api/config/execution-mode`
      );
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      const data = await response.json();
      console.warn("Execution mode is now always 'api':", data.message);
      return data;
    } catch (error) {
      console.error("Failed to fetch execution mode (deprecated):", error);
      return {
        mode: "api",
        available: ["api"],
        message: "Execution mode is always 'api' - mode switching deprecated",
      };
    }
  }

  static async updateExecutionMode(
    mode: string
  ): Promise<{ mode: string; message: string }> {
    try {
      console.warn("Execution mode update ignored (deprecated):", mode);
      const response = await this.fetchWithCredentials(
        `/api/config/execution-mode`,
        {
          method: "POST",
          body: JSON.stringify({ mode }),
        }
      );

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(
          errorData.error?.message || `HTTP error! status: ${response.status}`
        );
      }

      return await response.json();
    } catch (error) {
      console.error("Failed to update execution mode (deprecated):", error);
      throw error;
    }
  }

  static async getDockerConfig(): Promise<DockerConfig> {
    try {
      const response = await this.fetchWithCredentials(`/api/config/docker`);
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      return await response.json();
    } catch (error) {
      console.error("Failed to fetch docker config:", error);
      // Return default
      return {
        image: "drbh/codex-universal-explore:8",
        environment: {},
        secrets: {},
      };
    }
  }

  static async updateDockerConfig(config: DockerConfig): Promise<DockerConfig> {
    try {
      const response = await this.fetchWithCredentials(`/api/config/docker`, {
        method: "PUT",
        body: JSON.stringify(config),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(
          errorData.error?.message || `HTTP error! status: ${response.status}`
        );
      }

      return await response.json();
    } catch (error) {
      console.error("Failed to update docker config:", error);
      throw error;
    }
  }
}
