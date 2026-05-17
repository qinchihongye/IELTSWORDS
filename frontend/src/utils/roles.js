export const ROLE_LEVELS = {
  user: 1,
  premium_user: 2,
  admin: 3,
  super_admin: 4,
};

export const ROLE_LABELS = {
  user: '普通用户',
  premium_user: 'VIP 用户',
  admin: '管理员',
  super_admin: '超级管理员',
};

export const ROLE_OPTIONS = [
  { value: 'user', label: ROLE_LABELS.user },
  { value: 'premium_user', label: ROLE_LABELS.premium_user },
  { value: 'admin', label: ROLE_LABELS.admin },
  { value: 'super_admin', label: ROLE_LABELS.super_admin },
];

export const ROLE_COLORS = {
  user: 'default',
  premium_user: 'blue',
  admin: 'gold',
  super_admin: 'red',
};

export const getRoleLevel = (role = 'user') => ROLE_LEVELS[role] || ROLE_LEVELS.user;

export const hasMinRole = (user, minRole) => {
  if (!user) return false;
  return getRoleLevel(user.role) >= getRoleLevel(minRole);
};
