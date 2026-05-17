import config from '../config/settings';

const BUILTIN_AVATAR_FILES = [
  '花舞霓裳.png',
  '万华镜.png',
  '三河千鸟.png',
  '恋物语.png',
  '无尽夏.png',
  '石灰灯.png',
  '花手鞠.png',
  '薄荷拇指.png',
  '香草草莓.png',
  '魔幻海洋.png',
  '坦尼克.jpg',
  '白二岐.jpg',
  '萨利安.jpg',
  '白锦龟背竹.png',
  '绿天鹅绒.png',
  '银虎.png',
  '黑桃.png',
  '婉尼拉.png',
  '女王之心.jpg',
];

const LEGACY_BUILTIN_AVATAR_FILES = [
  '万华镜.png',
  '三河千鸟.png',
  '恋物语.png',
  '无尽夏.png',
  '石灰灯.png',
  '花手鞠.png',
  '花舞霓裳.png',
  '薄荷拇指.png',
  '香草草莓.png',
  '魔幻海洋.png',
];

export const DEFAULT_BUILTIN_AVATAR_KEY = '万华镜.png';
const VIP_ONLY_BUILTIN_AVATAR_KEYS = new Set(['花舞霓裳.png']);

const builtinAvatarModules = import.meta.glob(
  [
    '../assets/builtin-avatars/*.png',
    '../assets/builtin-avatars/*.jpg',
    '../assets/builtin-avatars/*.jpeg',
    '../assets/builtin-avatars/*.webp',
  ],
  {
    eager: true,
    import: 'default',
  }
);

const BUILTIN_AVATAR_SRC_BY_FILE = Object.fromEntries(
  Object.entries(builtinAvatarModules).map(([path, src]) => [path.split('/').pop(), src])
);

const LEGACY_BUILTIN_AVATAR_KEY_MAP = Object.fromEntries(
  LEGACY_BUILTIN_AVATAR_FILES.map((fileName, index) => [`avatar-${String(index + 1).padStart(2, '0')}`, fileName])
);
const LEGACY_RENAMED_BUILTIN_AVATAR_KEY_MAP = {
  '石头灯.png': '石灰灯.png',
};

const getAvatarLabel = (fileName) => fileName.replace(/\.[^.]+$/, '');

export const BUILTIN_AVATAR_OPTIONS = BUILTIN_AVATAR_FILES.map((fileName) => ({
  key: fileName,
  label: getAvatarLabel(fileName),
  src: BUILTIN_AVATAR_SRC_BY_FILE[fileName] || '',
  vipOnly: VIP_ONLY_BUILTIN_AVATAR_KEYS.has(fileName),
}));

export const normalizeBuiltinAvatarKey = (avatarKey = DEFAULT_BUILTIN_AVATAR_KEY) => {
  const value = avatarKey?.trim();
  if (!value) {
    return DEFAULT_BUILTIN_AVATAR_KEY;
  }

  if (BUILTIN_AVATAR_SRC_BY_FILE[value]) {
    return value;
  }

  return LEGACY_RENAMED_BUILTIN_AVATAR_KEY_MAP[value]
    || LEGACY_BUILTIN_AVATAR_KEY_MAP[value]
    || DEFAULT_BUILTIN_AVATAR_KEY;
};

export const getBuiltinAvatarOption = (avatarKey = DEFAULT_BUILTIN_AVATAR_KEY) => {
  const normalizedKey = normalizeBuiltinAvatarKey(avatarKey);
  return (
    BUILTIN_AVATAR_OPTIONS.find((item) => item.key === normalizedKey)
    || BUILTIN_AVATAR_OPTIONS[0]
  );
};

export const isBuiltinAvatarVipOnly = (avatarKey) => (
  VIP_ONLY_BUILTIN_AVATAR_KEYS.has(normalizeBuiltinAvatarKey(avatarKey))
);

export const getAvatarSrc = (userLike) => {
  if (!userLike) {
    return getBuiltinAvatarOption().src;
  }

  if (userLike.avatar_type === 'upload' && userLike.avatar_value) {
    if (/^(https?:|data:)/.test(userLike.avatar_value)) {
      return userLike.avatar_value;
    }

    try {
      return new URL(userLike.avatar_value, `${config.api.baseURL.replace(/\/$/, '')}/`).href;
    } catch (error) {
      console.error('解析上传头像地址失败:', error);
    }
  }

  return getBuiltinAvatarOption(userLike.avatar_value).src;
};

export const getAvatarFallbackText = (name = '') => {
  const trimmed = name.trim();
  if (!trimmed) {
    return '?';
  }
  return trimmed.slice(0, 1).toUpperCase();
};
