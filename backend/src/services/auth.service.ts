import bcrypt from 'bcryptjs';
import { env } from '../config/env';
import * as repo from '../repositories/auth.repository';
import { AuthUser } from '../middleware/auth';
import { signAccessToken, signRefreshToken, verifyRefreshToken } from '../middleware/auth';
import { AppError } from '../utils/api';
import { audit } from '../utils/audit';

export interface LoginContext { ip?: string | null; userAgent?: string | null }

export async function login(email: string, password: string, ctx: LoginContext = {}) {
  const user = await repo.findUserByEmail(email.toLowerCase().trim());

  if (!user) {
    await audit({ action: 'LOGIN_FAILED', entity: 'users', description: `Unknown email ${email}`, ip: ctx.ip, userAgent: ctx.userAgent });
    throw AppError.unauthorized('Invalid email or password');
  }
  if (!user.is_active) throw AppError.forbidden('This account has been deactivated. Contact the administrator.');
  if (user.locked_until && new Date(user.locked_until) > new Date()) {
    throw AppError.forbidden('Account locked after too many failed attempts. Try again in 15 minutes.');
  }

  const valid = await bcrypt.compare(password, user.password_hash);
  if (!valid) {
    const attempts = Number(user.failed_attempts ?? 0) + 1;
    await repo.registerFailedLogin(user.user_id, attempts);
    await audit({
      userId: user.user_id, action: 'LOGIN_FAILED', entity: 'users', entityId: user.user_id,
      description: `Failed login attempt ${attempts}`, ip: ctx.ip, userAgent: ctx.userAgent,
    });
    throw AppError.unauthorized('Invalid email or password');
  }

  const authUser: AuthUser = {
    userId: user.user_id,
    role: user.role_code as AuthUser['role'],
    email: user.email,
    studentId: user.student_id ?? undefined,
    facultyId: user.faculty_id ?? undefined,
    name: [user.s_first ?? user.f_first, user.s_last ?? user.f_last].filter(Boolean).join(' ')
      || user.roll_number || user.employee_code || user.email,
  };

  const accessToken = signAccessToken(authUser);
  const refreshToken = signRefreshToken(authUser);
  await repo.touchLogin(user.user_id);
  await repo.saveRefreshToken(user.user_id, refreshToken);
  await audit({
    userId: user.user_id, action: 'LOGIN', entity: 'users', entityId: user.user_id,
    description: `${authUser.role} signed in`, ip: ctx.ip, userAgent: ctx.userAgent,
  });

  return {
    user: { ...authUser, mustChangePassword: false },
    accessToken,
    refreshToken,
    expiresIn: env.jwt.expiresIn,
  };
}

export async function refresh(token: string, ctx: LoginContext = {}) {
  let payload;
  try {
    payload = verifyRefreshToken(token);
  } catch {
    throw AppError.unauthorized('Invalid or expired refresh token');
  }
  const user = await repo.findUserById(Number(payload.sub));
  if (!user || !user.is_active) throw AppError.unauthorized('Account no longer active');
  if (user.refresh_token !== token) throw AppError.unauthorized('Refresh token has been revoked');

  const authUser: AuthUser = {
    userId: user.user_id,
    role: user.role_code as AuthUser['role'],
    email: user.email,
    studentId: user.student_id ?? undefined,
    facultyId: user.faculty_id ?? undefined,
  };
  const accessToken = signAccessToken(authUser);
  const refreshToken = signRefreshToken(authUser);
  await repo.saveRefreshToken(user.user_id, refreshToken);
  return { accessToken, refreshToken, expiresIn: env.jwt.expiresIn };
}

export async function logout(userId: number, ctx: LoginContext = {}) {
  await repo.clearRefreshToken(userId);
  await audit({ userId, action: 'LOGOUT', entity: 'users', entityId: userId, description: 'Signed out', ip: ctx.ip });
  return { loggedOut: true };
}

export async function me(userId: number) {
  const user = await repo.findUserById(userId);
  if (!user) throw AppError.notFound('User');
  return user;
}

export async function changePassword(userId: number, current: string, next: string) {
  const hashCurrent = await repo.hashForUser(userId);
  if (!hashCurrent) throw AppError.notFound('User');
  const valid = await bcrypt.compare(current, hashCurrent);
  if (!valid) throw AppError.validation('Your current password is incorrect');
  if (next.length < 8) throw AppError.validation('The new password must be at least 8 characters long');
  const hash = await bcrypt.hash(next, env.bcryptRounds);
  await repo.updatePassword(userId, hash);
  await audit({ userId, action: 'UPDATE', entity: 'users', entityId: userId, description: 'Password changed' });
  return { changed: true };
}

export function hashPassword(plain: string): Promise<string> {
  return bcrypt.hash(plain, env.bcryptRounds);
}

export const listRoles = repo.roles;
export const listUsers = repo.listUsers;
export const createUser = repo.createUser;
