import type { FastifyBaseLogger, FastifyReply } from "fastify";
import type { ZodIssue } from "zod";

export type ApiErrorCode =
  | "BAD_REQUEST"
  | "RATE_LIMITED"
  | "GEO_PROVIDER_UNAVAILABLE"
  | "GEO_PROVIDER_REQUEST_FAILED"
  | "INTERNAL_SERVER_ERROR";

export class ApiError extends Error {
  code: ApiErrorCode;
  statusCode: number;
  issues?: ZodIssue[];
  details?: Record<string, unknown>;
  retryable?: boolean;

  constructor(
    code: ApiErrorCode,
    message: string,
    options: {
      statusCode?: number;
      issues?: ZodIssue[];
      details?: Record<string, unknown>;
      retryable?: boolean;
    } = {}
  ) {
    super(message);
    this.name = "ApiError";
    this.code = code;
    this.statusCode = options.statusCode ?? 500;
    this.issues = options.issues;
    this.details = options.details;
    this.retryable = options.retryable;
  }
}

export const sendApiError = (
  reply: FastifyReply,
  requestId: string,
  error: unknown,
  logger?: FastifyBaseLogger
) => {
  if (error instanceof ApiError) {
    if (logger) {
      logger.warn(
        {
          requestId,
          errorCode: error.code,
          statusCode: error.statusCode,
          details: error.details
        },
        error.message
      );
    }
    return reply.status(error.statusCode).send({
      error: {
        code: error.code,
        message: error.message,
        ...(error.issues ? { issues: error.issues } : {})
      },
      requestId
    });
  }

  if (logger) {
    logger.error({ requestId, error }, "Unhandled request error");
  }

  return reply.status(500).send({
    error: {
      code: "INTERNAL_SERVER_ERROR",
      message: "Internal Server Error"
    },
    requestId
  });
};
