import React, { useState } from 'react';
import { Avatar, Modal } from 'antd';
import { UserOutlined } from '@ant-design/icons';
import { getAvatarFallbackText, getAvatarSrc } from '../utils/avatars';

const UserAvatar = ({ user, size = 40, style, previewable = false, previewTitle, ...props }) => {
  const [previewOpen, setPreviewOpen] = useState(false);
  const src = getAvatarSrc(user);
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
          borderRadius: '50%',
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
          }}
        >
          <img
            src={src}
            alt={title}
            style={{
              width: '100%',
              maxWidth: 360,
              maxHeight: '70vh',
              objectFit: 'contain',
              borderRadius: 24,
              background: 'rgba(248, 250, 252, 0.88)',
            }}
          />
        </div>
      </Modal>
    </>
  );
};

export default UserAvatar;
