import apiClient from '../api/client';
import config from '../config/settings';

const PREFERRED_DEFAULT_BUILTIN_AVATAR_KEY = '恋物语.png';
const LEGACY_BUILTIN_AVATAR_FILES = [
  '三河千鸟.png',
  '恋物语.png',
  '无尽夏.png',
  '石灰灯.png',
  '花舞霓裳.png',
  '香草草莓.png',
  '魔幻海洋.png',
];

export const DEFAULT_BUILTIN_AVATAR_KEY = PREFERRED_DEFAULT_BUILTIN_AVATAR_KEY;
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

const builtinApiBase = config.api.baseURL.replace(/\/$/, '');

const getAvatarLabel = (fileName = '') => fileName.replace(/\.[^.]+$/, '');
const toAbsoluteAvatarUrl = (url = '') => {
  if (!url) {
    return null;
  }
  if (/^(https?:|data:|blob:)/.test(url)) {
    return url;
  }

  try {
    return new URL(url, `${builtinApiBase}/`).href;
  } catch (error) {
    console.error('解析头像地址失败:', error);
    return null;
  }
};

const normalizeBuiltinAvatarCandidate = (avatarKey = '') => {
  const value = String(avatarKey || '').trim();
  if (!value) {
    return '';
  }

  return LEGACY_RENAMED_BUILTIN_AVATAR_KEY_MAP[value]
    || LEGACY_BUILTIN_AVATAR_KEY_MAP[value]
    || value;
};

const getBuiltinSrc = (filename) => (filename ? `${builtinApiBase}/builtin-avatars/${filename}` : null);

const getDefaultBuiltinAvatarKey = () => {
  if (dynamicBuiltinCache.some((item) => item.key === PREFERRED_DEFAULT_BUILTIN_AVATAR_KEY)) {
    return PREFERRED_DEFAULT_BUILTIN_AVATAR_KEY;
  }

  return dynamicBuiltinCache[0]?.key || DEFAULT_BUILTIN_AVATAR_KEY;
};

export let BUILTIN_AVATAR_OPTIONS = [];

let dynamicBuiltinCache = [];

const refreshBuiltinOptions = () => {
  BUILTIN_AVATAR_OPTIONS = dynamicBuiltinCache.map((item) => ({
    key: item.key,
    label: item.label,
    src: `${builtinApiBase}${item.url}`,
    vipOnly: item.vip_only,
    variety: item.variety || '',
  }));
};

export const fetchDynamicBuiltinAvatars = async () => {
  try {
    const response = await apiClient.get('/api/avatars/builtin');
    dynamicBuiltinCache = response.data || [];
    refreshBuiltinOptions();
  } catch {
    dynamicBuiltinCache = [];
    refreshBuiltinOptions();
  }
  return dynamicBuiltinCache;
};

export const getDynamicBuiltinAvatars = () => dynamicBuiltinCache;

export const normalizeBuiltinAvatarKey = (avatarKey = DEFAULT_BUILTIN_AVATAR_KEY) => {
  const candidate = normalizeBuiltinAvatarCandidate(avatarKey);
  if (candidate && (dynamicBuiltinCache.length === 0 || dynamicBuiltinCache.some((item) => item.key === candidate))) {
    return candidate;
  }

  return getDefaultBuiltinAvatarKey();
};

export const getBuiltinAvatarOption = (avatarKey = DEFAULT_BUILTIN_AVATAR_KEY) => {
  const normalizedKey = normalizeBuiltinAvatarKey(avatarKey);
  const option = BUILTIN_AVATAR_OPTIONS.find((item) => item.key === normalizedKey);
  if (option) {
    return option;
  }

  if (normalizedKey) {
    return {
      key: normalizedKey,
      label: getAvatarLabel(normalizedKey),
      src: getBuiltinSrc(normalizedKey),
      vipOnly: VIP_ONLY_BUILTIN_AVATAR_KEYS.has(normalizedKey),
      variety: '',
    };
  }

  if (BUILTIN_AVATAR_OPTIONS.length > 0) {
    return BUILTIN_AVATAR_OPTIONS[0];
  }

  return {
    key: DEFAULT_BUILTIN_AVATAR_KEY,
    label: '默认头像',
    src: null,
    vipOnly: false,
    variety: '',
  };
};

export const isBuiltinAvatarVipOnly = (avatarKey) => (
  VIP_ONLY_BUILTIN_AVATAR_KEYS.has(normalizeBuiltinAvatarCandidate(avatarKey))
);

export const getAvatarSrc = (userLike) => {
  if (!userLike) {
    return getBuiltinAvatarOption().src;
  }

  if (userLike.avatar_url) {
    return toAbsoluteAvatarUrl(userLike.avatar_url);
  }

  if (userLike.avatar_type === 'upload' && userLike.avatar_value) {
    return toAbsoluteAvatarUrl(userLike.avatar_value);
  }

  if (userLike.avatar_type === 'builtin' || !userLike.avatar_type) {
    const option = getBuiltinAvatarOption(userLike.avatar_value || DEFAULT_BUILTIN_AVATAR_KEY);
    return option?.src || null;
  }

  return getBuiltinAvatarOption(userLike.avatar_value).src;
};

export const getAvatarFallbackSrc = (userLike) => {
  if (!userLike || userLike.avatar_type === 'upload') {
    return null;
  }

  const avatarKey = normalizeBuiltinAvatarKey(userLike.avatar_value || DEFAULT_BUILTIN_AVATAR_KEY);
  return getBuiltinSrc(avatarKey);
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
  return option?.label || '默认头像';
};
