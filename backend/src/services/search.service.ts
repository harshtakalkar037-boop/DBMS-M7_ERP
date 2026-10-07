import { globalSearch } from '../repositories/search.repository';
import { AuthUser } from '../middleware/auth';

export async function search(term: string, actor: AuthUser, limit = 30) {
  if (!term || term.trim().length < 2) return [];
  let hits = await globalSearch(term.slice(0, 80), limit);
  // A student must not be able to enumerate other students through search.
  if (actor.role === 'STUDENT') {
    hits = hits.filter((h) => !(h.entity === 'students' && h.id !== actor.studentId));
  }
  return hits;
}
