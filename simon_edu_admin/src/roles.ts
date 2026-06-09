export const ROLE_OPTIONS = [
  { value: 'user', label: '일반' },
  { value: 'district_leader', label: '구역장' },
  { value: 'team_leader', label: '팀장' },
  { value: 'manager', label: '임과장' },
  { value: 'admin', label: '관리자' },
] as const;

export type UserRole = typeof ROLE_OPTIONS[number]['value'];

export const ADMIN_LOGIN_ROLES: UserRole[] = ['manager', 'admin'];
export const PUBLISH_ROLES: UserRole[] = ['district_leader', 'team_leader', 'manager', 'admin'];

export const getRoleLabel = (role?: string) => (
  ROLE_OPTIONS.find((option) => option.value === role)?.label || '일반'
);

export const canOpenAdmin = (role?: string) => ADMIN_LOGIN_ROLES.includes(role as UserRole);
