import "dotenv/config";
import { z } from "zod";

const envSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  PORT: z.coerce.number().int().positive().default(4000),
  DATABASE_URL: z.string().url(),
  JWT_SECRET: z.string().min(16, "JWT_SECRET must be at least 16 characters"),
  JWT_EXPIRES_IN: z.string().default("8h"),
  CORS_ORIGIN: z.string().default("http://localhost:3000"),

  // TEMPORARY dev-only auth bypass so Step 3 APIs can be exercised from
  // Postman before the login/JWT-issuance module exists. See middleware/auth.ts.
  AUTH_BYPASS: z.coerce.boolean().default(false),
});

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  console.error("Invalid environment configuration:");
  console.error(parsed.error.flatten().fieldErrors);
  throw new Error("Environment validation failed — check your .env file against .env.example");
}

export const env = parsed.data;

if (env.AUTH_BYPASS && env.NODE_ENV === "production") {
  throw new Error(
    "AUTH_BYPASS=true is not allowed when NODE_ENV=production — this would let anyone call every " +
      "API as an admin with no token. Remove AUTH_BYPASS from the production environment.",
  );
}
