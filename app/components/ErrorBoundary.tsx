import { useRouteError, isRouteErrorResponse, Link } from "@remix-run/react";

export default function ErrorBoundary() {
  const error = useRouteError();

  if (isRouteErrorResponse(error)) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gray-50">
        <div className="w-full max-w-md rounded-lg border border-gray-200 bg-white p-8 text-center">
          <div className="mb-4">
            <h1 className="mb-2 text-6xl font-bold text-gray-300">
              {error.status}
            </h1>
            <h2 className="mb-4 text-xl font-semibold text-gray-900">
              {error.status === 404 ? "Job Not Found" : "Something went wrong"}
            </h2>
            <p className="mb-6 text-gray-600">
              {error.status === 404
                ? "The job you're looking for doesn't exist or has been removed."
                : "We encountered an error while processing your request."}
            </p>
          </div>

          <Link
            to="/"
            className="inline-flex items-center rounded-lg bg-blue-600 px-4 py-2 text-white transition-colors hover:bg-blue-700"
          >
            <svg
              className="mr-2 h-4 w-4"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M15 19l-7-7 7-7"
              />
            </svg>
            Back to Jobs
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-gray-50">
      <div className="w-full max-w-md rounded-lg border border-gray-200 bg-white p-8 text-center">
        <h1 className="mb-4 text-xl font-semibold text-gray-900">
          Unexpected Error
        </h1>
        <p className="mb-6 text-gray-600">
          Something went wrong. Please try again later.
        </p>
        <Link
          to="/"
          className="inline-flex items-center rounded-lg bg-blue-600 px-4 py-2 text-white transition-colors hover:bg-blue-700"
        >
          <svg
            className="mr-2 h-4 w-4"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M15 19l-7-7 7-7"
            />
          </svg>
          Back to Jobs
        </Link>
      </div>
    </div>
  );
}
