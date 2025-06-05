import React, { useState, useEffect } from "react";
import { AuthService, ApiCredentials } from "~/lib/authService";

interface LoginFormProps {
  onSuccess: () => void;
  login?: (credentials: {
    openaiApiKey?: string;
    huggingfaceToken?: string;
  }) => Promise<{ success: boolean; error?: string }>;
}

export const LoginForm: React.FC<LoginFormProps> = ({ onSuccess, login }) => {
  const [credentials, setCredentials] = useState({
    openaiApiKey: "",
    huggingfaceToken: "",
  });
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showKeys, setShowKeys] = useState({
    openai: false,
    huggingface: false,
  });
  const [oauth2Available, setOauth2Available] = useState(true);
  const [showManualEntry, setShowManualEntry] = useState(false);

  // Check if OAuth2 is available on component mount
  useEffect(() => {
    AuthService.isOAuth2Available().then(setOauth2Available);
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setError(null);

    // Validate that HuggingFace token is provided
    if (!credentials.huggingfaceToken.trim()) {
      setError("Please provide your HuggingFace token to continue");
      setIsLoading(false);
      return;
    }

    try {
      // Use the login function from context if provided, otherwise fall back to AuthService
      const authFunction = login || AuthService.authenticate;
      const result = await authFunction({
        openaiApiKey: credentials.openaiApiKey.trim(),
        huggingfaceToken: credentials.huggingfaceToken.trim(),
      });

      if (result.success) {
        // Log the user info for debugging
        if (result.hfUserInfo) {
          console.log("HuggingFace user info received:", result.hfUserInfo);
        }

        onSuccess();
      } else {
        setError(
          result.error ||
            "Authentication failed. Please check your API keys and try again."
        );
      }
    } catch (err) {
      console.error("Login error:", err);
      setError(err instanceof Error ? err.message : "Authentication failed");
    } finally {
      setIsLoading(false);
    }
  };

  const handleInputChange = (
    field: keyof typeof credentials,
    value: string
  ) => {
    setCredentials((prev) => ({ ...prev, [field]: value }));
    if (error) setError(null); // Clear error when user starts typing
  };

  const handleOAuth2Login = () => {
    // Use popup for OAuth2 to avoid iframe cookie issues
    const popup = window.open(
      "/api/auth/login",
      "oauth2_login",
      "width=500,height=600,scrollbars=yes,resizable=yes"
    );

    console.log("OAuth2 login popup opened:", popup);

    // Simply check if /api/auth/done return a 200 response fo this every 500ms for 10 seconds
    const checkAuthDone = setInterval(async () => {
      try {
        const response = await fetch("/api/auth/done", {
          method: "GET",
          credentials: "include",
        });

        if (response.ok) {
          clearInterval(checkAuthDone);
          onSuccess();
        }
      } catch (err) {
        console.error("Error checking auth done:", err);
      }
    }, 1500);

    // if (!popup) {
    //   alert('Popup blocked. Please allow popups for OAuth2 login.');
    //   return;
    // }

    // // Listen for popup completion
    // const checkClosed = setInterval(() => {
    //   if (popup.closed) {
    //     clearInterval(checkClosed);
    //     // Check if authentication was successful by refreshing auth status
    //     setTimeout(() => {
    //       onSuccess();
    //     }, 500);
    //   }
    // }, 1000);

    // // Handle popup messages (if needed)
    // const handleMessage = (event: MessageEvent) => {
    //   if (event.origin !== window.location.origin) return;

    //   if (event.data.type === 'OAUTH2_SUCCESS') {
    //     popup.close();
    //     clearInterval(checkClosed);
    //     onSuccess();
    //   } else if (event.data.type === 'OAUTH2_ERROR') {
    //     popup.close();
    //     clearInterval(checkClosed);
    //     setError(event.data.error || 'OAuth2 authentication failed');
    //   }
    // };

    // window.addEventListener('message', handleMessage);

    // // Cleanup listener when popup closes
    // const originalClose = popup.close;
    // popup.close = function() {
    //   window.removeEventListener('message', handleMessage);
    //   originalClose.call(this);
    // };
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-gray-50 px-4 py-12 dark:bg-gray-900 sm:px-6 lg:px-8">
      <div className="w-full max-w-md space-y-8">
        {/* Header */}
        <div className="text-center">
          <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full border border-gray-200 bg-white shadow-lg dark:border-gray-700 dark:bg-gray-800">
            {/* <span className="text-white text-2xl font-bold">H</span> */}
            <img
              src="https://huggingface.co/front/assets/huggingface_logo-noborder.svg"
              alt="Logo"
              className="w-12 rounded-full"
            />
          </div>
          <h2 className="text-3xl font-bold text-gray-900 dark:text-gray-100">
            Welcome to Hugex
          </h2>
          <p className="mt-2 text-gray-600 dark:text-gray-400">
            {oauth2Available
              ? "Sign in with your HuggingFace account to get started"
              : "Please provide your HuggingFace token to get started"}
          </p>
        </div>

        {/* OAuth2 Button or Manual Form */}
        <div className="mt-8 space-y-6">
          {oauth2Available && !showManualEntry ? (
            /* OAuth2 Login Section */
            <div className="space-y-6 rounded-lg bg-white p-6 shadow-lg dark:bg-gray-800">
              <button
                type="button"
                onClick={handleOAuth2Login}
                className="flex w-full items-center justify-center gap-2 rounded-lg border border-gray-300 bg-white px-4 py-3 font-medium text-gray-900 shadow-lg transition-colors hover:bg-gray-50 hover:shadow-xl dark:border-gray-700 dark:bg-gray-800 dark:text-gray-100 dark:hover:bg-gray-700"
              >
                <img
                  src="https://huggingface.co/front/assets/huggingface_logo-noborder.svg"
                  alt="HuggingFace"
                  className="h-4 w-4"
                />
                Sign in with HuggingFace
              </button>

              {/* Development notice - always show since OAuth2 is enabled */}
              {/* <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg p-3">
                <div className="flex items-start gap-2">
                  <svg className="w-4 h-4 text-blue-600 dark:text-blue-400 mt-0.5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                  <div className="text-xs text-blue-800 dark:text-blue-300">
                    <p className="font-medium mb-1">OAuth2 Authentication</p>
                    <p>Click above to sign in with your HuggingFace account. For production use, ensure OAuth2 app credentials are properly configured.</p>
                  </div>
                </div>
              </div> */}

              <div className="text-center">
                <button
                  type="button"
                  onClick={() => setShowManualEntry(true)}
                  className="text-sm text-gray-500 underline hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-300"
                >
                  Or use manual token entry
                </button>
              </div>
            </div>
          ) : (
            /* Manual Token Entry Form */
            <form onSubmit={handleSubmit}>
              <div className="space-y-6 rounded-lg bg-white p-6 shadow-lg dark:bg-gray-800">
                {/* OpenAI API Key */}
                {/* <div>
              <label
                htmlFor="openai-key"
                className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2"
              >
                OpenAI API Key
                <span className="text-gray-500 dark:text-gray-400 font-normal ml-1">
                  (optional - can be configured later)
                </span>
              </label>
              <div className="relative">
                <input
                  id="openai-key"
                  type={showKeys.openai ? "text" : "password"}
                  value={credentials.openaiApiKey}
                  onChange={(e) =>
                    handleInputChange("openaiApiKey", e.target.value)
                  }
                  className="w-full px-3 py-3 pr-12 bg-gray-50 dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-lg text-gray-900 dark:text-gray-100 placeholder-gray-500 dark:placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  placeholder="sk-..."
                />
                <button
                  type="button"
                  onClick={() =>
                    setShowKeys((prev) => ({ ...prev, openai: !prev.openai }))
                  }
                  className="absolute right-3 top-1/2 transform -translate-y-1/2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
                >
                  {showKeys.openai ? (
                    <svg
                      className="w-5 h-5"
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"
                      />
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z"
                      />
                    </svg>
                  ) : (
                    <svg
                      className="w-5 h-5"
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.878 9.878L3 3m6.878 6.878L21 21"
                      />
                    </svg>
                  )}
                </button>
              </div>
              <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                Get your API key from{" "}
                <a
                  href="https://platform.openai.com/api-keys"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-blue-600 hover:underline"
                >
                  OpenAI Platform
                </a>
              </p>
            </div> */}

                {/* HuggingFace Token */}
                <div>
                  <label
                    htmlFor="hf-token"
                    className="mb-2 block text-sm font-medium text-gray-700 dark:text-gray-300"
                  >
                    HuggingFace Token
                    <span className="ml-1 font-normal text-red-500 dark:text-red-400">
                      (required)
                    </span>
                  </label>
                  <div className="relative">
                    <input
                      id="hf-token"
                      type={showKeys.huggingface ? "text" : "password"}
                      value={credentials.huggingfaceToken}
                      onChange={(e) =>
                        handleInputChange("huggingfaceToken", e.target.value)
                      }
                      className="w-full rounded-lg border border-gray-300 bg-gray-50 px-3 py-3 pr-12 text-gray-900 placeholder-gray-500 focus:border-transparent focus:outline-none focus:ring-2 focus:ring-blue-500 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100 dark:placeholder-gray-400"
                      placeholder="hf_..."
                    />
                    <button
                      type="button"
                      onClick={() =>
                        setShowKeys((prev) => ({
                          ...prev,
                          huggingface: !prev.huggingface,
                        }))
                      }
                      className="absolute right-3 top-1/2 -translate-y-1/2 transform text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
                    >
                      {showKeys.huggingface ? (
                        <svg
                          className="h-5 w-5"
                          fill="none"
                          stroke="currentColor"
                          viewBox="0 0 24 24"
                        >
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeWidth={2}
                            d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"
                          />
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeWidth={2}
                            d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z"
                          />
                        </svg>
                      ) : (
                        <svg
                          className="h-5 w-5"
                          fill="none"
                          stroke="currentColor"
                          viewBox="0 0 24 24"
                        >
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeWidth={2}
                            d="M13.875 18.825A10.05 10.05 0 0112 19c4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.878 9.878L3 3m6.878 6.878L21 21"
                          />
                        </svg>
                      )}
                    </button>
                  </div>
                  <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                    Get your token from{" "}
                    <a
                      href="https://huggingface.co/settings/tokens"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-blue-600 hover:underline"
                    >
                      HuggingFace Settings
                    </a>
                  </p>
                </div>

                {/* Info Box */}
                <div className="rounded-lg border border-blue-200 bg-blue-50 p-4 dark:border-blue-800 dark:bg-blue-900/20">
                  <div className="flex items-start gap-3">
                    <svg
                      className="mt-0.5 h-5 w-5 flex-shrink-0 text-blue-600 dark:text-blue-400"
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
                      />
                    </svg>
                    <div className="text-sm text-blue-800 dark:text-blue-300">
                      <p className="mb-1 font-medium">Security & Privacy</p>
                      <ul className="space-y-1 text-xs">
                        <li>
                          • Your HuggingFace token is required for
                          authentication and job management
                        </li>
                        {/* <li>• OpenAI API key is optional and can be configured later in settings</li> */}
                        <li>
                          • All credentials are stored securely and encrypted
                        </li>
                        <li>• Session expires automatically after 7 days</li>
                      </ul>
                    </div>
                  </div>
                </div>

                {/* Error Message */}
                {error && (
                  <div className="rounded-lg border border-red-200 bg-red-50 p-4 dark:border-red-800 dark:bg-red-900/20">
                    <div className="flex items-center gap-3">
                      <svg
                        className="h-5 w-5 flex-shrink-0 text-red-600 dark:text-red-400"
                        fill="none"
                        stroke="currentColor"
                        viewBox="0 0 24 24"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={2}
                          d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
                        />
                      </svg>
                      <p className="text-sm text-red-800 dark:text-red-300">
                        {error}
                      </p>
                    </div>
                  </div>
                )}

                {/* Submit Button */}
                <button
                  type="submit"
                  disabled={isLoading || !credentials.huggingfaceToken.trim()}
                  className="flex w-full items-center justify-center gap-2 rounded-lg bg-blue-600 px-4 py-3 font-medium text-white transition-colors hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-gray-400 dark:disabled:bg-gray-600"
                >
                  {isLoading ? (
                    <>
                      <svg
                        className="h-4 w-4 animate-spin"
                        fill="none"
                        stroke="currentColor"
                        viewBox="0 0 24 24"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={2}
                          d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                        />
                      </svg>
                      Verifying credentials...
                    </>
                  ) : (
                    "Continue to Hugex"
                  )}
                </button>

                {/* Back to OAuth2 button if manual entry is shown */}
                {oauth2Available && showManualEntry && (
                  <div className="text-center">
                    <button
                      type="button"
                      onClick={() => setShowManualEntry(false)}
                      className="text-sm text-gray-500 underline hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-300"
                    >
                      ← Back to HuggingFace sign in
                    </button>
                  </div>
                )}
              </div>
            </form>
          )}
        </div>

        {/* Footer */}
        <div className="space-y-2 text-center text-xs text-gray-500 dark:text-gray-400">
          <p>
            By continuing, you agree to store your credentials securely in your
            browser.
          </p>
          {/* <p className="text-blue-600 dark:text-blue-400">
            ℹ️ OpenAI API key is now optional and can be configured later in settings
          </p> */}
        </div>
      </div>
    </div>
  );
};
