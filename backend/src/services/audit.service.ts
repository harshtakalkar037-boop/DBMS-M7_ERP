import { auditRepo } from '../repositories/audit.repository';
import { parsePaging } from '../utils/api';

export const auditService = {
  list: (q: Record<string, any>) => auditRepo.list(q, parsePaging(q)),
  actionsSummary: auditRepo.actionsSummary,
  entitySummary: auditRepo.entitySummary,
  stats: auditRepo.stats,
};
