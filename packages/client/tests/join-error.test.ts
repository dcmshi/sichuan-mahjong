import { describe, expect, it } from 'vitest';
import { catalog } from '../src/i18n/index.js';
import { joinErrorForStatus } from '../src/screens/JoinForm.js';

describe('join lookup failures (F22)', () => {
  it('distinguishes a wrong code from a broken server', () => {
    expect(joinErrorForStatus(404)).toBe('join.errNotFound');
    expect(joinErrorForStatus(500)).toBe('join.errConn');
    expect(joinErrorForStatus(502)).toBe('join.errConn');
    expect(joinErrorForStatus(0)).toBe('join.errConn');
  });

  it('returns catalog keys that exist', () => {
    for (const status of [404, 500]) {
      expect(catalog.en[joinErrorForStatus(status)]).toBeDefined();
    }
  });
});
