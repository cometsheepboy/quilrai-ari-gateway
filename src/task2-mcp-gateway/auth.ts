
import { timingSafeEqual } from "node:crypto";

export type UserRole = "admin" | "viewer";

interface AuthenticatedUser {
  role: UserRole;
}

function secureTokenMatch(
  provided: string,
  expected: string
): boolean {
  const providedBuffer = Buffer.from(provided);
  const expectedBuffer = Buffer.from(expected);

  if (providedBuffer.length !== expectedBuffer.length) {
    return false;
  }

  return timingSafeEqual(providedBuffer, expectedBuffer);
}

export function authenticateToken(
  token: string
): AuthenticatedUser | null {
  const adminToken = process.env.ADMIN_TOKEN;
  const viewerToken = process.env.VIEWER_TOKEN;

  if (
    adminToken &&
    secureTokenMatch(token, adminToken)
  ) {
    return { role: "admin" };
  }

  if (
    viewerToken &&
    secureTokenMatch(token, viewerToken)
  ) {
    return { role: "viewer" };
  }

  return null;
}
