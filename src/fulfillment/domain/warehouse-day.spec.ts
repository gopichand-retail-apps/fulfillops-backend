import {
  DEFAULT_WAREHOUSE_TIME_ZONE,
  resolveWarehouseTimeZone,
  warehouseDayKey,
} from './warehouse-day';

describe('warehouse day', () => {
  describe('resolveWarehouseTimeZone', () => {
    it('defaults to UTC when the setting is missing or blank', () => {
      expect(DEFAULT_WAREHOUSE_TIME_ZONE).toBe('UTC');
      expect(resolveWarehouseTimeZone(undefined)).toBe('UTC');
      expect(resolveWarehouseTimeZone('   ')).toBe('UTC');
    });

    it('accepts and trims a valid IANA zone', () => {
      expect(resolveWarehouseTimeZone(' America/New_York ')).toBe(
        'America/New_York',
      );
    });

    it('rejects an unknown zone instead of falling back to UTC', () => {
      expect(() => resolveWarehouseTimeZone('Mars/Olympus')).toThrow(
        'WAREHOUSE_TIME_ZONE must be a valid IANA time zone.',
      );
    });
  });

  describe('warehouseDayKey', () => {
    const newYork = 'America/New_York';

    it('switches day exactly at local midnight', () => {
      expect(warehouseDayKey('2026-11-24T04:59:59.999Z', newYork)).toBe(
        '2026-11-23',
      );
      expect(warehouseDayKey('2026-11-24T05:00:00.000Z', newYork)).toBe(
        '2026-11-24',
      );
    });

    it('differs from the UTC date for the same instant', () => {
      const instant = '2026-11-24T03:00:00.000Z';
      expect(warehouseDayKey(instant, 'UTC')).toBe('2026-11-24');
      expect(warehouseDayKey(instant, newYork)).toBe('2026-11-23');
    });

    it('accepts epoch milliseconds as well as ISO strings', () => {
      expect(
        warehouseDayKey(Date.parse('2026-11-24T05:00:00.000Z'), newYork),
      ).toBe('2026-11-24');
    });

    it('holds across the spring-forward change', () => {
      expect(warehouseDayKey('2026-03-08T04:59:59.000Z', newYork)).toBe(
        '2026-03-07',
      );
      expect(warehouseDayKey('2026-03-08T05:00:00.000Z', newYork)).toBe(
        '2026-03-08',
      );
    });

    it('holds across the fall-back change', () => {
      expect(warehouseDayKey('2026-11-01T03:59:59.000Z', newYork)).toBe(
        '2026-10-31',
      );
      expect(warehouseDayKey('2026-11-01T04:00:00.000Z', newYork)).toBe(
        '2026-11-01',
      );
    });
  });
});
