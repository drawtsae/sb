import { NextResponse, type NextRequest } from "next/server";

// Cheap gate only (cookie presence); real validation happens in requireUser*.
export function proxy(request: NextRequest) {
  if (request.cookies.has("sb_session")) return NextResponse.next();
  const { pathname, search } = request.nextUrl;
  if (pathname.startsWith("/api/")) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const url = request.nextUrl.clone();
  url.pathname = "/login";
  url.search = `?next=${encodeURIComponent(pathname + search)}`;
  return NextResponse.redirect(url);
}

// The song upload and file routes are excluded on purpose: when the proxy matches, Next
// buffers the request body and truncates it at 10 MB. They authenticate with requireUserApi.
export const config = {
  matcher: [
    "/((?!login$|login/|live$|live/|sw\\.js$|~offline$|~offline/|manifest\\.webmanifest$|_next/|favicon\\.ico$|api/songs/upload$|api/songs/[^/]+/file$).*)",
  ],
};
