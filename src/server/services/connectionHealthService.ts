/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 RMATi- Ruben Modern Auto-motive-electrical Technology innovations
 */

import net from 'node:net';
import path from 'node:path';

export type PostgresHealthStatus = 'CONNECTED' | 'UNREACHABLE' | 'NOT_CONFIGURED';
export type PostgresProbeMethod = 'UNIX_SOCKET' | 'TCP_PG_WIRE' | 'NONE';

export interface PostgresHealthProbeResult {
  configured: boolean;
  status: PostgresHealthStatus;
  latencyMs: number;
  probeMethod: PostgresProbeMethod;
  detail: string;
}

export interface PostgresProbeEnvInput {
  SQL_HOST?: string;
  SQL_USER?: string;
  SQL_PASSWORD?: string;
  SQL_DB_NAME?: string;
  SQL_PORT?: string;
}

const DEFAULT_PG_PROBE_TIMEOUT_MS = 3_000;

/**
 * Standard 8-byte PostgreSQL v3 SSLRequest wire-protocol probe packet:
 * Length = 8 (int32 BE), Request Code = 80877103 (0x04d2162f).
 * A live PostgreSQL server replies with a single byte: 'S' (0x53) or 'N' (0x4e).
 */
const PG_SSL_REQUEST_PACKET = Buffer.from([
  0x00, 0x00, 0x00, 0x08,
  0x04, 0xd2, 0x16, 0x2f,
]);

function sanitizeProbeErrorCode(err: unknown): string {
  const code =
    typeof err === 'object' && err !== null && 'code' in err
      ? String((err as { code?: unknown }).code || '')
      : '';
  if (code === 'ECONNREFUSED') return 'Connection refused by PostgreSQL endpoint.';
  if (code === 'ENOENT') return 'Cloud SQL Unix domain socket path not found on host.';
  if (code === 'ETIMEDOUT') return 'PostgreSQL probe timed out.';
  if (code === 'ENOTFOUND') return 'PostgreSQL host could not be resolved.';
  if (code === 'EACCES') return 'Permission denied accessing PostgreSQL socket.';
  return 'PostgreSQL endpoint is unreachable.';
}

function parseOptionalPort(rawPort: string | undefined): number {
  const parsed = Number(rawPort);
  if (Number.isInteger(parsed) && parsed > 0 && parsed <= 65535) {
    return parsed;
  }
  return 5432;
}

/**
 * Performs a single, lazy, on-demand, read-only PostgreSQL connectivity probe.
 * Strictly reads platform SQL_* runtime variables (never DATABASE_URL), never runs
 * at module startup, never loops/retries, and never leaks credentials or hostnames.
 */
export async function probePostgresConnection(options?: {
  env?: PostgresProbeEnvInput;
  timeoutMs?: number;
}): Promise<PostgresHealthProbeResult> {
  const env = options?.env ?? process.env;
  const timeoutMs = Math.max(250, Math.min(8_000, options?.timeoutMs ?? DEFAULT_PG_PROBE_TIMEOUT_MS));

  const sqlHost = String(env.SQL_HOST || '').trim();
  const sqlUser = String(env.SQL_USER || '').trim();
  const sqlDbName = String(env.SQL_DB_NAME || '').trim();

  if (!sqlHost || !sqlUser || !sqlDbName) {
    return {
      configured: false,
      status: 'NOT_CONFIGURED',
      latencyMs: 0,
      probeMethod: 'NONE',
      detail:
        'Cloud SQL PostgreSQL runtime variables (SQL_HOST, SQL_USER, SQL_DB_NAME) are not configured on this server; Cloud Firestore & local IndexedDB remain active.',
    };
  }

  const isUnixSocket = sqlHost.startsWith('/');
  const port = parseOptionalPort(env.SQL_PORT);
  const probeMethod: PostgresProbeMethod = isUnixSocket ? 'UNIX_SOCKET' : 'TCP_PG_WIRE';
  const startedAt = Date.now();

  return new Promise<PostgresHealthProbeResult>((resolve) => {
    let settled = false;
    const socketPath = isUnixSocket
      ? sqlHost.includes('.s.PGSQL.')
        ? sqlHost
        : path.join(sqlHost, `.s.PGSQL.${port}`)
      : null;

    const socket = socketPath
      ? net.createConnection({ path: socketPath })
      : net.createConnection({ host: sqlHost, port });

    const finish = (result: PostgresHealthProbeResult) => {
      if (settled) return;
      settled = true;
      socket.removeAllListeners();
      socket.destroy();
      resolve(result);
    };

    socket.setTimeout(timeoutMs);

    socket.once('connect', () => {
      try {
        socket.write(PG_SSL_REQUEST_PACKET);
      } catch (err) {
        finish({
          configured: true,
          status: 'UNREACHABLE',
          latencyMs: Date.now() - startedAt,
          probeMethod,
          detail: sanitizeProbeErrorCode(err),
        });
      }
    });

    socket.once('data', (chunk: Buffer) => {
      const firstByte = chunk.length > 0 ? chunk[0] : 0;
      const isPgWireReply = firstByte === 0x53 || firstByte === 0x4e || firstByte === 0x45;
      if (isPgWireReply) {
        finish({
          configured: true,
          status: 'CONNECTED',
          latencyMs: Math.max(0, Date.now() - startedAt),
          probeMethod,
          detail:
            firstByte === 0x53
              ? 'PostgreSQL server responded to SSL/wire handshake (TLS supported).'
              : 'PostgreSQL server responded to wire-protocol ping.',
        });
      } else {
        finish({
          configured: true,
          status: 'UNREACHABLE',
          latencyMs: Math.max(0, Date.now() - startedAt),
          probeMethod,
          detail: 'Endpoint accepted socket connection but returned a non-PostgreSQL protocol response.',
        });
      }
    });

    socket.once('timeout', () => {
      finish({
        configured: true,
        status: 'UNREACHABLE',
        latencyMs: Math.max(0, Date.now() - startedAt),
        probeMethod,
        detail: `PostgreSQL wire ping timed out after ${timeoutMs}ms.`,
      });
    });

    socket.once('error', (err) => {
      finish({
        configured: true,
        status: 'UNREACHABLE',
        latencyMs: Math.max(0, Date.now() - startedAt),
        probeMethod,
        detail: sanitizeProbeErrorCode(err),
      });
    });
  });
}

export function maskUidForDiagnostics(uid: string | null | undefined): string | null {
  if (!uid) return null;
  const trimmed = uid.trim();
  if (trimmed.length <= 8) return `${trimmed.slice(0, 2)}***`;
  return `${trimmed.slice(0, 4)}…${trimmed.slice(-4)}`;
}
