import { execSync, spawnSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { networkInterfaces } from 'node:os';
import { join } from 'node:path';

// This package is ESM ("type": "module"), where the CommonJS `require` global does
// not exist — a bare `require(...)` throws ReferenceError. createRequire gives us a
// working synchronous require for the CJS-only optional deps below. (A12)
const nodeRequire = createRequire(import.meta.url);

// ---------------------------------------------------------------------------
// LAN IP detection
// ---------------------------------------------------------------------------

/** Returns the best LAN IPv4 address (first non-loopback, non-link-local, non-virtual). */
export function getLanIp(): string | null {
  const ifaces = networkInterfaces();
  const SKIP_PREFIXES = ['169.254.', '127.'];
  // Skip virtual / tunnel adapters by name heuristic
  const SKIP_NAMES = /^(lo|docker|veth|br-|virbr|vmnet|vboxnet|utun|tun|tap|Loopback)/i;

  for (const [name, addrs] of Object.entries(ifaces)) {
    if (!addrs) continue;
    if (SKIP_NAMES.test(name)) continue;
    for (const addr of addrs) {
      if (addr.family !== 'IPv4') continue;
      if (addr.internal) continue;
      if (SKIP_PREFIXES.some(p => addr.address.startsWith(p))) continue;
      // Skip Tailscale CGNAT range (handled separately)
      if (addr.address.startsWith('100.')) continue;
      return addr.address;
    }
  }
  return null;
}

// ---------------------------------------------------------------------------
// mDNS
// ---------------------------------------------------------------------------

let mdnsInstance: unknown = null;

/** Starts the mDNS responder for mahjong.local. Returns true iff it actually started. */
export function startMdns(port: number): boolean {
  // Lazy require so a missing package (or platform issue) doesn't crash startup.
  try {
    const mdns = nodeRequire('multicast-dns')() as {
      on: (evt: string, cb: (query: unknown, rinfo: unknown) => void) => void;
      destroy: () => void;
    };
    mdnsInstance = mdns;

    mdns.on('query', (query: unknown) => {
      const q = query as { questions?: Array<{ name: string; type: string }> };
      for (const question of q.questions ?? []) {
        if (
          question.name === 'mahjong.local' &&
          (question.type === 'A' || question.type === 'ANY')
        ) {
          const ip = getLanIp();
          if (!ip) continue;
          (mdns as unknown as { respond: (r: unknown) => void }).respond({
            answers: [
              { name: 'mahjong.local', type: 'A', ttl: 60, data: ip },
              {
                name: 'mahjong.local',
                type: 'SRV',
                ttl: 60,
                data: { target: 'mahjong.local', port },
              },
            ],
          });
        }
      }
    });
    return true;
  } catch {
    // multicast-dns not available or platform issue — skip (and tell the caller
    // so it doesn't advertise a mahjong.local URL that won't resolve).
    return false;
  }
}

export function stopMdns(): void {
  if (mdnsInstance) {
    (mdnsInstance as { destroy: () => void }).destroy();
    mdnsInstance = null;
  }
}

// ---------------------------------------------------------------------------
// Tailscale detection
// ---------------------------------------------------------------------------

export type TailscaleInfo = {
  ip: string;
  hostname: string; // e.g. "laptop.tail-name.ts.net"
};

const TAILSCALE_CGNAT_PREFIX = '100.';

/** Checks for a Tailscale IP on a network interface (fallback to CLI). */
export function getTailscaleIpFromInterfaces(): string | null {
  const ifaces = networkInterfaces();
  for (const addrs of Object.values(ifaces)) {
    if (!addrs) continue;
    for (const addr of addrs) {
      if (addr.family === 'IPv4' && addr.address.startsWith(TAILSCALE_CGNAT_PREFIX)) {
        // Quick range check: 100.64.0.0/10 = 100.64.x.x to 100.127.x.x
        const second = Number.parseInt(addr.address.split('.')[1] ?? '0', 10);
        if (second >= 64 && second <= 127) return addr.address;
      }
    }
  }
  return null;
}

const TAILSCALE_BIN_CANDIDATES = [
  'tailscale',
  '/Applications/Tailscale.app/Contents/MacOS/Tailscale',
  'C:\\Program Files\\Tailscale\\tailscale.exe',
];

function findTailscaleBin(): string | null {
  for (const bin of TAILSCALE_BIN_CANDIDATES) {
    try {
      const result = spawnSync(bin, ['version'], { timeout: 2000, stdio: 'pipe' });
      if (result.status === 0) return bin;
    } catch {
      /* try next */
    }
  }
  return null;
}

export function getTailscaleInfo(): TailscaleInfo | null {
  const bin = findTailscaleBin();
  if (!bin) {
    // Fall back to interface scan
    const ip = getTailscaleIpFromInterfaces();
    if (!ip) return null;
    return { ip, hostname: ip }; // no hostname without CLI
  }

  try {
    const result = spawnSync(bin, ['status', '--json', '--self'], {
      timeout: 5000,
      stdio: 'pipe',
    });
    if (result.status !== 0) return null;

    const json = JSON.parse(result.stdout.toString()) as {
      Self?: { TailscaleIPs?: string[]; DNSName?: string };
      BackendState?: string;
    };

    if (json.BackendState !== 'Running') return null;
    const ip = json.Self?.TailscaleIPs?.[0] ?? null;
    if (!ip) return null;

    // DNSName has a trailing dot — strip it
    const dnsName = (json.Self?.DNSName ?? '').replace(/\.$/, '');
    return { ip, hostname: dnsName || ip };
  } catch {
    const ip = getTailscaleIpFromInterfaces();
    if (!ip) return null;
    return { ip, hostname: ip };
  }
}

// ---------------------------------------------------------------------------
// TLS cert via tailscale cert
// ---------------------------------------------------------------------------

export type TlsCert = { key: string; cert: string };

/**
 * Attempt to get or provision a TLS cert from Tailscale.
 * Returns null if Tailscale is unavailable or cert cannot be provisioned.
 */
export function getTailscaleCert(hostname: string): TlsCert | null {
  const bin = findTailscaleBin();
  if (!bin || !hostname || hostname === '') return null;

  // Common cert paths (tailscale cert stores them here after provisioning)
  const stateDir = getTailscaleStateDir();
  const certPath = join(stateDir, `${hostname}.crt`);
  const keyPath = join(stateDir, `${hostname}.key`);

  // Try existing cert first
  if (existsSync(certPath) && existsSync(keyPath)) {
    try {
      return { cert: readFileSync(certPath, 'utf8'), key: readFileSync(keyPath, 'utf8') };
    } catch {
      /* fall through to provision */
    }
  }

  // Attempt to provision
  try {
    const result = spawnSync(bin, ['cert', hostname], { timeout: 15_000, stdio: 'pipe' });
    if (result.status === 0 && existsSync(certPath) && existsSync(keyPath)) {
      return { cert: readFileSync(certPath, 'utf8'), key: readFileSync(keyPath, 'utf8') };
    }
  } catch {
    /* provisioning failed */
  }

  return null;
}

function getTailscaleStateDir(): string {
  const platform = process.platform;
  if (platform === 'win32') return join(process.env.LOCALAPPDATA ?? 'C:\\', 'Tailscale');
  if (platform === 'darwin') return '/Library/Tailscale';
  return '/var/lib/tailscale';
}

// ---------------------------------------------------------------------------
// Static server URL for the lobby join link
// ---------------------------------------------------------------------------

export function getServerUrls(
  httpPort: number,
  lanIp: string | null,
  tailscale: TailscaleInfo | null,
  httpsPort: number,
): {
  lan: string | null;
  mdns: string;
  tailscale: string | null;
} {
  return {
    lan: lanIp ? `http://${lanIp}:${httpPort}` : null,
    mdns: `http://mahjong.local:${httpPort}`,
    tailscale: tailscale ? `https://${tailscale.hostname}:${httpsPort}` : null,
  };
}
