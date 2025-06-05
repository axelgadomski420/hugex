import { json, type LoaderFunctionArgs } from "@remix-run/node";
import { getJobStore } from "~/lib/server/jobStore";
import {
  extractCredentialsFromCookie,
  hasValidCredentials,
} from "~/lib/server/auth";

// GET /api/jobs/:jobId/environment - Get job environment variables
export async function loader({ request, params }: LoaderFunctionArgs) {
  const { jobId } = params;

  if (!jobId) {
    return json(
      {
        error: {
          code: "MISSING_JOB_ID",
          message: "Job ID is required",
        },
      },
      { status: 400 }
    );
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
    const jobStore = getJobStore();
    const job = await jobStore.getJob(jobId);

    if (!job) {
      return json(
        {
          error: {
            code: "JOB_NOT_FOUND",
            message: "Job not found",
          },
        },
        { status: 404 }
      );
    }

    // Check if the user has access to this job
    const username = credentials.hfUserInfo?.username;
    if (job.author && job.author !== username) {
      return json(
        {
          error: {
            code: "FORBIDDEN",
            message: "You do not have access to this job",
          },
        },
        { status: 403 }
      );
    }

    // Return job environment information
    return json({
      jobId: job.id,
      title: job.title,
      status: job.status,
      environment: job.environment || {},
      secrets: job.secrets || {}, // Already masked in jobProcessor
      apiJobId: job.apiJobId,
      repository: job.repository,
      createdAt: job.createdAt,
      updatedAt: job.updatedAt,
    });
  } catch (error) {
    console.error(`Error getting job environment for ${jobId}:`, error);
    return json(
      {
        error: {
          code: "INTERNAL_ERROR",
          message: "Failed to get job environment",
        },
      },
      { status: 500 }
    );
  }
}
