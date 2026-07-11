import { drizzle } from "drizzle-orm/neon-http";
import { neon } from "@neondatabase/serverless";
import * as schema from "./schema";

// DATABASE_URL is not required for the app to build or boot — pages that
// read from the DB catch connection errors and render a "not configured
// yet" state instead. Set DATABASE_URL (a Neon connection string) to make
// data actually load. See .env.example.
const connectionString = process.env.DATABASE_URL ?? "";

const sql = neon(connectionString || "postgresql://user:password@host.tld/dbname?option=value");
export const db = drizzle(sql, { schema });

export const isDatabaseConfigured = Boolean(process.env.DATABASE_URL);
