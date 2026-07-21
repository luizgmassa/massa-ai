export type ProjectIdentityErrorCode =
  | "INVALID_PROJECT_IDENTITY_REQUEST"
  | "PROJECT_IDENTITY_BACKEND_UNAVAILABLE"
  | "PROJECT_IDENTITY_SOURCE_NOT_FOUND"
  | "PROJECT_IDENTITY_SOURCE_RETIRED"
  | "PROJECT_IDENTITY_TARGET_EXISTS"
  | "PROJECT_IDENTITY_TARGET_NOT_FOUND"
  | "PROJECT_IDENTITY_TARGET_RETIRED"
  | "PROJECT_IDENTITY_ROOT_MISMATCH"
  | "PROJECT_IDENTITY_CONFLICT"
  | "PROJECT_IDENTITY_UNKNOWN_STORAGE"
  | "PROJECT_IDENTITY_PLAN_CHANGED"
  | "PROJECT_IDENTITY_OPERATION_REUSED";

const ERROR_MESSAGES: Record<ProjectIdentityErrorCode, string> = {
  INVALID_PROJECT_IDENTITY_REQUEST: "The project identity request is invalid",
  PROJECT_IDENTITY_BACKEND_UNAVAILABLE: "The project identity backend is unavailable",
  PROJECT_IDENTITY_SOURCE_NOT_FOUND: "The source project does not exist",
  PROJECT_IDENTITY_SOURCE_RETIRED: "The source project ID is retired",
  PROJECT_IDENTITY_TARGET_EXISTS: "The target project already exists",
  PROJECT_IDENTITY_TARGET_NOT_FOUND: "The target project does not exist",
  PROJECT_IDENTITY_TARGET_RETIRED: "The target project ID is retired",
  PROJECT_IDENTITY_ROOT_MISMATCH: "The projects do not have the same canonical root",
  PROJECT_IDENTITY_CONFLICT: "The project identities contain conflicting records",
  PROJECT_IDENTITY_UNKNOWN_STORAGE: "Unclassified project-scoped storage was found",
  PROJECT_IDENTITY_PLAN_CHANGED: "The project identity preview has changed",
  PROJECT_IDENTITY_OPERATION_REUSED: "The operation ID was already used for another request",
};

const ERROR_STATUS: Record<ProjectIdentityErrorCode, number> = {
  INVALID_PROJECT_IDENTITY_REQUEST: 400,
  PROJECT_IDENTITY_BACKEND_UNAVAILABLE: 503,
  PROJECT_IDENTITY_SOURCE_NOT_FOUND: 404,
  PROJECT_IDENTITY_SOURCE_RETIRED: 409,
  PROJECT_IDENTITY_TARGET_EXISTS: 409,
  PROJECT_IDENTITY_TARGET_NOT_FOUND: 404,
  PROJECT_IDENTITY_TARGET_RETIRED: 409,
  PROJECT_IDENTITY_ROOT_MISMATCH: 409,
  PROJECT_IDENTITY_CONFLICT: 409,
  PROJECT_IDENTITY_UNKNOWN_STORAGE: 409,
  PROJECT_IDENTITY_PLAN_CHANGED: 409,
  PROJECT_IDENTITY_OPERATION_REUSED: 409,
};

/** Sanitized public error shared by Core, HTTP, and MCP transports. */
export class ProjectIdentityError extends Error {
  readonly statusCode: number;

  constructor(
    readonly code: ProjectIdentityErrorCode,
    options?: { cause?: unknown; statusCode?: number },
  ) {
    super(
      ERROR_MESSAGES[code],
      options?.cause === undefined ? undefined : { cause: options.cause },
    );
    this.name = "ProjectIdentityError";
    this.statusCode = options?.statusCode ?? ERROR_STATUS[code];
  }
}

