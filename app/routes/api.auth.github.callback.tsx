import { LoaderFunction, redirect } from "@remix-run/node";
import serverConfig from "~/lib/server/config";
import { parseCookies } from "~/lib/server/auth";

interface GitHubUserInfo {
  username: string;
  name?: string;
  email?: string;
  avatar_url?: string;
}

export const loader: LoaderFunction = async ({ request }) => {
  console.log("🔥 GitHub OAuth2 callback route hit");

  // Check if GitHub OAuth2 is enabled
  if (!serverConfig.GITHUB_OAUTH2.ENABLED) {
    throw new Response("GitHub OAuth2 not configured", { status: 400 });
  }

  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const error = url.searchParams.get("error");

  // Handle OAuth2 error
  if (error) {
    console.error("GitHub OAuth2 error:", error);
    return createErrorResponse(
      "GitHub OAuth2 authentication was cancelled or failed"
    );
  }

  if (!code || !state) {
    return createErrorResponse("Missing required GitHub OAuth2 parameters");
  }

  // Get stored state from cookies for CSRF protection
  const cookieHeader = request.headers.get("Cookie");
  const cookies = parseCookies(cookieHeader || "");

  const storedState = cookies.github_oauth_state;
  const returnTo = cookies.github_oauth_return_to
    ? decodeURIComponent(cookies.github_oauth_return_to)
    : "/";

  // Verify state parameter (CSRF protection)
  if (!storedState || storedState !== state) {
    console.error("GitHub OAuth2 state mismatch");
    return createErrorResponse("Invalid GitHub OAuth2 state parameter");
  }

  try {
    // Exchange authorization code for access token
    const tokenResponse = await fetch(
      "https://github.com/login/oauth/access_token",
      {
        method: "POST",
        headers: {
          Accept: "application/json",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          client_id: serverConfig.GITHUB_OAUTH2.CLIENT_ID!,
          client_secret: serverConfig.GITHUB_OAUTH2.CLIENT_SECRET!,
          code,
          redirect_uri: serverConfig.GITHUB_OAUTH2.CALLBACK_URL,
        }),
      }
    );

    if (!tokenResponse.ok) {
      const errorText = await tokenResponse.text();
      console.error("GitHub token exchange failed:", errorText);
      return createErrorResponse("Failed to obtain access token from GitHub");
    }

    const tokenData = await tokenResponse.json();
    const accessToken = tokenData.access_token;

    if (!accessToken) {
      console.error("No access token in GitHub response");
      return createErrorResponse("No access token received from GitHub");
    }

    // Get user info from GitHub API
    const userResponse = await fetch("https://api.github.com/user", {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        Accept: "application/vnd.github+json",
        "X-GitHub-Api-Version": "2022-11-28",
      },
    });

    if (!userResponse.ok) {
      console.error("Failed to get GitHub user info");
      return createErrorResponse("Failed to get user information from GitHub");
    }

    const userData = await userResponse.json();

    // Get user's primary email
    let userEmail = userData.email;
    if (!userEmail) {
      try {
        const emailResponse = await fetch(
          "https://api.github.com/user/emails",
          {
            headers: {
              Authorization: `Bearer ${accessToken}`,
              Accept: "application/vnd.github+json",
              "X-GitHub-Api-Version": "2022-11-28",
            },
          }
        );

        if (emailResponse.ok) {
          const emails = await emailResponse.json();
          const primaryEmail = emails.find((email: any) => email.primary);
          userEmail = primaryEmail?.email || emails[0]?.email;
        }
      } catch (emailError) {
        console.warn("Could not fetch user email:", emailError);
      }
    }

    const githubUserInfo: GitHubUserInfo = {
      username: userData.login,
      name: userData.name || userData.login,
      email: userEmail,
      avatar_url: userData.avatar_url,
    };

    // 🔧 FIX: Read existing auth cookie and merge with GitHub data
    let existingCookieData: any = {};
    const existingAuthCookie =
      cookies[serverConfig.COOKIE_NAME] ||
      cookies[encodeURIComponent(serverConfig.COOKIE_NAME)];

    if (existingAuthCookie) {
      try {
        // Handle both encoded and non-encoded cookie values
        let cookieValue = existingAuthCookie;
        try {
          // Try decoding first in case it's URL encoded
          cookieValue = decodeURIComponent(existingAuthCookie);
        } catch (decodeError) {
          // If decoding fails, use original value
          cookieValue = existingAuthCookie;
        }

        // Decode existing cookie to preserve HuggingFace session
        existingCookieData = JSON.parse(atob(cookieValue));
        console.log("📋 Existing auth cookie found, merging with GitHub data");
        console.log("🔍 Existing cookie data:", {
          hasHuggingFace: existingCookieData.hasHuggingFace,
          hasOpenAI: existingCookieData.hasOpenAI,
          hasHfUserInfo: !!existingCookieData.hfUserInfo,
        });
      } catch (error) {
        console.warn("⚠️ Could not parse existing auth cookie:", error);
        console.warn("⚠️ Cookie value length:", existingAuthCookie?.length);
      }
    } else {
      console.warn(
        "⚠️ No existing auth cookie found - user may not be logged in to HuggingFace"
      );
    }

    // Merge existing credentials with new GitHub token
    let mergedCredentials: any = {};
    if (existingCookieData.enc) {
      try {
        mergedCredentials = JSON.parse(atob(existingCookieData.enc));
      } catch (error) {
        console.warn("⚠️ Could not parse existing credentials:", error);
      }
    }

    // Add GitHub token to existing credentials
    mergedCredentials.gh = accessToken;

    // Create merged session cookie data
    const expiresAt = new Date();
    expiresAt.setTime(expiresAt.getTime() + 7 * 24 * 60 * 60 * 1000); // 7 days

    const cookieData = {
      // Preserve existing HuggingFace data
      hasOpenAI: existingCookieData.hasOpenAI || false,
      hasHuggingFace: existingCookieData.hasHuggingFace || false,
      hasGitHub: true, // Add GitHub authentication flag
      expiresAt: existingCookieData.expiresAt || expiresAt.toISOString(),
      hfUserInfo: existingCookieData.hfUserInfo, // Preserve HF user info
      githubUserInfo: btoa(JSON.stringify(githubUserInfo)), // Add GitHub user info
      isOAuth2: existingCookieData.isOAuth2, // Preserve OAuth2 flag if it exists
      isGitHubOAuth2: true, // Flag to indicate GitHub OAuth2 session
      // Store merged credentials (HF + GitHub tokens)
      enc: btoa(JSON.stringify(mergedCredentials)),
    };

    const cookieValue = btoa(JSON.stringify(cookieData));

    console.log("✅ GitHub OAuth successful - Final cookie data:", {
      hasHuggingFace: cookieData.hasHuggingFace,
      hasGitHub: cookieData.hasGitHub,
      hasOpenAI: cookieData.hasOpenAI,
      hasHfUserInfo: !!cookieData.hfUserInfo,
      hasGithubUserInfo: !!cookieData.githubUserInfo,
      credentialsKeys: Object.keys(mergedCredentials),
    });

    // Create HTML response for popup
    const htmlResponse = `
      <!DOCTYPE html>
      <html>
        <head>
          <title>GitHub Authentication Success</title>
          <style>
            body { font-family: system-ui, sans-serif; text-align: center; padding: 50px; }
            .success { color: #059669; }
            .loading { color: #6B7280; }
          </style>
        </head>
        <body>
          <div class="success">
            <h2>✓ GitHub Authentication Successful</h2>
            <p class="loading">Redirecting...</p>
          </div>
          <script>
            // Close the popup after setting the cookie
            window.close();
          </script>
        </body>
      </html>
    `;

    console.log(
      "GitHub OAuth2 authentication successful for user:",
      githubUserInfo.username
    );

    // Create response with auth cookie
    const response = new Response(htmlResponse, {
      status: 200,
      headers: {
        "Content-Type": "text/html",
      },
    });

    // Clear GitHub OAuth2 temporary cookies
    const clearCookieOptions = "Path=/; HttpOnly; SameSite=Lax; Max-Age=0";
    response.headers.append(
      "Set-Cookie",
      `github_oauth_state=; ${clearCookieOptions}`
    );
    response.headers.append(
      "Set-Cookie",
      `github_oauth_return_to=; ${clearCookieOptions}`
    );

    // Set auth cookie with proper settings for popup scenarios
    const isSecure = request.url.startsWith("https");
    const cookieOptions = [
      `${serverConfig.COOKIE_NAME}=${cookieValue}`,
      "Max-Age=" + 7 * 24 * 60 * 60, // 7 days
      "Path=/",
      "SameSite=None",
      "HttpOnly=false", // Allow client-side access for existing code
      "Secure",
    ];

    if (isSecure) {
      cookieOptions.push("Secure");
    }

    response.headers.append("Set-Cookie", cookieOptions.join("; "));

    return response;
  } catch (error) {
    console.error("GitHub OAuth2 callback error:", error);
    return createErrorResponse(
      "GitHub OAuth2 authentication failed during token exchange"
    );
  }
};

function createErrorResponse(errorMessage: string): Response {
  return new Response(
    `
    <!DOCTYPE html>
    <html>
      <head>
        <title>GitHub Authentication Error</title>
        <style>
          body { font-family: system-ui, sans-serif; text-align: center; padding: 50px; }
          .error { color: #DC2626; }
        </style>
      </head>
      <body>
        <div class="error">
          <h2>⚠ GitHub Authentication Failed</h2>
          <p>${errorMessage}</p>
        </div>
        <script>
          if (window.opener) {
            window.opener.postMessage({
              type: 'GITHUB_OAUTH2_ERROR',
              error: '${errorMessage}'
            }, window.location.origin);
            window.close();
          } else {
            window.location.href = '/?error=' + encodeURIComponent('${errorMessage}');
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
