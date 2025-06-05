import { type LoaderFunctionArgs } from "@remix-run/node";
import { getJobStore } from "~/lib/server/jobStore";
import {
  extractCredentialsFromCookie,
  hasValidCredentials,
} from "~/lib/server/auth";

// GET /api/jobs/:jobId/logs - Stream job logs via Server-Sent Events
export async function loader({ request, params }: LoaderFunctionArgs) {
  const jobId = params.jobId;
  if (!jobId) {
    return new Response("Job ID is required", { status: 400 });
  }

  // Check authentication
  const cookieHeader = request.headers.get("Cookie");
  const credentials = extractCredentialsFromCookie(cookieHeader);

  if (!hasValidCredentials(credentials)) {
    return new Response("Unauthorized", { status: 401 });
  }

  // Set up Server-Sent Events stream
  const stream = new ReadableStream({
    start(controller) {
      const encoder = new TextEncoder();

      // Send initial connection message
      controller.enqueue(
        encoder.encode(
          `data: ${JSON.stringify({ type: "connected", jobId })}\n\n`
        )
      );

      let intervalId: NodeJS.Timeout;
      let lastLogLength = 0;

      const sendLogs = async () => {
        try {
          const jobStore = getJobStore();
          const job = await jobStore.getJob(jobId);

          if (!job) {
            controller.enqueue(
              encoder.encode(
                `data: ${JSON.stringify({ type: "error", message: "Job not found" })}\n\n`
              )
            );
            return;
          }

          // Get current logs
          const logs = await jobStore.getJobLogs(jobId);

          if (logs && logs.length > lastLogLength) {
            // Send only new log content
            const newLogs = logs.substring(lastLogLength);
            lastLogLength = logs.length;

            controller.enqueue(
              encoder.encode(
                `data: ${JSON.stringify({
                  type: "logs",
                  data: newLogs,
                  timestamp: new Date().toISOString(),
                })}\n\n`
              )
            );
          }

          // Send job status update
          controller.enqueue(
            encoder.encode(
              `data: ${JSON.stringify({
                type: "status",
                status: job.status,
                timestamp: new Date().toISOString(),
              })}\n\n`
            )
          );

          // If job is completed or failed, stop streaming
          if (job.status === "completed" || job.status === "failed") {
            controller.enqueue(
              encoder.encode(
                `data: ${JSON.stringify({
                  type: "finished",
                  status: job.status,
                  timestamp: new Date().toISOString(),
                })}\n\n`
              )
            );
            clearInterval(intervalId);
            controller.close();
          }
        } catch (error) {
          console.error("Error streaming logs:", error);
          controller.enqueue(
            encoder.encode(
              `data: ${JSON.stringify({
                type: "error",
                message: "Failed to fetch logs",
              })}\n\n`
            )
          );
        }
      };

      // Start streaming logs every 2 seconds
      intervalId = setInterval(sendLogs, 2000);

      // Send initial logs immediately
      sendLogs();

      // Clean up on client disconnect
      request.signal.addEventListener("abort", () => {
        clearInterval(intervalId);
        controller.close();
      });
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no", // Disable proxy buffering
    },
  });
}
