import React, { useCallback, useEffect, useRef, useState, useMemo } from 'react';
import { Button, Card, Form, Input, Space, Tag, Typography, message, Modal, Slider, Select, Tooltip } from 'antd';
import {
  DownloadOutlined,
  LockOutlined,
  UploadOutlined,
  UserOutlined,
  PictureOutlined,
  ScissorOutlined,
  CloudUploadOutlined,
  ZoomInOutlined,
  ZoomOutOutlined,
  InfoCircleOutlined
} from '@ant-design/icons';
import Cropper from 'react-easy-crop';
import apiClient from '../api/client';
import UserAvatar from '../components/UserAvatar';
import { useAuth } from '../context/AuthContext';
import { BUILTIN_AVATAR_OPTIONS, fetchDynamicBuiltinAvatars } from '../utils/avatars';
import { hasMinRole } from '../utils/roles';

const { Title, Text } = Typography;

const normalizeAvatarOption = (option = {}) => ({
  ...option,
  vipOnly: !!option.vip_only,
  isHardcoded: !!option.is_hardcoded,
  unlockSource: option.unlock_source || 'public',
  isLocked: !!option.is_locked,
});

// Utility to crop image inside a canvas and return a transparent PNG blob
const getCroppedImg = (imageSrc, croppedAreaPixels) => {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.src = imageSrc;
    image.onload = () => {
      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d');
      if (!ctx) {
        reject(new Error('无法获取 Canvas 2D 绘图上下文'));
        return;
      }

      // We draw the crop area at the exact original pixel dimension to PRESERVE 100% original quality
      const size = croppedAreaPixels.width;
      canvas.width = size;
      canvas.height = size;

      // Create circular clipping path
      ctx.beginPath();
      ctx.arc(size / 2, size / 2, size / 2, 0, 2 * Math.PI);
      ctx.clip();

      // Draw the cropped portion from original image onto the circular canvas area
      ctx.drawImage(
        image,
        croppedAreaPixels.x,
        croppedAreaPixels.y,
        croppedAreaPixels.width,
        croppedAreaPixels.height,
        0,
        0,
        size,
        size
      );

      // Convert canvas to a transparent PNG Blob
      canvas.toBlob((blob) => {
        if (!blob) {
          reject(new Error('Canvas is empty'));
          return;
        }
        resolve(blob);
      }, 'image/png');
    };
    image.onerror = (error) => reject(error);
  });
};

const Profile = () => {
  const {
    user,
    updateProfile,
    changePassword,
    setBuiltinAvatar,
    uploadAvatar,
  } = useAuth();
  const [profileForm] = Form.useForm();
  const [passwordForm] = Form.useForm();
  const uploadInputRef = useRef(null);
  const [avatarSaving, setAvatarSaving] = useState(false);
  const [avatarCatalogLoading, setAvatarCatalogLoading] = useState(false);
  const canUseVipAvatar = hasMinRole(user, 'premium_user');
  const isAdmin = hasMinRole(user, 'admin');

  // Cropper states
  const [cropImage, setCropImage] = useState(null);
  const [crop, setCrop] = useState({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const [croppedAreaPixels, setCroppedAreaPixels] = useState(null);
  const [uploadFileName, setUploadFileName] = useState('');
  const [avatarOptions, setAvatarOptions] = useState([]);
  const [nextUnlockCondition, setNextUnlockCondition] = useState('');
  const [activeTab, setActiveTab] = useState('basic');
  const [previewAvatar, setPreviewAvatar] = useState(null);
  const [selectedVariety, setSelectedVariety] = useState('ALL');
  const [selectedChapterVariety, setSelectedChapterVariety] = useState('ALL');
  const [selectedVipVariety, setSelectedVipVariety] = useState('ALL');
  const [unlockedNormalCount, setUnlockedNormalCount] = useState(0);
  const [totalNormalCount, setTotalNormalCount] = useState(0);

  const groupedAvatars = useMemo(() => {
    const normal = [];
    const vip = [];
    const chapter = [];
    avatarOptions.forEach((option) => {
      if (option.unlockSource === 'chapter_completion') {
        chapter.push(option);
      } else if (option.vipOnly) {
        vip.push(option);
      } else {
        normal.push(option);
      }
    });
    return { chapter, normal, vip };
  }, [avatarOptions]);

  const normalVarieties = useMemo(() => {
    const varieties = new Set();
    (groupedAvatars.normal || []).forEach((opt) => {
      if (opt.variety) {
        varieties.add(opt.variety);
      }
    });
    return Array.from(varieties);
  }, [groupedAvatars.normal]);

  const filteredNormalAvatars = useMemo(() => {
    if (selectedVariety === 'ALL') {
      return groupedAvatars.normal || [];
    }
    return (groupedAvatars.normal || []).filter((opt) => opt.variety === selectedVariety);
  }, [groupedAvatars.normal, selectedVariety]);

  useEffect(() => {
    if (selectedVariety !== 'ALL' && !normalVarieties.includes(selectedVariety)) {
      setSelectedVariety('ALL');
    }
  }, [normalVarieties, selectedVariety]);

  const chapterVarieties = useMemo(() => {
    const varieties = new Set();
    (groupedAvatars.chapter || []).forEach((opt) => {
      if (opt.variety) {
        varieties.add(opt.variety);
      }
    });
    return Array.from(varieties);
  }, [groupedAvatars.chapter]);

  const filteredChapterAvatars = useMemo(() => {
    if (selectedChapterVariety === 'ALL') {
      return groupedAvatars.chapter || [];
    }
    return (groupedAvatars.chapter || []).filter((opt) => opt.variety === selectedChapterVariety);
  }, [groupedAvatars.chapter, selectedChapterVariety]);

  useEffect(() => {
    if (selectedChapterVariety !== 'ALL' && !chapterVarieties.includes(selectedChapterVariety)) {
      setSelectedChapterVariety('ALL');
    }
  }, [chapterVarieties, selectedChapterVariety]);

  const vipVarieties = useMemo(() => {
    const varieties = new Set();
    (groupedAvatars.vip || []).forEach((opt) => {
      if (opt.variety) {
        varieties.add(opt.variety);
      }
    });
    return Array.from(varieties);
  }, [groupedAvatars.vip]);

  const filteredVipAvatars = useMemo(() => {
    if (selectedVipVariety === 'ALL') {
      return groupedAvatars.vip || [];
    }
    return (groupedAvatars.vip || []).filter((opt) => opt.variety === selectedVipVariety);
  }, [groupedAvatars.vip, selectedVipVariety]);

  useEffect(() => {
    if (selectedVipVariety !== 'ALL' && !vipVarieties.includes(selectedVipVariety)) {
      setSelectedVipVariety('ALL');
    }
  }, [vipVarieties, selectedVipVariety]);

  const loadAvatarCatalog = useCallback(async () => {
    setAvatarCatalogLoading(true);
    try {
      await fetchDynamicBuiltinAvatars();
      const response = await apiClient.get('/api/avatars/me/options');
      setAvatarOptions((response.data?.avatars || []).map(normalizeAvatarOption));
      setNextUnlockCondition(response.data?.next_unlock_condition || '');
      setUnlockedNormalCount(response.data?.unlocked_normal_count || 0);
      setTotalNormalCount(response.data?.total_normal_count || 0);
    } catch (error) {
      console.error('加载头像选项失败:', error);
    } finally {
      setAvatarCatalogLoading(false);
    }
  }, []);

  useEffect(() => {
    profileForm.setFieldsValue({
      username: user?.username,
      email: user?.email,
      uid: user?.uid,
    });
  }, [profileForm, user?.email, user?.username, user?.uid]);

  useEffect(() => {
    if (!user) {
      return;
    }
    loadAvatarCatalog();
  }, [loadAvatarCatalog, user]);

  const renderAvatarGroup = (title, options, sectionClassName = '') => {
    if (!options.length) {
      return null;
    }

    return (
      <div className={`profile-avatar-group-section ${sectionClassName}`.trim()}>
        <div className={`profile-avatar-group-title ${sectionClassName}`.trim()}>{title}</div>
        <div className="profile-avatar-grid">
          {options.map((option) => {
            const selected = user?.avatar_type === 'builtin' && user?.avatar_value === option.key;
            const isUnlockLocked = !!option.isLocked;
            const locked = (option.vipOnly && !canUseVipAvatar) || isUnlockLocked;
            return (
              <button
                key={option.key}
                type="button"
                className={`profile-avatar-option ${selected ? 'profile-avatar-option--selected' : ''} ${locked ? 'profile-avatar-option--locked' : ''}`}
                onClick={() => {
                  if (isUnlockLocked) {
                    message.warning(`您尚未解锁“${option.label}”头像`);
                    return;
                  }
                  if (option.vipOnly && !canUseVipAvatar) {
                    message.warning(`${option.label}头像仅 VIP 用户及以上可设置`);
                    return;
                  }
                  handleBuiltinAvatarSelect(option.key);
                }}
                disabled={avatarSaving}
                aria-disabled={locked}
              >
                <div style={{ position: 'relative', display: 'inline-flex' }}>
                  <UserAvatar
                    user={{ ...(user || {}), avatar_type: 'builtin', avatar_value: option.key }}
                    size={56}
                    locked={isUnlockLocked && !isAdmin}
                  />
                  {option.vipOnly && (
                    <div className="avatar-tag-overlay vip" title="VIP 专属">
                      👑
                    </div>
                  )}
                  {isUnlockLocked && isAdmin && (
                    <div className="avatar-tag-overlay lock" title="尚未解锁" style={{ background: '#ef4444', color: '#fff', fontSize: 10 }}>
                      🔒
                    </div>
                  )}
                  <div
                    className="avatar-zoom-trigger"
                    title={`预览 ${option.label}`}
                    onClick={(e) => {
                      e.stopPropagation();
                      setPreviewAvatar(option);
                    }}
                  >
                    🔍
                  </div>
                </div>
                <span className="avatar-option-label">{option.label}</span>
              </button>
            );
          })}
        </div>
      </div>
    );
  };

  const renderVipAvatarGroup = () => {
    const allOptions = groupedAvatars.vip || [];
    if (!allOptions.length) {
      return null;
    }

    return (
      <div className="profile-avatar-group-section vip-avatars">
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginBottom: 12 }}>
          <div className="profile-avatar-group-title">VIP 专属头像</div>
          
          {vipVarieties.length > 0 && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 4 }}>
              <span style={{ fontSize: 13, color: '#64748b', fontWeight: 600 }}>筛选品种：</span>
              <Select
                value={selectedVipVariety}
                onChange={(value) => setSelectedVipVariety(value)}
                style={{ width: 180 }}
                options={[
                  { value: 'ALL', label: `全部 (${allOptions.length})` },
                  ...vipVarieties.map((variety) => {
                    const count = allOptions.filter(opt => opt.variety === variety).length;
                    return {
                      value: variety,
                      label: `${variety} (${count})`,
                    };
                  }),
                ]}
              />
            </div>
          )}
        </div>

        {filteredVipAvatars.length === 0 ? (
          <div className="profile-avatar-empty">该品类下暂无 VIP 专属头像</div>
        ) : (
          <div className="profile-avatar-grid">
            {filteredVipAvatars.map((option) => {
              const selected = user?.avatar_type === 'builtin' && user?.avatar_value === option.key;
              const isUnlockLocked = !!option.isLocked;
              const locked = (option.vipOnly && !canUseVipAvatar) || isUnlockLocked;
              return (
                <button
                  key={option.key}
                  type="button"
                  className={`profile-avatar-option ${selected ? 'profile-avatar-option--selected' : ''} ${locked ? 'profile-avatar-option--locked' : ''}`}
                  onClick={() => {
                    if (isUnlockLocked) {
                      message.warning(`您尚未解锁“${option.label}”头像`);
                      return;
                    }
                    if (option.vipOnly && !canUseVipAvatar) {
                      message.warning(`${option.label}头像仅 VIP 用户及以上可设置`);
                      return;
                    }
                    handleBuiltinAvatarSelect(option.key);
                  }}
                  disabled={avatarSaving}
                  aria-disabled={locked}
                >
                  <div style={{ position: 'relative', display: 'inline-flex' }}>
                    <UserAvatar
                      user={{ ...(user || {}), avatar_type: 'builtin', avatar_value: option.key }}
                      size={56}
                      locked={isUnlockLocked && !isAdmin}
                    />
                    {option.vipOnly && (
                      <div className="avatar-tag-overlay vip" title="VIP 专属">
                        👑
                      </div>
                    )}
                    {isUnlockLocked && isAdmin && (
                      <div className="avatar-tag-overlay lock" title="尚未解锁" style={{ background: '#ef4444', color: '#fff', fontSize: 10 }}>
                        🔒
                      </div>
                    )}
                    <div
                      className="avatar-zoom-trigger"
                      title={`预览 ${option.label}`}
                      onClick={(e) => {
                        e.stopPropagation();
                        setPreviewAvatar(option);
                      }}
                    >
                      🔍
                    </div>
                  </div>
                  <span className="avatar-option-label">{option.label}</span>
                </button>
              );
            })}
          </div>
        )}
      </div>
    );
  };

  const renderChapterAvatarGroup = () => {
    const allOptions = groupedAvatars.chapter || [];
    if (!allOptions.length) {
      return null;
    }

    return (
      <div className="profile-avatar-group-section chapter-avatars">
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginBottom: 12 }}>
          <div className="profile-avatar-group-title">章节解锁头像</div>
          
          {chapterVarieties.length > 0 && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 4 }}>
              <span style={{ fontSize: 13, color: '#64748b', fontWeight: 600 }}>筛选品种：</span>
              <Select
                value={selectedChapterVariety}
                onChange={(value) => setSelectedChapterVariety(value)}
                style={{ width: 180 }}
                options={[
                  { value: 'ALL', label: `全部 (${allOptions.length})` },
                  ...chapterVarieties.map((variety) => {
                    const count = allOptions.filter(opt => opt.variety === variety).length;
                    return {
                      value: variety,
                      label: `${variety} (${count})`,
                    };
                  }),
                ]}
              />
            </div>
          )}
        </div>

        {filteredChapterAvatars.length === 0 ? (
          <div className="profile-avatar-empty">该品类下暂无已解锁的章节头像</div>
        ) : (
          <div className="profile-avatar-grid">
            {filteredChapterAvatars.map((option) => {
              const selected = user?.avatar_type === 'builtin' && user?.avatar_value === option.key;
              const isUnlockLocked = !!option.isLocked;
              const locked = (option.vipOnly && !canUseVipAvatar) || isUnlockLocked;
              return (
                <button
                  key={option.key}
                  type="button"
                  className={`profile-avatar-option ${selected ? 'profile-avatar-option--selected' : ''} ${locked ? 'profile-avatar-option--locked' : ''}`}
                  onClick={() => {
                    if (isUnlockLocked) {
                      message.warning(`您尚未解锁“${option.label}”头像`);
                      return;
                    }
                    if (option.vipOnly && !canUseVipAvatar) {
                      message.warning(`${option.label}头像仅 VIP 用户及以上可设置`);
                      return;
                    }
                    handleBuiltinAvatarSelect(option.key);
                  }}
                  disabled={avatarSaving}
                  aria-disabled={locked}
                >
                  <div style={{ position: 'relative', display: 'inline-flex' }}>
                    <UserAvatar
                      user={{ ...(user || {}), avatar_type: 'builtin', avatar_value: option.key }}
                      size={56}
                      locked={isUnlockLocked && !isAdmin}
                    />
                    {option.vipOnly && (
                      <div className="avatar-tag-overlay vip" title="VIP 专属">
                        👑
                      </div>
                    )}
                    {isUnlockLocked && isAdmin && (
                      <div className="avatar-tag-overlay lock" title="尚未解锁" style={{ background: '#ef4444', color: '#fff', fontSize: 10 }}>
                        🔒
                      </div>
                    )}
                    <div
                      className="avatar-zoom-trigger"
                      title={`预览 ${option.label}`}
                      onClick={(e) => {
                        e.stopPropagation();
                        setPreviewAvatar(option);
                      }}
                    >
                      🔍
                    </div>
                  </div>
                  <span className="avatar-option-label">{option.label}</span>
                </button>
              );
            })}
          </div>
        )}
      </div>
    );
  };

  const renderNormalAvatarGroup = () => {
    const allOptions = groupedAvatars.normal || [];
    if (!allOptions.length) {
      return null;
    }

    return (
      <div className="profile-avatar-group-section normal-avatars">
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginBottom: 12 }}>
          <div className="profile-avatar-group-title" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span>阶段解锁头像</span>
            <Tooltip title={`已解锁头像 ${unlockedNormalCount} 个，总头像 ${totalNormalCount} 个`}>
              <span style={{
                fontSize: '13px',
                color: '#4f46e5',
                fontWeight: 600,
                cursor: 'pointer',
                display: 'inline-flex',
                alignItems: 'center',
                background: 'rgba(99, 102, 241, 0.08)',
                padding: '2px 8px',
                borderRadius: '12px',
                transition: 'all 0.2s ease',
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.background = 'rgba(99, 102, 241, 0.15)';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = 'rgba(99, 102, 241, 0.08)';
              }}
              >
                {unlockedNormalCount}/{totalNormalCount}
              </span>
            </Tooltip>
            {nextUnlockCondition && (
              <Tooltip title={`下一阶段预告: ${nextUnlockCondition}`}>
                <InfoCircleOutlined style={{ color: '#6366f1', cursor: 'help', fontSize: '14px' }} />
              </Tooltip>
            )}
          </div>
          
          {normalVarieties.length > 0 && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 4 }}>
              <span style={{ fontSize: 13, color: '#64748b', fontWeight: 600 }}>筛选品种：</span>
              <Select
                value={selectedVariety}
                onChange={(value) => setSelectedVariety(value)}
                style={{ width: 180 }}
                options={[
                  { value: 'ALL', label: `全部 (${allOptions.length})` },
                  ...normalVarieties.map((variety) => {
                    const count = allOptions.filter(opt => opt.variety === variety).length;
                    return {
                      value: variety,
                      label: `${variety} (${count})`,
                    };
                  }),
                ]}
              />
            </div>
          )}
        </div>

        {filteredNormalAvatars.length === 0 ? (
          <div className="profile-avatar-empty">该品类下暂无已解锁的阶段头像</div>
        ) : (
          <div className="profile-avatar-grid">
            {filteredNormalAvatars.map((option) => {
              const selected = user?.avatar_type === 'builtin' && user?.avatar_value === option.key;
              const isUnlockLocked = !!option.isLocked;
              const locked = (option.vipOnly && !canUseVipAvatar) || isUnlockLocked;
              return (
                <button
                  key={option.key}
                  type="button"
                  className={`profile-avatar-option ${selected ? 'profile-avatar-option--selected' : ''} ${locked ? 'profile-avatar-option--locked' : ''}`}
                  onClick={() => {
                    if (isUnlockLocked) {
                      message.warning(`您尚未解锁“${option.label}”头像`);
                      return;
                    }
                    if (option.vipOnly && !canUseVipAvatar) {
                      message.warning(`${option.label}头像仅 VIP 用户及以上可设置`);
                      return;
                    }
                    handleBuiltinAvatarSelect(option.key);
                  }}
                  disabled={avatarSaving}
                  aria-disabled={locked}
                >
                  <div style={{ position: 'relative', display: 'inline-flex' }}>
                    <UserAvatar
                      user={{ ...(user || {}), avatar_type: 'builtin', avatar_value: option.key }}
                      size={56}
                      locked={isUnlockLocked && !isAdmin}
                    />
                    {option.vipOnly && (
                      <div className="avatar-tag-overlay vip" title="VIP 专属">
                        👑
                      </div>
                    )}
                    {isUnlockLocked && isAdmin && (
                      <div className="avatar-tag-overlay lock" title="尚未解锁" style={{ background: '#ef4444', color: '#fff', fontSize: 10 }}>
                        🔒
                      </div>
                    )}
                    <div
                      className="avatar-zoom-trigger"
                      title={`预览 ${option.label}`}
                      onClick={(e) => {
                        e.stopPropagation();
                        setPreviewAvatar(option);
                      }}
                    >
                      🔍
                    </div>
                  </div>
                  <span className="avatar-option-label">{option.label}</span>
                </button>
              );
            })}
          </div>
        )}
      </div>
    );
  };

  const handleExport = async () => {
    try {
      const response = await apiClient.get('/api/progress/export', { responseType: 'blob' });
      const url = URL.createObjectURL(response.data);
      const link = document.createElement('a');
      link.href = url;
      link.download = 'my-progress.csv';
      link.click();
      URL.revokeObjectURL(url);
    } catch (error) {
      console.error('导出学习记录失败:', error);
      message.error('导出失败');
    }
  };

  const handleBuiltinAvatarSelect = async (avatarKey) => {
    if (avatarSaving) {
      return;
    }

    if (user?.avatar_type === 'builtin' && user?.avatar_value === avatarKey) {
      return;
    }

    setAvatarSaving(true);
    try {
      await setBuiltinAvatar(avatarKey);
    } finally {
      setAvatarSaving(false);
    }
  };

  const handleAvatarUpload = (event) => {
    const file = event.target.files?.[0];
    event.target.value = '';

    if (!file || avatarSaving) {
      return;
    }

    if (!canUseVipAvatar) {
      message.warning('仅 VIP 用户及以上可上传自定义头像');
      return;
    }

    const supportedTypes = ['image/png', 'image/jpeg', 'image/webp'];
    if (!supportedTypes.includes(file.type)) {
      message.warning('仅支持 PNG、JPG、WEBP 格式');
      return;
    }

    if (file.size > 2 * 1024 * 1024) {
      message.warning('头像大小不能超过 2MB');
      return;
    }

    // Intercept automatic upload and open circular cropping box
    const reader = new FileReader();
    reader.addEventListener('load', () => {
      setCropImage(reader.result);
      const baseName = file.name.replace(/\.[^.]+$/, '');
      setUploadFileName(`${baseName}.png`);
    });
    reader.readAsDataURL(file);
  };

  // Submit the cropped circular PNG Blob to backend
  const handleCropSubmit = async () => {
    if (!cropImage || !croppedAreaPixels) return;
    setAvatarSaving(true);
    try {
      // 1. Get transparent circular PNG Blob
      const croppedBlob = await getCroppedImg(cropImage, croppedAreaPixels);
      
      // 2. Wrap as File
      const croppedFile = new File([croppedBlob], uploadFileName, { type: 'image/png' });

      // 3. Upload via context hook
      await uploadAvatar(croppedFile);
      
      message.success('个性圆形头像裁剪并上传成功');
      setCropImage(null); // Close Cropper Modal
    } catch (error) {
      console.error('上传自定义裁剪圆形头像失败:', error);
      message.error('头像裁剪或上传失败，请重试');
    } finally {
      setAvatarSaving(false);
    }
  };

  return (
    <div className="profile-page">
      <style>{css}</style>


      <div className="profile-layout">
        <aside className="profile-sidebar">
          <ul className="profile-menu">
            <li className={`profile-menu-item ${activeTab === 'basic' ? 'active' : ''}`} onClick={() => setActiveTab('basic')}>
              <UserOutlined className="menu-icon" /> <span className="menu-text">基础资料修改</span>
            </li>
            <li className={`profile-menu-item ${activeTab === 'avatar' ? 'active' : ''}`} onClick={() => setActiveTab('avatar')}>
              <PictureOutlined className="menu-icon" /> <span className="menu-text">头像修改</span>
            </li>
            <li className={`profile-menu-item ${activeTab === 'export' ? 'active' : ''}`} onClick={() => setActiveTab('export')}>
              <DownloadOutlined className="menu-icon" /> <span className="menu-text">数据导出</span>
            </li>
          </ul>
        </aside>

        <main className="profile-content">
          {activeTab === 'basic' && (
            <Card className="profile-card">
        <div className="profile-card-title" style={{ marginBottom: '16px', fontSize: '18px', paddingBottom: '12px', borderBottom: '1px solid #f1f5f9' }}>
          <UserOutlined style={{ color: '#6366f1' }} /> 基础资料修改
        </div>
        <div className="profile-grid" style={{ maxWidth: '800px', margin: '0 auto', gap: '60px' }}>
          <Space direction="vertical" size={12} style={{ width: '100%' }}>
            <div className="profile-card-title" style={{ fontSize: '15px' }}>个人信息</div>
            <Form
              form={profileForm}
              layout="vertical"
              onFinish={updateProfile}
            >
              <Form.Item label="用户名" name="username" rules={[{ required: true }, { min: 3 }]} style={{ marginBottom: '12px' }}>
                <Input />
              </Form.Item>
              <Form.Item label="邮箱" name="email" rules={[{ required: true }, { type: 'email' }]} style={{ marginBottom: '12px' }}>
                <Input />
              </Form.Item>
              <Form.Item label="UID" name="uid" style={{ marginBottom: '20px' }}>
                <Input disabled />
              </Form.Item>
              <Button type="primary" htmlType="submit" style={{ width: '100%' }}>保存资料</Button>
            </Form>
          </Space>

          <Space direction="vertical" size={12} style={{ width: '100%' }}>
            <div className="profile-card-title" style={{ fontSize: '15px' }}><LockOutlined /> 修改密码</div>
            <Form
              form={passwordForm}
              layout="vertical"
              onFinish={async (values) => {
                if (values.newPassword !== values.confirmPassword) {
                  message.warning('两次输入的密码不一致');
                  return;
                }
                const success = await changePassword(values.currentPassword, values.newPassword);
                if (success) passwordForm.resetFields();
              }}
            >
              <Form.Item label="当前密码" name="currentPassword" rules={[{ required: true }]} style={{ marginBottom: '12px' }}>
                <Input.Password />
              </Form.Item>
              <Form.Item label="新密码" name="newPassword" rules={[{ required: true }, { min: 8 }]} style={{ marginBottom: '12px' }}>
                <Input.Password />
              </Form.Item>
              <Form.Item label="确认新密码" name="confirmPassword" rules={[{ required: true }]} style={{ marginBottom: '20px' }}>
                <Input.Password />
              </Form.Item>
              <Button type="primary" htmlType="submit" style={{ width: '100%' }}>更新密码</Button>
            </Form>
          </Space>
        </div>
      </Card>
      )}

      {activeTab === 'avatar' && (
      <Card className="profile-card">
        <div className="profile-card-title" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px', fontSize: '18px', paddingBottom: '12px', borderBottom: '1px solid #f1f5f9' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <UserOutlined style={{ color: '#6366f1' }} /> 头像修改
          </div>
          <Text type="secondary" style={{ fontSize: '13px', fontWeight: 'normal' }}>
            🔍 可放大预览，👑 标识的头像为 VIP 用户及以上专属，章节头像会随学习进度逐步解锁。
          </Text>
        </div>
        <div className="profile-avatar-panel">
          {/* Row 1 - Left Column: Profile Avatar Preview & Actions */}
          <div className="profile-avatar-preview">
            <UserAvatar
              user={user}
              size={104}
              previewable
              previewTitle={`${user?.username || '用户'} 的头像`}
            />
            <div className="profile-avatar-preview__copy">
              <Title level={4} style={{ margin: 0 }}>{user?.username}</Title>
              <Tag color={user?.avatar_type === 'upload' ? 'purple' : 'blue'} style={{ marginInlineEnd: 0, width: 'fit-content' }}>
                {user?.avatar_type === 'upload' ? '当前为上传头像' : '当前为内置头像'}
              </Tag>
            </div>

            <div className="profile-avatar-actions">
              <Button
                icon={<UploadOutlined />}
                onClick={() => {
                  if (!canUseVipAvatar) {
                    message.warning('仅 VIP 用户及以上可上传自定义头像');
                    return;
                  }
                  uploadInputRef.current?.click();
                }}
                loading={avatarSaving}
              >
                上传头像
              </Button>
              <Text type="secondary" style={{ fontSize: 12 }}>
                支持 PNG / JPG / WEBP，大小不超过 2MB
              </Text>
              <Text type="secondary" style={{ fontSize: 12 }}>
                上传自定义头像仅 VIP 用户及以上可用
              </Text>
              <input
                ref={uploadInputRef}
                type="file"
                accept="image/png,image/jpeg,image/webp"
                onChange={handleAvatarUpload}
                style={{ display: 'none' }}
              />
            </div>
          </div>

          {/* Row 1 - Right Column: VIP Avatars & Under-construction Unlock Previews */}
          <div className="profile-avatar-picker">
            <div className="profile-avatar-group-container">
              {!avatarCatalogLoading && renderVipAvatarGroup()}
            </div>
          </div>

          {/* Row 2 - Left Column: Chapter-unlocked Avatars */}
          <div className="profile-avatar-picker">
            <div className="profile-avatar-group-container">
              {!avatarCatalogLoading && renderChapterAvatarGroup()}
            </div>
          </div>

          {/* Row 2 - Right Column: Stage-unlocked (Normal) Avatars */}
          <div className="profile-avatar-picker">
            <div className="profile-avatar-group-container">
              {avatarCatalogLoading ? (
                <div className="profile-avatar-empty">头像列表加载中...</div>
              ) : (
                <>
                  {renderNormalAvatarGroup()}
                  {!groupedAvatars.chapter.length && !groupedAvatars.vip.length && !groupedAvatars.normal.length && (
                    <div className="profile-avatar-empty">当前没有可用的内置头像</div>
                  )}
                </>
              )}
            </div>
          </div>
        </div>
      </Card>
      )}

      {activeTab === 'export' && (
      <Card className="profile-card">
        <div className="profile-card-title" style={{ marginBottom: '20px', fontSize: '18px', paddingBottom: '12px', borderBottom: '1px solid #f1f5f9' }}>
          <DownloadOutlined style={{ color: '#6366f1' }} /> 数据导出
        </div>
        <div className="export-row">
          <div>
            <div className="profile-card-title" style={{ fontSize: '15px' }}>学习记录导出</div>
            <Text type="secondary">导出自己的学习状态、复习次数和最近学习时间。</Text>
          </div>
          <Button icon={<DownloadOutlined />} onClick={handleExport}>导出 CSV</Button>
        </div>
      </Card>
      )}
      </main>
      </div>

      {/* The Interactive Circular Cropper Modal (Drag & Crop to perfect transparent circle) */}
      <Modal
        title={
          <div className="modal-custom-title">
            <ScissorOutlined style={{ color: '#8b5cf6', fontSize: '18px' }} />
            <span>个性头像圆形高保真裁剪器</span>
          </div>
        }
        open={!!cropImage}
        onCancel={() => setCropImage(null)}
        footer={
          <div className="cropper-modal-footer">
            <Button size="large" onClick={() => setCropImage(null)} style={{ borderRadius: '8px' }}>
              取消
            </Button>
            <Button
              type="primary"
              size="large"
              loading={avatarSaving}
              icon={<CloudUploadOutlined />}
              onClick={handleCropSubmit}
              className="cropper-confirm-btn"
            >
              确认裁剪并上传
            </Button>
          </div>
        }
        width={550}
        destroyOnClose
        className="premium-cropper-modal"
      >
        {cropImage && (
          <div className="cropper-wrapper">
            <Text type="secondary" className="cropper-tip">
              💡 鼠标拖动图片可移动位置，使用滚轮或下方控制杆可缩放。圆圈内部区域将保留，圆圈外部将自动裁剪为透明。
            </Text>
            
            {/* The absolute Cropper container */}
            <div className="cropper-container-box">
              <Cropper
                image={cropImage}
                crop={crop}
                zoom={zoom}
                aspect={1}
                cropShape="round"
                showGrid={false}
                onCropChange={setCrop}
                onZoomChange={setZoom}
                onCropComplete={(croppedArea, croppedAreaPixels) => setCroppedAreaPixels(croppedAreaPixels)}
              />
            </div>

            {/* Slider zoom controller */}
            <div className="cropper-zoom-slider">
              <ZoomOutOutlined style={{ color: '#94a3b8', fontSize: '16px' }} />
              <Slider
                min={1}
                max={3}
                step={0.05}
                value={zoom}
                onChange={setZoom}
                tooltip={{ open: false }}
                className="zoom-slider-glass"
              />
              <ZoomInOutlined style={{ color: '#6366f1', fontSize: '16px' }} />
            </div>
          </div>
        )}
      </Modal>

      {/* Dynamic Built-in Avatar Preview Modal */}
      <Modal
        open={!!previewAvatar}
        onCancel={() => setPreviewAvatar(null)}
        footer={null}
        centered
        destroyOnClose
        width={440}
        title={`${previewAvatar?.label || '头像'} 预览`}
      >
        <div
          style={{
            display: 'grid',
            justifyItems: 'center',
            gap: 12,
            padding: '24px 0',
          }}
        >
          <UserAvatar
            user={{ ...(user || {}), avatar_type: 'builtin', avatar_value: previewAvatar?.key }}
            size={200}
            locked={!!previewAvatar?.isLocked && !isAdmin}
            style={{
              boxShadow: '0 8px 30px rgba(0,0,0,0.12)',
            }}
          />
          <span style={{ color: '#6b7280', fontSize: 14 }}>
            {previewAvatar?.label} {previewAvatar?.vipOnly ? '(VIP 专属)' : previewAvatar?.unlockSource === 'chapter_completion' ? '(章节解锁)' : ''} {previewAvatar?.isLocked ? '(尚未解锁)' : ''}
          </span>
        </div>
      </Modal>
    </div>
  );
};

const css = `
.profile-page {
  display: flex;
  flex-direction: column;
  gap: 20px;
  max-width: 1100px;
  margin: 0 auto;
}

.profile-layout {
  display: flex;
  gap: 32px;
  align-items: flex-start;
}

.profile-sidebar {
  width: 260px;
  flex-shrink: 0;
  background: rgba(255, 255, 255, 0.75);
  backdrop-filter: blur(20px);
  -webkit-backdrop-filter: blur(20px);
  border: 1px solid rgba(255, 255, 255, 0.5);
  border-radius: 24px;
  padding: 24px 16px;
  box-shadow: 0 20px 60px rgba(0, 0, 0, 0.05), 0 0 0 1px rgba(0,0,0,0.02);
  position: sticky;
  top: 24px;
}

.profile-menu {
  list-style: none;
  padding: 0;
  margin: 0;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.profile-menu-item {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 14px 16px;
  border-radius: 14px;
  color: #475569;
  font-weight: 600;
  font-size: 15px;
  cursor: pointer;
  transition: all 0.3s ease;
  user-select: none;
}

.profile-menu-item:hover {
  background: rgba(255, 255, 255, 0.8);
  color: #1e293b;
}

.profile-menu-item.active {
  background: linear-gradient(135deg, #6366f1 0%, #4f46e5 100%);
  color: white;
  box-shadow: 0 10px 20px rgba(99, 102, 241, 0.25);
}

.menu-icon {
  font-size: 18px;
  transition: transform 0.3s ease;
}

.profile-menu-item.active .menu-icon {
  transform: scale(1.1);
}

.profile-content {
  flex: 1;
  min-width: 0;
}

.profile-header,
.export-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
}

.profile-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 20px;
}

.profile-card {
  border-radius: 24px;
  background: rgba(255, 255, 255, 0.85);
  backdrop-filter: blur(20px);
  -webkit-backdrop-filter: blur(20px);
  border: 1px solid rgba(255, 255, 255, 0.5);
  box-shadow: 0 20px 60px rgba(0, 0, 0, 0.05), 0 0 0 1px rgba(0,0,0,0.02);
  padding: 12px;
}

.profile-card .ant-card-body {
  padding: 24px;
}

.profile-card .ant-input,
.profile-card .ant-input-password {
  padding: 12px 16px;
  border-radius: 12px;
  background: #ffffff;
  border: 1px solid #e2e8f0;
  box-shadow: 0 2px 4px rgba(0,0,0,0.02);
  transition: all 0.3s ease;
  font-size: 15px;
}

.profile-card .ant-input:focus,
.profile-card .ant-input-password.ant-input-affix-wrapper-focused {
  outline: none;
  border-color: #6366f1;
  box-shadow: 0 0 0 4px rgba(99, 102, 241, 0.1);
}

.profile-card .ant-btn-primary {
  background: linear-gradient(135deg, #6366f1 0%, #4f46e5 100%);
  border: none;
  border-radius: 12px;
  height: 48px;
  font-weight: 600;
  letter-spacing: 0.5px;
  box-shadow: 0 10px 20px rgba(99, 102, 241, 0.25);
  transition: all 0.3s ease;
  font-size: 16px;
}

.profile-card .ant-btn-primary:hover {
  transform: translateY(-2px);
  box-shadow: 0 14px 28px rgba(99, 102, 241, 0.3);
}

.profile-card .ant-btn-primary:active {
  transform: translateY(0);
}

.profile-card-title {
  display: flex;
  align-items: center;
  gap: 8px;
  color: #1e293b;
  font-weight: 700;
  font-size: 16px;
}

.profile-avatar-panel {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 24px;
  align-items: stretch;
}

.profile-avatar-preview {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 20px;
  padding: 32px 24px;
  border-radius: 20px;
  background: linear-gradient(180deg, rgba(99, 102, 241, 0.07) 0%, rgba(255, 255, 255, 0.92) 100%);
  border: 1px solid rgba(99, 102, 241, 0.12);
  width: 100%;
  box-sizing: border-box;
}

.profile-avatar-preview__copy {
  display: flex;
  flex-direction: column;
  align-items: center;
  text-align: center;
  gap: 8px;
}

.profile-avatar-actions {
  display: flex;
  flex-direction: column;
  align-items: center;
  text-align: center;
  gap: 12px;
  width: 100%;
}

.profile-avatar-picker {
  min-width: 0;
}

.profile-avatar-group-container {
  display: flex;
  flex-direction: column;
  gap: 20px;
}

.profile-avatar-unlock-preview {
  display: grid;
  gap: 10px;
  padding: 16px 18px;
  border-radius: 18px;
  background: linear-gradient(180deg, rgba(99, 102, 241, 0.08) 0%, rgba(255, 255, 255, 0.94) 100%);
  border: 1px solid rgba(99, 102, 241, 0.14);
}

.profile-avatar-unlock-preview__title {
  font-size: 13px;
  font-weight: 800;
  color: #4f46e5;
}

.profile-avatar-unlock-preview__body {
  font-size: 13px;
  line-height: 1.6;
  color: #475569;
}

.profile-avatar-group-section {
  display: flex;
  flex-direction: column;
}

.profile-avatar-group-title {
  font-size: 14px;
  font-weight: 800;
  color: #475569;
  margin-bottom: 12px;
  display: flex;
  align-items: center;
  gap: 8px;
}

.profile-avatar-group-title::before {
  content: '';
  display: inline-block;
  width: 4px;
  height: 14px;
  border-radius: 2px;
  background: #6366f1;
}

.profile-avatar-group-title.vip {
  color: #d97706;
}

.profile-avatar-group-title.vip::before {
  background: linear-gradient(135deg, #f59e0b 0%, #d97706 100%);
}

.profile-avatar-group-title.chapter {
  color: #0f766e;
}

.profile-avatar-group-title.chapter::before {
  background: linear-gradient(135deg, #14b8a6 0%, #0f766e 100%);
}

.profile-avatar-grid {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 12px;
  max-height: 232px;
  overflow-y: auto;
  padding-right: 6px;
  margin-right: -6px;
  padding-bottom: 2px;
}

.profile-avatar-grid::-webkit-scrollbar {
  width: 6px;
}

.profile-avatar-grid::-webkit-scrollbar-track {
  background: rgba(0, 0, 0, 0.01);
  border-radius: 3px;
}

.profile-avatar-grid::-webkit-scrollbar-thumb {
  background: rgba(99, 102, 241, 0.16);
  border-radius: 3px;
  transition: all 0.2s ease;
}

.profile-avatar-grid::-webkit-scrollbar-thumb:hover {
  background: rgba(99, 102, 241, 0.36);
}

.profile-avatar-option {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
  padding: 12px 6px;
  border-radius: 18px;
  border: 1px solid rgba(148, 163, 184, 0.18);
  background: rgba(255, 255, 255, 0.82);
  color: #475569;
  font-size: 13px;
  font-weight: 600;
  line-height: 1.4;
  text-align: center;
  cursor: pointer;
  transition: all 0.2s ease;
}

.profile-avatar-option:hover {
  border-color: rgba(99, 102, 241, 0.28);
  transform: translateY(-1px);
  box-shadow: 0 12px 24px rgba(99, 102, 241, 0.08);
}

.profile-avatar-option--selected {
  border-color: rgba(99, 102, 241, 0.45);
  background: rgba(238, 242, 255, 0.9);
  box-shadow: 0 12px 24px rgba(99, 102, 241, 0.12);
}

.profile-avatar-option--locked {
  position: relative;
  border-style: dashed;
  cursor: not-allowed;
}

.profile-avatar-option--locked:hover {
  transform: none;
  box-shadow: none;
}

.avatar-tag-overlay {
  position: absolute;
  top: -4px;
  right: -4px;
  width: 20px;
  height: 20px;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 11px;
  box-shadow: 0 4px 10px rgba(0, 0, 0, 0.16);
  border: 1px solid rgba(255, 255, 255, 0.9);
  z-index: 2;
  animation: overlayPulse 2s infinite ease-in-out;
}

.avatar-tag-overlay.vip {
  background: linear-gradient(135deg, #f59e0b 0%, #d97706 100%);
  color: white;
}

.avatar-zoom-trigger {
  position: absolute;
  bottom: -2px;
  right: -2px;
  width: 18px;
  height: 18px;
  border-radius: 50%;
  background: rgba(255, 255, 255, 0.95);
  border: 1px solid rgba(148, 163, 184, 0.32);
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 9px;
  color: #475569;
  cursor: zoom-in;
  box-shadow: 0 2px 6px rgba(0, 0, 0, 0.08);
  transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1);
  z-index: 3;
}

.avatar-zoom-trigger:hover {
  background: #6366f1;
  color: white;
  border-color: #6366f1;
  transform: scale(1.15);
}

@keyframes overlayPulse {
  0% { transform: scale(1); }
  50% { transform: scale(1.06); }
  100% { transform: scale(1); }
}

.avatar-option-label {
  margin-top: 4px;
  font-size: 12.5px;
  font-weight: 700;
  color: #475569;
  white-space: nowrap;
  max-width: 100%;
  overflow: hidden;
  text-overflow: ellipsis;
}

.profile-avatar-option:disabled {
  cursor: wait;
  opacity: 0.75;
}

.profile-avatar-empty {
  padding: 24px 18px;
  border-radius: 18px;
  background: rgba(255, 255, 255, 0.7);
  border: 1px dashed rgba(148, 163, 184, 0.28);
  color: #64748b;
  font-size: 13px;
  text-align: center;
}

/* Interactive Circular Cropper Modal Custom Styles */
.modal-custom-title {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 16px;
  font-weight: 700;
}

.cropper-wrapper {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.cropper-tip.ant-typography {
  font-size: 13px;
  color: #64748b;
  background: #f1f5f9;
  padding: 8px 12px;
  border-radius: 8px;
  line-height: 1.5;
  border-left: 3px solid #8b5cf6;
}

.cropper-container-box {
  position: relative;
  width: 100%;
  height: 320px;
  background: #0f172a;
  border-radius: 16px;
  overflow: hidden;
  border: 1px solid rgba(255,255,255,0.08);
}

.cropper-zoom-slider {
  display: flex;
  align-items: center;
  gap: 16px;
  padding: 8px 12px;
  background: #f8fafc;
  border: 1px solid #e2e8f0;
  border-radius: 12px;
}

.zoom-slider-glass.ant-slider {
  flex: 1;
  margin: 0;
}

.cropper-modal-footer {
  display: flex;
  justify-content: flex-end;
  gap: 12px;
  width: 100%;
}

.cropper-confirm-btn.ant-btn {
  background: linear-gradient(135deg, #6366f1 0%, #8b5cf6 100%);
  border: none;
  border-radius: 8px;
  font-weight: 700;
}

.cropper-confirm-btn.ant-btn:hover {
  background: linear-gradient(135deg, #4f46e5 0%, #7c3aed 100%);
}

@media (max-width: 920px) {
  .profile-grid,
  .profile-avatar-panel {
    grid-template-columns: 1fr;
  }
}

@media (max-width: 800px) {
  .profile-layout {
    flex-direction: column;
  }
  .profile-sidebar {
    width: 100%;
    position: relative;
    top: 0;
  }
  .profile-header,
  .export-row {
    align-items: flex-start;
    flex-direction: column;
  }
}

@media (max-width: 640px) {
  .profile-avatar-grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}
`;

export default Profile;
