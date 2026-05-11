import "dotenv/config";
import { defineConfig } from "prisma/config";

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
  },
  datasource: {
    // For Supabase: use the pooled URL here for runtime queries.
    // For migrations (`prisma migrate`), temporarily point DATABASE_URL at DIRECT_URL,
    // or invoke with `DATABASE_URL=$DIRECT_URL npx prisma migrate dev`.
    url: process.env["DATABASE_URL"],
  },
});
