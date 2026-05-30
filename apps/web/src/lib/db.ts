import { Pool } from '@neondatabase/serverless';
import { drizzle } from 'drizzle-orm/neon-serverless';
import { logger } from './logger';

export const pool = new Pool({ connectionString: process.env.DATABASE_URL! });

pool.on('connect', () => {
  logger.info('db_pool_connect', { totalCount: pool.totalCount });
});
pool.on('remove', () => {
  logger.info('db_pool_remove', { totalCount: pool.totalCount });
});
pool.on('error', (err: Error) => {
  logger.error('db_pool_error', { totalCount: pool.totalCount }, err);
});

export const db = drizzle(pool);

export type DB = typeof db;
export type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];
