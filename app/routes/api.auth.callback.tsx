import { LoaderFunction, redirect, json } from "@remix-run/node";
import serverConfig from "~/lib/server/config";
import { parseCookies } from "~/lib/server/auth";

interface HFUserInfo {
  username: string;
  fullName: string;
  avatarUrl: string;
}

export const loader: LoaderFunction = async ({ request }) => {
  // Check if OAuth2 is enabled
  if (!serverConfig.OAUTH2.ENABLED) {
    throw new Response("OAuth2 not configured", { status: 400 });
  }

  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const error = url.searchParams.get("error");

  // Handle OAuth2 error
  if (error) {
    console.error("OAuth2 error:", error);
    return new Response(
      `
      <!DOCTYPE html>
      <html>
        <head>
          <title>Authentication Error</title>
          <style>
            body { font-family: system-ui, sans-serif; text-align: center; padding: 50px; }
            .error { color: #DC2626; }
          </style>
        </head>
        <body>
          <div class="error">
            <h2>⚠ Authentication Failed</h2>
            <p>OAuth2 authentication was cancelled or failed.</p>
          </div>
          <script>
            if (window.opener) {
              window.opener.postMessage({
                type: 'OAUTH2_ERROR',
                error: 'OAuth2 authentication failed'
              }, window.location.origin);
              window.close();
            } else {
              window.location.href = '/?error=' + encodeURIComponent('OAuth2 authentication failed');
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

  if (!code || !state) {
    return new Response(
      `
      <!DOCTYPE html>
      <html>
        <head>
          <title>Authentication Error</title>
          <style>
            body { font-family: system-ui, sans-serif; text-align: center; padding: 50px; }
            .error { color: #DC2626; }
          </style>
        </head>
        <body>
          <div class="error">
            <h2>⚠ Invalid OAuth2 Callback</h2>
            <p>Missing required OAuth2 parameters.</p>
          </div>
          <script>
            if (window.opener) {
              window.opener.postMessage({
                type: 'OAUTH2_ERROR',
                error: 'Invalid OAuth2 callback'
              }, window.location.origin);
              window.close();
            } else {
              window.location.href = '/?error=' + encodeURIComponent('Invalid OAuth2 callback');
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

  // Get stored PKCE data from cookies
  const cookieHeader = request.headers.get("Cookie");
  const cookies = parseCookies(cookieHeader || "");

  const storedState = cookies.oauth_state;
  const codeVerifier = cookies.oauth_code_verifier;
  const returnTo = cookies.oauth_return_to
    ? decodeURIComponent(cookies.oauth_return_to)
    : "/";

  // Verify state parameter (CSRF protection)
  if (!storedState || storedState !== state) {
    console.error("OAuth2 state mismatch");
    return new Response(
      `
      <!DOCTYPE html>
      <html>
        <head>
          <title>Authentication Error</title>
          <style>
            body { font-family: system-ui, sans-serif; text-align: center; padding: 50px; }
            .error { color: #DC2626; }
          </style>
        </head>
        <body>
          <div class="error">
            <h2>⚠ Security Error</h2>
            <p>Invalid OAuth2 state parameter.</p>
          </div>
          <script>
            if (window.opener) {
              window.opener.postMessage({
                type: 'OAUTH2_ERROR',
                error: 'Invalid OAuth2 state'
              }, window.location.origin);
              window.close();
            } else {
              window.location.href = '/?error=' + encodeURIComponent('Invalid OAuth2 state');
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

  if (!codeVerifier) {
    console.error("Missing code verifier");
    return new Response(
      `
      <!DOCTYPE html>
      <html>
        <head>
          <title>Authentication Error</title>
          <style>
            body { font-family: system-ui, sans-serif; text-align: center; padding: 50px; }
            .error { color: #DC2626; }
          </style>
        </head>
        <body>
          <div class="error">
            <h2>⚠ Authentication Error</h2>
            <p>Missing OAuth2 verification data.</p>
          </div>
          <script>
            if (window.opener) {
              window.opener.postMessage({
                type: 'OAUTH2_ERROR',
                error: 'Missing OAuth2 verification data'
              }, window.location.origin);
              window.close();
            } else {
              window.location.href = '/?error=' + encodeURIComponent('Missing OAuth2 verification data');
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

  try {
    // Exchange authorization code for access token
    const tokenResponse = await fetch(
      `${serverConfig.OAUTH2.PROVIDER_URL}/oauth/token`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
          Accept: "application/json",
        },
        body: new URLSearchParams({
          grant_type: "authorization_code",
          client_id: serverConfig.OAUTH2.CLIENT_ID!,
          client_secret: serverConfig.OAUTH2.CLIENT_SECRET!,
          code,
          redirect_uri: serverConfig.OAUTH2.CALLBACK_URL,
          code_verifier: codeVerifier,
        }),
      }
    );

    if (!tokenResponse.ok) {
      const errorText = await tokenResponse.text();
      console.error("Token exchange failed:", errorText);
      return new Response(
        `
        <!DOCTYPE html>
        <html>
          <head>
            <title>Authentication Error</title>
            <style>
              body { font-family: system-ui, sans-serif; text-align: center; padding: 50px; }
              .error { color: #DC2626; }
            </style>
          </head>
          <body>
            <div class="error">
              <h2>⚠ Token Exchange Failed</h2>
              <p>Failed to obtain access token from HuggingFace.</p>
            </div>
            <script>
              if (window.opener) {
                window.opener.postMessage({
                  type: 'OAUTH2_ERROR',
                  error: 'Failed to obtain access token'
                }, window.location.origin);
                window.close();
              } else {
                window.location.href = '/?error=' + encodeURIComponent('Failed to obtain access token');
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

    const tokenData = await tokenResponse.json();
    const accessToken = tokenData.access_token;

    if (!accessToken) {
      console.error("No access token in response");
      return new Response(
        `
        <!DOCTYPE html>
        <html>
          <head>
            <title>Authentication Error</title>
            <style>
              body { font-family: system-ui, sans-serif; text-align: center; padding: 50px; }
              .error { color: #DC2626; }
            </style>
          </head>
          <body>
            <div class="error">
              <h2>⚠ Invalid Token Response</h2>
              <p>No access token received from HuggingFace.</p>
            </div>
            <script>
              if (window.opener) {
                window.opener.postMessage({
                  type: 'OAUTH2_ERROR',
                  error: 'Invalid token response'
                }, window.location.origin);
                window.close();
              } else {
                window.location.href = '/?error=' + encodeURIComponent('Invalid token response');
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

    // Get user info from HuggingFace API
    const userResponse = await fetch("https://huggingface.co/api/whoami-v2", {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    });

    if (!userResponse.ok) {
      console.error("Failed to get user info");
      return new Response(
        `
        <!DOCTYPE html>
        <html>
          <head>
            <title>Authentication Error</title>
            <style>
              body { font-family: system-ui, sans-serif; text-align: center; padding: 50px; }
              .error { color: #DC2626; }
            </style>
          </head>
          <body>
            <div class="error">
              <h2>⚠ User Info Failed</h2>
              <p>Failed to get user information from HuggingFace.</p>
            </div>
            <script>
              if (window.opener) {
                window.opener.postMessage({
                  type: 'OAUTH2_ERROR',
                  error: 'Failed to get user information'
                }, window.location.origin);
                window.close();
              } else {
                window.location.href = '/?error=' + encodeURIComponent('Failed to get user information');
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

    const userData = await userResponse.json();
    const userInfo: HFUserInfo = {
      username: userData.name || "",
      fullName: userData.fullname || userData.name || "",
      avatarUrl: userData.avatarUrl || "",
    };

    // Create session cookie (similar to existing auth)
    const expiresAt = new Date();
    expiresAt.setTime(expiresAt.getTime() + 7 * 24 * 60 * 60 * 1000); // 7 days

    const cookieData = {
      hasOpenAI: false,
      hasHuggingFace: true,
      expiresAt: expiresAt.toISOString(),
      hfUserInfo: btoa(JSON.stringify(userInfo)),
      isOAuth2: true, // Flag to indicate OAuth2 session
      // Store the access token (encrypted)
      enc: btoa(
        JSON.stringify({
          hf: accessToken,
        })
      ),
    };

    const cookieValue = btoa(JSON.stringify(cookieData));

    // Create HTML response for popup with auth cookie
    const htmlResponse = `
      <!DOCTYPE html>
      <html>
        <head>
          <title>Authentication Success</title>
          <style>
            body { font-family: system-ui, sans-serif; text-align: center; padding: 50px; }
            .success { color: #059669; }
            .loading { color: #6B7280; }
          </style>
        </head>
        <body>
          <div class="success">
            <h2>✓ Authentication Successful</h2>
            <p class="loading">Redirecting...</p>
          </div>
          <script>
          // Just close the popup after setting the cookie
            window.close();
          </script>
        </body>
      </html>
    `;

    console.log(
      "OAuth2 authentication successful for user:",
      userInfo.username
    );

    // const htmlResponse = ""
    // Create response with auth cookie
    const response = new Response(htmlResponse, {
      status: 200,
      headers: {
        "Content-Type": "text/html",
      },
    });

    // Clear OAuth2 temporary cookies
    const clearCookieOptions = "Path=/; HttpOnly; SameSite=Lax; Max-Age=0";
    response.headers.append(
      "Set-Cookie",
      `oauth_state=; ${clearCookieOptions}`
    );
    response.headers.append(
      "Set-Cookie",
      `oauth_code_verifier=; ${clearCookieOptions}`
    );
    response.headers.append(
      "Set-Cookie",
      `oauth_return_to=; ${clearCookieOptions}`
    );

    // Set auth cookie with proper settings for popup/iframe scenarios
    const isSecure = request.url.startsWith("https");
    const cookieOptions = [
      `${serverConfig.COOKIE_NAME}=${cookieValue}`,
      "Max-Age=" + 7 * 24 * 60 * 60, // 7 days
      "Path=/",
      // isSecure ? "SameSite=None" : "SameSite=Lax", // None for HTTPS (required for iframes), Lax for HTTP
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
    console.error("OAuth2 callback error:", error);
    return new Response(
      `
      <!DOCTYPE html>
      <html>
        <head>
          <title>Authentication Error</title>
          <style>
            body { font-family: system-ui, sans-serif; text-align: center; padding: 50px; }
            .error { color: #DC2626; }
          </style>
        </head>
        <body>
          <div class="error">
            <h2>⚠ Authentication Failed</h2>
            <p>OAuth2 authentication failed during token exchange.</p>
          </div>
          <script>
            if (window.opener) {
              window.opener.postMessage({
                type: 'OAUTH2_ERROR',
                error: 'OAuth2 authentication failed'
              }, window.location.origin);
              window.close();
            } else {
              window.location.href = '/?error=' + encodeURIComponent('OAuth2 authentication failed');
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
};
