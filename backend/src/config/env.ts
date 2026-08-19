import "dotenv/config";
import { z } from "zod";

const envSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  PORT: z.coerce.number().int().positive().default(4000),
  DATABASE_URL: z.string().url(),
  JWT_SECRET: z.string().min(16, "JWT_SECRET must be at least 16 characters"),
  JWT_EXPIRES_IN: z.string().default("8h"),
  CORS_ORIGIN: z.string().default("http://localhost:3000"),
  // The deployed Next.js frontend's origin (e.g. https://app.vercel.app),
  // separate from CORS_ORIGIN so local dev's default keeps working
  // unmodified — production just adds this on top. No trailing slash
  // (an Origin header never has one; see app.ts's normalizeOrigin).
  FRONTEND_URL: z.string().url().optional(),
});

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  console.error("Invalid environment configuration:");
  console.error(parsed.error.flatten().fieldErrors);
  throw new Error("Environment validation failed — check your .env file against .env.example");
}

export const env = parsed.data;
