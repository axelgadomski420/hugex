import { LoaderFunction, redirect } from "@remix-run/node";
import serverConfig from "~/lib/server/config";
import { generateRandomString } from "~/lib/oauth2Utils";

export const loader: LoaderFunction = async ({ request }) => {
  console.log("🔥 GitHub OAuth2 login route hit");

  // Check if GitHub OAuth2 is enabled
  if (!serverConfig.GITHUB_OAUTH2.ENABLED) {
    throw new Response("GitHub OAuth2 not configured", { status: 400 });
  }

  // In development mode with demo credentials, provide helpful message
  if (
    process.env.NODE_ENV === "development" &&
    (!serverConfig.GITHUB_OAUTH2.CLIENT_ID ||
      serverConfig.GITHUB_OAUTH2.CLIENT_ID === "demo-client-id")
  ) {
    const helpMessage =
      "GitHub OAuth2 is enabled for demo purposes, but requires real GitHub OAuth app credentials. " +
      "Create an OAuth app at https://github.com/settings/applications/new and set GITHUB_CLIENT_ID and GITHUB_CLIENT_SECRET in your .env file.";

    // Return HTML page for popup
    return new Response(
      `
      <!DOCTYPE html>
      <html>
        <head>
          <title>GitHub OAuth2 Configuration Required</title>
          <style>
            body { font-family: system-ui, sans-serif; text-align: center; padding: 50px; }
            .error { color: #DC2626; }
            .info { color: #6B7280; margin-top: 20px; }
          </style>
        </head>
        <body>
          <div class="error">
            <h2>⚠ GitHub OAuth2 Configuration Required</h2>
            <p>GitHub OAuth2 is enabled for demo purposes, but requires real GitHub OAuth app credentials.</p>
            <div class="info">
              <p>To enable GitHub OAuth2:</p>
              <p>1. Create an OAuth app at <a href="https://github.com/settings/applications/new" target="_blank">GitHub Settings</a></p>
              <p>2. Set GITHUB_CLIENT_ID and GITHUB_CLIENT_SECRET in your .env file</p>
              <p>3. Set Authorization callback URL to: ${serverConfig.GITHUB_OAUTH2.CALLBACK_URL}</p>
            </div>
          </div>
          <script>
            if (window.opener) {
              window.opener.postMessage({
                type: 'GITHUB_OAUTH2_ERROR',
                error: '${helpMessage}'
              }, window.location.origin);
            }
          </script>
        </body>
      </html>
    `,
      {
        status: 200,
        headers: { "Content-Type": "text/html" },
      }
    );
  }

  console.log("GitHub OAuth2 client ID:", serverConfig.GITHUB_OAUTH2.CLIENT_ID);
  const url = new URL(request.url);
  const returnTo = "/api/auth/done"; // Default return URL

  // Generate state parameter for security (CSRF protection)
  const state = generateRandomString(32);

  console.log(
    "Generated GitHub callback URL:",
    serverConfig.GITHUB_OAUTH2.CALLBACK_URL
  );

  // Build GitHub OAuth2 authorization URL
  const authUrl = new URL("https://github.com/login/oauth/authorize");
  authUrl.searchParams.set("client_id", serverConfig.GITHUB_OAUTH2.CLIENT_ID!);
  authUrl.searchParams.set(
    "redirect_uri",
    serverConfig.GITHUB_OAUTH2.CALLBACK_URL
  );
  authUrl.searchParams.set("scope", serverConfig.GITHUB_OAUTH2.SCOPES);
  authUrl.searchParams.set("state", state);
  authUrl.searchParams.set("allow_signup", "true"); // Allow users to create GitHub account during OAuth

  console.log(
    "Redirecting to GitHub OAuth2 authorization URL:",
    authUrl.toString()
  );

  // Create response with redirect and secure cookies for state verification
  const response = redirect(authUrl.toString());

  // Store state and return URL in secure HttpOnly cookies
  const cookieOptions = "Path=/; HttpOnly; SameSite=Lax; Max-Age=600"; // 10 minutes

  response.headers.append(
    "Set-Cookie",
    `github_oauth_state=${state}; ${cookieOptions}`
  );
  response.headers.append(
    "Set-Cookie",
    `github_oauth_return_to=${encodeURIComponent(returnTo)}; ${cookieOptions}`
  );

  console.log("GitHub OAuth2 login cookies set:", {
    state,
    returnTo,
  });

  return response;
};
