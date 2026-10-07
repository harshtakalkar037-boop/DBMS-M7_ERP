import { reportsRepo } from '../repositories/reports.repository';
import { rowsToCsv } from '../utils/api';

export const reports = {
  catalog: reportsRepo.catalog,
  kpis: reportsRepo.kpis,
  run: reportsRepo.run,

  /** Same query, serialised as CSV for download. */
  async csv(key: string, params: Record<string, any> = {}) {
    const result = await reportsRepo.run(key, params);
    return { filename: `${key}-${new Date().toISOString().slice(0, 10)}.csv`, csv: rowsToCsv(result.rows) };
  },
};
