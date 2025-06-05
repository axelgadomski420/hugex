import {
  json,
  type LoaderFunctionArgs,
  type ActionFunctionArgs,
} from "@remix-run/node";
import serverConfig from "~/lib/server/config";

/**
 * Repository configuration endpoint (DEPRECATED)
 * Repository configuration is now handled in the create task form
 * This endpoint is kept for backward compatibility but does nothing
 */

// GET /api/config/repository - Get repository configuration (deprecated)
export async function loader({ request }: LoaderFunctionArgs) {
  try {
    // Return default config for compatibility
    return json({
      url: serverConfig.REPO.URL,
      branch: serverConfig.REPO.BRANCH,
      message:
        "Repository configuration is deprecated. Use per-job repository selection.",
    });
  } catch (error) {
    console.error("Error getting repository configuration:", error);
    return json(
      {
        error: {
          code: "INTERNAL_ERROR",
          message: "Failed to get repository configuration",
        },
      },
      { status: 500 }
    );
  }
}

// PUT /api/config/repository - Update repository configuration (deprecated)
export async function action({ request }: ActionFunctionArgs) {
  if (request.method !== "PUT") {
    return json({ error: "Method not allowed" }, { status: 405 });
  }

  try {
    const { url, branch } = await request.json();

    console.log(
      `📂 Repository configuration update ignored (deprecated): ${url}`
    );

    // Return success but don't actually update anything
    return json({
      url: serverConfig.REPO.URL,
      branch: serverConfig.REPO.BRANCH,
      message:
        "Repository configuration is deprecated. Repository is now selected per-job in the create task form.",
    });
  } catch (error) {
    console.error("Error in repository configuration endpoint:", error);
    return json(
      {
        error: {
          code: "INTERNAL_ERROR",
          message: "Failed to process repository configuration request",
        },
      },
      { status: 500 }
    );
  }
}
