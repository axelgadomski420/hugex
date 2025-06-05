import { json, type LoaderFunctionArgs } from "@remix-run/node";
import { getJobProcessor } from "~/lib/server/jobProcessor";
import { DockerJobExecutor } from "~/lib/server/processors/DockerJobExecutor";

// GET /health - Health check
export async function loader({ request }: LoaderFunctionArgs) {
  try {
    const jobProcessor = getJobProcessor();
    const executionMode = jobProcessor.getExecutionMode();

    // Check Docker availability if in Docker mode
    let dockerStatus = null;
    if (executionMode === "docker") {
      const dockerExecutor = new DockerJobExecutor();
      dockerStatus = await dockerExecutor.healthCheck();
    }

    const isHealthy =
      executionMode === "api" || (dockerStatus && dockerStatus.available);

    return json(
      {
        status: isHealthy ? "healthy" : "unhealthy",
        timestamp: new Date().toISOString(),
        executionMode,
        docker: dockerStatus,
      },
      { status: isHealthy ? 200 : 503 }
    );
  } catch (error) {
    console.error("Health check error:", error);
    return json(
      {
        status: "unhealthy",
        timestamp: new Date().toISOString(),
        error: "Internal server error",
      },
      { status: 500 }
    );
  }
}
