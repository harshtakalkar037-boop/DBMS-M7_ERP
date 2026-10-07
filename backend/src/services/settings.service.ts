import { settingsRepo } from '../repositories/settings.repository';
import { audit } from '../utils/audit';
import { AppError } from '../utils/api';
import { AuthUser } from '../middleware/auth';

/** Keys an administrator may change from the UI. Everything else is read only. */
const EDITABLE = [
  'MIN_ATTENDANCE_PERCENTAGE', 'LATE_FEE_PER_DAY', 'GRACE_DAYS',
  'INSTITUTE_NAME', 'INSTITUTE_EMAIL', 'INSTITUTE_PHONE', 'CURRENT_ACADEMIC_YEAR',
];

export const settings = {
  list: settingsRepo.list,
  get: settingsRepo.get,
  number: settingsRepo.number,

  async update(key: string, value: string, actor: AuthUser) {
    if (!EDITABLE.includes(key)) {
      throw AppError.forbidden(`The setting "${key}" is managed by the database and cannot be edited here`);
    }
    const before = await settingsRepo.get(key);
    await settingsRepo.set(key, value);
    await audit({
      userId: actor.userId, action: 'UPDATE', entity: 'system_settings',
      description: `Setting ${key}: ${before} -> ${value}`, oldValue: { [key]: before }, newValue: { [key]: value },
    });
    return { key, value, previous: before };
  },
};
