import { NextResponse, type NextRequest } from "next/server";
import {
  getSessionCookieName,
  getSessionFromRequest,
  resolveEngineUserId,
  revokeSession
} from "@/lib/auth/session";
import { CatHttpError, isCatAuthError } from "@/lib/cat/errors";

export type CatRouteSession = NonNullable<Awaited<ReturnType<typeof getSessionFromRequest>>>;

function clearSessionCookie(response: NextResponse) {
  response.cookies.set(getSessionCookieName(), "", {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    expires: new Date(0),
    path: "/"
  });
  return response;
}

export async function requireCatSession(request: NextRequest) {
  const session = await getSessionFromRequest(request);
  if (!session) {
    return {
      response: NextResponse.json(
        { error: "Your session is no longer valid. Sign in again.", code: "session_expired" },
        { status: 401 }
      )
    };
  }

  return {
    session,
    engineUserId: resolveEngineUserId(session)
  };
}

export async function handleCatRouteError(error: unknown, session?: CatRouteSession) {
  if (isCatAuthError(error)) {
    if (session?.id) {
      await revokeSession(session.id).catch(() => undefined);
    }

    return clearSessionCookie(
      NextResponse.json(
        {
          error: "Your Cheshire Cat session expired or became invalid. Sign in again.",
          code: "cat_session_expired"
        },
        { status: 401 }
      )
    );
  }

  if (error instanceof CatHttpError) {
    const status = error.status >= 400 && error.status < 500 ? error.status : 502;
    return NextResponse.json({ error: error.clientMessage }, { status });
  }

  const message = error instanceof Error ? error.message : "Unable to reach Cheshire Cat";
  return NextResponse.json({ error: message }, { status: 502 });
}
