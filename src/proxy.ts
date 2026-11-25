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

export const config = {
  matcher: [
    "/((?!login$|login/|live$|live/|sw\\.js$|~offline$|~offline/|manifest\\.webmanifest$|_next/|favicon\\.ico$).*)",
  ],
};
