import "dotenv/config";
import { defineConfig } from "prisma/config";

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
  },
  datasource: {
    // CLI commands (migrate, introspect) use the direct connection.
    // Runtime queries use the pooled URL via @prisma/adapter-pg in lib/prisma.ts.
    url: process.env.DIRECT_URL ?? process.env.DATABASE_URL,
  },
});
