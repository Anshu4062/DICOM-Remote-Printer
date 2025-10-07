import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

// Temporarily disable route protection to avoid redirect loops during login
export function middleware(_request: NextRequest) {
  return NextResponse.next();
}

export const config = {
  matcher: [],
};
