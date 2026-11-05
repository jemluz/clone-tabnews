import { NextResponse } from "next/server";
import { middleware as nextraMiddleware } from "nextra/locales";

export function middleware(request) {
  const { pathname } = request.nextUrl;
  const legacyClassesPath = pathname.match(
    /^\/(?:(pt-BR|en-US)\/)?aulas(?=\/|$)/,
  );

  if (legacyClassesPath) {
    const url = request.nextUrl.clone();
    const locale = legacyClassesPath[1] ?? "pt-BR";
    url.pathname = pathname.replace(
      /^\/(?:(?:pt-BR|en-US)\/)?aulas(?=\/|$)/,
      `/${locale}/classes`,
    );
    return NextResponse.redirect(url);
  }

  return nextraMiddleware(request);
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|img/).*)"],
};
