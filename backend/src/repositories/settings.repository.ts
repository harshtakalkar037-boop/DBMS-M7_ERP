import { query, queryOne, execute, Row } from '../config/database';

export const settingsRepo = {
  list: () => query<Row>(
    'SELECT setting_key AS `key`, setting_value AS `value`, description, updated_at AS updatedAt FROM system_settings ORDER BY setting_key'),
  get: (key: string, fallback = '') => queryOne<Row>(
    'SELECT setting_value AS `value` FROM system_settings WHERE setting_key = ?', [key])
    .then((r) => String(r?.value ?? fallback)),
  set: (key: string, value: string) => execute(
    `INSERT INTO system_settings (setting_key, setting_value) VALUES (?,?)
     ON DUPLICATE KEY UPDATE setting_value = VALUES(setting_value)`, [key, value]),
  /** Number valued settings (thresholds, percentages, rates). */
  number: async (key: string, fallback: number): Promise<number> => {
    const row = await queryOne<Row>(
      'SELECT setting_value AS `value` FROM system_settings WHERE setting_key = ?', [key]);
    const n = Number(row?.value);
    return Number.isFinite(n) ? n : fallback;
  },
};
