import { json, type LoaderFunctionArgs } from "@remix-run/node";
import { getJobStore } from "~/lib/server/jobStore";
import {
  extractCredentialsFromCookie,
  hasValidCredentials,
} from "~/lib/server/auth";

// GET /api/jobs/:jobId/diff - Get job diff
export async function loader({ request, params }: LoaderFunctionArgs) {
  const { jobId } = params;

  if (!jobId) {
    return json({ error: "Job ID is required" }, { status: 400 });
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
            code: "NOT_FOUND",
            message: "Job not found",
          },
        },
        { status: 404 }
      );
    }

    // Check if the job belongs to the authenticated user
    const username = credentials?.hfUserInfo?.username;
    if (job.author && job.author !== username) {
      return json(
        {
          error: {
            code: "FORBIDDEN",
            message: "You don't have permission to access this job",
          },
        },
        { status: 403 }
      );
    }

    if (job.status !== "completed") {
      return json(
        {
          error: {
            code: "JOB_NOT_COMPLETED",
            message: "Job has not completed yet",
          },
        },
        { status: 400 }
      );
    }

    const diff = await jobStore.getJobDiff(jobId);
    if (!diff) {
      return json(
        {
          error: {
            code: "NOT_FOUND",
            message: "No diff available for this job",
          },
        },
        { status: 404 }
      );
    }

    return json(diff);
  } catch (error) {
    console.error("Error getting job diff:", error);
    return json(
      {
        error: {
          code: "INTERNAL_ERROR",
          message: "Failed to get job diff",
        },
      },
      { status: 500 }
    );
  }
}
