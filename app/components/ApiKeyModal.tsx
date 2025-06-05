import React, { useState, useEffect } from "react";

interface ApiKeyModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const ApiKeyModal: React.FC<ApiKeyModalProps> = ({
  isOpen,
  onClose,
}) => {
  const [currentApiKey, setCurrentApiKey] = useState("");
  const [newApiKey, setNewApiKey] = useState("");
  const [showApiKey, setShowApiKey] = useState(false);
  const [copySuccess, setCopySuccess] = useState(false);

  useEffect(() => {
    if (isOpen) {
      // Load current API key from localStorage when modal opens
      const storedApiKey = localStorage.getItem("hugex_api_key");
      if (storedApiKey) {
        setCurrentApiKey(storedApiKey);
      }
    }
  }, [isOpen]);

  const handleSave = () => {
    if (newApiKey.trim()) {
      localStorage.setItem("hugex_api_key", newApiKey.trim());
      setCurrentApiKey(newApiKey.trim());
      setNewApiKey("");
      alert("API key saved successfully!");
    }
  };

  const handleDelete = () => {
    if (confirm("Are you sure you want to delete your API key?")) {
      localStorage.removeItem("hugex_api_key");
      setCurrentApiKey("");
      setNewApiKey("");
      alert("API key deleted successfully!");
    }
  };

  const handleCopy = async () => {
    const keyToCopy = currentApiKey || newApiKey;
    if (keyToCopy) {
      try {
        await navigator.clipboard.writeText(keyToCopy);
        setCopySuccess(true);
        setTimeout(() => setCopySuccess(false), 2000);
      } catch (err) {
        console.error("Failed to copy to clipboard:", err);
      }
    }
  };

  const generateCurlExample = () => {
    const apiKey = currentApiKey || newApiKey || "your-api-key-here";
    return `curl -X POST https://your-domain.com/api/jobs/create-with-key \\
  -H "Content-Type: application/json" \\
  -H "Authorization: Bearer ${apiKey}" \\
  -d '{
    "title": "Fix authentication bug",
    "description": "Resolve login issues in the user authentication flow",
    "repository": {
      "url": "https://github.com/username/repo"
    },
    "branch": "main",
    "environment": {
      "LLM_MODEL": "claude-3-sonnet-20240229",
      "LLM_PROVIDER": "anthropic"
    },
    "secrets": {
      "ANTHROPIC_API_KEY": "sk-ant-api03-..."
    }
  }'`;
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black bg-opacity-50"
        onClick={onClose}
      />

      {/* Modal */}
      <div className="relative mx-4 max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-lg bg-white shadow-xl dark:bg-gray-800">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-gray-200 p-6 dark:border-gray-700">
          <h2 className="text-xl font-semibold text-gray-900 dark:text-gray-100">
            API Key Management
          </h2>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
          >
            <svg
              className="h-6 w-6"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M6 18L18 6M6 6l12 12"
              />
            </svg>
          </button>
        </div>

        {/* Content */}
        <div className="space-y-6 p-6">
          {/* Current API Key Section */}
          <div>
            <label className="mb-2 block text-sm font-medium text-gray-700 dark:text-gray-300">
              Current API Key
            </label>
            {currentApiKey ? (
              <div className="space-y-3">
                <div className="flex items-center gap-2">
                  <input
                    type={showApiKey ? "text" : "password"}
                    value={currentApiKey}
                    readOnly
                    className="flex-1 rounded-md border border-gray-300 bg-gray-50 px-3 py-2 font-mono text-sm text-gray-900 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100"
                  />
                  <button
                    onClick={() => setShowApiKey(!showApiKey)}
                    className="rounded-md border border-gray-300 px-3 py-2 text-sm text-gray-700 hover:bg-gray-50 dark:border-gray-600 dark:text-gray-300 dark:hover:bg-gray-700"
                  >
                    {showApiKey ? (
                      <i className="fas fa-eye-slash"></i>
                    ) : (
                      <i className="fas fa-eye"></i>
                    )}
                  </button>
                  <button
                    onClick={handleCopy}
                    className="rounded-md border border-gray-300 px-3 py-2 text-sm text-gray-700 hover:bg-gray-50 dark:border-gray-600 dark:text-gray-300 dark:hover:bg-gray-700"
                  >
                    {copySuccess ? (
                      <i className="fas fa-check text-green-600"></i>
                    ) : (
                      <i className="fas fa-copy"></i>
                    )}
                  </button>
                </div>
                <button
                  onClick={handleDelete}
                  className="text-sm text-red-600 hover:text-red-800 dark:text-red-400 dark:hover:text-red-300"
                >
                  <i className="fas fa-trash mr-1"></i>
                  Delete API Key
                </button>
              </div>
            ) : (
              <p className="text-sm italic text-gray-500 dark:text-gray-400">
                No API key configured
              </p>
            )}
          </div>

          {/* Add/Update API Key Section */}
          <div>
            <label className="mb-2 block text-sm font-medium text-gray-700 dark:text-gray-300">
              {currentApiKey ? "Update API Key" : "Add API Key"}
            </label>
            <div className="space-y-3">
              <input
                type="password"
                value={newApiKey}
                onChange={(e) => setNewApiKey(e.target.value)}
                placeholder="Enter your Hugging Face token (hf_...)"
                className="w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-gray-900 focus:border-blue-500 focus:ring-2 focus:ring-blue-500 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100"
              />
              <button
                onClick={handleSave}
                disabled={!newApiKey.trim()}
                className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {currentApiKey ? "Update" : "Save"} API Key
              </button>
            </div>
          </div>

          {/* Information Section */}
          <div className="rounded-lg border border-blue-200 bg-blue-50 p-4 dark:border-blue-800 dark:bg-blue-900/20">
            <h3 className="mb-2 text-sm font-medium text-blue-800 dark:text-blue-300">
              How to get your Hugging Face API token:
            </h3>
            <ol className="list-inside list-decimal space-y-1 text-sm text-blue-700 dark:text-blue-300">
              <li>
                Go to{" "}
                <a
                  href="https://huggingface.co/settings/tokens"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="underline"
                >
                  huggingface.co/settings/tokens
                </a>
              </li>
              <li>Click "New token" and select "Write" access</li>
              <li>Copy the token and paste it above</li>
            </ol>
          </div>

          {/* Usage Example */}
          <div>
            <label className="mb-2 block text-sm font-medium text-gray-700 dark:text-gray-300">
              API Usage Example
            </label>
            <div className="overflow-x-auto rounded-lg bg-gray-900 p-4 dark:bg-gray-950">
              <pre className="whitespace-pre-wrap text-sm text-gray-100">
                <code>{generateCurlExample()}</code>
              </pre>
            </div>
            <button
              onClick={() => {
                navigator.clipboard.writeText(generateCurlExample());
                setCopySuccess(true);
                setTimeout(() => setCopySuccess(false), 2000);
              }}
              className="mt-2 text-sm text-blue-600 hover:text-blue-800 dark:text-blue-400 dark:hover:text-blue-300"
            >
              <i className="fas fa-copy mr-1"></i>
              Copy curl example
            </button>
          </div>

          {/* Additional Examples */}
          <div>
            <label className="mb-2 block text-sm font-medium text-gray-700 dark:text-gray-300">
              Additional Examples
            </label>
            <div className="space-y-4">
              {/* OpenAI Example */}
              <div>
                <h4 className="mb-2 text-sm font-medium text-gray-600 dark:text-gray-400">
                  OpenAI Configuration:
                </h4>
                <div className="overflow-x-auto rounded-lg bg-gray-900 p-3 dark:bg-gray-950">
                  <pre className="whitespace-pre-wrap text-xs text-gray-100">
                    <code>{`{
  "title": "Add new feature",
  "environment": {
    "LLM_MODEL": "gpt-4",
    "LLM_PROVIDER": "openai"
  },
  "secrets": {
    "OPENAI_API_KEY": "sk-..."
  }
}`}</code>
                  </pre>
                </div>
              </div>

              {/* Anthropic Example */}
              <div>
                <h4 className="mb-2 text-sm font-medium text-gray-600 dark:text-gray-400">
                  Anthropic Configuration:
                </h4>
                <div className="overflow-x-auto rounded-lg bg-gray-900 p-3 dark:bg-gray-950">
                  <pre className="whitespace-pre-wrap text-xs text-gray-100">
                    <code>{`{
  "title": "Database optimization",
  "environment": {
    "LLM_MODEL": "claude-3-sonnet-20240229",
    "LLM_PROVIDER": "anthropic"
  },
  "secrets": {
    "ANTHROPIC_API_KEY": "sk-ant-api03-..."
  }
}`}</code>
                  </pre>
                </div>
              </div>

              {/* Environment Only Example */}
              <div>
                <h4 className="mb-2 text-sm font-medium text-gray-600 dark:text-gray-400">
                  Environment Variables Only:
                </h4>
                <div className="overflow-x-auto rounded-lg bg-gray-900 p-3 dark:bg-gray-950">
                  <pre className="whitespace-pre-wrap text-xs text-gray-100">
                    <code>{`{
  "title": "Quick fix",
  "environment": {
    "NODE_ENV": "production",
    "DEBUG": "true",
    "CUSTOM_VAR": "value"
  }
}`}</code>
                  </pre>
                </div>
              </div>
            </div>
          </div>

          {/* API Endpoint Documentation */}
          <div className="rounded-lg bg-gray-50 p-4 dark:bg-gray-700">
            <h3 className="mb-2 text-sm font-medium text-gray-700 dark:text-gray-300">
              API Endpoint
            </h3>
            <div className="space-y-2 text-sm text-gray-600 dark:text-gray-400">
              <div>
                <strong>Endpoint:</strong>{" "}
                <code>/api/jobs/create-with-key</code>
              </div>
              <div>
                <strong>Method:</strong> POST
              </div>
              <div>
                <strong>Headers:</strong>
              </div>
              <ul className="ml-4 list-inside list-disc space-y-1">
                <li>
                  <code>Content-Type: application/json</code>
                </li>
                <li>
                  <code>Authorization: Bearer &lt;your-api-key&gt;</code>
                </li>
              </ul>
              <div>
                <strong>Required fields:</strong> title
              </div>
              <div>
                <strong>Optional fields:</strong> description, repository,
                branch, author, environment, secrets
              </div>
              <div className="mt-3">
                <strong>Environment & Secrets:</strong>
                <ul className="ml-4 mt-1 list-inside list-disc space-y-1">
                  <li>
                    <code>environment</code>: Object with environment variables
                    (e.g., LLM_MODEL, LLM_PROVIDER)
                  </li>
                  <li>
                    <code>secrets</code>: Object with sensitive values (e.g.,
                    ANTHROPIC_API_KEY, OPENAI_API_KEY)
                  </li>
                </ul>
              </div>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="flex justify-end gap-3 border-t border-gray-200 px-6 py-4 dark:border-gray-700">
          <button
            onClick={onClose}
            className="rounded-md border border-gray-300 px-4 py-2 text-sm text-gray-700 hover:bg-gray-50 dark:border-gray-600 dark:text-gray-300 dark:hover:bg-gray-700"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
};
