export type Role =
  | 'ADMIN' | 'FACULTY' | 'STUDENT' | 'ACCOUNTANT' | 'HOSTEL_ADMIN' | 'EXAM_CELL' | 'HR';

export interface AuthUser {
  userId: number;
  role: Role;
  email: string;
  name: string;
  studentId?: number | null;
  facultyId?: number | null;
  mustChangePassword?: boolean;
}

export interface LoginResult {
  user: AuthUser;
  accessToken: string;
  refreshToken: string;
  expiresIn: string;
}

export interface Page<T> {
  rows: T[];
  meta: { page: number; limit: number; total: number; totalPages: number };
}
