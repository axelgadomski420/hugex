import { JobExecutor } from "./JobExecutor";
import serverConfig from "../config";
import { dockerConfig } from "../../../routes/api.config.docker";
import { getJobStore } from "../jobStore";

const { DOCKER, REPO } = serverConfig;

export class DockerJobExecutor extends JobExecutor {
  private docker: any;

  constructor() {
    super();
    this.docker = null; // Will be initialized when needed
  }

  async execute(jobId: string, jobData: any, credentials: any) {
    console.log(`🐳 Executing job ${jobId} via Docker`);
    console.log(`📦 Job data:`, jobData);

    try {
      // Initialize Docker if not already done
      if (!this.docker) {
        try {
          // Dynamic import to avoid issues in client-side code
          const Docker = await import("dockerode");
          this.docker = new Docker.default();

          // Test Docker connection
          await this.docker.ping();
          console.log("🐳 Docker daemon connected successfully");
        } catch (error) {
          throw new Error(`Docker daemon not available: ${error.message}`);
        }
      }

      // Execute job in Docker container using the same setup as API
      const { output, environment, secrets } = await this.runJobInContainer(
        jobId,
        jobData,
        credentials
      );

      // Extract diff from output
      const diff = this.extractDiffFromOutput(output, jobId);

      return {
        success: true,
        output: output,
        diff: diff,
        environment: environment,
        secrets: secrets,
      };
    } catch (error) {
      console.error(`❌ Docker job execution failed for ${jobId}:`, error);
      throw error;
    }
  }

  private extractDiffFromOutput(output: string, jobId: string) {
    const delimiter =
      "================================================================================";

    console.log(
      `🔍 Extracting diff from output (${output.length} chars) for job ${jobId}`
    );

    // Count total occurrences for debugging
    const delimiterCount = (
      output.match(new RegExp(delimiter.replace(/=/g, "\\="), "g")) || []
    ).length;
    console.log(`📊 Found ${delimiterCount} delimiter occurrences`);

    // Find the last occurrence of the delimiter (end marker)
    const endIndex = output.lastIndexOf(delimiter);
    if (endIndex === -1) {
      console.warn(
        "❌ No end delimiter found in output, generating empty diff"
      );
      // Log a sample of the output for debugging
      console.log(
        "📄 Output sample (first 500 chars):",
        output.substring(0, 500)
      );
      return {
        jobId,
        files: [],
        summary: { totalAdditions: 0, totalDeletions: 0, totalFiles: 0 },
      };
    }

    console.log(`📍 End delimiter found at position: ${endIndex}`);

    // Find the second-to-last occurrence of the delimiter (start marker)
    // by searching backwards from the position before the end delimiter
    const searchUpTo = endIndex - 1;
    const startIndex = output.lastIndexOf(delimiter, searchUpTo);

    console.log(
      `📍 Start delimiter search up to position ${searchUpTo}, found at: ${startIndex}`
    );

    if (startIndex !== -1 && startIndex !== endIndex) {
      const diffContent = output
        .substring(startIndex + delimiter.length, endIndex)
        .trim();
      console.log(`📝 Extracted diff content (${diffContent.length} chars)`);
      console.log(`📄 Diff preview:`, diffContent.substring(0, 200));

      if (diffContent) {
        return this.parseDiff(diffContent, jobId);
      } else {
        console.warn("⚠️ Diff content is empty after trimming");
      }
    } else if (startIndex === -1) {
      console.warn(
        "⚠️ No start delimiter found - only one delimiter in output"
      );
      // If there's only one delimiter, maybe the diff is after it?
      const contentAfterDelimiter = output
        .substring(endIndex + delimiter.length)
        .trim();
      if (contentAfterDelimiter) {
        console.log(
          `🔄 Trying content after single delimiter (${contentAfterDelimiter.length} chars)`
        );
        console.log(
          `📄 Content preview:`,
          contentAfterDelimiter.substring(0, 200)
        );
        return this.parseDiff(contentAfterDelimiter, jobId);
      }
    } else {
      console.warn("⚠️ Start and end delimiters are the same position");
    }

    console.warn("❌ No valid diff found in output, generating empty diff");
    return {
      jobId,
      files: [],
      summary: { totalAdditions: 0, totalDeletions: 0, totalFiles: 0 },
    };
  }

  private async runJobInContainer(
    jobId: string,
    jobData: any,
    credentials: any
  ): Promise<{
    output: string;
    environment: Record<string, string>;
    secrets: Record<string, string>;
  }> {
    console.log(`🐳 Creating Docker container for job ${jobId}`);

    // Use credentials from request (required - no fallback)
    const openaiKey = credentials?.openaiApiKey;

    // if (!openaiKey) {
    //   throw new Error(
    //     "OpenAI API key is required but not provided in credentials"
    //   );
    // }

    // Use user's Docker configuration
    console.log(`🐳 Using Docker image: ${dockerConfig.image}`);

    // Check if image exists locally
    try {
      await this.docker.getImage(dockerConfig.image).inspect();
      console.log(`✅ Docker image found: ${dockerConfig.image}`);
    } catch (error) {
      console.error(`❌ Docker image not found: ${dockerConfig.image}`);

      // List available images for debugging
      try {
        const images = await this.docker.listImages();
        console.log(`📋 Available Docker images:`);
        images.forEach((img: any) => {
          const tags = img.RepoTags || ["<none>:<none>"];
          console.log(`  - ${tags.join(", ")} (${img.Id.slice(0, 12)})`);
        });
      } catch (listError) {
        console.error(`Failed to list images:`, listError.message);
      }

      throw new Error(
        `Docker image '${dockerConfig.image}' not found. Please check the image name or pull/build the image.`
      );
    }

    // Get repository URL from job data or fall back to server config
    const repositoryUrl = jobData.repository?.url || REPO.URL;
    const repositoryBranch = jobData.repository?.branch || REPO.BRANCH;
    console.log(
      `📂 Repository: ${repositoryUrl} (branch: ${repositoryBranch})`
    );
    console.log(
      `📋 Environment variables: ${
        Object.keys(dockerConfig.environment).length
      } custom variables`
    );
    console.log(
      `🔐 Secrets: ${Object.keys(dockerConfig.secrets).length} custom secrets`
    );

    // Merge base environment with user's custom environment variables
    const baseEnvironment = {
      JOB_ID: jobId,
      REPO_URL: repositoryUrl,
      REPO_BRANCH: repositoryBranch,
      PROMPT: jobData.description,
      ...dockerConfig.environment, // User's custom env vars
    };

    const secrets = {
      OPENAI_API_KEY: openaiKey,
      ...dockerConfig.secrets, // User's custom secrets
    };

    // Convert to array format for Docker
    const environment = [
      ...Object.entries(baseEnvironment).map(
        ([key, value]) => `${key}=${value}`
      ),
      ...Object.entries(secrets).map(([key, value]) => `${key}=${value}`),
    ];

    // Use the user's configured Docker image
    const container = await this.docker.createContainer({
      Image: dockerConfig.image,
      Cmd: ["/opt/agents/codex"],
      Env: environment,
      WorkingDir: "/workspace",
      Tty: false,
      AttachStdout: true,
      AttachStderr: true,
      HostConfig: {
        AutoRemove: true,
        Memory: DOCKER.MEMORY_LIMIT,
        CpuShares: DOCKER.CPU_SHARES,
      },
    });

    console.log(`🚀 Starting container for job ${jobId}`);

    // Start container
    await container.start();

    // Get container logs
    const logs = await this.getContainerLogs(container, jobId);
    console.log(
      `📜 Container logs for job ${jobId} (${logs.length} characters)`
    );
    console.log(`📄 Container logs preview:`, logs.substring(0, 500));

    return {
      output: logs,
      environment: baseEnvironment,
      secrets: secrets,
    };
  }

  private async getContainerLogs(
    container: any,
    jobId: string
  ): Promise<string> {
    // Get logs stream
    const stream = await container.logs({
      stdout: true,
      stderr: true,
      follow: true,
    });

    return new Promise((resolve, reject) => {
      let output = "";
      const jobStore = getJobStore();

      stream.on("data", async (chunk: Buffer) => {
        // Docker multiplexes stdout/stderr, need to handle the stream format
        const cleanChunk = this.cleanDockerStreamChunk(chunk);
        output += cleanChunk;

        // Store incremental logs in real-time
        try {
          await jobStore.setJobLogs(jobId, output);
        } catch (error) {
          console.error(
            `Failed to store incremental logs for job ${jobId}:`,
            error
          );
        }
      });

      stream.on("end", () => {
        console.log(`✅ Container execution completed for job ${jobId}`);
        console.log(`📋 Total output length: ${output.length} characters`);
        resolve(output);
      });

      stream.on("error", (error: Error) => {
        console.error(`🚨 Container error for job ${jobId}:`, error);
        reject(error);
      });

      // Timeout after configured time
      setTimeout(() => {
        container.kill().catch(console.error); // Attempt to kill the container
        reject(new Error("Container execution timeout"));
      }, DOCKER.TIMEOUT);
    });
  }

  // Helper method to clean Docker stream multiplexing
  private cleanDockerStreamChunk(chunk: Buffer): string {
    // Docker streams are multiplexed with 8-byte headers
    // Format: [STREAM_TYPE][0][0][0][SIZE][SIZE][SIZE][SIZE][DATA...]
    if (chunk.length < 8) {
      return chunk.toString();
    }

    let result = "";
    let offset = 0;

    while (offset < chunk.length) {
      if (offset + 8 > chunk.length) {
        // Not enough bytes for a complete header, treat as raw data
        result += chunk.slice(offset).toString();
        break;
      }

      // Read the size from bytes 4-7 (big-endian)
      const size = chunk.readUInt32BE(offset + 4);

      if (size === 0) {
        offset += 8;
        continue;
      }

      if (offset + 8 + size > chunk.length) {
        // Not enough data for the claimed size, treat as raw data
        result += chunk.slice(offset).toString();
        break;
      }

      // Extract the actual data
      const data = chunk.slice(offset + 8, offset + 8 + size);
      result += data.toString();

      offset += 8 + size;
    }

    return result;
  }

  // Health check for Docker availability
  async healthCheck(): Promise<{ available: boolean; error?: string }> {
    try {
      if (!this.docker) {
        const Docker = await import("dockerode");
        this.docker = new Docker.default();
      }
      await this.docker.ping();
      return { available: true };
    } catch (error) {
      return { available: false, error: error.message };
    }
  }
}
