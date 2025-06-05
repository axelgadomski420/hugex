// A minimal loader for a simple endpoint response
export const loader = async () => {
  return new Response(
    "Authentication successful. You may now close this tab.",
    {
      status: 200,
      headers: {
        "Content-Type": "text/plain",
      },
    }
  );
};

// Confirmation screen after successful authentication
export default function AuthDone() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-gray-50 px-4 dark:bg-gray-900">
      <div className="w-full max-w-md space-y-6 text-center">
        <div className="rounded-2xl border border-gray-200 bg-white p-6 shadow-md dark:border-gray-700 dark:bg-gray-800">
          <h1 className="text-2xl font-semibold text-gray-800 dark:text-white">
            🎉 Authentication Complete
          </h1>
          <p className="text-gray-600 dark:text-gray-300">
            You’ve successfully authenticated. You can now safely close this
            window.
          </p>
        </div>
        <p className="text-xs text-gray-400 dark:text-gray-500">
          This page will not refresh automatically.
        </p>
      </div>
    </div>
  );
}
