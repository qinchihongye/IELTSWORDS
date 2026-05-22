import apiClient from '../api/client';
import config from '../config/settings';

const BUILTIN_AVATAR_FILES = [
  '恋物语.png'
];

const LEGACY_BUILTIN_AVATAR_FILES = [
  '三河千鸟.png',
  '恋物语.png',
  '无尽夏.png',
  '石灰灯.png',
  '花舞霓裳.png',
  '香草草莓.png',
  '魔幻海洋.png',
];

export const DEFAULT_BUILTIN_AVATAR_KEY = BUILTIN_AVATAR_FILES.includes('恋物语.png') ? '恋物语.png' : (BUILTIN_AVATAR_FILES[0] || '');
const VIP_ONLY_BUILTIN_AVATAR_KEYS = new Set([
  '花舞霓裳.png',
  '石灰灯.png',
  '香草草莓.png',
  '白二岐.png',
  '幻想曲.png',
  '雪后.png',
]);




const LEGACY_BUILTIN_AVATAR_KEY_MAP = Object.fromEntries(
  LEGACY_BUILTIN_AVATAR_FILES.map((fileName, index) => [`avatar-${String(index + 1).padStart(2, '0')}`, fileName])
);
const LEGACY_RENAMED_BUILTIN_AVATAR_KEY_MAP = {
  '石头灯.png': '石灰灯.png',
  '坦尼克.jpg': '坦尼克.png',
  '白二岐.jpg': '白二岐.png',
  '萨利安.jpg': '萨利安.png',
};

const getAvatarLabel = (fileName) => fileName.replace(/\.[^.]+$/, '');

const builtinApiBase = config.api.baseURL.replace(/\/$/, '');

const getBuiltinSrc = (filename) => {
  return `${builtinApiBase}/builtin-avatars/${filename}`;
};

export let BUILTIN_AVATAR_OPTIONS = BUILTIN_AVATAR_FILES.map((fileName) => ({
  key: fileName,
  label: getAvatarLabel(fileName),
  src: getBuiltinSrc(fileName),
  vipOnly: VIP_ONLY_BUILTIN_AVATAR_KEYS.has(fileName),
}));

let dynamicBuiltinCache = [];

const refreshBuiltinOptions = () => {
  const dynamicOptions = dynamicBuiltinCache.map((item) => ({
    key: item.key,
    label: item.label,
    src: `${builtinApiBase}${item.url}`,
    vipOnly: item.vip_only,
  }));
  const hardcodedKeys = new Set(BUILTIN_AVATAR_FILES);
  const filteredDynamicOptions = dynamicOptions.filter((item) => !hardcodedKeys.has(item.key));
  
  BUILTIN_AVATAR_OPTIONS = [
    ...BUILTIN_AVATAR_FILES.map((fileName) => ({
      key: fileName,
      label: getAvatarLabel(fileName),
      src: getBuiltinSrc(fileName),
      vipOnly: VIP_ONLY_BUILTIN_AVATAR_KEYS.has(fileName),
    })),
    ...filteredDynamicOptions,
  ];
};

export const fetchDynamicBuiltinAvatars = async () => {
  try {
    const response = await apiClient.get('/api/avatars/builtin');
    dynamicBuiltinCache = response.data || [];
    refreshBuiltinOptions();
  } catch {
    // Silently fail — bundled avatars still work
  }
  return dynamicBuiltinCache;
};

export const getDynamicBuiltinAvatars = () => dynamicBuiltinCache;

export const normalizeBuiltinAvatarKey = (avatarKey = DEFAULT_BUILTIN_AVATAR_KEY) => {
  const value = avatarKey?.trim();
  if (!value) {
    return DEFAULT_BUILTIN_AVATAR_KEY;
  }



  if (dynamicBuiltinCache.some((item) => item.key === value)) {
    return value;
  }

  return LEGACY_RENAMED_BUILTIN_AVATAR_KEY_MAP[value]
    || LEGACY_BUILTIN_AVATAR_KEY_MAP[value]
    || DEFAULT_BUILTIN_AVATAR_KEY;
};

export const getBuiltinAvatarOption = (avatarKey = DEFAULT_BUILTIN_AVATAR_KEY) => {
  const normalizedKey = normalizeBuiltinAvatarKey(avatarKey);
  const option = BUILTIN_AVATAR_OPTIONS.find((item) => item.key === normalizedKey);
  if (option) return option;
  
  if (BUILTIN_AVATAR_OPTIONS.length > 0) {
    return BUILTIN_AVATAR_OPTIONS[0];
  }
  
  return {
    key: DEFAULT_BUILTIN_AVATAR_KEY,
    label: getAvatarLabel(DEFAULT_BUILTIN_AVATAR_KEY),
    src: getBuiltinSrc(DEFAULT_BUILTIN_AVATAR_KEY),
    vipOnly: false,
  };
};

export const isBuiltinAvatarVipOnly = (avatarKey) => (
  VIP_ONLY_BUILTIN_AVATAR_KEYS.has(normalizeBuiltinAvatarKey(avatarKey))
);


export const getAvatarSrc = (userLike) => {
  if (!userLike) {
    return getBuiltinSrc(DEFAULT_BUILTIN_AVATAR_KEY);
  }

  if (userLike.avatar_type === 'upload' && userLike.avatar_value) {
    if (/^(https?:|data:)/.test(userLike.avatar_value)) {
      return userLike.avatar_value;
    }

    try {
      return new URL(userLike.avatar_value, `${builtinApiBase}/`).href;
    } catch (error) {
      console.error('解析上传头像地址失败:', error);
    }
  }

  if (userLike.avatar_type === 'builtin' || !userLike.avatar_type) {
    return getBuiltinSrc(userLike.avatar_value || DEFAULT_BUILTIN_AVATAR_KEY);
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

export const getAvatarName = (userLike) => {
  if (!userLike) {
    return '默认头像';
  }
  if (userLike.avatar_type === 'upload') {
    return '自定义上传头像';
  }
  const option = getBuiltinAvatarOption(userLike.avatar_value);
  return option ? option.label : '默认头像';
};
