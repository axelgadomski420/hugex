import { config } from "./config";

// Import both services statically
import { JobService as MockJobService } from "./jobService";
import { JobService as RemixJobService } from "./jobService.remix";

// Export the appropriate service based on configuration
// This avoids top-level await and dynamic imports that could cause bundling issues
export const JobService = RemixJobService; // config.USE_REAL_API ? RemixJobService : MockJobService;
