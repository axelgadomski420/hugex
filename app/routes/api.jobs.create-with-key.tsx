import { json, type ActionFunctionArgs } from "@remix-run/node";
import { getJobStore } from "~/lib/server/jobStore";
import { getJobProcessor } from "~/lib/server/jobProcessor";
import { v4 as uuidv4 } from "uuid";
import type { Job } from "~/types/job";

// POST /api/jobs/create-with-key - Create job with API key
export async function action({ request }: ActionFunctionArgs) {
  console.log("POST /api/jobs/create-with-key");
  if (request.method !== "POST") {
    return json({ error: "Method not allowed" }, { status: 405 });
  }

  // Check for API key in Authorization header
  const authHeader = request.headers.get("Authorization");
  const apiKey = authHeader?.replace("Bearer ", "");

  if (!apiKey) {
    return json(
      {
        error: {
          code: "UNAUTHORIZED",
          message: "API key required in Authorization header (Bearer token)",
        },
      },
      { status: 401 }
    );
  }

  // For now, we'll validate that the API key is a Hugging Face token
  // In a production environment, you might want to validate against your own API key system
  if (!isValidHuggingFaceToken(apiKey)) {
    return json(
      {
        error: {
          code: "UNAUTHORIZED",
          message:
            "Invalid API key format. Expected a valid Hugging Face token.",
        },
      },
      { status: 401 }
    );
  }

  try {
    const {
      title,
      description,
      branch,
      author,
      repository,
      environment,
      secrets,
    } = await request.json();

    // Validation
    if (!title || title.length === 0 || title.length > 200) {
      return json(
        {
          error: {
            code: "VALIDATION_ERROR",
            message: "Title is required and must be between 1-200 characters",
            details: [
              {
                field: "title",
                message:
                  "Title is required and must be between 1-200 characters",
              },
            ],
          },
        },
        { status: 400 }
      );
    }

    if (description && description.length > 1000) {
      return json(
        {
          error: {
            code: "VALIDATION_ERROR",
            message: "Description must be less than 1000 characters",
            details: [
              {
                field: "description",
                message: "Description must be less than 1000 characters",
              },
            ],
          },
        },
        { status: 400 }
      );
    }

    // Validate environment variables if provided
    if (environment && typeof environment !== "object") {
      return json(
        {
          error: {
            code: "VALIDATION_ERROR",
            message: "Environment must be an object",
            details: [
              {
                field: "environment",
                message: "Environment must be an object with key-value pairs",
              },
            ],
          },
        },
        { status: 400 }
      );
    }

    // Validate secrets if provided
    if (secrets && typeof secrets !== "object") {
      return json(
        {
          error: {
            code: "VALIDATION_ERROR",
            message: "Secrets must be an object",
            details: [
              {
                field: "secrets",
                message: "Secrets must be an object with key-value pairs",
              },
            ],
          },
        },
        { status: 400 }
      );
    }
    if (repository?.url) {
      const githubUrlPattern =
        /^https:\/\/github\.com\/[\w\-\.]+\/[\w\-\.]+(?:\.git)?(?:\/)?$/;
      if (!githubUrlPattern.test(repository.url)) {
        return json(
          {
            error: {
              code: "VALIDATION_ERROR",
              message: "Repository URL must be a valid GitHub repository URL",
              details: [
                {
                  field: "repository.url",
                  message:
                    "Repository URL must be a valid GitHub repository URL (e.g., https://github.com/username/repo)",
                },
              ],
            },
          },
          { status: 400 }
        );
      }
    }

    // Get user info from the API key to set as author
    let apiKeyAuthor = author;
    try {
      const userInfo = await getUserInfoFromApiKey(apiKey);
      console.log("User info from API key:", userInfo);
      apiKeyAuthor = userInfo?.username || author || "api-user";
    } catch (error) {
      console.warn("Could not get user info from API key:", error);
      apiKeyAuthor = author || "api-user";
    }

    console.log("API Key Author:", apiKeyAuthor);

    const job: Job = {
      id: uuidv4(),
      title,
      description: description || "",
      status: "pending",
      createdAt: new Date(),
      updatedAt: new Date(),
      branch: branch || undefined,
      author: apiKeyAuthor,
      repository: repository || undefined,
      environment: environment || undefined,
      secrets: secrets || undefined,
    };

    const jobStore = getJobStore();
    await jobStore.createJob(job);

    // Create credentials object for job processor
    const credentials = {
      huggingfaceToken: apiKey,
      hfUserInfo: {
        username: apiKeyAuthor,
      },
    };

    // Start processing job asynchronously with credentials
    const jobProcessor = getJobProcessor();
    jobProcessor.processJob(job.id, jobStore, credentials).catch((error) => {
      console.error(`Failed to process job ${job.id}:`, error);
    });

    return json(job, { status: 201 });
  } catch (error) {
    console.error("Error creating job:", error);
    return json(
      {
        error: {
          code: "INTERNAL_ERROR",
          message: "Failed to create job",
        },
      },
      { status: 500 }
    );
  }
}

// Helper function to validate Hugging Face token format
function isValidHuggingFaceToken(token: string): boolean {
  // Hugging Face tokens typically start with "hf_" and are 37 characters long
  // But we'll be more flexible and just check for basic format
  return (
    typeof token === "string" && token.length >= 20 && token.trim() === token
  );
}

// Helper function to get user info from API key
async function getUserInfoFromApiKey(
  apiKey: string
): Promise<{ username: string } | null> {
  try {
    const response = await fetch("https://huggingface.co/api/whoami-v2", {
      headers: {
        Authorization: `Bearer ${apiKey}`,
      },
    });

    if (response.ok) {
      const data = await response.json();
      return { username: data.name || data.username || "api-user" };
    }
  } catch (error) {
    console.error("Error fetching user info:", error);
  }

  return null;
}
