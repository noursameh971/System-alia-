import { createApp } from "./app.js";
import { env } from "./config/env.js";
import { pool } from "./db/client.js";
import { warmUpEmbedder } from "./modules/knowledge/embedder.js";
import { startRecordSync } from "./modules/knowledge/records.js";

const app = createApp();

const server = app.listen(env.PORT, () => {
  console.log(`API listening on port ${env.PORT} (${env.NODE_ENV})`);
  // The assistant's knowledge base: load the embedding model and start
  // mirroring records in the background, so the first search is ready.
  if (env.KNOWLEDGE_ENABLED) {
    warmUpEmbedder();
    startRecordSync();
  }
});

async function shutdown(signal: string) {
  console.log(`${signal} received, shutting down...`);
  server.close(async () => {
    await pool.end();
    process.exit(0);
  });
}

process.on("SIGTERM", () => void shutdown("SIGTERM"));
process.on("SIGINT", () => void shutdown("SIGINT"));
