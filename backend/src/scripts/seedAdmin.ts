/**
 * One-time bootstrap: creates (or resets) the first admin account so there's
 * someone who can log in and use the /dashboard/users UI to add everyone
 * else. Safe to re-run — it upserts on email, so running it again with a
 * new password just resets that admin's password instead of erroring.
 *
 * Usage:
 *   cd backend
 *   npm run seed:admin -- --email=you@company.com --password=... --name="Admin Name"
 *
 * Flags fall back to ADMIN_EMAIL / ADMIN_PASSWORD / ADMIN_NAME env vars,
 * then to the defaults below (dev convenience only — always pass a real
 * password outside local dev).
 */
import bcrypt from "bcryptjs";
import { db, pool } from "../db/client.js";
import { users } from "../db/schema/index.js";

const BCRYPT_ROUNDS = 10;

function readArg(flag: string): string | undefined {
  const prefix = `--${flag}=`;
  const arg = process.argv.find((a) => a.startsWith(prefix));
  return arg?.slice(prefix.length);
}

async function main() {
  const email = (readArg("email") ?? process.env.ADMIN_EMAIL ?? "admin@aliahijab.local").toLowerCase();
  const password = readArg("password") ?? process.env.ADMIN_PASSWORD ?? "ChangeMe123!";
  const fullName = readArg("name") ?? process.env.ADMIN_NAME ?? "Admin";

  if (password.length < 8) {
    throw new Error("Password must be at least 8 characters");
  }

  const passwordHash = await bcrypt.hash(password, BCRYPT_ROUNDS);

  const [admin] = await db
    .insert(users)
    .values({ fullName, email, passwordHash, role: "admin", brandId: null })
    .onConflictDoUpdate({
      target: users.email,
      set: { passwordHash, role: "admin", brandId: null, isActive: true, fullName },
    })
    .returning({ id: users.id, email: users.email, fullName: users.fullName });

  console.log(`Admin user ready: ${admin!.fullName} <${admin!.email}> (id ${admin!.id})`);
  if (!readArg("password") && !process.env.ADMIN_PASSWORD) {
    console.log(`Using the default password — pass --password=... to set your own.`);
  }
}

main()
  .catch((err) => {
    console.error("seed-admin failed:", err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await pool.end();
  });
