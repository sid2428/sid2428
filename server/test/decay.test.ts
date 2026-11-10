import { describe, expect, it } from 'vitest';
import { adjustHealth, effectFor, healthNow, uptimePercent } from '../src/game/decay.js';
import { DAY, T0, freshState } from './helpers.js';

describe('health decay', () => {
  it('reaches zero exactly seven days after full health', () => {
    const h = { value: 100, at: T0 };
    expect(healthNow(h, T0)).toBe(100);
    expect(healthNow(h, T0 + 3.5 * DAY)).toBeCloseTo(50, 5);
    expect(healthNow(h, T0 + 7 * DAY)).toBeCloseTo(0, 5);
    expect(healthNow(h, T0 + 30 * DAY)).toBe(0);
  });

  it('ignores a clock that runs backwards', () => {
    expect(healthNow({ value: 80, at: T0 }, T0 - DAY)).toBe(80);
  });

  it('maps health to stages at the boundaries', () => {
    expect(effectFor(100).stage).toBe('healthy');
    expect(effectFor(75.1).stage).toBe('healthy');
    expect(effectFor(75).stage).toBe('degraded');
    expect(effectFor(50).stage).toBe('major');
    expect(effectFor(25).stage).toBe('critical');
    expect(effectFor(0.01).stage).toBe('critical');
    expect(effectFor(0).stage).toBe('down');
  });
});

describe('adjustHealth', () => {
  it('caps healing at 100', () => {
    const st = freshState();
    adjustHealth(st, 25, T0 + 1000);
    expect(st.health.value).toBe(100);
  });

  it('stops damage at the floor without raising a lower value', () => {
    const st = freshState();
    st.health = { value: 5, at: T0 };
    adjustHealth(st, -10, T0, 1);
    expect(st.health.value).toBe(1);
    st.health = { value: 0.5, at: T0 };
    adjustHealth(st, -10, T0, 1);
    expect(st.health.value).toBe(0.5);
  });

  it('banks downtime when an outage is repaired', () => {
    const st = freshState();
    const repaired = T0 + 9 * DAY;
    adjustHealth(st, 25, repaired);
    expect(st.postmortem.downtimeMs).toBeCloseTo(2 * DAY, -3);
    expect(st.health).toEqual({ value: 25, at: repaired });
  });
});

describe('uptimePercent', () => {
  it('is 100 before any outage', () => {
    expect(uptimePercent(freshState(), T0 + 6 * DAY)).toBe(100);
  });

  it('counts a live outage that has not been repaired', () => {
    expect(uptimePercent(freshState(), T0 + 14 * DAY)).toBeCloseTo(50, 3);
  });

  it('survives zero elapsed time', () => {
    expect(uptimePercent(freshState(), T0)).toBe(100);
  });
});
