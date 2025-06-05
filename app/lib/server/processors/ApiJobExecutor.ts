import { JobExecutor } from "./JobExecutor";
import serverConfig from "../config";
import { dockerConfig } from "../../../routes/api.config.docker";
import { GitHubTokenService } from "../githubTokenService";
import { getEffectiveUsername } from "../auth";
import { promises as fs } from "fs";
import { exec } from "child_process";
import { promisify } from "util";
import * as path from "path";
import * as os from "os";

const execAsync = promisify(exec);

const { HUGGINGFACE_API, REPO } = serverConfig;

export class ApiJobExecutor extends JobExecutor {
  constructor() {
    super();
  }

  async execute(jobId: string, jobData: any, credentials: any) {
    try {
      // Prepare environment and secrets for job execution
      const { environment, secrets, apiJobId } = await this.submitJobToApi(
        jobId,
        jobData,
        credentials
      );

      // Poll for completion with credentials
      const result = await this.pollJobCompletion(apiJobId, credentials);
      console.log(`✅ Job result length: ${result.length} characters`);
      console.log(`📄 Job result preview:`, result.substring(0, 500));

      // Extract diff from output
      const diff = this.extractDiffFromOutput(result, jobId);

      return {
        success: true,
        output: result,
        diff: diff,
        apiJobId: apiJobId,
        environment: environment,
        secrets: secrets,
      };
    } catch (error) {
      console.error(`❌ API job execution failed for ${jobId}:`, error);
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

  private async submitJobToApi(jobId: string, jobData: any, credentials: any) {
    // Use credentials from request (required - no fallback)
    const hfToken = credentials?.huggingfaceToken;
    const openaiKey = credentials?.openaiApiKey;
    const githubToken = credentials?.githubToken;

    if (!hfToken) {
      throw new Error(
        "Hugging Face token is required but not provided in credentials"
      );
    }

    const username = getEffectiveUsername(credentials);

    // Get repository URL from job data or fall back to server config
    const repositoryUrl = jobData.repository?.url || REPO.URL;
    const repositoryBranch = jobData.repository?.branch || REPO.BRANCH;

    // Handle GitHub repository access for private repos
    let authenticatedRepoUrl = repositoryUrl;
    let githubEphemeralToken = null;

    if (githubToken && repositoryUrl.includes("github.com")) {
      console.log("🔑 GitHub token available, checking repository access...");

      // Validate repository access
      const repoAccess = await GitHubTokenService.validateRepositoryAccess(
        githubToken,
        repositoryUrl
      );

      if (repoAccess.canAccess) {
        console.log(
          `📂 Repository access confirmed (private: ${repoAccess.isPrivate})`
        );

        // Create ephemeral token for container use (expires in 60 minutes)
        const ephemeralResult = await GitHubTokenService.createEphemeralToken(
          githubToken,
          repositoryUrl,
          60 // 60 minutes
        );

        if (ephemeralResult) {
          githubEphemeralToken = ephemeralResult.token;
          // Create authenticated clone URL for the container
          authenticatedRepoUrl = GitHubTokenService.createAuthenticatedCloneUrl(
            ephemeralResult.token,
            repositoryUrl
          );
          console.log("🎫 Ephemeral GitHub token created for container access");
        } else {
          console.warn(
            "⚠️ Could not create ephemeral token, using original URL"
          );
        }
      } else {
        console.warn("⚠️ Cannot access repository with provided GitHub token");
      }
    }

    // Merge base environment with user's custom environment variables from job data
    const environment = {
      JOB_ID: jobId,
      REPO_URL: authenticatedRepoUrl, // Use authenticated URL if available
      REPO_BRANCH: repositoryBranch,
      // PROMPT: `Clone the repository, then change to the repository directory (${repositoryUrl.split("/").pop()?.replace(".git", "") || "repo"}) and execute the following task: ${jobData.description}. Make sure to stay within the repository directory for all operations and use file editing tools to make any necessary changes.`,
      PROMPT: jobData.description,
      ...dockerConfig.environment, // Global defaults
      ...(jobData.environment || {}), // Job-specific environment variables override global ones
    };

    // Merge required secrets with user's custom secrets from job data
    const secrets = {
      OPENAI_API_KEY: openaiKey,
      ...(githubEphemeralToken && { GITHUB_TOKEN: githubEphemeralToken }), // Add GitHub token if available
      ...dockerConfig.secrets, // Global secrets
      ...(jobData.secrets || {}), // Job-specific secrets override global ones
    };

    // Create job payload for Hugging Face API
    const payload = {
      command: ["/opt/agents/codex"],
      arguments: [],
      environment,
      flavor: "cpu-basic",
      dockerImage: dockerConfig.image,
      secrets,
      timeoutSeconds: HUGGINGFACE_API.TIMEOUT_SECONDS,
    };

    console.log("🔍 API Payload (environment and secrets debug):", {
      ...payload,
      environment: payload.environment, // Show actual environment variables
      secrets: Object.keys(payload.secrets).reduce(
        (acc, key) => {
          acc[key] = payload.secrets[key] ? "***" : "(not set)";
          return acc;
        },
        {} as Record<string, string>
      ),
    });

    // Construct URL with username from credentials
    // Format: https://huggingface.co/api/jobs/username
    const apiUrl = `${HUGGINGFACE_API.BASE_URL.replace(
      "/api/jobs/",
      `/api/jobs/${username}`
    )}`;
    console.log(`🔗 Using API URL with username: ${apiUrl}`);

    const response = await fetch(apiUrl, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${hfToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(
        `API request failed: ${response.status} ${response.statusText} - ${errorText}`
      );
    }

    const result = await response.json();
    const submittedApiJobId = result.id || result.jobId || result._id;
    console.log(
      `✅ Job submitted to API with ID: ${submittedApiJobId || "unknown"}`
    );

    return {
      apiJobId: submittedApiJobId,
      environment,
      secrets,
    };
  }

  private async pollJobCompletion(apiJobId: string, credentials: any) {
    const maxAttempts = HUGGINGFACE_API.MAX_POLL_ATTEMPTS;
    const pollInterval = HUGGINGFACE_API.POLL_INTERVAL;
    const hfToken = credentials?.huggingfaceToken;

    if (!hfToken) {
      throw new Error(
        "Hugging Face token is required for polling job completion"
      );
    }
    // Use authenticated username from credentials or 'anonymous' as fallback
    const username = getEffectiveUsername(credentials);

    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      try {
        console.log(`Polling attempt ${attempt}/${maxAttempts}`);

        // Construct URL with username from credentials
        const statusUrl = `${HUGGINGFACE_API.BASE_URL.replace(
          "/api/jobs/",
          `/api/jobs/${username}`
        )}/${apiJobId}`;
        console.log(`🔗 Using status URL with username: ${statusUrl}`);

        const statusResponse = await fetch(statusUrl, {
          headers: {
            Authorization: `Bearer ${hfToken}`,
          },
        });

        if (!statusResponse.ok) {
          console.warn(`⚠️ Status check failed: ${statusResponse.status}`);
          await this.sleep(pollInterval);
          continue;
        }

        const status = await statusResponse.json();
        console.log(
          `📊 Job status:`,
          status.status || status.state || "unknown"
        );

        // Check if job is completed
        if (this.isJobCompleted(status)) {
          console.log(`✅ Job completed successfully`);
          return await this.getJobOutput(apiJobId, credentials);
        }

        // Check if job failed
        if (this.isJobFailed(status)) {
          throw new Error(
            `Job failed with status: ${status.status || status.status.stage}`
          );
        }

        // Continue polling
        await this.sleep(pollInterval);
      } catch (error) {
        console.error(
          `❌ Error during polling attempt ${attempt}:`,
          (error as Error).message
        );
        if (attempt === maxAttempts) {
          throw error;
        }
        await this.sleep(pollInterval);
      }
    }

    throw new Error(
      "Job polling timeout - job did not complete within expected time"
    );
  }

  private isJobCompleted(status: any): boolean {
    const completedStates = [
      "completed",
      "succeeded",
      "success",
      "finished",
      "done",
    ];
    const currentState = (status.status?.stage || "").toLowerCase();
    return completedStates.includes(currentState);
  }

  private isJobFailed(status: any): boolean {
    const failedStates = ["failed", "error", "cancelled", "timeout", "aborted"];
    const currentState = (status.status?.stage || "").toLowerCase();
    return failedStates.includes(currentState);
  }

  private async getJobOutput(
    apiJobId: string,
    credentials: any
  ): Promise<string> {
    try {
      console.log(`📥 Fetching job output for ${apiJobId}`);
      const hfToken = credentials?.huggingfaceToken;

      if (!hfToken) {
        throw new Error(
          "Hugging Face token is required for fetching job output"
        );
      }
      // Use authenticated username from credentials or 'anonymous' as fallback
      const username = getEffectiveUsername(credentials);

      // Construct URL with username from credentials
      const logsUrl = `${HUGGINGFACE_API.BASE_URL.replace(
        "/api/jobs/",
        `/api/jobs/${username}`
      )}/${apiJobId}/logs`;

      console.log(`🔗 Using logs URL with username: ${logsUrl}`);

      const outputResponse = await fetch(logsUrl, {
        headers: {
          Authorization: `Bearer ${hfToken}`,
        },
      });

      if (!outputResponse.ok) {
        console.warn(`⚠️ Could not fetch job output: ${outputResponse.status}`);
        return "Job completed but output not available";
      }

      // Get the readable stream
      const reader = outputResponse.body?.getReader();
      if (!reader) {
        return "Job completed but output not available";
      }

      const decoder = new TextDecoder();
      let rawStream = "";
      let parsedOutput = "";

      try {
        while (true) {
          const { done, value } = await reader.read();

          if (done) {
            break;
          }

          // Decode the chunk and add to raw stream
          const chunk = decoder.decode(value, { stream: true });
          rawStream += chunk;

          // Optional: Log progress for debugging
          console.log(`📄 Received chunk: ${chunk.length} characters`);
        }

        // Final decode to handle any remaining bytes
        rawStream += decoder.decode();

        // Parse the SSE data format
        const lines = rawStream.split("\n");
        for (const line of lines) {
          if (line.startsWith("data: ")) {
            try {
              const jsonData = line.substring(6); // Remove 'data: ' prefix
              const parsed = JSON.parse(jsonData);
              if (parsed.data) {
                parsedOutput += parsed.data + "\n";
              }
            } catch (parseError) {
              console.warn(`⚠️ Could not parse SSE line: ${line}`);
            }
          }
        }

        console.log(
          `✅ Stream complete. Parsed output: ${parsedOutput.length} characters`
        );
        return parsedOutput.trim(); // Remove trailing newline
      } finally {
        // Always release the reader
        reader.releaseLock();
      }
    } catch (error) {
      console.error("❌ Error fetching job output:", error);
      return "Job completed but output could not be retrieved";
    }
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

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
