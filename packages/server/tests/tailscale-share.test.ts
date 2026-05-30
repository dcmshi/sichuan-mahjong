import { describe, it, expect, vi } from 'vitest';
import { createTailscaleShare } from '../src/tailscaleShare.js';

const IP = '100.101.102.103';

function jsonResponse(body: unknown, ok = true, status = 200): Response {
  return {
    ok,
    status,
    json: async () => body,
  } as unknown as Response;
}

describe('Tailscale share automation', () => {
  it('returns no_credentials when no API key is available', async () => {
    const r = await createTailscaleShare({ tailscaleIp: IP, apiKey: '', fetchImpl: vi.fn() });
    expect(r).toEqual({ ok: false, reason: 'no_credentials' });
  });

  it('resolves the device and creates an invite (happy path)', async () => {
    const fetchImpl = vi.fn()
      .mockResolvedValueOnce(jsonResponse({ devices: [
        { id: 'dev-other', addresses: ['100.1.1.1'] },
        { id: 'dev-here', addresses: [IP, 'fd7a::1'] },
      ] }))
      .mockResolvedValueOnce(jsonResponse([{ inviteUrl: 'https://login.tailscale.com/share/abc123' }]));

    const r = await createTailscaleShare({ tailscaleIp: IP, apiKey: 'tskey-xxx', tailnet: 'example.com', fetchImpl });
    expect(r).toEqual({ ok: true, inviteUrl: 'https://login.tailscale.com/share/abc123' });

    // Correct endpoints, auth header, and POST body.
    const [devUrl, devInit] = fetchImpl.mock.calls[0]!;
    expect(devUrl).toBe('https://api.tailscale.com/api/v2/tailnet/example.com/devices');
    expect((devInit as RequestInit).headers).toMatchObject({ Authorization: 'Bearer tskey-xxx' });

    const [invUrl, invInit] = fetchImpl.mock.calls[1]!;
    expect(invUrl).toBe('https://api.tailscale.com/api/v2/device/dev-here/device-invites');
    const init = invInit as RequestInit;
    expect(init.method).toBe('POST');
    expect(JSON.parse(init.body as string)).toEqual([{ multiUse: true, allowExitNode: false }]);
  });

  it('reads `url` as a fallback invite field', async () => {
    const fetchImpl = vi.fn()
      .mockResolvedValueOnce(jsonResponse({ devices: [{ id: 'd', addresses: [IP] }] }))
      .mockResolvedValueOnce(jsonResponse([{ url: 'https://login.tailscale.com/share/zzz' }]));
    const r = await createTailscaleShare({ tailscaleIp: IP, apiKey: 'k', fetchImpl });
    expect(r).toEqual({ ok: true, inviteUrl: 'https://login.tailscale.com/share/zzz' });
  });

  it('returns device_not_found when no device matches the host IP', async () => {
    const fetchImpl = vi.fn()
      .mockResolvedValueOnce(jsonResponse({ devices: [{ id: 'x', addresses: ['100.9.9.9'] }] }));
    const r = await createTailscaleShare({ tailscaleIp: IP, apiKey: 'k', fetchImpl });
    expect(r).toEqual({ ok: false, reason: 'device_not_found' });
  });

  it('surfaces API errors', async () => {
    const fetchImpl = vi.fn().mockResolvedValueOnce(jsonResponse({}, false, 403));
    const r = await createTailscaleShare({ tailscaleIp: IP, apiKey: 'k', fetchImpl });
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.reason).toBe('api_error');
      expect(r.detail).toContain('403');
    }
  });

  it('defaults the tailnet to "-" when not specified', async () => {
    const fetchImpl = vi.fn()
      .mockResolvedValueOnce(jsonResponse({ devices: [{ id: 'd', addresses: [IP] }] }))
      .mockResolvedValueOnce(jsonResponse([{ inviteUrl: 'https://x' }]));
    await createTailscaleShare({ tailscaleIp: IP, apiKey: 'k', fetchImpl });
    expect(fetchImpl.mock.calls[0]![0]).toBe('https://api.tailscale.com/api/v2/tailnet/-/devices');
  });
});
