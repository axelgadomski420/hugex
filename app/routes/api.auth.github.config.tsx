import { LoaderFunction, json } from "@remix-run/node";
import serverConfig from "~/lib/server/config";

export const loader: LoaderFunction = async () => {
  const isDevelopment = process.env.NODE_ENV === "development";
  const oauthAvailable = !!(
    serverConfig.GITHUB_OAUTH2.CLIENT_ID &&
    serverConfig.GITHUB_OAUTH2.CLIENT_SECRET &&
    serverConfig.GITHUB_OAUTH2.CLIENT_ID !== "demo-client-id"
  );

  return json({
    methods: {
      oauth: {
        available: oauthAvailable,
        recommended: !isDevelopment,
      },
      pat: {
        available: process.env.GITHUB_ALLOW_PAT !== "false", // Allow by default
        recommended: isDevelopment,
      },
    },
    defaultMethod: isDevelopment ? "pat" : "oauth",
    showBothOptions: oauthAvailable && process.env.GITHUB_ALLOW_PAT !== "false",
    setupMessage: getSetupMessage(
      oauthAvailable,
      process.env.GITHUB_ALLOW_PAT !== "false"
    ),
    isDevelopment,
  });
};

function getSetupMessage(
  oauthAvailable: boolean,
  patAvailable: boolean
): string {
  if (!oauthAvailable && !patAvailable) {
    return "GitHub authentication is not configured. Please set up OAuth or enable PAT support.";
  }
  if (!oauthAvailable && patAvailable) {
    return "OAuth not configured. Using Personal Access Token authentication.";
  }
  if (oauthAvailable && !patAvailable) {
    return "Using OAuth authentication only.";
  }
  return "Both OAuth and Personal Access Token authentication available.";
}
