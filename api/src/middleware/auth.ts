import { jwtVerify } from "jose";
import type { MiddlewareHandler } from "hono";
import type { Variables, JwtPayload } from "../types/index.js";

export const authMiddleware: MiddlewareHandler<{ Variables: Variables }> = async (c, next) => {
  const authHeader = c.req.header("Authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    return c.json({ error: { code: "UNAUTHORIZED", message: "Missing or malformed Authorization header" } }, 401);
  }
  const token = authHeader.slice(7);
  const secret = process.env.JWT_SECRET || (globalThis as any).__ENV?.JWT_SECRET;
  if (!secret) {
    console.error("[auth] JWT_SECRET is not configured");
    return c.json({ error: { code: "INTERNAL_SERVER_ERROR", message: "Auth configuration error" } }, 500);
  }
  try {
    const secretKey = new TextEncoder().encode(secret);
    const { payload } = await jwtVerify(token, secretKey, { algorithms: ["HS256"] });
    const user: JwtPayload = {
      sub: payload.sub as string,
      email: payload["email"] as string,
      roles: (payload["roles"] as string[]) ?? [],
      emailVerified: (payload["emailVerified"] as boolean) ?? false,
      mustChangePassword: (payload["mustChangePassword"] as boolean) ?? false,
      companyId: payload["companyId"] as string | undefined,
      iat: payload.iat,
      exp: payload.exp,
    };
    c.set("user", user);
    return next();
  } catch (err) {
    const message =
      err instanceof Error && err.message.includes("expired") ? "Token has expired" : "Invalid token";
    return c.json({ error: { code: "UNAUTHORIZED", message } }, 401);
  }
};
