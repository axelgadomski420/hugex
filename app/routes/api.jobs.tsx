import {
  json,
  type LoaderFunctionArgs,
  type ActionFunctionArgs,
} from "@remix-run/node";
import { getJobStore } from "~/lib/server/jobStore";
import { getJobProcessor } from "~/lib/server/jobProcessor";
import {
  extractCredentialsFromCookie,
  isPublicPath,
  hasValidCredentials,
  getEffectiveUsername,
} from "~/lib/server/auth";
import serverConfig from "~/lib/server/config";
import { v4 as uuidv4 } from "uuid";
import type { Job } from "~/types/job";

// GET /api/jobs - List jobs
export async function loader({ request }: LoaderFunctionArgs) {
  console.log("GET /api/jobs");
  const url = new URL(request.url);
  const page = parseInt(url.searchParams.get("page") || "1");
  const limit = Math.min(parseInt(url.searchParams.get("limit") || "20"), 100);
  const status = url.searchParams.get("status");
  const search = url.searchParams.get("search");

  // Check authentication
  if (!isPublicPath(url.pathname)) {
    const cookieHeader = request.headers.get("Cookie");
    const credentials = extractCredentialsFromCookie(cookieHeader);

    if (!hasValidCredentials(credentials)) {
      return json(
        {
          error: {
            code: "UNAUTHORIZED",
            message:
              "Authentication required - please provide API credentials through the UI",
          },
        },
        { status: 401 }
      );
    }

    try {
      const jobStore = getJobStore();

      // Get the authenticated user's username
      // Use effective username which can be from HF or GitHub
      const username = getEffectiveUsername(credentials);

      // Add the author filter to only show the user's own jobs
      const result = await jobStore.listJobs({
        page,
        limit,
        status: status === "all" ? undefined : status || undefined,
        search: search || undefined,
        author: username, // Filter by the authenticated user
      });

      return json(result);
    } catch (error) {
      console.error("Error listing jobs:", error);
      return json(
        {
          error: {
            code: "INTERNAL_ERROR",
            message: "Failed to list jobs",
          },
        },
        { status: 500 }
      );
    }
  } else {
    // For public paths, only return minimal information
    return json({
      jobs: [],
      pagination: {
        page: 1,
        limit,
        total: 0,
        totalPages: 0,
        hasNext: false,
        hasPrev: false,
      },
    });
  }
}

// POST /api/jobs - Create job
export async function action({ request }: ActionFunctionArgs) {
  console.log("POST /api/jobs");
  if (request.method !== "POST") {
    return json({ error: "Method not allowed" }, { status: 405 });
  }

  // Check authentication
  const cookieHeader = request.headers.get("Cookie");
  const credentials = extractCredentialsFromCookie(cookieHeader);

  if (!hasValidCredentials(credentials)) {
    return json(
      {
        error: {
          code: "UNAUTHORIZED",
          message:
            "Authentication required - please provide API credentials through the UI",
        },
      },
      { status: 401 }
    );
  }

  try {
    const { title, description, branch, author, repository } =
      await request.json();

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

    // Validate repository URL if provided
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

    // Use the authenticated user as the author if not provided
    // Support both HuggingFace and GitHub usernames
    const authenticatedAuthor = getEffectiveUsername(credentials);

    const job: Job = {
      id: uuidv4(),
      title,
      description: description || "",
      status: "pending",
      createdAt: new Date(),
      updatedAt: new Date(),
      branch: branch || undefined,
      author: author || authenticatedAuthor, // Use authenticated user if author not provided
      repository: repository || undefined,
    };

    const jobStore = getJobStore();
    await jobStore.createJob(job);

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
