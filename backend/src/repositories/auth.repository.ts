import { queryOne, execute, query, Row } from '../config/database';

export interface UserRecord extends Row {
  user_id: number;
  role_id: number;
  role_code: string;
  email: string;
  password_hash: string;
  phone: string | null;
  is_active: boolean;
  failed_attempts: number;
  locked_until: string | null;
  refresh_token: string | null;
  student_id?: number | null;
  faculty_id?: number | null;
  first_name?: string | null;
  last_name?: string | null;
}

/** Loads everything the login flow needs in a single query. */
export async function findUserByEmail(email: string): Promise<UserRecord | null> {
  return queryOne<UserRecord>(
    `SELECT u.*, r.role_code,
            s.student_id, s.first_name AS s_first, s.last_name AS s_last, s.roll_number,
            f.faculty_id, f.first_name AS f_first, f.last_name AS f_last, f.employee_code
     FROM users u
     JOIN roles r ON r.role_id = u.role_id
     LEFT JOIN students s ON s.user_id = u.user_id
     LEFT JOIN faculty  f ON f.user_id = u.user_id
     WHERE u.email = ? LIMIT 1`,
    [email],
  );
}

export async function findUserById(userId: number): Promise<UserRecord | null> {
  return queryOne<UserRecord>(
    `SELECT u.user_id, u.role_id, u.email, u.phone, u.is_active, u.last_login_at, u.created_at,
            r.role_code, s.student_id, f.faculty_id
     FROM users u
     JOIN roles r ON r.role_id = u.role_id
     LEFT JOIN students s ON s.user_id = u.user_id
     LEFT JOIN faculty f  ON f.user_id = u.user_id
     WHERE u.user_id = ? LIMIT 1`,
    [userId],
  );
}

export async function touchLogin(userId: number): Promise<void> {
  await execute(
    'UPDATE users SET last_login_at = NOW(), failed_attempts = 0, locked_until = NULL WHERE user_id = ?',
    [userId],
  );
}

export async function registerFailedLogin(userId: number, attempts: number): Promise<void> {
  const lock = attempts >= 5 ? ', locked_until = DATE_ADD(NOW(), INTERVAL 15 MINUTE)' : '';
  await execute(
    `UPDATE users SET failed_attempts = ?${lock} WHERE user_id = ?`,
    [attempts, userId],
  );
}

export async function saveRefreshToken(userId: number, token: string): Promise<void> {
  await execute('UPDATE users SET refresh_token = ? WHERE user_id = ?', [token, userId]);
}

export async function clearRefreshToken(userId: number): Promise<void> {
  await execute('UPDATE users SET refresh_token = NULL WHERE user_id = ?', [userId]);
}

export async function updatePassword(userId: number, hash: string): Promise<void> {
  await execute(
    'UPDATE users SET password_hash = ?, is_first_login = 0, refresh_token = NULL WHERE user_id = ?',
    [hash, userId],
  );
}

export async function listUsers(pagingSql: string, params: unknown[]): Promise<[Row[], number]> {
  const rows = await query(pagingSql, params);
  const total = await query('SELECT COUNT(*) AS total FROM users u JOIN roles r ON r.role_id = u.role_id');
  return [rows, Number(total[0]?.total ?? 0)];
}

export async function roles(): Promise<Row[]> {
  return query('SELECT role_id AS id, role_code AS code, role_name AS name FROM roles ORDER BY role_id');
}

export async function createUser(
  roleCode: string,
  email: string,
  passwordHash: string,
  phone?: string | null,
): Promise<number> {
  const res = await execute(
    `INSERT INTO users (role_id, email, password_hash, phone, is_active, is_first_login)
     SELECT role_id, ?, ?, ?, 1, 1 FROM roles WHERE role_code = ? LIMIT 1`,
    [email, passwordHash, phone ?? null, roleCode],
  );
  return res.insertId;
}

export async function hashForUser(userId: number): Promise<string | null> {
  const row = await queryOne<Row>('SELECT password_hash FROM users WHERE user_id = ?', [userId]);
  return (row?.password_hash as string) ?? null;
}

export async function setUserActive(userId: number, active: boolean): Promise<void> {
  await execute('UPDATE users SET is_active = ? WHERE user_id = ?', [active ? 1 : 0, userId]);
}
