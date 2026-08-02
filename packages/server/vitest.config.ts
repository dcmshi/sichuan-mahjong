import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['tests/**/*.test.ts'],
    // Several tests play a full round through bots. The 700ms human-facing pace
    // (O2, room.ts) would turn each of those into a minute of setTimeout, so the
    // suite pins the pace it was written against. A test that cares about the
    // pace should call setBotPaceMs itself.
    // SM_RATE_LIMIT_OFF for the same reason: the limiter is process-global, so
    // otherwise one test file's lobby churn would count against the next one's
    // budget and failures would depend on execution order. The limiter is
    // covered directly in rate-limit.test.ts, and end to end in limits.test.ts,
    // which builds its own tightened profile.
    env: { SM_BOT_DELAY_MS: '150', SM_RATE_LIMIT_OFF: '1' },
  },
});
