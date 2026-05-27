import { Pool } from '@neondatabase/serverless';
import { drizzle } from 'drizzle-orm/neon-serverless';

const pool = new Pool({ connectionString: process.env.DATABASE_URL! });
export const db = drizzle(pool);

export type DB = typeof db;
export type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];
