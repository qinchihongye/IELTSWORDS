import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Button, Input, Modal, Select, Space, Switch, Table, Tag, Typography, message } from 'antd';
import { DeleteOutlined, DownloadOutlined, KeyOutlined, ReloadOutlined } from '@ant-design/icons';
import apiClient from '../api/client';
import { useAuth } from '../context/AuthContext';
import { getRoleLevel, hasMinRole, ROLE_COLORS, ROLE_LABELS, ROLE_OPTIONS } from '../utils/roles';
import UserAvatar from '../components/UserAvatar';

const { Title, Text } = Typography;

const AdminUsers = () => {
  const { user } = useAuth();
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(false);
  const [savingUserId, setSavingUserId] = useState(null);
  const [passwordModalUser, setPasswordModalUser] = useState(null);
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');

  const isSuperAdmin = hasMinRole(user, 'super_admin');

  const fetchUsers = useCallback(async () => {
    setLoading(true);
    try {
      const response = await apiClient.get('/api/admin/users');
      setUsers(response.data);
    } catch (error) {
      console.error('获取用户列表失败:', error);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void fetchUsers();
  }, [fetchUsers]);

  const updateUserInList = useCallback((updatedUser) => {
    setUsers((currentUsers) => (
      currentUsers.map((item) => (item.id === updatedUser.id ? updatedUser : item))
    ));
  }, []);

  const canManageUser = useCallback((targetUser) => {
    if (!user || user.id === targetUser.id) {
      return false;
    }

    return getRoleLevel(user.role) > getRoleLevel(targetUser.role);
  }, [user]);

  const handleActiveChange = useCallback(async (targetUser, isActive) => {
    setSavingUserId(targetUser.id);
    try {
      const response = await apiClient.patch(`/api/admin/users/${targetUser.id}/active`, {
        is_active: isActive,
      });
      updateUserInList(response.data);
      message.success(isActive ? '用户已启用' : '用户已禁用');
    } catch (error) {
      console.error('更新用户状态失败:', error);
    } finally {
      setSavingUserId(null);
    }
  }, [updateUserInList]);

  const handleRoleChange = useCallback(async (targetUser, role) => {
    setSavingUserId(targetUser.id);
    try {
      const response = await apiClient.patch(`/api/admin/users/${targetUser.id}/role`, { role });
      updateUserInList(response.data);
      message.success('角色已更新');
    } catch (error) {
      console.error('更新用户角色失败:', error);
    } finally {
      setSavingUserId(null);
    }
  }, [updateUserInList]);

  const handleDeleteUser = useCallback((targetUser) => {
    Modal.confirm({
      title: '确认删除用户',
      content: `确定要删除用户“${targetUser.username}”吗？删除后无法恢复。`,
      okText: '确认删除',
      cancelText: '取消',
      okButtonProps: {
        danger: true,
        loading: savingUserId === targetUser.id,
      },
      onOk: async () => {
        setSavingUserId(targetUser.id);
        try {
          const response = await apiClient.delete(`/api/admin/users/${targetUser.id}`);
          await fetchUsers();
          message.success(response.data?.message || '用户已删除');
        } catch (error) {
          console.error('删除用户失败:', error);
          throw error;
        } finally {
          setSavingUserId(null);
        }
      },
    });
  }, [fetchUsers, savingUserId]);

  const openPasswordModal = useCallback((targetUser) => {
    setPasswordModalUser(targetUser);
    setNewPassword('');
    setConfirmPassword('');
  }, []);

  const closePasswordModal = useCallback(() => {
    setPasswordModalUser(null);
    setNewPassword('');
    setConfirmPassword('');
  }, []);

  const handlePasswordReset = useCallback(async () => {
    if (!passwordModalUser) {
      return;
    }

    if (newPassword.length < 8) {
      message.warning('密码至少 8 位');
      return;
    }

    if (newPassword !== confirmPassword) {
      message.warning('两次输入的密码不一致');
      return;
    }

    setSavingUserId(passwordModalUser.id);
    try {
      const response = await apiClient.patch(`/api/admin/users/${passwordModalUser.id}/password`, {
        password: newPassword,
      });
      updateUserInList(response.data);
      message.success('密码已重置');
      closePasswordModal();
    } catch (error) {
      console.error('重置用户密码失败:', error);
    } finally {
      setSavingUserId(null);
    }
  }, [closePasswordModal, confirmPassword, newPassword, passwordModalUser, updateUserInList]);

  const handleExportUsers = useCallback(async () => {
    try {
      const response = await apiClient.get('/api/admin/export/users', { responseType: 'blob' });
      const url = URL.createObjectURL(response.data);
      const link = document.createElement('a');
      link.href = url;
      link.download = 'users.csv';
      link.click();
      URL.revokeObjectURL(url);
    } catch (error) {
      console.error('导出用户失败:', error);
    }
  }, []);

  const columns = useMemo(() => [
    {
      title: '用户',
      dataIndex: 'username',
      key: 'username',
      render: (username, record) => (
        <div className="admin-user-cell">
          <UserAvatar user={record} size={42} />
          <div className="admin-user-cell__copy">
            <Text strong>{username}</Text>
            <Text type="secondary">{record.email}</Text>
          </div>
        </div>
      ),
    },
    {
      title: 'UID',
      dataIndex: 'uid',
      key: 'uid',
      width: 160,
      render: (uid) => uid ? <Text style={{ fontFamily: 'monospace', fontSize: 13 }}>{uid}</Text> : <Text type="secondary">-</Text>,
    },
    {
      title: '角色',
      dataIndex: 'role',
      key: 'role',
      width: 220,
      render: (role, record) => (
        isSuperAdmin && user?.id !== record.id ? (
          <Select
            value={role}
            options={ROLE_OPTIONS}
            onChange={(nextRole) => handleRoleChange(record, nextRole)}
            disabled={savingUserId === record.id}
            style={{ width: 160 }}
          />
        ) : (
          <Tag color={ROLE_COLORS[role] || 'default'}>{ROLE_LABELS[role] || role}</Tag>
        )
      ),
    },
    {
      title: '状态',
      dataIndex: 'is_active',
      key: 'is_active',
      width: 130,
      render: (isActive, record) => (
        <Switch
          checked={isActive}
          checkedChildren="启用"
          unCheckedChildren="禁用"
          disabled={!canManageUser(record) || savingUserId === record.id}
          onChange={(checked) => handleActiveChange(record, checked)}
        />
      ),
    },
    {
      title: '创建时间',
      dataIndex: 'created_at',
      key: 'created_at',
      width: 190,
      render: (value) => value ? new Date(value).toLocaleString() : '-',
    },
    {
      title: '最近登录',
      dataIndex: 'last_login',
      key: 'last_login',
      width: 190,
      render: (value) => value ? new Date(value).toLocaleString() : '-',
    },
    {
      title: '操作',
      key: 'actions',
      width: 240,
      render: (_, record) => (
        <Space>
          <Button
            icon={<KeyOutlined />}
            disabled={!canManageUser(record) || savingUserId === record.id}
            onClick={() => openPasswordModal(record)}
          >
            重置密码
          </Button>
          <Button
            danger
            icon={<DeleteOutlined />}
            disabled={!canManageUser(record) || savingUserId === record.id}
            onClick={() => handleDeleteUser(record)}
          >
            删除
          </Button>
        </Space>
      ),
    },
  ], [canManageUser, handleActiveChange, handleDeleteUser, handleRoleChange, isSuperAdmin, openPasswordModal, savingUserId, user?.id]);

  return (
    <div className="admin-users-page">
      <style>{css}</style>

      <div className="admin-users-header">
        <div>
          <Title level={2} style={{ margin: 0 }}>用户管理</Title>
          <Text type="secondary">管理普通用户、VIP 用户和管理员账户。</Text>
        </div>
        <Space>
          <Tag color={ROLE_COLORS[user?.role] || 'default'}>
            当前角色：{ROLE_LABELS[user?.role] || '普通用户'}
          </Tag>
          <Button icon={<DownloadOutlined />} onClick={handleExportUsers}>
            导出用户
          </Button>
          <Button icon={<ReloadOutlined />} onClick={fetchUsers} loading={loading}>
            刷新
          </Button>
        </Space>
      </div>

      <div className="admin-users-table">
        <Table
          rowKey="id"
          columns={columns}
          dataSource={users}
          loading={loading}
          pagination={{ pageSize: 10, showSizeChanger: false }}
        />
      </div>

      <Modal
        title={`重置密码：${passwordModalUser?.username || ''}`}
        open={!!passwordModalUser}
        onCancel={closePasswordModal}
        onOk={handlePasswordReset}
        okText="更新密码"
        cancelText="取消"
        confirmLoading={savingUserId === passwordModalUser?.id}
        destroyOnHidden
      >
        <div className="password-reset-panel">
          <Input.Password
            value={newPassword}
            onChange={(event) => setNewPassword(event.target.value)}
            placeholder="新密码（至少 8 位）"
          />
          <Input.Password
            value={confirmPassword}
            onChange={(event) => setConfirmPassword(event.target.value)}
            placeholder="确认新密码"
          />
        </div>
      </Modal>
    </div>
  );
};

const css = `
.admin-users-page {
  display: flex;
  flex-direction: column;
  gap: 20px;
}

.admin-users-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
}

.admin-users-table {
  background: rgba(255, 255, 255, 0.72);
  border: 1px solid rgba(226, 232, 240, 0.8);
  border-radius: 8px;
  padding: 16px;
  box-shadow: 0 12px 30px rgba(15, 23, 42, 0.05);
}

.admin-user-cell {
  display: flex;
  align-items: center;
  gap: 12px;
}

.admin-user-cell__copy {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.password-reset-panel {
  display: flex;
  flex-direction: column;
  gap: 12px;
  padding-top: 8px;
}

@media (max-width: 768px) {
  .admin-users-header {
    align-items: flex-start;
    flex-direction: column;
  }
}
`;

export default AdminUsers;
