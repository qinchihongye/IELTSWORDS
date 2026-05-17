import React, { useEffect, useRef, useState } from 'react';
import { Button, Card, Form, Input, Space, Tag, Typography, message } from 'antd';
import { DownloadOutlined, LockOutlined, UploadOutlined, UserOutlined } from '@ant-design/icons';
import apiClient from '../api/client';
import UserAvatar from '../components/UserAvatar';
import { useAuth } from '../context/AuthContext';
import { BUILTIN_AVATAR_OPTIONS } from '../utils/avatars';
import { hasMinRole } from '../utils/roles';
const { Title, Text } = Typography;

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

  useEffect(() => {
    profileForm.setFieldsValue({
      username: user?.username,
      email: user?.email,
    });
  }, [profileForm, user?.email, user?.username]);

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

  const handleAvatarUpload = async (event) => {
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

    setAvatarSaving(true);
    try {
      await uploadAvatar(file);
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
            <UserAvatar user={user} size={104} />
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
            <Text type="secondary" style={{ display: 'block', marginBottom: 16 }}>
              这里内置了 {BUILTIN_AVATAR_OPTIONS.length} 个头像，点一下就能立即切换。
            </Text>
            <Text type="secondary" style={{ display: 'block', marginBottom: 16 }}>
              花舞霓裳为 VIP 用户及以上专属头像。
            </Text>

            <div className="profile-avatar-grid">
              {BUILTIN_AVATAR_OPTIONS.map((option) => {
                const selected = user?.avatar_type === 'builtin' && user?.avatar_value === option.key;
                const locked = option.vipOnly && !canUseVipAvatar;
                return (
                  <button
                    key={option.key}
                    type="button"
                    className={`profile-avatar-option ${selected ? 'profile-avatar-option--selected' : ''} ${locked ? 'profile-avatar-option--locked' : ''}`}
                    onClick={() => {
                      if (locked) {
                        message.warning('花舞霓裳头像仅 VIP 用户及以上可设置');
                        return;
                      }
                      handleBuiltinAvatarSelect(option.key);
                    }}
                    disabled={avatarSaving}
                    aria-disabled={locked}
                  >
                    <UserAvatar
                      user={{ ...(user || {}), avatar_type: 'builtin', avatar_value: option.key }}
                      size={56}
                    />
                    {option.vipOnly ? <span className="profile-avatar-option__badge">VIP 专属</span> : null}
                    <span>{option.label}</span>
                  </button>
                );
              })}
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

.profile-avatar-option__badge {
  padding: 2px 8px;
  border-radius: 999px;
  background: rgba(59, 130, 246, 0.12);
  color: #2563eb;
  font-size: 11px;
  font-weight: 700;
}

.profile-avatar-option:disabled {
  cursor: wait;
  opacity: 0.75;
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
