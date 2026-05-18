import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Button, Input, Modal, Select, Space, Switch, Table, Tag, Tooltip, Typography, message } from 'antd';
import {
  DeleteOutlined,
  KeyOutlined,
  TeamOutlined,
  LockOutlined,
  CloudDownloadOutlined,
  SyncOutlined,
  SafetyCertificateOutlined,
  SearchOutlined
} from '@ant-design/icons';
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
  const [searchText, setSearchText] = useState('');

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

  // Instant fuzzy filter based on username, uid, or email
  const filteredUsers = useMemo(() => {
    if (!searchText.trim()) {
      return users;
    }
    const query = searchText.toLowerCase().trim();
    return users.filter((u) => {
      const matchUsername = u.username?.toLowerCase().includes(query);
      const matchUid = u.uid?.toLowerCase().includes(query);
      const matchEmail = u.email?.toLowerCase().includes(query);
      return matchUsername || matchUid || matchEmail;
    });
  }, [users, searchText]);

  const columns = useMemo(() => [
    {
      title: '用户',
      dataIndex: 'username',
      key: 'username',
      render: (username, record) => (
        <div className="admin-user-cell">
          <UserAvatar user={record} size={42} />
          <div className="admin-user-cell__copy">
            <Text strong className="user-name-text">{username}</Text>
            <Text type="secondary" className="user-email-text">{record.email}</Text>
          </div>
        </div>
      ),
    },
    {
      title: 'UID',
      dataIndex: 'uid',
      key: 'uid',
      width: 160,
      render: (uid) => uid ? <span className="uid-badge-mono">{uid}</span> : <Text type="secondary">-</Text>,
    },
    {
      title: '角色',
      dataIndex: 'role',
      key: 'role',
      width: 160,
      render: (role, record) => (
        isSuperAdmin && user?.id !== record.id ? (
          <Select
            value={role}
            options={ROLE_OPTIONS}
            onChange={(nextRole) => handleRoleChange(record, nextRole)}
            disabled={savingUserId === record.id}
            className="premium-select-role"
            size="middle"
          />
        ) : (
          <Tag color={ROLE_COLORS[role] || 'default'} style={{ borderRadius: '8px', fontWeight: 600, padding: '4px 10px' }}>
            {ROLE_LABELS[role] || role}
          </Tag>
        )
      ),
    },
    {
      title: '创建时间',
      dataIndex: 'created_at',
      key: 'created_at',
      width: 190,
      render: (value) => value ? <Text style={{ fontSize: 13, color: '#475569', fontWeight: 500 }}>{new Date(value).toLocaleString()}</Text> : '-',
    },
    {
      title: '最近登录',
      dataIndex: 'last_login',
      key: 'last_login',
      width: 190,
      render: (value) => value ? <Text style={{ fontSize: 13, color: '#475569', fontWeight: 500 }}>{new Date(value).toLocaleString()}</Text> : '-',
    },
    {
      title: '操作',
      key: 'actions',
      width: 260,
      render: (_, record) => (
        <Space size="middle">
          <Switch
            checked={record.is_active}
            checkedChildren="启用"
            unCheckedChildren="禁用"
            disabled={!canManageUser(record) || savingUserId === record.id}
            onChange={(checked) => handleActiveChange(record, checked)}
            className="premium-switch-active"
          />
          <Tooltip title="重置密码">
            <Button
              icon={<KeyOutlined />}
              disabled={!canManageUser(record) || savingUserId === record.id}
              onClick={() => openPasswordModal(record)}
              className="action-btn-circle-glass"
            />
          </Tooltip>
          <Tooltip title="删除">
            <Button
              danger
              icon={<DeleteOutlined />}
              disabled={!canManageUser(record) || savingUserId === record.id}
              onClick={() => handleDeleteUser(record)}
              className="action-btn-circle-glass danger"
            />
          </Tooltip>
        </Space>
      ),
    },
  ], [canManageUser, handleActiveChange, handleDeleteUser, handleRoleChange, isSuperAdmin, openPasswordModal, savingUserId, user?.id]);

  return (
    <div className="admin-users-page">
      <style>{css}</style>

      <div className="admin-users-header">
        <div className="header-title-section">
          <Title level={2} style={{ margin: 0, fontWeight: 800, color: '#1e293b', display: 'flex', alignItems: 'center', gap: '10px' }}>
            <TeamOutlined style={{ color: '#6366f1' }} />
            用户管理
          </Title>
          <Text type="secondary" style={{ fontSize: '14px', color: '#64748b' }}>
            管理普通用户、VIP 用户和管理员账户权限与状态。
          </Text>
        </div>
        
        <div className="header-actions-wrap">
          <span className="role-badge-glass">
            当前身份：{ROLE_LABELS[user?.role] || '普通用户'}
          </span>
          <Button
            icon={<CloudDownloadOutlined />}
            onClick={handleExportUsers}
            className="btn-premium-glass"
          >
            导出用户
          </Button>
          <Button
            icon={<SyncOutlined spin={loading} />}
            onClick={fetchUsers}
            loading={loading}
            className="btn-premium-glass"
          >
            刷新数据
          </Button>
        </div>
      </div>

      <div className="table-toolbar-glass">
        <Input
          prefix={<SearchOutlined style={{ color: '#94a3b8', fontSize: '16px' }} />}
          placeholder="输入用户名、UID 或邮箱进行精准/模糊搜索..."
          value={searchText}
          onChange={(e) => setSearchText(e.target.value)}
          allowClear
          className="search-input-glass"
        />
      </div>

      <div className="admin-users-table">
        <Table
          rowKey="id"
          columns={columns}
          dataSource={filteredUsers}
          loading={loading}
          pagination={{ pageSize: 5, showSizeChanger: false }}
          className="premium-users-table"
        />
      </div>

      <Modal
        title={
          <div className="premium-modal-title">
            <SafetyCertificateOutlined style={{ color: '#6366f1' }} />
            <span>密码重置安全验证 - {passwordModalUser?.username || ''}</span>
          </div>
        }
        open={!!passwordModalUser}
        onCancel={closePasswordModal}
        onOk={handlePasswordReset}
        okText="确认更新密码"
        cancelText="取消"
        confirmLoading={savingUserId === passwordModalUser?.id}
        destroyOnClose
        className="premium-cropper-modal"
        okButtonProps={{
          className: 'btn-premium-primary',
          style: { borderRadius: '10px', height: '38px', border: 'none', fontWeight: '600' }
        }}
        cancelButtonProps={{
          style: { borderRadius: '10px', height: '38px' }
        }}
      >
        <div className="password-reset-panel">
          <Text type="secondary" style={{ fontSize: '13px', marginBottom: '4px', display: 'block' }}>
            请输入为此用户设定的新登录密码（至少 8 位数字/字母）：
          </Text>
          <Input.Password
            prefix={<LockOutlined style={{ color: '#94a3b8' }} />}
            value={newPassword}
            onChange={(event) => setNewPassword(event.target.value)}
            placeholder="新登录密码"
            className="password-input-glass"
            size="large"
          />
          <Input.Password
            prefix={<LockOutlined style={{ color: '#94a3b8' }} />}
            value={confirmPassword}
            onChange={(event) => setConfirmPassword(event.target.value)}
            placeholder="确认新登录密码"
            className="password-input-glass"
            size="large"
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
  max-width: 1280px;
  margin: 0 auto;
  padding-bottom: 40px;
}

/* Header Section */
.admin-users-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 20px;
  padding: 8px 0;
}

.header-title-section {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.header-actions-wrap {
  display: flex;
  align-items: center;
  gap: 12px;
}

/* Premium Tags */
.role-badge-glass {
  padding: 6px 14px;
  border-radius: 12px;
  font-weight: 700;
  font-size: 13px;
  border: 1px solid rgba(99, 102, 241, 0.18);
  background: rgba(99, 102, 241, 0.08);
  color: #4f46e5;
  box-shadow: 0 4px 12px rgba(99, 102, 241, 0.04);
}

/* Glassmorphic Action Buttons */
.btn-premium-glass {
  border-radius: 12px !important;
  font-weight: 600 !important;
  height: 40px !important;
  display: flex !important;
  align-items: center !important;
  gap: 8px !important;
  border: 1px solid rgba(226, 232, 240, 0.8) !important;
  background: rgba(255, 255, 255, 0.6) !important;
  backdrop-filter: blur(8px) !important;
  box-shadow: 0 4px 10px rgba(0, 0, 0, 0.02) !important;
  transition: all 0.25s cubic-bezier(0.4, 0, 0.2, 1) !important;
}

.btn-premium-glass:hover {
  transform: translateY(-1px);
  background: rgba(255, 255, 255, 0.9) !important;
  border-color: #6366f1 !important;
  color: #6366f1 !important;
  box-shadow: 0 6px 16px rgba(99, 102, 241, 0.08) !important;
}

.btn-premium-primary {
  background: linear-gradient(135deg, #6366f1 0%, #4f46e5 100%) !important;
  color: white !important;
  border: none !important;
}

.btn-premium-primary:hover {
  background: linear-gradient(135deg, #4f46e5 0%, #3730a3 100%) !important;
  color: white !important;
  box-shadow: 0 6px 16px rgba(99, 102, 241, 0.3) !important;
}

/* Glassmorphic Table Toolbar */
.table-toolbar-glass {
  background: rgba(255, 255, 255, 0.75);
  border: 1px solid rgba(226, 232, 240, 0.8);
  border-radius: 16px;
  padding: 12px 20px;
  backdrop-filter: blur(12px);
  box-shadow: 0 8px 24px rgba(15, 23, 42, 0.02);
  display: flex;
  align-items: center;
  gap: 16px;
}

.search-input-glass.ant-input-affix-wrapper {
  max-width: 420px;
  border-radius: 10px !important;
  border-color: #cbd5e1 !important;
  background: rgba(255, 255, 255, 0.7) !important;
  padding: 6px 14px !important;
  transition: all 0.25s cubic-bezier(0.4, 0, 0.2, 1) !important;
}

.search-input-glass.ant-input-affix-wrapper-focused,
.search-input-glass.ant-input-affix-wrapper:hover {
  border-color: #6366f1 !important;
  background: white !important;
  box-shadow: 0 0 0 3px rgba(99, 102, 241, 0.1) !important;
}

/* Glassmorphic Table Wrap */
.admin-users-table {
  background: rgba(255, 255, 255, 0.75);
  border: 1px solid rgba(226, 232, 240, 0.8);
  border-radius: 20px;
  padding: 24px;
  backdrop-filter: blur(16px);
  box-shadow: 0 16px 40px rgba(15, 23, 42, 0.03);
  overflow: hidden;
}

/* Custom Table Styles */
.premium-users-table .ant-table {
  background: transparent !important;
}

.premium-users-table .ant-table-thead > tr > th {
  background: rgba(248, 250, 252, 0.6) !important;
  color: #475569 !important;
  font-weight: 700 !important;
  font-size: 13px !important;
  border-bottom: 2px solid rgba(241, 245, 249, 0.8) !important;
  padding: 16px !important;
}

.premium-users-table .ant-table-tbody > tr > td {
  padding: 16px !important;
  border-bottom: 1px solid rgba(241, 245, 249, 0.7) !important;
  transition: all 0.2s ease;
}

.premium-users-table .ant-table-tbody > tr:hover > td {
  background: rgba(99, 102, 241, 0.02) !important;
}

/* User cell customization */
.admin-user-cell {
  display: flex;
  align-items: center;
  gap: 14px;
}

.admin-user-cell__copy {
  display: flex;
  flex-direction: column;
  gap: 3px;
}

.admin-user-cell__copy .user-name-text {
  font-size: 15px;
  font-weight: 700;
  color: #1e293b;
}

.admin-user-cell__copy .user-email-text {
  font-size: 12px;
  color: #64748b;
  font-weight: 500;
}

.uid-badge-mono {
  font-family: 'Courier New', Courier, monospace;
  font-size: 12.5px;
  font-weight: 600;
  color: #334155;
  background: rgba(241, 245, 249, 0.8);
  padding: 4px 10px;
  border-radius: 8px;
  border: 1px solid rgba(226, 232, 240, 0.6);
}

/* Custom Antd Select styles inside table */
.premium-select-role.ant-select {
  width: 100% !important;
}

.premium-select-role.ant-select .ant-select-selector {
  border-radius: 10px !important;
  border-color: #e2e8f0 !important;
  background: rgba(255, 255, 255, 0.6) !important;
  font-weight: 600 !important;
  font-size: 13px !important;
  color: #334155 !important;
  height: 34px !important;
  display: flex !important;
  align-items: center !important;
}

.premium-select-role.ant-select-focused .ant-select-selector,
.premium-select-role.ant-select:hover .ant-select-selector {
  border-color: #6366f1 !important;
}

/* Action button icons customization */
.action-btn-circle-glass {
  border-radius: 50% !important;
  width: 36px !important;
  height: 36px !important;
  display: inline-flex !important;
  align-items: center !important;
  justify-content: center !important;
  background: rgba(255, 255, 255, 0.8) !important;
  border: 1px solid rgba(226, 232, 240, 0.8) !important;
  box-shadow: 0 4px 10px rgba(0, 0, 0, 0.02) !important;
  transition: all 0.2s ease !important;
}

.action-btn-circle-glass:hover {
  transform: scale(1.08);
  border-color: #6366f1 !important;
  color: #6366f1 !important;
  background: white !important;
  box-shadow: 0 6px 16px rgba(99, 102, 241, 0.1) !important;
}

.action-btn-circle-glass.danger:hover {
  border-color: #ef4444 !important;
  color: #ef4444 !important;
  background: #fef2f2 !important;
  box-shadow: 0 6px 16px rgba(239, 68, 68, 0.12) !important;
}

/* Switch customization */
.premium-switch-active.ant-switch {
  background-color: rgba(148, 163, 184, 0.3) !important;
}

.premium-switch-active.ant-switch-checked {
  background: linear-gradient(135deg, #10b981 0%, #059669 100%) !important;
}

/* Pagination Glassmorphism */
.premium-users-table .ant-pagination-item {
  border-radius: 8px !important;
  background: rgba(255, 255, 255, 0.5) !important;
  border: 1px solid rgba(226, 232, 240, 0.8) !important;
  transition: all 0.2s ease;
}

.premium-users-table .ant-pagination-item-active {
  background: linear-gradient(135deg, #6366f1 0%, #4f46e5 100%) !important;
  border-color: transparent !important;
}

.premium-users-table .ant-pagination-item-active a {
  color: white !important;
}

/* Premium Password Reset Modal */
.premium-modal-title {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 16px;
  font-weight: 800;
  color: #1e293b;
}

.password-reset-panel {
  display: flex;
  flex-direction: column;
  gap: 14px;
  padding: 16px 0 8px 0;
}

.password-input-glass.ant-input-affix-wrapper {
  border-radius: 10px !important;
  border-color: #cbd5e1 !important;
  background: rgba(255, 255, 255, 0.6) !important;
  padding: 8px 12px !important;
  transition: all 0.2s ease !important;
}

.password-input-glass.ant-input-affix-wrapper-focused,
.password-input-glass.ant-input-affix-wrapper:hover {
  border-color: #6366f1 !important;
  box-shadow: 0 0 0 2px rgba(99, 102, 241, 0.1) !important;
}

@media (max-width: 768px) {
  .admin-users-header {
    align-items: flex-start;
    flex-direction: column;
    gap: 14px;
  }
  .header-actions-wrap {
    width: 100%;
    justify-content: flex-start;
    flex-wrap: wrap;
  }
  .table-toolbar-glass {
    padding: 10px 14px;
  }
  .search-input-glass.ant-input-affix-wrapper {
    max-width: 100%;
  }
}
`;

export default AdminUsers;
