import React, { useState } from 'react';
import { Avatar, Modal } from 'antd';
import { UserOutlined } from '@ant-design/icons';
import { getAvatarFallbackText, getAvatarSrc, getAvatarName } from '../utils/avatars';

const UserAvatar = ({ user, size = 40, style, previewable = false, previewTitle, src: customSrc, ...props }) => {
  const [previewOpen, setPreviewOpen] = useState(false);
  const src = customSrc || getAvatarSrc(user);
  const title = previewTitle || user?.username || user?.email || '头像预览';

  const avatarNode = (
    <Avatar
      size={size}
      src={src}
      icon={!src ? <UserOutlined /> : undefined}
      style={{
        background: 'rgba(99, 102, 241, 0.12)',
        color: '#4f46e5',
        flexShrink: 0,
        ...style,
      }}
      {...props}
    >
      {!src ? getAvatarFallbackText(user?.username || user?.email || '') : null}
    </Avatar>
  );

  if (!previewable || !src) {
    return avatarNode;
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setPreviewOpen(true)}
        aria-label={`查看 ${title} 头像`}
        style={{
          padding: 0,
          border: 'none',
          background: 'transparent',
          display: 'inline-flex',
          alignItems: 'center',
          justifyContent: 'center',
          borderRadius: style?.borderRadius || '50%',
          cursor: 'zoom-in',
        }}
      >
        {avatarNode}
      </button>

      <Modal
        open={previewOpen}
        onCancel={() => setPreviewOpen(false)}
        footer={null}
        centered
        destroyOnHidden
        width={440}
        title={title}
      >
        <div
          style={{
            display: 'grid',
            justifyItems: 'center',
            gap: 12,
            padding: '24px 0',
          }}
        >
          <Avatar
            size={200}
            src={src}
            shape="circle"
            style={{
              background: style?.background || undefined,
              boxShadow: style?.background === 'transparent' ? 'none' : '0 8px 30px rgba(0,0,0,0.12)',
            }}
          />
          <span style={{ color: '#6b7280', fontSize: 14 }}>{customSrc ? title : getAvatarName(user)}</span>
        </div>
      </Modal>
    </>
  );
};

export default UserAvatar;
