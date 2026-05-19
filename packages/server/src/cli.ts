import { parseArgs } from 'node:util';

export type CliOptions = {
  port: number;
  httpsPort: number;
  mdns: boolean;
  tailscale: boolean;
  dataDir: string | null;
  help: boolean;
};

const HELP = `
Sichuan Mahjong — local multiplayer server

Usage: sichuan-mahjong [options]

Options:
  --port <n>          HTTP port (default: 8080)
  --https-port <n>    HTTPS port for Tailscale (default: 8443)
  --no-mdns           Disable mDNS broadcast
  --no-tailscale      Disable Tailscale detection
  --data-dir <path>   Override SQLite data directory
  --help              Show this message
`.trim();

export function parseCli(argv = process.argv.slice(2)): CliOptions {
  try {
    const { values } = parseArgs({
      args: argv,
      options: {
        port:         { type: 'string',  default: '8080' },
        'https-port': { type: 'string',  default: '8443' },
        'no-mdns':    { type: 'boolean', default: false },
        'no-tailscale': { type: 'boolean', default: false },
        'data-dir':   { type: 'string' },
        help:         { type: 'boolean', default: false },
      },
      strict: true,
    });

    if (values.help) {
      console.log(HELP);
      process.exit(0);
    }

    return {
      port:       parseInt(values.port as string, 10) || 8080,
      httpsPort:  parseInt(values['https-port'] as string, 10) || 8443,
      mdns:       !(values['no-mdns'] as boolean),
      tailscale:  !(values['no-tailscale'] as boolean),
      dataDir:    (values['data-dir'] as string) ?? null,
      help:       false,
    };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`Error: ${msg}\n\n${HELP}`);
    process.exit(1);
  }
}

// ---------------------------------------------------------------------------
// Startup banner
// ---------------------------------------------------------------------------

export function printBanner(opts: {
  httpPort: number;
  lanIp: string | null;
  tailscaleUrl: string | null;
  tailscaleHostname: string | null;
  hasTls: boolean;
}): void {
  const { httpPort, lanIp, tailscaleUrl, tailscaleHostname, hasTls } = opts;

  console.log('\n\u{1F004}  Sichuan Mahjong — running on this machine\n');

  if (lanIp) {
    console.log(`   LAN:        http://${lanIp}:${httpPort}`);
  } else {
    console.log(`   LAN:        (no LAN interface detected)`);
  }
  console.log(`   mDNS:       http://mahjong.local:${httpPort}`);

  if (tailscaleUrl) {
    console.log(`   Tailscale:  ${tailscaleUrl}  ← share with remote friends`);
  } else {
    console.log(`   Tailscale:  (not detected — install Tailscale for cross-network play)`);
  }

  if (tailscaleHostname && !hasTls) {
    console.log(`\n   ⚠️  Tailscale found but TLS cert unavailable.`);
    console.log(`       Run: tailscale cert ${tailscaleHostname}`);
    console.log(`       Then restart the server.`);
  }

  console.log('\n   Server keeps running until you Ctrl-C.\n');
}

// ---------------------------------------------------------------------------
// QR code helper
// ---------------------------------------------------------------------------

export function printQr(url: string): void {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const qrcode = require('qrcode-terminal') as { generate: (url: string, opts: { small: boolean }) => void };
    console.log(`   QR code for ${url}:\n`);
    qrcode.generate(url, { small: true });
  } catch {
    // qrcode-terminal unavailable — skip silently
  }
}
