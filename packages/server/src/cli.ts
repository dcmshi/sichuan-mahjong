import { createRequire } from 'node:module';
import { parseArgs } from 'node:util';

// ESM has no `require` global; createRequire loads the CJS-only qrcode-terminal. (A12)
const nodeRequire = createRequire(import.meta.url);

export type CliOptions = {
  port: number;
  httpsPort: number;
  mdns: boolean;
  tailscale: boolean;
  share: boolean;
  dataDir: string | null;
  /** Bot pause per move, in ms. `null` leaves the server default in place. */
  botDelayMs: number | null;
  help: boolean;
};

/**
 * The CC BY-SA 4.0 attribution for the tile art, as text. The release binary
 * embeds the SVGs (see LICENSE §3), so the attribution has to be reachable from
 * the binary itself and not only from a file next to it. The About screen and
 * /tiles/credits.json cover someone who opens the UI; this covers someone who
 * only ever has the executable.
 */
export const CREDITS = `
Sichuan Mahjong

  Code                 MIT
  Tile artwork         CC BY-SA 4.0

The 27 suit tiles (man/pin/sou 1-9) are from the Wikimedia Commons category
"SVG Planar illustrations of Mahjong tiles", by Cangjie6 (primary),
Jerry Crimson Mann (original) and User:Dewclouds (vectorisation).
They are renamed for this project and otherwise used as published.

  Licence     https://creativecommons.org/licenses/by-sa/4.0/
  Source      https://commons.wikimedia.org/wiki/Category:SVG_Planar_illustrations_of_Mahjong_tiles
  Per-file    /tiles/credits.json on a running server

The tile back is an original work for this project, and is MIT. This binary
embeds the artwork, so redistributing it redistributes CC BY-SA material —
keep this notice with it. Full terms: LICENSE in the source repository.
`.trim();

const HELP = `
Sichuan Mahjong — local multiplayer server

Usage: sichuan-mahjong [options]

Options:
  --port <n>          HTTP port (default: 8080)
  --https-port <n>    HTTPS port for Tailscale (default: 8443)
  --no-mdns           Disable mDNS broadcast
  --no-tailscale      Disable Tailscale detection
  --share             Auto-create a Tailscale share invite for this node
                      (needs TAILSCALE_API_KEY; optional TAILSCALE_TAILNET)
  --data-dir <path>   Override SQLite data directory
  --bot-delay <ms>    How long bots pause per move (max 5000). Overrides the
                      host's lobby choice for every room on this server.
                      Lower it to speed practice games up, 0 for instant.
  --credits           Show tile artwork attribution and licences
  --help              Show this message
`.trim();

function parseDelay(raw: string | undefined): number | null {
  if (raw === undefined) return null;
  const ms = Number.parseInt(raw, 10);
  return Number.isFinite(ms) && ms >= 0 ? ms : null;
}

export function parseCli(argv = process.argv.slice(2)): CliOptions {
  try {
    const { values } = parseArgs({
      args: argv,
      options: {
        port: { type: 'string', default: '8080' },
        'https-port': { type: 'string', default: '8443' },
        'no-mdns': { type: 'boolean', default: false },
        'no-tailscale': { type: 'boolean', default: false },
        share: { type: 'boolean', default: false },
        'data-dir': { type: 'string' },
        'bot-delay': { type: 'string' },
        credits: { type: 'boolean', default: false },
        help: { type: 'boolean', default: false },
      },
      strict: true,
    });

    if (values.help) {
      console.log(HELP);
      process.exit(0);
    }

    if (values.credits) {
      console.log(CREDITS);
      process.exit(0);
    }

    return {
      port: Number.parseInt(values.port as string, 10) || 8080,
      httpsPort: Number.parseInt(values['https-port'] as string, 10) || 8443,
      mdns: !(values['no-mdns'] as boolean),
      tailscale: !(values['no-tailscale'] as boolean),
      share: values.share as boolean,
      dataDir: (values['data-dir'] as string) ?? null,
      // `|| 700` is wrong here — `--bot-delay 0` is a legitimate value (instant
      // bots), so an unparseable argument has to fall through to null and leave
      // the server default alone rather than land on a number.
      botDelayMs: parseDelay(values['bot-delay'] as string | undefined),
      help: false,
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
  mdnsActive: boolean;
}): void {
  const { httpPort, lanIp, tailscaleUrl, tailscaleHostname, hasTls, mdnsActive } = opts;

  console.log('\n\u{1F004}  Sichuan Mahjong — running on this machine\n');

  if (lanIp) {
    console.log(`   LAN:        http://${lanIp}:${httpPort}`);
  } else {
    console.log('   LAN:        (no LAN interface detected)');
  }
  // Only advertise the mahjong.local URL when the responder actually started —
  // otherwise the address won't resolve for anyone who tries it. (A12)
  if (mdnsActive) {
    console.log(`   mDNS:       http://mahjong.local:${httpPort}`);
  }

  if (tailscaleUrl) {
    console.log(`   Tailscale:  ${tailscaleUrl}  ← share with remote friends`);
  } else {
    console.log('   Tailscale:  (not detected — install Tailscale for cross-network play)');
  }

  if (tailscaleHostname && !hasTls) {
    console.log('\n   ⚠️  Tailscale found but TLS cert unavailable.');
    console.log(`       Run: tailscale cert ${tailscaleHostname}`);
    console.log('       Then restart the server.');
  }

  console.log('\n   Server keeps running until you Ctrl-C.\n');
}

// ---------------------------------------------------------------------------
// QR code helper
// ---------------------------------------------------------------------------

export function printQr(url: string): void {
  try {
    // ESM package: `require` is undefined here, so use createRequire for this
    // CommonJS-only optional dep. (A12)
    const qrcode = nodeRequire('qrcode-terminal') as {
      generate: (url: string, opts: { small: boolean }) => void;
    };
    console.log(`   QR code for ${url}:\n`);
    qrcode.generate(url, { small: true });
  } catch {
    // qrcode-terminal unavailable — skip silently
  }
}
