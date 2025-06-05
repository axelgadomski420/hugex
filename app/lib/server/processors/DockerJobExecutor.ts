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

    // (Optional) enforce openaiKey presence if needed:
    // if (!openaiKey) {
    //   throw new Error(
    //     "OpenAI API key is required but not provided in credentials"
    //   );
    // }

    // Use user's Docker configuration
    let imageRef = dockerConfig.image;
    console.log(`🐳 Using Docker image: ${imageRef}`);

    // REMOVE to handle private registry or custom namespace
    // If the default image is "codex-universal-explore:dev"
    if (imageRef === "codex-universal-explore:dev") {
      imageRef = "docker.io/drbh/codex-universal-explore:dev";
    }

    // Check if image exists locally
    try {
      await this.docker.getImage(imageRef).inspect();
      console.log(`✅ Docker image found: ${imageRef}`);
    } catch (error) {
      console.error(`❌ Docker image not found: ${imageRef}`);

      try {
        const pullStream = await this.docker.pull(imageRef);
        await new Promise<void>((resolve, reject) => {
          this.docker.modem.followProgress(
            pullStream,
            (err: Error) => {
              if (err) return reject(err);
              return resolve();
            },
            (event: any) => {
              // (Optional) uncomment to see each pull progress event:
              console.log(event.status, event.progress || "");
            }
          );
        });
        console.log(`✅ Successfully pulled image: ${imageRef}`);
      } catch (pullErr) {
        console.error(
          `❌ Failed to pull image "${imageRef}": ${pullErr.message}`
        );
        throw new Error(
          `Could not pull Docker image "${imageRef}". ` +
            `If it’s on Docker Hub under namespace "drbh", make sure you’ve pushed ` +
            `"${imageRef}". If it’s on a private registry, ensure you’re logged in and the name is correct.`
        );
      }
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
      Image: imageRef,
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

  async createBranchAndPush(options: {
    repositoryUrl: string;
    branch: string;
    baseBranch: string;
    title: string;
    description: string;
    files: any[];
    credentials?: any;
  }): Promise<{ branch: string; commitHash: string }> {
    // For Docker executor, we'll use the same Git operations as ApiJobExecutor
    // since Git operations don't need to run inside the container

    const { promises: fs } = await import("fs");
    const { exec } = await import("child_process");
    const { promisify } = await import("util");
    const path = await import("path");
    const os = await import("os");

    const execAsync = promisify(exec);
    let tempDir: string | null = null;

    try {
      console.log(
        `🌿 Creating branch '${options.branch}' and pushing changes...`
      );

      // Create temporary directory
      tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "hugex-git-"));
      console.log(`📁 Created temp directory: ${tempDir}`);

      // Get authenticated repository URL (if needed)
      const repoUrl = await this.getAuthenticatedRepoUrl(options.repositoryUrl);

      // 1. Shallow clone the repository
      console.log(`📌 Cloning repository: ${options.repositoryUrl}`);
      await execAsync(
        `git clone --depth=1 --branch ${options.baseBranch} "${repoUrl}" repo`,
        {
          cwd: tempDir,
          env: { ...process.env, GIT_TERMINAL_PROMPT: "0" },
        }
      );

      const repoPath = path.join(tempDir, "repo");

      // 2. Create and checkout new branch
      console.log(`🌱 Creating branch: ${options.branch}`);
      await execAsync(`git checkout -b "${options.branch}"`, {
        cwd: repoPath,
        env: { ...process.env, GIT_TERMINAL_PROMPT: "0" },
      });

      // 3. Apply file changes from diff
      console.log(`🗏 Applying ${options.files.length} file changes...`);
      await this.applyFileChanges(repoPath, options.files);

      // 4. Configure git user (required for commits)
      await execAsync('git config user.name "HugeX Bot"', {
        cwd: repoPath,
        env: { ...process.env, GIT_TERMINAL_PROMPT: "0" },
      });
      await execAsync(
        'git config user.email "hugex@users.noreply.github.com"',
        {
          cwd: repoPath,
          env: { ...process.env, GIT_TERMINAL_PROMPT: "0" },
        }
      );

      // 5. Stage all changes
      console.log(`📚 Staging changes...`);
      await execAsync("git add .", {
        cwd: repoPath,
        env: { ...process.env, GIT_TERMINAL_PROMPT: "0" },
      });

      // Check if there are any changes to commit
      const { stdout: statusOutput } = await execAsync(
        "git status --porcelain",
        {
          cwd: repoPath,
          env: { ...process.env, GIT_TERMINAL_PROMPT: "0" },
        }
      );

      console.log(`Git status output:`, statusOutput);

      if (!statusOutput.trim()) {
        // No changes detected - let's create a minimal change to ensure we have something to commit
        console.log("No changes detected, creating minimal change...");

        // Create a simple marker file to indicate this branch was created by HugeX
        const markerPath = path.join(repoPath, ".hugex-branch-marker");
        const markerContent = `Branch created by Hugex\nTimestamp: ${new Date().toISOString()}\nBranch: ${
          options.branch
        }\nRepository: ${options.repositoryUrl}\n`;
        await fs.writeFile(markerPath, markerContent, "utf8");

        // Stage the marker file
        await execAsync("git add .hugex-branch-marker", {
          cwd: repoPath,
          env: { ...process.env, GIT_TERMINAL_PROMPT: "0" },
        });

        console.log("Created marker file to ensure non-empty commit");
      }

      // 6. Commit changes
      const commitMessage = `${options.title}\n\n${options.description}`;
      console.log(`📝 Committing changes...`);
      await execAsync(`git commit -m "${commitMessage.replace(/"/g, '\\"')}"`, {
        cwd: repoPath,
        env: { ...process.env, GIT_TERMINAL_PROMPT: "0" },
      });

      // 7. Get commit hash
      const { stdout: commitHash } = await execAsync("git rev-parse HEAD", {
        cwd: repoPath,
        env: { ...process.env, GIT_TERMINAL_PROMPT: "0" },
      });

      // 8. Push branch to origin
      console.log(`🚀 Pushing branch to origin...`);
      await execAsync(`git push origin "${options.branch}"`, {
        cwd: repoPath,
        env: { ...process.env, GIT_TERMINAL_PROMPT: "0" },
      });

      const finalCommitHash = commitHash.trim();
      console.log(
        `✅ Successfully created branch '${options.branch}' with commit: ${finalCommitHash}`
      );

      return {
        branch: options.branch,
        commitHash: finalCommitHash,
      };
    } catch (error) {
      console.error("❌ Failed to create branch and push:", error);
      throw new Error(`Git operation failed: ${error.message}`);
    } finally {
      // Clean up temporary directory
      if (tempDir) {
        try {
          await fs.rm(tempDir, { recursive: true, force: true });
          console.log(`🧽 Cleaned up temp directory: ${tempDir}`);
        } catch (cleanupError) {
          console.warn(`⚠️ Failed to clean up temp directory: ${cleanupError}`);
        }
      }
    }
  }

  private async getAuthenticatedRepoUrl(
    repositoryUrl: string
  ): Promise<string> {
    // For GitHub repositories, check if we have a token available
    if (repositoryUrl.includes("github.com")) {
      // In a production system, you would:
      // 1. Get the GitHub token from the current user's session/credentials
      // 2. Create an ephemeral token for this operation
      // 3. Return authenticated URL with token

      // For now, return the original URL
      // TODO: Integrate with GitHubTokenService for authenticated access
      console.log(
        "⚠️ Using unauthenticated repository URL - private repositories may fail"
      );
    }

    return repositoryUrl;
  }

  private async applyFileChanges(
    repoPath: string,
    files: any[]
  ): Promise<void> {
    const { promises: fs } = await import("fs");
    const path = await import("path");

    console.log(`Applying changes to ${files.length} files:`);

    for (const file of files) {
      console.log(`Processing file: ${file.filename} (status: ${file.status})`);

      // Use diff field if available, otherwise fall back to patch
      const diffContent = file.diff || file.patch;
      console.log(
        `File diff preview:`,
        diffContent ? diffContent.substring(0, 150) + "..." : "NO DIFF/PATCH"
      );
      console.log(`Available fields:`, Object.keys(file));

      const filePath = path.join(repoPath, file.filename);

      try {
        switch (file.status) {
          case "added":
            // Create new file
            console.log(`Creating new file: ${filePath}`);
            await fs.mkdir(path.dirname(filePath), { recursive: true });
            await this.applyDiffToFile(filePath, diffContent, true);
            break;

          case "modified":
            // Modify existing file
            console.log(`Modifying existing file: ${filePath}`);
            await this.applyDiffToFile(filePath, diffContent, false);
            break;

          case "deleted":
            // Delete file
            console.log(`Deleting file: ${filePath}`);
            try {
              await fs.unlink(filePath);
            } catch (err) {
              console.warn(`File already deleted or not found: ${filePath}`);
            }
            break;

          case "renamed":
            // Handle renamed files
            console.log(
              `Renaming file: ${file.oldFilename} -> ${file.filename}`
            );
            if (file.oldFilename) {
              const oldPath = path.join(repoPath, file.oldFilename);
              try {
                await fs.rename(oldPath, filePath);
                // Apply any changes to the renamed file
                if (diffContent) {
                  await this.applyDiffToFile(filePath, diffContent, false);
                }
              } catch (err) {
                console.warn(
                  `Rename failed, treating as new file: ${err.message}`
                );
                await this.applyDiffToFile(filePath, diffContent, true);
              }
            }
            break;

          default:
            console.warn(
              `Unknown file status: ${file.status} for ${file.filename}`
            );
        }
      } catch (error) {
        console.error(`Failed to apply changes to ${file.filename}:`, error);
        throw error;
      }
    }
  }

  private async applyDiffToFile(
    filePath: string,
    diff: string,
    isNewFile: boolean
  ): Promise<void> {
    const { promises: fs } = await import("fs");

    if (!diff) {
      console.warn(`No diff content for ${filePath}`);
      return;
    }

    console.log(`Applying diff to ${filePath}:`, {
      isNewFile,
      diffLength: diff.length,
      diffPreview: diff.substring(0, 200) + (diff.length > 200 ? "..." : ""),
    });

    if (isNewFile) {
      // For new files, extract content from diff
      const content = this.extractContentFromDiff(diff);
      console.log(
        `Extracted content for new file (${content.length} chars):`,
        content.substring(0, 100)
      );
      await fs.writeFile(filePath, content, "utf8");
    } else {
      // For existing files, apply patch
      try {
        const currentContent = await fs.readFile(filePath, "utf8");
        console.log(
          `Current file content (${currentContent.length} chars):`,
          currentContent.substring(0, 100)
        );
        const patchedContent = this.applySimplePatch(currentContent, diff);
        console.log(
          `Patched content (${patchedContent.length} chars):`,
          patchedContent.substring(0, 100)
        );
        await fs.writeFile(filePath, patchedContent, "utf8");
      } catch (error) {
        console.error(`Failed to apply patch to ${filePath}:`, error);
        // Fallback: try to extract content from diff
        const content = this.extractContentFromDiff(diff);
        console.log(
          `Fallback: extracted content (${content.length} chars):`,
          content.substring(0, 100)
        );
        await fs.writeFile(filePath, content, "utf8");
      }
    }
  }

  private extractContentFromDiff(diff: string): string {
    // Extract content from diff format
    // This handles unified diff format and extracts added lines
    if (!diff || diff.trim() === "") {
      console.warn("Empty diff provided, returning empty content");
      return "";
    }

    const lines = diff.split("\n");
    const content: string[] = [];
    let foundContent = false;

    console.log(`Extracting content from diff with ${lines.length} lines`);

    for (const line of lines) {
      if (line.startsWith("+") && !line.startsWith("+++")) {
        // Add line (remove the + prefix)
        content.push(line.substring(1));
        foundContent = true;
      } else if (
        !line.startsWith("-") &&
        !line.startsWith("@@") &&
        !line.startsWith("index") &&
        !line.startsWith("diff") &&
        !line.startsWith("+++") &&
        !line.startsWith("---")
      ) {
        // Context line (unchanged)
        if (line.trim() !== "") {
          content.push(line);
          foundContent = true;
        }
      }
    }

    const result = content.join("\n");
    console.log(
      `Extracted ${content.length} lines, found content: ${foundContent}, result length: ${result.length}`
    );

    // If no content was found in the diff, it might be a simple text replacement
    // Try to extract everything after the diff headers
    if (!foundContent && diff.includes("@@")) {
      const hunkStart = diff.indexOf("@@");
      const secondHunkStart = diff.indexOf("@@", hunkStart + 2);
      if (secondHunkStart !== -1) {
        const hunkContent = diff.substring(
          secondHunkStart + diff.substring(secondHunkStart).indexOf("\n") + 1
        );
        const hunkLines = hunkContent.split("\n");
        const extractedContent: string[] = [];

        for (const line of hunkLines) {
          if (line.startsWith("+")) {
            extractedContent.push(line.substring(1));
          } else if (line.startsWith(" ")) {
            extractedContent.push(line.substring(1));
          }
        }

        if (extractedContent.length > 0) {
          console.log(
            `Fallback extraction found ${extractedContent.length} lines`
          );
          return extractedContent.join("\n");
        }
      }
    }

    return result;
  }

  private applySimplePatch(originalContent: string, diff: string): string {
    // Simple patch application - this is a basic implementation
    // For production, consider using a proper diff/patch library like 'diff' or 'node-patch'
    const originalLines = originalContent.split("\n");
    const diffLines = diff.split("\n");
    const result: string[] = [];

    let originalIndex = 0;
    let inHunk = false;
    let hunkOriginalStart = 0;
    let hunkOriginalLength = 0;
    let hunkNewStart = 0;
    let hunkNewLength = 0;
    let processedInHunk = 0;

    for (const line of diffLines) {
      if (line.startsWith("@@")) {
        // Parse hunk header
        const match = line.match(/@@ -(\d+),?(\d*) \+(\d+),?(\d*) @@/);
        if (match) {
          hunkOriginalStart = parseInt(match[1]) - 1; // Convert to 0-based
          hunkOriginalLength = match[2] ? parseInt(match[2]) : 1;
          hunkNewStart = parseInt(match[3]) - 1;
          hunkNewLength = match[4] ? parseInt(match[4]) : 1;

          // Copy lines before this hunk
          while (originalIndex < hunkOriginalStart) {
            result.push(originalLines[originalIndex]);
            originalIndex++;
          }

          inHunk = true;
          processedInHunk = 0;
        }
      } else if (inHunk) {
        if (line.startsWith("-")) {
          // Remove line - skip it in original
          originalIndex++;
          processedInHunk++;
        } else if (line.startsWith("+")) {
          // Add line
          result.push(line.substring(1));
          processedInHunk++;
        } else if (line.startsWith(" ")) {
          // Context line - keep it
          result.push(line.substring(1));
          originalIndex++;
          processedInHunk++;
        }

        // Check if hunk is complete
        if (processedInHunk >= Math.max(hunkOriginalLength, hunkNewLength)) {
          inHunk = false;
        }
      }
    }

    // Copy remaining lines
    while (originalIndex < originalLines.length) {
      result.push(originalLines[originalIndex]);
      originalIndex++;
    }

    return result.join("\n");
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
