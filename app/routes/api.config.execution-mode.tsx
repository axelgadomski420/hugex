import {
  json,
  type LoaderFunctionArgs,
  type ActionFunctionArgs,
} from "@remix-run/node";
import { getJobProcessor } from "~/lib/server/jobProcessor";

/**
 * Execution mode configuration endpoint
 * GET /api/config/execution-mode - Get current execution mode
 * POST /api/config/execution-mode - Switch execution mode
 */

// GET /api/config/execution-mode - Get current execution mode
export async function loader({ request }: LoaderFunctionArgs) {
  try {
    const jobProcessor = getJobProcessor();
    const currentMode = jobProcessor.getExecutionMode();

    return json({
      mode: currentMode,
      available: ["api", "docker"],
    });
  } catch (error) {
    console.error("Error getting execution mode:", error);
    return json(
      {
        error: {
          code: "INTERNAL_ERROR",
          message: "Failed to get execution mode",
        },
      },
      { status: 500 }
    );
  }
}

// POST /api/config/execution-mode - Switch execution mode
export async function action({ request }: ActionFunctionArgs) {
  if (request.method !== "POST") {
    return json({ error: "Method not allowed" }, { status: 405 });
  }

  try {
    const { mode } = await request.json();

    // Validate mode
    if (!mode || (mode !== "api" && mode !== "docker")) {
      return json(
        {
          error: {
            code: "INVALID_MODE",
            message: "Mode must be either 'api' or 'docker'",
          },
        },
        { status: 400 }
      );
    }

    const jobProcessor = getJobProcessor();
    jobProcessor.switchExecutionMode(mode);
    const newMode = jobProcessor.getExecutionMode();

    return json({
      message: `Execution mode switched to '${newMode}'`,
      mode: newMode,
    });
  } catch (error) {
    console.error("Error switching execution mode:", error);
    return json(
      {
        error: {
          code: "INTERNAL_ERROR",
          message: "Failed to switch execution mode",
        },
      },
      { status: 500 }
    );
  }
}
