import React, { useEffect, useRef, useState, useMemo } from 'react';
import { Button, Card, Form, Input, Space, Tag, Typography, message, Modal, Slider } from 'antd';
import {
  DownloadOutlined,
  LockOutlined,
  UploadOutlined,
  UserOutlined,
  ScissorOutlined,
  CloudUploadOutlined,
  ZoomInOutlined,
  ZoomOutOutlined
} from '@ant-design/icons';
import Cropper from 'react-easy-crop';
import apiClient from '../api/client';
import UserAvatar from '../components/UserAvatar';
import { useAuth } from '../context/AuthContext';
import { BUILTIN_AVATAR_OPTIONS, fetchDynamicBuiltinAvatars } from '../utils/avatars';
import { hasMinRole } from '../utils/roles';

const { Title, Text } = Typography;

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
  const canUseVipAvatar = hasMinRole(user, 'premium_user');

  // Cropper states
  const [cropImage, setCropImage] = useState(null);
  const [crop, setCrop] = useState({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const [croppedAreaPixels, setCroppedAreaPixels] = useState(null);
  const [uploadFileName, setUploadFileName] = useState('');
  const [avatarOptions, setAvatarOptions] = useState(BUILTIN_AVATAR_OPTIONS);
  const [previewAvatar, setPreviewAvatar] = useState(null);

  const groupedAvatars = useMemo(() => {
    const normal = [];
    const vip = [];
    avatarOptions.forEach((option) => {
      if (option.vipOnly) {
        vip.push(option);
      } else {
        normal.push(option);
      }
    });
    return { normal, vip };
  }, [avatarOptions]);

  useEffect(() => {
    profileForm.setFieldsValue({
      username: user?.username,
      email: user?.email,
    });
  }, [profileForm, user?.email, user?.username]);

  useEffect(() => {
    const loadDynamic = async () => {
      await fetchDynamicBuiltinAvatars();
      setAvatarOptions([...BUILTIN_AVATAR_OPTIONS]);
    };
    loadDynamic();
  }, []);

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

      <div className="profile-header">
        <div>
          <Title level={2} style={{ margin: 0 }}>个人资料</Title>
          <Text type="secondary">管理账户信息、头像、密码和个人学习数据。</Text>
        </div>
      </div>

      <Card className="profile-card">
        <div className="profile-avatar-panel">
          <div className="profile-avatar-preview">
            <UserAvatar
              user={user}
              size={104}
              previewable
              previewTitle={`${user?.username || '用户'} 的头像`}
            />
            <div className="profile-avatar-preview__copy">
              <Title level={4} style={{ margin: 0 }}>{user?.username}</Title>
              <Text type="secondary">{user?.email}</Text>
              {user?.uid && (
                <Text type="secondary" style={{ fontSize: 12, fontFamily: 'monospace' }}>
                  UID: {user.uid}
                </Text>
              )}
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

          <div className="profile-avatar-picker">
            <div className="profile-card-title"><UserOutlined /> 内置头像</div>
            <Text type="secondary" style={{ display: 'block', marginBottom: 6 }}>
              这里内置了 {avatarOptions.length} 个头像，点击头像可立即切换。
            </Text>
            <Text type="secondary" style={{ display: 'block', marginBottom: 16 }}>
              点击右下角 🔍 可放大预览，带有 👑 标识的头像为 VIP 用户及以上专属。
            </Text>

            <div className="profile-avatar-group-container">
              <div className="profile-avatar-group-section">
                <div className="profile-avatar-group-title vip">VIP 专属头像</div>
                <div className="profile-avatar-grid">
                  {groupedAvatars.vip.map((option) => {
                    const selected = user?.avatar_type === 'builtin' && user?.avatar_value === option.key;
                    const locked = option.vipOnly && !canUseVipAvatar;
                    return (
                      <button
                        key={option.key}
                        type="button"
                        className={`profile-avatar-option ${selected ? 'profile-avatar-option--selected' : ''} ${locked ? 'profile-avatar-option--locked' : ''}`}
                        onClick={() => {
                          if (locked) {
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
                          />
                          {option.vipOnly && (
                            <div className="avatar-tag-overlay vip" title="VIP 专属">
                              👑
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

              <div className="profile-avatar-group-section" style={{ marginTop: '20px' }}>
                <div className="profile-avatar-group-title">普通头像</div>
                <div className="profile-avatar-grid">
                  {groupedAvatars.normal.map((option) => {
                    const selected = user?.avatar_type === 'builtin' && user?.avatar_value === option.key;
                    const locked = option.vipOnly && !canUseVipAvatar;
                    return (
                      <button
                        key={option.key}
                        type="button"
                        className={`profile-avatar-option ${selected ? 'profile-avatar-option--selected' : ''} ${locked ? 'profile-avatar-option--locked' : ''}`}
                        onClick={() => {
                          if (locked) {
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
                          />
                          {option.vipOnly && (
                            <div className="avatar-tag-overlay vip" title="VIP 专属">
                              👑
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
            </div>
          </div>
        </div>
      </Card>

      <div className="profile-grid">
        <Card className="profile-card">
          <Space direction="vertical" size={18} style={{ width: '100%' }}>
            <div className="profile-card-title"><UserOutlined /> 基础资料</div>
            <Form
              form={profileForm}
              layout="vertical"
              onFinish={updateProfile}
            >
              <Form.Item label="用户名" name="username" rules={[{ required: true }, { min: 3 }]}>
                <Input />
              </Form.Item>
              <Form.Item label="邮箱" name="email" rules={[{ required: true }, { type: 'email' }]}>
                <Input />
              </Form.Item>
              <Button type="primary" htmlType="submit">保存资料</Button>
            </Form>
          </Space>
        </Card>

        <Card className="profile-card">
          <Space direction="vertical" size={18} style={{ width: '100%' }}>
            <div className="profile-card-title"><LockOutlined /> 修改密码</div>
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
              <Form.Item label="当前密码" name="currentPassword" rules={[{ required: true }]}>
                <Input.Password />
              </Form.Item>
              <Form.Item label="新密码" name="newPassword" rules={[{ required: true }, { min: 8 }]}>
                <Input.Password />
              </Form.Item>
              <Form.Item label="确认新密码" name="confirmPassword" rules={[{ required: true }]}>
                <Input.Password />
              </Form.Item>
              <Button type="primary" htmlType="submit">更新密码</Button>
            </Form>
          </Space>
        </Card>
      </div>

      <Card className="profile-card">
        <div className="export-row">
          <div>
            <div className="profile-card-title">学习记录导出</div>
            <Text type="secondary">导出自己的学习状态、复习次数和最近学习时间。</Text>
          </div>
          <Button icon={<DownloadOutlined />} onClick={handleExport}>导出 CSV</Button>
        </div>
      </Card>

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
            style={{
              boxShadow: '0 8px 30px rgba(0,0,0,0.12)',
            }}
          />
          <span style={{ color: '#6b7280', fontSize: 14 }}>
            {previewAvatar?.label} {previewAvatar?.vipOnly ? '(VIP 专属)' : ''}
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
  border-radius: 8px;
  background: rgba(255,255,255,0.72);
  border: 1px solid rgba(226,232,240,0.8);
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
  grid-template-columns: minmax(260px, 320px) minmax(0, 1fr);
  gap: 24px;
  align-items: start;
}

.profile-avatar-preview {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 16px;
  padding: 24px;
  border-radius: 20px;
  background: linear-gradient(180deg, rgba(99, 102, 241, 0.07) 0%, rgba(255, 255, 255, 0.92) 100%);
  border: 1px solid rgba(99, 102, 241, 0.12);
}

.profile-avatar-preview__copy {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.profile-avatar-actions {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.profile-avatar-picker {
  min-width: 0;
}

.profile-avatar-group-container {
  display: flex;
  flex-direction: column;
  gap: 20px;
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

.profile-avatar-grid {
  display: grid;
  grid-template-columns: repeat(5, minmax(0, 1fr));
  gap: 12px;
}

.profile-avatar-option {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
  padding: 12px 8px;
  border-radius: 18px;
  border: 1px solid rgba(148, 163, 184, 0.18);
  background: rgba(255, 255, 255, 0.82);
  color: #475569;
  font-size: 13px;
  font-weight: 600;
  line-height: 1.4;
  text-align: center;
  word-break: break-word;
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
  font-size: 13px;
  font-weight: 700;
  color: #475569;
}

.profile-avatar-option:disabled {
  cursor: wait;
  opacity: 0.75;
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
