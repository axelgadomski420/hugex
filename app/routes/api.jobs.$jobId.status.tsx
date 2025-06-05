import { json, type LoaderFunctionArgs } from "@remix-run/node";
import { JobService } from "~/lib/jobService.remix";
import {
  extractCredentialsFromCookie,
  hasValidCredentials,
} from "~/lib/server/auth";

// GET /api/jobs/:jobId/status - Get job status
export async function loader({ request, params }: LoaderFunctionArgs) {
  const jobId = params.jobId;
  if (!jobId) {
    return json({ error: "Job ID is required" }, { status: 400 });
  }

  // Check authentication
  const cookieHeader = request.headers.get("Cookie");
  const credentials = extractCredentialsFromCookie(cookieHeader);

  if (!hasValidCredentials(credentials)) {
    return json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const job = await JobService.getJob(jobId);

    if (!job) {
      return json({ error: "Job not found" }, { status: 404 });
    }

    // Check if the job belongs to the authenticated user
    const username = credentials?.hfUserInfo?.username;
    if (job.author && job.author !== username) {
      return json(
        { error: "Unauthorized - This job belongs to another user" },
        { status: 403 }
      );
    }

    return json({
      id: job.id,
      status: job.status,
      updatedAt: job.updatedAt,
      changes: job.changes || null,
    });
  } catch (error) {
    console.error("Error fetching job status:", error);
    return json({ error: "Failed to fetch job status" }, { status: 500 });
  }
}
