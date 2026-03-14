import { jwtVerify } from "jose";
import type { MiddlewareHandler } from "hono";
import type { AppEnv, JwtPayload } from "../types";
import { error } from "../types";

/**
 * JWT authentication middleware.
 *
 * Reads the `Authorization: Bearer <token>` header, verifies it with HS256
 * using JWT_SECRET, and stores the decoded payload in `c.var.user`.
 */
export const authMiddleware: MiddlewareHandler<AppEnv> = async (c, next) => {
  const authHeader = c.req.header("Authorization");

  if (!authHeader?.startsWith("Bearer ")) {
    return c.json(error("UNAUTHORIZED", "Missing or malformed Authorization header"), 401);
  }

  const token = authHeader.slice(7);

  if (!token) {
    return c.json(error("UNAUTHORIZED", "Token not provided"), 401);
  }

  const secret = c.env.JWT_SECRET;
  if (!secret) {
    console.error("[auth] JWT_SECRET binding is not configured");
    return c.json(error("INTERNAL_SERVER_ERROR", "Auth configuration error"), 500);
  }

  try {
    const secretKey = new TextEncoder().encode(secret);
    const { payload } = await jwtVerify(token, secretKey, {
      algorithms: ["HS256"],
    });

    const user: JwtPayload = {
      sub: payload.sub as string,
      email: payload["email"] as string,
      name: payload["name"] as string,
      role: payload["role"] as string,
      iat: payload.iat,
      exp: payload.exp,
    };

    c.set("user", user);
    return next();
  } catch (err) {
    const message =
      err instanceof Error && err.message.includes("expired")
        ? "Token has expired"
        : "Invalid token";
    return c.json(error("UNAUTHORIZED", message), 401);
  }
};
