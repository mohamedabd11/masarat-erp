/**
 * Structured logger — production-safe, JSON on server / console in dev.
 *
 * Uses a tiny wrapper so we can swap to pino/winston later without
 * touching call-sites. Every log record includes:
 *   level, message, timestamp, service, requestId?, agencyId?, userId?
 */

type LogLevel = 'debug' | 'info' | 'warn' | 'error';

interface LogContext {
  requestId?: string;
  agencyId?: string;
  userId?: string;
  [key: string]: unknown;
}

interface LogRecord {
  level: LogLevel;
  msg: string;
  ts: string;
  service: string;
  err?: {
    message: string;
    name: string;
    stack?: string;
  };
  [key: string]: unknown;
}

const SERVICE = 'masarat-erp';
const IS_PROD = process.env['NODE_ENV'] === 'production';

function buildRecord(level: LogLevel, msg: string, ctx?: LogContext, err?: unknown): LogRecord {
  const record: LogRecord = {
    level,
    msg,
    ts: new Date().toISOString(),
    service: SERVICE,
    ...ctx,
  };

  if (err instanceof Error) {
    record.err = {
      name: err.name,
      message: err.message,
      stack: IS_PROD ? undefined : err.stack,
    };
  } else if (err !== undefined) {
    record.err = { name: 'UnknownError', message: String(err) };
  }

  return record;
}

function emit(record: LogRecord): void {
  if (IS_PROD) {
    // JSON lines — ingested by Vercel Log Drains / Datadog / CloudWatch
    if (record.level === 'error' || record.level === 'warn') {
      console.error(JSON.stringify(record));
    } else {
      console.log(JSON.stringify(record));
    }
  } else {
    // Readable format for local dev
    const prefix = `[${record.level.toUpperCase()}]`;
    const ctx = { ...record };
    delete ctx.level;
    delete ctx.msg;
    delete ctx.ts;
    delete ctx.service;
    const extras = Object.keys(ctx).length ? ` ${JSON.stringify(ctx)}` : '';
    const fn = record.level === 'error' ? console.error
             : record.level === 'warn'  ? console.warn
             : console.log;
    fn(`${prefix} ${record.msg}${extras}`);
  }
}

export const logger = {
  debug(msg: string, ctx?: LogContext): void {
    if (!IS_PROD) emit(buildRecord('debug', msg, ctx));
  },
  info(msg: string, ctx?: LogContext): void {
    emit(buildRecord('info', msg, ctx));
  },
  warn(msg: string, ctx?: LogContext, err?: unknown): void {
    emit(buildRecord('warn', msg, ctx, err));
  },
  error(msg: string, ctx?: LogContext, err?: unknown): void {
    emit(buildRecord('error', msg, ctx, err));
  },
  /** Create a child logger that pre-binds context fields */
  child(ctx: LogContext) {
    return {
      debug: (msg: string, extra?: LogContext) => logger.debug(msg, { ...ctx, ...extra }),
      info:  (msg: string, extra?: LogContext) => logger.info(msg,  { ...ctx, ...extra }),
      warn:  (msg: string, extra?: LogContext, err?: unknown) => logger.warn(msg,  { ...ctx, ...extra }, err),
      error: (msg: string, extra?: LogContext, err?: unknown) => logger.error(msg, { ...ctx, ...extra }, err),
    };
  },
};
