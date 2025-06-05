import { LoaderFunction, redirect } from "@remix-run/node";
import serverConfig from "~/lib/server/config";
import { generateRandomString, createCodeChallenge } from "~/lib/oauth2Utils";

export const loader: LoaderFunction = async ({ request }) => {
  console.log("🔥 OAuth2 login route hit");
  // Check if OAuth2 is enabled
  if (!serverConfig.OAUTH2.ENABLED) {
    throw new Response("OAuth2 not configured", { status: 400 });
  }

  // In development mode with demo credentials, provide helpful message
  if (
    process.env.NODE_ENV === "development" &&
    (!serverConfig.OAUTH2.CLIENT_ID ||
      serverConfig.OAUTH2.CLIENT_ID === "demo-client-id")
  ) {
    const helpMessage =
      "OAuth2 is enabled for demo purposes, but requires real HuggingFace OAuth app credentials. " +
      "Create an OAuth app at https://huggingface.co/settings/applications/new and set OPENID_CLIENT_ID and OPENID_CLIENT_SECRET in your .env file.";

    // Return HTML page for popup
    return new Response(
      `
      <!DOCTYPE html>
      <html>
        <head>
          <title>OAuth2 Configuration Required</title>
          <style>
            body { font-family: system-ui, sans-serif; text-align: center; padding: 50px; }
            .error { color: #DC2626; }
            .info { color: #6B7280; margin-top: 20px; }
          </style>
        </head>
        <body>
          <div class="error">
            <h2>⚠ OAuth2 Configuration Required</h2>
            <p>OAuth2 is enabled for demo purposes, but requires real HuggingFace OAuth app credentials.</p>
            <div class="info">
              <p>To enable OAuth2:</p>
              <p>1. Create an OAuth app at <a href="https://huggingface.co/settings/applications/new" target="_blank">HuggingFace Settings</a></p>
              <p>2. Set OPENID_CLIENT_ID and OPENID_CLIENT_SECRET in your .env file</p>
            </div>
          </div>
          <script>
            if (window.opener) {
              window.opener.postMessage({
                type: 'OAUTH2_ERROR',
                error: '${helpMessage}'
              }, window.location.origin);
              // window.close();
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

  console.log("OAuth2 client ID:", serverConfig.OAUTH2.CLIENT_ID);
  const url = new URL(request.url);
  // const returnTo = url.searchParams.get("returnTo") || "/";
  const returnTo = "/api/auth/done"; // Default return URL

  // Generate PKCE parameters for security
  const state = generateRandomString(32);
  const codeVerifier = generateRandomString(128);
  const codeChallenge = await createCodeChallenge(codeVerifier);

  console.log(
    "Generated serverConfig.OAUTH2.CALLBACK_URL:",
    serverConfig.OAUTH2.CALLBACK_URL
  );

  // Build OAuth2 authorization URL
  const authUrl = new URL("/oauth/authorize", serverConfig.OAUTH2.PROVIDER_URL);
  authUrl.searchParams.set("client_id", serverConfig.OAUTH2.CLIENT_ID!);
  authUrl.searchParams.set("response_type", "code");
  authUrl.searchParams.set("scope", serverConfig.OAUTH2.SCOPES);
  authUrl.searchParams.set("redirect_uri", serverConfig.OAUTH2.CALLBACK_URL);
  authUrl.searchParams.set("state", state);
  authUrl.searchParams.set("code_challenge", codeChallenge);
  authUrl.searchParams.set("code_challenge_method", "S256");

  console.log("Redirecting to OAuth2 authorization URL:", authUrl.toString());

  // Create response with redirect and secure cookies for PKCE
  const response = redirect(authUrl.toString());

  // Store PKCE data and return URL in secure HttpOnly cookies
  const cookieOptions = "Path=/; HttpOnly; SameSite=Lax; Max-Age=600"; // 10 minutes

  response.headers.append(
    "Set-Cookie",
    `oauth_state=${state}; ${cookieOptions}`
  );
  response.headers.append(
    "Set-Cookie",
    `oauth_code_verifier=${codeVerifier}; ${cookieOptions}`
  );
  response.headers.append(
    "Set-Cookie",
    `oauth_return_to=${encodeURIComponent(returnTo)}; ${cookieOptions}`
  );

  console.log("OAuth2 login cookies set:", {
    state,
    codeVerifier,
    returnTo,
  });

  return response;
};
