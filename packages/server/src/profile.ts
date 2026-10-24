/**
 * The knobs that differ between a server you own and a server on a public URL.
 *
 * Only *numbers* live here, deliberately. The security controls themselves —
 * CSPRNG room codes, rate limiting, the spectator secret — are on in both
 * profiles, because a control that switches on with `--hosted` is one you would
 * develop against all day with it off, and one that fails open the first time
 * somebody forgets the flag. What legitimately varies is how much of a shared
 * instance a stranger may consume, and how long abandoned state is worth
 * keeping. See docs/design-hosted-server.md.
 */

export type Window = { limit: number; windowMs: number };

export type RuntimeProfile = {
  hosted: boolean;
  /** Abandoned lobbies (no connected human) are dropped after this. */
  lobbyTtlMs: number;
  /** Rooms with no activity are dropped after this. */
  roomIdleTtlMs: number;
  /** POST /api/lobby, per client IP. */
  createLimit: Window;
  /** Code lookups and socket opens, per client IP — the enumeration guard. */
  joinLimit: Window;
  /** Hard ceiling on concurrent lobbies + rooms, whatever the per-IP limits say. */
  maxConcurrentGames: number;
  /**
   * Hops to trust in X-Forwarded-For, or false to trust nothing.
   *
   * **Not `true`.** Fastify passes this to proxy-addr, where `true` trusts every
   * address in the chain and therefore resolves `req.ip` to the *leftmost*
   * entry — which the client wrote. That silently makes every per-IP limit
   * spoofable by adding a header. A hop count trusts that many proxies inward
   * from the socket, so the address comes from infrastructure instead.
   */
  trustProxy: number | false;
  /** Test seam (SM_RATE_LIMIT_OFF), mirroring SM_BOT_DELAY_MS. */
  rateLimitEnabled: boolean;
};

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;

export function profileFor(hosted: boolean, env = process.env): RuntimeProfile {
  const rateLimitEnabled = env.SM_RATE_LIMIT_OFF !== '1';

  return hosted
    ? {
        hosted: true,
        lobbyTtlMs: 30 * MINUTE,
        roomIdleTtlMs: 3 * HOUR,
        createLimit: { limit: 10, windowMs: HOUR },
        joinLimit: { limit: 60, windowMs: MINUTE },
        maxConcurrentGames: 50,
        trustProxy: trustProxyHops(env),
        rateLimitEnabled,
      }
    : {
        hosted: false,
        lobbyTtlMs: 2 * HOUR,
        roomIdleTtlMs: 24 * HOUR,
        // Generous rather than absent: a machine you own still shouldn't fall
        // over to a stray loop, and keeping the path live locally is the whole
        // point of not making it conditional.
        createLimit: { limit: 200, windowMs: HOUR },
        joinLimit: { limit: 600, windowMs: MINUTE },
        maxConcurrentGames: 500,
        // Nothing is in front of a LAN server, so an X-Forwarded-For header
        // here can only have come from a client inventing one.
        trustProxy: false,
        rateLimitEnabled,
      };
}

function trustProxyHops(env: NodeJS.ProcessEnv): number {
  const raw = env.SM_TRUST_PROXY;
  if (raw === undefined) return 1; // Render: one proxy between the client and us
  const hops = Number.parseInt(raw, 10);
  return Number.isFinite(hops) && hops >= 0 ? hops : 1;
}

/**
 * The `trustProxy` value to hand Fastify — the hop count, as a function. (A88)
 *
 * **Fastify 5.12.1 stopped honouring a bare number**: it now trusts *nothing*,
 * because a hop count cannot check that the immediate peer is a proxy, and a
 * client that reaches the server directly can supply the hops itself. Right for
 * a server the internet can reach; moot for the hosted profile, which only runs
 * behind Render's proxy — the one route to the instance. Passed through as a
 * number it collapsed `req.ip` to that proxy's address for every player, so each
 * per-IP limit became one global budget, and the types said so only by falling
 * through to the HTTP/2 overload. This is the rule 5.12.0 applied to a number.
 */
export function fastifyTrustProxy(
  trustProxy: number | false,
): false | ((addr: string, hop: number) => boolean) {
  if (trustProxy === false) return false;
  return (_addr, hop) => hop < trustProxy;
}
