import { describe, expect, it } from 'vitest';
import { makeWatchRef, parseWatchRef } from '../src/ws/client.js';

/**
 * The watch grant is the one secret a user copies and pastes by hand, so the
 * parser has to survive what people actually paste: the whole link, the bare
 * ref, either with stray whitespace. It is exported as a pure function because
 * the client suite has no DOM — see CLAUDE.md.
 */
describe('parseWatchRef', () => {
  const ref = makeWatchRef('4L8L', 'a1b2c3d4-0000-4000-8000-000000000000');

  it('round-trips what makeWatchRef produced', () => {
    expect(parseWatchRef(ref)).toEqual({
      code: '4L8L',
      watch: 'a1b2c3d4-0000-4000-8000-000000000000',
    });
  });

  it('accepts a full pasted link', () => {
    const link = `https://example.onrender.com/?watch=${encodeURIComponent(ref)}`;
    expect(parseWatchRef(link)?.code).toBe('4L8L');
    expect(parseWatchRef(link)?.watch).toBe('a1b2c3d4-0000-4000-8000-000000000000');
  });

  it('ignores anything after the parameter it wants', () => {
    const link = `https://example.com/?watch=${encodeURIComponent(ref)}&lang=zh-Hans`;
    expect(parseWatchRef(link)?.watch).toBe('a1b2c3d4-0000-4000-8000-000000000000');
  });

  it('tolerates whitespace and lowercase, which is how a paste arrives', () => {
    expect(parseWatchRef('  4l8l.token  ')).toEqual({ code: '4L8L', watch: 'token' });
  });

  it('rejects a bare room code — that is the whole point of C5', () => {
    // Someone typing just the code should be told they need the link, not
    // silently sent to a socket that will be refused.
    expect(parseWatchRef('4L8L')).toBeNull();
  });

  it('rejects empty, malformed and wrong-length input', () => {
    expect(parseWatchRef('')).toBeNull();
    expect(parseWatchRef('   ')).toBeNull();
    expect(parseWatchRef('.token')).toBeNull();
    expect(parseWatchRef('4L8.token')).toBeNull();
    expect(parseWatchRef('4L8LX.token')).toBeNull();
    expect(parseWatchRef('4L8L.')).toBeNull();
  });
});
