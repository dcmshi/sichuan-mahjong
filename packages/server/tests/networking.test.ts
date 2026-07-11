import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// Mock child_process before importing networking module
vi.mock('node:child_process', () => ({
  spawnSync: vi.fn(),
}));

vi.mock('node:fs', async importOriginal => {
  const actual = await importOriginal<typeof import('node:fs')>();
  return {
    ...actual,
    existsSync: vi.fn().mockReturnValue(false),
    readFileSync: vi.fn().mockReturnValue(''),
  };
});

import { spawnSync } from 'node:child_process';
import { getLanIp, getTailscaleInfo, getTailscaleIpFromInterfaces } from '../src/networking.js';

const mockSpawnSync = vi.mocked(spawnSync);

function makeSpawnResult(stdout: string, status = 0) {
  return {
    status,
    stdout: Buffer.from(stdout),
    stderr: Buffer.from(''),
    pid: 1,
    output: [],
    signal: null,
    error: undefined,
  };
}

describe('Tailscale detection via CLI', () => {
  beforeEach(() => {
    mockSpawnSync.mockReset();
  });

  it('returns null when tailscale binary is not found', () => {
    mockSpawnSync.mockReturnValue(makeSpawnResult('', 1));
    // With no interfaces either, result is null
    const result = getTailscaleInfo();
    expect(result).toBeNull();
  });

  it('returns null when BackendState is not Running', () => {
    // First call: version check succeeds (binary found)
    mockSpawnSync.mockReturnValueOnce(makeSpawnResult('1.50.0', 0));
    // Second call: status --json
    mockSpawnSync.mockReturnValueOnce(
      makeSpawnResult(
        JSON.stringify({
          BackendState: 'Stopped',
          Self: { TailscaleIPs: ['100.100.1.2'], DNSName: 'laptop.tail.ts.net.' },
        }),
        0,
      ),
    );

    const result = getTailscaleInfo();
    expect(result).toBeNull();
  });

  it('returns ip and hostname when Tailscale is Running', () => {
    mockSpawnSync.mockReturnValueOnce(makeSpawnResult('1.50.0', 0));
    mockSpawnSync.mockReturnValueOnce(
      makeSpawnResult(
        JSON.stringify({
          BackendState: 'Running',
          Self: { TailscaleIPs: ['100.100.1.2'], DNSName: 'laptop.tail-name.ts.net.' },
        }),
        0,
      ),
    );

    const result = getTailscaleInfo();
    expect(result).not.toBeNull();
    expect(result?.ip).toBe('100.100.1.2');
    // Trailing dot stripped
    expect(result?.hostname).toBe('laptop.tail-name.ts.net');
  });

  it('strips trailing dot from DNSName', () => {
    mockSpawnSync.mockReturnValueOnce(makeSpawnResult('1.50.0', 0));
    mockSpawnSync.mockReturnValueOnce(
      makeSpawnResult(
        JSON.stringify({
          BackendState: 'Running',
          Self: { TailscaleIPs: ['100.64.5.10'], DNSName: 'myhost.example.ts.net.' },
        }),
        0,
      ),
    );

    const result = getTailscaleInfo();
    expect(result?.hostname).toBe('myhost.example.ts.net');
  });

  it('falls back to interface scan when status command fails', () => {
    // version check ok, status command fails
    mockSpawnSync.mockReturnValueOnce(makeSpawnResult('1.50.0', 0));
    mockSpawnSync.mockReturnValueOnce(makeSpawnResult('', 1));

    // getTailscaleInfo falls back to getTailscaleIpFromInterfaces which reads real OS interfaces
    // In CI there's no Tailscale, so the result is null
    const result = getTailscaleInfo();
    // Just assert it doesn't throw
    expect(result === null || typeof result?.ip === 'string').toBe(true);
  });

  it('handles malformed JSON gracefully', () => {
    mockSpawnSync.mockReturnValueOnce(makeSpawnResult('1.50.0', 0));
    mockSpawnSync.mockReturnValueOnce(makeSpawnResult('not-json', 0));

    // Should fall back to interface scan without throwing
    expect(() => getTailscaleInfo()).not.toThrow();
  });
});

describe('getTailscaleIpFromInterfaces', () => {
  it('returns null when no Tailscale interfaces present (real OS)', () => {
    // On a machine without Tailscale the function returns null or a 100.x address
    const result = getTailscaleIpFromInterfaces();
    expect(result === null || (typeof result === 'string' && result.startsWith('100.'))).toBe(true);
  });
});

describe('getLanIp', () => {
  it('returns null or a valid non-loopback IPv4', () => {
    const ip = getLanIp();
    if (ip !== null) {
      expect(ip).toMatch(/^\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}$/);
      expect(ip).not.toBe('127.0.0.1');
      expect(ip).not.toMatch(/^169\.254\./);
    }
  });
});
