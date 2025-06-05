import { json } from "@remix-run/node";
import type { LoaderFunctionArgs } from "@remix-run/node";

/**
 * API index route
 * This endpoint provides information about available API endpoints
 */
export async function loader({ request }: LoaderFunctionArgs) {
  return json({
    api: "hugex",
    version: "1.0.0",
    endpoints: [
      {
        path: "/api/config",
        description: "Configuration-related endpoints",
      },
      {
        path: "/api/jobs",
        description: "Job-related endpoints",
      },
    ],
  });
}
