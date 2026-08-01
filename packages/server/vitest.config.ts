import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['tests/**/*.test.ts'],
    // Several tests play a full round through bots. The 700ms human-facing pace
    // (O2, room.ts) would turn each of those into a minute of setTimeout, so the
    // suite pins the pace it was written against. A test that cares about the
    // pace should call setBotPaceMs itself.
    env: { SM_BOT_DELAY_MS: '150' },
  },
});
