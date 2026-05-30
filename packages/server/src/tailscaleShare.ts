// Tailscale node-sharing automation.
//
// Sharing the host node with friends on other tailnets is normally a manual
// admin-console step. With a Tailscale API key this automates it: resolve the
// host device, then create a (reusable) device-invite and surface its URL.
//
// Uses the documented Tailscale v2 API:
//   GET  https://api.tailscale.com/api/v2/tailnet/{tailnet}/devices
//   POST https://api.tailscale.com/api/v2/device/{deviceId}/device-invites
// Auth: `Authorization: Bearer <API key>`. Tailnet "-" means the key's own tailnet.
//
// Credentials come from --share + env (TAILSCALE_API_KEY, TAILSCALE_TAILNET).
// Everything is best-effort: without credentials or on any API failure we return
// a structured reason and the caller falls back to manual instructions.

const API_BASE = 'https://api.tailscale.com/api/v2';

export type ShareResult =
  | { ok: true; inviteUrl: string }
  | { ok: false; reason: 'no_credentials' | 'device_not_found' | 'api_error'; detail?: string };

type Device = { id: string; addresses?: string[]; name?: string; hostname?: string };

export type ShareOptions = {
  apiKey?: string | undefined;
  tailnet?: string | undefined;
  /** The host's Tailscale IP, used to locate this machine among the tailnet devices. */
  tailscaleIp: string;
  /** Reusable invite (up to 1000 uses) vs single-use. Default reusable. */
  multiUse?: boolean;
  /** Injected for tests; defaults to global fetch. */
  fetchImpl?: typeof fetch;
};

/** Read the first invite URL out of Tailscale's (loosely-typed) response. */
function extractInviteUrl(body: unknown): string | null {
  const pick = (o: unknown): string | null => {
    if (o && typeof o === 'object') {
      const r = o as Record<string, unknown>;
      if (typeof r['inviteUrl'] === 'string') return r['inviteUrl'];
      if (typeof r['url'] === 'string') return r['url'];
    }
    return null;
  };
  if (Array.isArray(body)) {
    for (const item of body) {
      const u = pick(item);
      if (u) return u;
    }
    return null;
  }
  return pick(body);
}

export async function createTailscaleShare(opts: ShareOptions): Promise<ShareResult> {
  const apiKey = opts.apiKey ?? process.env['TAILSCALE_API_KEY'];
  if (!apiKey) return { ok: false, reason: 'no_credentials' };

  const tailnet = opts.tailnet ?? process.env['TAILSCALE_TAILNET'] ?? '-';
  const fetchImpl = opts.fetchImpl ?? fetch;
  const multiUse = opts.multiUse ?? true;
  const auth = { Authorization: `Bearer ${apiKey}` };

  try {
    // 1. Find this host among the tailnet's devices by matching its Tailscale IP.
    const devRes = await fetchImpl(`${API_BASE}/tailnet/${encodeURIComponent(tailnet)}/devices`, {
      headers: auth,
    });
    if (!devRes.ok) {
      return { ok: false, reason: 'api_error', detail: `list devices: HTTP ${devRes.status}` };
    }
    const devBody = (await devRes.json()) as { devices?: Device[] };
    const device = (devBody.devices ?? []).find(d => (d.addresses ?? []).includes(opts.tailscaleIp));
    if (!device) return { ok: false, reason: 'device_not_found' };

    // 2. Create a device invite for that device.
    const invRes = await fetchImpl(`${API_BASE}/device/${encodeURIComponent(device.id)}/device-invites`, {
      method: 'POST',
      headers: { ...auth, 'Content-Type': 'application/json' },
      body: JSON.stringify([{ multiUse, allowExitNode: false }]),
    });
    if (!invRes.ok) {
      return { ok: false, reason: 'api_error', detail: `create invite: HTTP ${invRes.status}` };
    }
    const invUrl = extractInviteUrl(await invRes.json());
    if (!invUrl) return { ok: false, reason: 'api_error', detail: 'no invite URL in response' };

    return { ok: true, inviteUrl: invUrl };
  } catch (err) {
    return { ok: false, reason: 'api_error', detail: err instanceof Error ? err.message : String(err) };
  }
}
