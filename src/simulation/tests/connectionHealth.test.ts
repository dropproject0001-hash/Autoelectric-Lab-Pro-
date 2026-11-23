import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import http from 'node:http';
import net from 'node:net';
import path from 'node:path';
import type { AddressInfo } from 'node:net';
import { createAutoelectricApiApp } from '../../server/createApiApp';
import {
  maskUidForDiagnostics,
  probePostgresConnection,
} from '../../server/services/connectionHealthService';
import {
  resetFirebaseAuthCacheForTests,
  setJwksFetcherForTests,
} from '../../server/services/firebaseAuthMiddleware';
import { deriveOverallHealthTone } from '../../services/connectionHealthClient';

let passed = 0;
let failed = 0;

async function runTest(name: string, fn: () => void | Promise<void>): Promise<void> {
  try {
    await fn();
    passed++;
    console.log(`  PASS: ${name}`);
  } catch (err) {
    failed++;
    console.error(`  FAIL: ${name}`);
    console.error(err);
  }
}

function base64UrlEncode(input: Buffer | string): string {
  const buf = typeof input === 'string' ? Buffer.from(input, 'utf8') : input;
  return buf.toString('base64').replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');
}

function createSignedFirebaseTestJwt(projectId: string, uid: string, email: string) {
  const { privateKey, publicKey } = crypto.generateKeyPairSync('rsa', {
    modulusLength: 2048,
  });
  const jwk = publicKey.export({ format: 'jwk' }) as {
    kty: string;
    n: string;
    e: string;
  };
  const kid = 'conn-health-test-kid-1';
  const nowSec = Math.floor(Date.now() / 1000);
  const header = base64UrlEncode(JSON.stringify({ alg: 'RS256', typ: 'JWT', kid }));
  const payload = base64UrlEncode(
    JSON.stringify({
      iss: `https://securetoken.google.com/${projectId}`,
      aud: projectId,
      sub: uid,
      user_id: uid,
      email,
      email_verified: true,
      iat: nowSec - 10,
      exp: nowSec + 3600,
    })
  );
  const signingInput = `${header}.${payload}`;
  const signature = crypto
    .createSign('RSA-SHA256')
    .update(signingInput)
    .sign(privateKey);
  const token = `${signingInput}.${base64UrlEncode(signature)}`;
  return {
    token,
    jwk: {
      kid,
      kty: jwk.kty,
      alg: 'RS256',
      use: 'sig',
      n: jwk.n,
      e: jwk.e,
    },
  };
}

async function main() {
  console.log('\n=== FIREBASE AUTH & CLOUD SQL CONNECTION HEALTH TEST SUITE ===');

  await runTest('probePostgresConnection reports NOT_CONFIGURED cleanly when SQL_* env vars are absent', async () => {
    const res = await probePostgresConnection({ env: {} });
    assert.equal(res.configured, false);
    assert.equal(res.status, 'NOT_CONFIGURED');
    assert.equal(res.probeMethod, 'NONE');
    assert.equal(res.latencyMs, 0);
  });

  await runTest('probePostgresConnection verifies live PostgreSQL wire handshake over TCP and handles closed port without leaking secrets', async () => {
    // Ephemeral mock PostgreSQL SSLRequest responder ('N' byte = SSL not enabled, valid PG v3 wire response)
    const mockPgServer = net.createServer((socket) => {
      socket.once('data', (chunk) => {
        if (chunk.length === 8 && chunk.readInt32BE(0) === 8 && chunk.readInt32BE(4) === 80877103) {
          socket.write(Buffer.from('N', 'ascii'));
        }
        socket.end();
      });
    });

    await new Promise<void>((resolve) => mockPgServer.listen(0, '127.0.0.1', resolve));
    const port = (mockPgServer.address() as AddressInfo).port;

    try {
      const okRes = await probePostgresConnection({
        env: {
          SQL_HOST: '127.0.0.1',
          SQL_PORT: String(port),
          SQL_USER: 'app_user',
          SQL_PASSWORD: 'super-secret-password-never-leaked',
          SQL_DB_NAME: 'ecu_lab',
        },
        timeoutMs: 2000,
      });

      assert.equal(okRes.configured, true);
      assert.equal(okRes.status, 'CONNECTED');
      assert.equal(okRes.probeMethod, 'TCP_PG_WIRE');
      assert.ok(okRes.latencyMs >= 0);
      assert.equal(okRes.detail.includes('super-secret-password'), false);
    } finally {
      await new Promise<void>((resolve) => mockPgServer.close(() => resolve()));
    }

    // Now probe the closed port -> must return UNREACHABLE with sanitized error
    const failRes = await probePostgresConnection({
      env: {
        SQL_HOST: '127.0.0.1',
        SQL_PORT: String(port),
        SQL_USER: 'app_user',
        SQL_PASSWORD: 'super-secret-password-never-leaked',
        SQL_DB_NAME: 'ecu_lab',
      },
      timeoutMs: 1500,
    });
    assert.equal(failRes.configured, true);
    assert.equal(failRes.status, 'UNREACHABLE');
    assert.equal(failRes.detail.includes('super-secret-password'), false);
    assert.equal(failRes.detail.includes('127.0.0.1'), false);
  });

  await runTest('GET /api/autoelectric/diagnostics/connection-health enforces 401 auth and verifies RS256 Firebase ID tokens', async () => {
    const cfgPath = path.join(process.cwd(), 'firebase-applet-config.json');
    const projectId = fs.existsSync(cfgPath)
      ? (JSON.parse(fs.readFileSync(cfgPath, 'utf8')).projectId as string) || 'gen-lang-client-0979131562'
      : 'gen-lang-client-0979131562';

    const { token, jwk } = createSignedFirebaseTestJwt(
      projectId,
      'firebase-uid-test-987654',
      'engineer@example.com'
    );

    setJwksFetcherForTests(async () => ({
      keys: [jwk],
      maxAgeSec: 300,
    }));

    const app = createAutoelectricApiApp();
    const server = http.createServer(app);
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    const baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;

    try {
      // 1. Unauthenticated request must fail with 401 AUTH_REQUIRED
      const unauthRes = await fetch(`${baseUrl}/api/autoelectric/diagnostics/connection-health`);
      assert.equal(unauthRes.status, 401);
      const unauthJson = (await unauthRes.json()) as { code?: string };
      assert.equal(unauthJson.code, 'AUTH_REQUIRED');

      // 2. Authenticated Firebase RS256 JWT request must succeed and return structured health JSON
      const authRes = await fetch(`${baseUrl}/api/autoelectric/diagnostics/connection-health`, {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });
      assert.equal(authRes.status, 200);
      const payload = (await authRes.json()) as {
        status: string;
        firebaseAuth: {
          serverVerified: boolean;
          authKind: string;
          uidMasked: string | null;
          emailVerified: boolean;
        };
        cloudSqlPostgres: {
          configured: boolean;
          status: string;
          probeMethod: string;
        };
      };

      assert.equal(payload.firebaseAuth.serverVerified, true);
      assert.equal(payload.firebaseAuth.authKind, 'FIREBASE_ID_TOKEN');
      assert.equal(payload.firebaseAuth.uidMasked, maskUidForDiagnostics('firebase-uid-test-987654'));
      assert.equal(payload.firebaseAuth.emailVerified, true);
      assert.ok(
        ['CONNECTED', 'NOT_CONFIGURED', 'UNREACHABLE'].includes(payload.cloudSqlPostgres.status)
      );
    } finally {
      resetFirebaseAuthCacheForTests();
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
  });

  await runTest('deriveOverallHealthTone and LabStatusFooter integration satisfy security and UX constraints', () => {
    const healthyTone = deriveOverallHealthTone(
      {
        configured: true,
        authReady: true,
        signedIn: true,
        emailVerified: true,
        email: 'engineer@example.com',
        uidMasked: 'fire…7654',
        serverTokenVerified: true,
        serverAuthKind: 'FIREBASE_ID_TOKEN',
        detail: 'ok',
      },
      {
        configured: false,
        status: 'NOT_CONFIGURED',
        latencyMs: 0,
        probeMethod: 'NONE',
        detail: 'n/a',
      },
      {
        configured: true,
        databaseId: 'ai-studio-virtualeculaboem-a394a24c-3180-4bd9-8d2e-ad856ade7828',
        status: 'CONNECTED',
        profileReadVerified: true,
        latencyMs: 42,
        detail: 'ok',
      }
    );
    assert.equal(healthyTone, 'HEALTHY');

    const degradedTone = deriveOverallHealthTone(
      {
        configured: true,
        authReady: true,
        signedIn: true,
        emailVerified: true,
        email: 'engineer@example.com',
        uidMasked: 'fire…7654',
        serverTokenVerified: true,
        serverAuthKind: 'FIREBASE_ID_TOKEN',
        detail: 'ok',
      },
      {
        configured: true,
        status: 'UNREACHABLE',
        latencyMs: 3000,
        probeMethod: 'TCP_PG_WIRE',
        detail: 'timeout',
      },
      {
        configured: true,
        databaseId: '(default)',
        status: 'CONNECTED',
        profileReadVerified: true,
        latencyMs: 35,
        detail: 'ok',
      }
    );
    assert.equal(degradedTone, 'DEGRADED');

    const footerSrc = fs.readFileSync(
      path.join(process.cwd(), 'src/components/LabStatusFooter.tsx'),
      'utf8'
    );
    assert.ok(footerSrc.includes('ConnectionHealthWidget'), 'LabStatusFooter must render ConnectionHealthWidget');

    const widgetSrc = fs.readFileSync(
      path.join(process.cwd(), 'src/components/ConnectionHealthWidget.tsx'),
      'utf8'
    );
    assert.equal(widgetSrc.includes('setInterval'), false, 'ConnectionHealthWidget must not run background setInterval flood loops');

    const clientSrc = fs.readFileSync(
      path.join(process.cwd(), 'src/services/connectionHealthClient.ts'),
      'utf8'
    );
    assert.equal(
      /(localStorage|sessionStorage)\./.test(clientSrc),
      false,
      'ID tokens must stay in memory and never be written to browser storage'
    );
  });

  console.log(`\nConnection Health Summary: ${passed} passed, ${failed} failed`);
  if (failed > 0) {
    process.exit(1);
  }
}

void main();
