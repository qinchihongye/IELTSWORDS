import React from 'react';
import { Avatar, Button, Modal, Tag, Typography } from 'antd';
import { CrownOutlined, GiftOutlined } from '@ant-design/icons';
import config from '../config/settings';

const { Text, Title } = Typography;

const builtinApiBase = config.api.baseURL.replace(/\/$/, '');

const UNLOCK_SOURCE_LABELS = {
  chapter_completion: '章节解锁',
  group_completion: 'Group 解锁',
  words_mastered: '阶段解锁',
  vip: 'VIP 解锁',
  public: '默认开放',
  super_admin: '系统可用',
};

const getAvatarSrc = (url = '') => {
  if (!url) {
    return '';
  }
  if (/^(https?:|data:)/.test(url)) {
    return url;
  }
  return `${builtinApiBase}${url.startsWith('/') ? url : `/${url}`}`;
};

const AvatarUnlockModal = ({ open, avatars = [], onClose }) => {
  const isMultiple = avatars.length > 1;

  return (
    <Modal
      open={open}
      onCancel={onClose}
      footer={[
        <Button key="ok" type="primary" onClick={onClose}>
          我知道了
        </Button>,
      ]}
      centered
      destroyOnHidden
      width={isMultiple ? 640 : 420}
      title={null}
    >
      <div
        style={{
          display: 'grid',
          gap: 18,
          paddingTop: 8,
        }}
      >
        <div
          style={{
            display: 'grid',
            justifyItems: 'center',
            gap: 10,
            textAlign: 'center',
          }}
        >
          <div
            style={{
              width: 56,
              height: 56,
              borderRadius: '50%',
              display: 'grid',
              placeItems: 'center',
              background: 'linear-gradient(135deg, rgba(99,102,241,0.16), rgba(236,72,153,0.16))',
              color: '#4f46e5',
            }}
          >
            <GiftOutlined style={{ fontSize: 24 }} />
          </div>
          <Title level={4} style={{ margin: 0 }}>
            {isMultiple ? `解锁了 ${avatars.length} 个新头像` : '解锁了新头像'}
          </Title>
          <Text type="secondary">
            {isMultiple ? '继续学习，后面还有更多头像等你解锁。' : '继续保持，现在可以去头像页面查看它了。'}
          </Text>
        </div>

        <div
          style={{
            display: 'grid',
            gridTemplateColumns: isMultiple ? 'repeat(auto-fit, minmax(140px, 1fr))' : '1fr',
            gap: 14,
          }}
        >
          {avatars.map((avatar) => (
            <div
              key={avatar.key}
              style={{
                border: '1px solid rgba(148, 163, 184, 0.2)',
                borderRadius: 16,
                padding: isMultiple ? '18px 14px' : '22px 18px',
                background: 'linear-gradient(180deg, rgba(255,255,255,0.96), rgba(248,250,252,0.96))',
                display: 'grid',
                justifyItems: 'center',
                gap: 10,
                textAlign: 'center',
              }}
            >
              <div style={{ position: 'relative' }}>
                <Avatar
                  size={isMultiple ? 72 : 104}
                  src={getAvatarSrc(avatar.url)}
                  style={{
                    boxShadow: '0 10px 30px rgba(15, 23, 42, 0.12)',
                    background: '#eef2ff',
                  }}
                />
                {avatar.vip_only ? (
                  <div
                    title="VIP 专属"
                    style={{
                      position: 'absolute',
                      right: -4,
                      bottom: -2,
                      width: 24,
                      height: 24,
                      borderRadius: '50%',
                      display: 'grid',
                      placeItems: 'center',
                      background: '#f59e0b',
                      color: '#fff',
                      boxShadow: '0 6px 18px rgba(245, 158, 11, 0.28)',
                    }}
                  >
                    <CrownOutlined style={{ fontSize: 12 }} />
                  </div>
                ) : null}
              </div>

              <div style={{ display: 'grid', gap: 6, justifyItems: 'center' }}>
                <Text strong style={{ fontSize: isMultiple ? 14 : 16, color: '#111827' }}>
                  {avatar.label}
                </Text>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, justifyContent: 'center' }}>
                  <Tag color="blue" style={{ marginInlineEnd: 0 }}>
                    {avatar.variety}
                  </Tag>
                  <Tag style={{ marginInlineEnd: 0 }}>
                    {UNLOCK_SOURCE_LABELS[avatar.unlock_source] || '已解锁'}
                  </Tag>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </Modal>
  );
};

export default AvatarUnlockModal;
