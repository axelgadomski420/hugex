import {
  json,
  type LoaderFunctionArgs,
  type ActionFunctionArgs,
} from "@remix-run/node";
import serverConfig from "~/lib/server/config";

// In-memory storage for Docker configuration (in production, this should be persisted)
let dockerConfig = {
  image: process.env.DOCKER_IMAGE || "codex-universal-explore:dev", // Default to local dev image
  environment: {} as Record<string, string>,
  secrets: {} as Record<string, string>,
};

// GET /api/config/docker - Get Docker configuration
export async function loader({ request }: LoaderFunctionArgs) {
  try {
    return json(dockerConfig);
  } catch (error) {
    console.error("Error getting Docker configuration:", error);
    return json(
      {
        error: {
          code: "INTERNAL_ERROR",
          message: "Failed to get Docker configuration",
        },
      },
      { status: 500 }
    );
  }
}

// PUT /api/config/docker - Update Docker configuration
export async function action({ request }: ActionFunctionArgs) {
  if (request.method !== "PUT") {
    return json({ error: "Method not allowed" }, { status: 405 });
  }

  try {
    const { image, environment, secrets } = await request.json();

    // Validate image
    if (!image || typeof image !== "string") {
      return json(
        {
          error: {
            code: "INVALID_IMAGE",
            message: "Docker image is required and must be a string",
          },
        },
        { status: 400 }
      );
    }

    // Basic Docker image validation (allow registry/image:tag format)
    const dockerImagePattern =
      /^[a-zA-Z0-9][a-zA-Z0-9_.-]*(?:\/[a-zA-Z0-9][a-zA-Z0-9_.-]*)*(?::[a-zA-Z0-9][a-zA-Z0-9_.-]*)?$/;
    if (!dockerImagePattern.test(image)) {
      return json(
        {
          error: {
            code: "INVALID_IMAGE_FORMAT",
            message:
              "Docker image must be in valid format (e.g., registry/image:tag)",
          },
        },
        { status: 400 }
      );
    }

    // Validate environment variables
    if (environment && typeof environment !== "object") {
      return json(
        {
          error: {
            code: "INVALID_ENVIRONMENT",
            message: "Environment must be an object",
          },
        },
        { status: 400 }
      );
    }

    // Validate secrets
    if (secrets && typeof secrets !== "object") {
      return json(
        {
          error: {
            code: "INVALID_SECRETS",
            message: "Secrets must be an object",
          },
        },
        { status: 400 }
      );
    }

    // Update configuration
    dockerConfig = {
      image,
      environment: environment || {},
      secrets: secrets || {},
    };

    console.log(`🐳 Docker configuration updated - Image: ${image}`);
    console.log(
      `📋 Environment variables: ${Object.keys(dockerConfig.environment).length} variables`
    );
    console.log(
      `🔐 Secrets: ${Object.keys(dockerConfig.secrets).length} secrets`
    );

    // Return configuration without exposing secret values
    return json({
      image: dockerConfig.image,
      environment: dockerConfig.environment,
      secrets: Object.keys(dockerConfig.secrets).reduce(
        (acc, key) => {
          acc[key] = "***";
          return acc;
        },
        {} as Record<string, string>
      ),
      message: "Docker configuration updated successfully",
    });
  } catch (error) {
    console.error("Error updating Docker configuration:", error);
    return json(
      {
        error: {
          code: "INTERNAL_ERROR",
          message: "Failed to update Docker configuration",
        },
      },
      { status: 500 }
    );
  }
}

// Export the dockerConfig so it can be imported by other modules
export { dockerConfig };
