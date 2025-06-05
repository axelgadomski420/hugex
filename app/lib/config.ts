// Configuration for JobService
export const config = {
  // Set to true to use integrated API, false for mock data
  USE_REAL_API:
    process.env.NODE_ENV === "production" ||
    process.env.USE_REAL_API === "true",

  // Job polling interval (for status updates)
  JOB_POLL_INTERVAL: 2000, // 2 seconds

  // Default pagination
  DEFAULT_PAGE_SIZE: 20,

  // Maximum retries for API calls
  MAX_RETRIES: 3,

  // Request timeout
  REQUEST_TIMEOUT: 10000, // 10 seconds

  // Name of the cookie used for authentication
  COOKIE_NAME: "hugex_auth",
};
