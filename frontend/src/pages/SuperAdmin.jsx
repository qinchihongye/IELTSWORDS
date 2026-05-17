import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Button, Form, Input, Select, Space, Table, Tag, Typography, message } from 'antd';
import {
  CheckCircleOutlined,
  CrownOutlined,
  ReloadOutlined,
  StopOutlined,
  UserAddOutlined,
  UserSwitchOutlined,
} from '@ant-design/icons';
import apiClient from '../api/client';
import { ROLE_COLORS, ROLE_LABELS, ROLE_OPTIONS } from '../utils/roles';

const { Title, Text } = Typography;

const SuperAdmin = () => {
  const [form] = Form.useForm();
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(false);
  const [creating, setCreating] = useState(false);

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

  const roleSummary = useMemo(() => {
    const summary = ROLE_OPTIONS.map((role) => ({
      ...role,
      count: 0,
      active: 0,
    }));

    const summaryByRole = new Map(summary.map((item) => [item.value, item]));
    users.forEach((item) => {
      const role = summaryByRole.get(item.role);
      if (!role) return;
      role.count += 1;
      if (item.is_active) {
        role.active += 1;
      }
    });

    return summary;
  }, [users]);

  const adminUsers = useMemo(() => (
    users.filter((item) => item.role === 'admin' || item.role === 'super_admin')
  ), [users]);

  const systemSummary = useMemo(() => {
    const activeCount = users.filter((item) => item.is_active).length;
    return {
      total: users.length,
      active: activeCount,
      inactive: users.length - activeCount,
      privileged: adminUsers.length,
    };
  }, [adminUsers.length, users]);

  const handleCreateUser = useCallback(async (values) => {
    setCreating(true);
    try {
      const response = await apiClient.post('/api/admin/users', values);
      setUsers((currentUsers) => [...currentUsers, response.data]);
      form.resetFields();
      message.success('账户已创建');
    } catch (error) {
      console.error('创建账户失败:', error);
    } finally {
      setCreating(false);
    }
  }, [form]);

  const columns = [
    {
      title: '账户',
      dataIndex: 'username',
      key: 'username',
      render: (username, record) => (
        <div className="super-admin-user-cell">
          <Text strong>{username}</Text>
          <Text type="secondary">{record.email}</Text>
        </div>
      ),
    },
    {
      title: '角色',
      dataIndex: 'role',
      key: 'role',
      width: 150,
      render: (role) => <Tag color={ROLE_COLORS[role] || 'default'}>{ROLE_LABELS[role] || role}</Tag>,
    },
    {
      title: '状态',
      dataIndex: 'is_active',
      key: 'is_active',
      width: 120,
      render: (isActive) => (
        <Tag icon={isActive ? <CheckCircleOutlined /> : <StopOutlined />} color={isActive ? 'green' : 'red'}>
          {isActive ? '启用' : '禁用'}
        </Tag>
      ),
    },
    {
      title: '最近登录',
      dataIndex: 'last_login',
      key: 'last_login',
      width: 190,
      render: (value) => value ? new Date(value).toLocaleString() : '-',
    },
  ];

  return (
    <div className="super-admin-page">
      <style>{css}</style>

      <div className="super-admin-header">
        <div>
          <Title level={2} style={{ margin: 0 }}>超级管理员</Title>
          <Text type="secondary">系统级账户、角色和管理员入口。</Text>
        </div>
        <Button icon={<ReloadOutlined />} onClick={fetchUsers} loading={loading}>
          刷新
        </Button>
      </div>

      <div className="super-admin-metrics">
        <div className="super-admin-metric">
          <UserSwitchOutlined />
          <div>
            <Text type="secondary">全部账户</Text>
            <Title level={3}>{systemSummary.total}</Title>
          </div>
        </div>
        <div className="super-admin-metric">
          <CheckCircleOutlined />
          <div>
            <Text type="secondary">启用账户</Text>
            <Title level={3}>{systemSummary.active}</Title>
          </div>
        </div>
        <div className="super-admin-metric">
          <StopOutlined />
          <div>
            <Text type="secondary">禁用账户</Text>
            <Title level={3}>{systemSummary.inactive}</Title>
          </div>
        </div>
        <div className="super-admin-metric">
          <CrownOutlined />
          <div>
            <Text type="secondary">管理账户</Text>
            <Title level={3}>{systemSummary.privileged}</Title>
          </div>
        </div>
      </div>

      <div className="super-admin-grid">
        <section className="super-admin-panel">
          <div className="super-admin-panel-head">
            <Title level={4}>角色分布</Title>
            <Text type="secondary">当前系统内四级权限的账户数量。</Text>
          </div>
          <div className="role-summary-list">
            {roleSummary.map((role) => (
              <div className="role-summary-row" key={role.value}>
                <Space>
                  <Tag color={ROLE_COLORS[role.value] || 'default'}>{role.label}</Tag>
                  <Text type="secondary">{role.value}</Text>
                </Space>
                <Space size={18}>
                  <Text>{role.count} 个账户</Text>
                  <Text type="secondary">{role.active} 个启用</Text>
                </Space>
              </div>
            ))}
          </div>
        </section>

        <section className="super-admin-panel">
          <div className="super-admin-panel-head">
            <Title level={4}>创建账户</Title>
            <Text type="secondary">直接创建普通、高级、管理员或超级管理员账户。</Text>
          </div>
          <Form
            form={form}
            layout="vertical"
            initialValues={{ role: 'user' }}
            onFinish={handleCreateUser}
          >
            <Form.Item
              label="用户名"
              name="username"
              rules={[
                { required: true, message: '请输入用户名' },
                { min: 3, message: '用户名至少 3 个字符' },
              ]}
            >
              <Input placeholder="username" />
            </Form.Item>
            <Form.Item
              label="邮箱"
              name="email"
              rules={[
                { required: true, message: '请输入邮箱' },
                { type: 'email', message: '邮箱格式不正确' },
              ]}
            >
              <Input placeholder="name@example.com" />
            </Form.Item>
            <Form.Item
              label="初始密码"
              name="password"
              rules={[
                { required: true, message: '请输入初始密码' },
                { min: 8, message: '密码至少 8 位' },
              ]}
            >
              <Input.Password placeholder="至少 8 位" />
            </Form.Item>
            <Form.Item label="角色" name="role" rules={[{ required: true }]}>
              <Select options={ROLE_OPTIONS} />
            </Form.Item>
            <Button type="primary" htmlType="submit" icon={<UserAddOutlined />} loading={creating} block>
              创建账户
            </Button>
          </Form>
        </section>
      </div>

      <section className="super-admin-panel">
        <div className="super-admin-panel-head">
          <Title level={4}>管理员账户</Title>
          <Text type="secondary">快速查看拥有后台权限的账户。角色调整仍在“用户管理”中完成。</Text>
        </div>
        <Table
          rowKey="id"
          columns={columns}
          dataSource={adminUsers}
          loading={loading}
          pagination={false}
        />
      </section>
    </div>
  );
};

const css = `
.super-admin-page {
  display: flex;
  flex-direction: column;
  gap: 20px;
}

.super-admin-header,
.super-admin-panel-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
}

.super-admin-metrics {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 16px;
}

.super-admin-metric,
.super-admin-panel {
  background: rgba(255, 255, 255, 0.74);
  border: 1px solid rgba(226, 232, 240, 0.82);
  border-radius: 8px;
  box-shadow: 0 12px 30px rgba(15, 23, 42, 0.05);
}

.super-admin-metric {
  display: flex;
  align-items: center;
  gap: 14px;
  padding: 18px;
}

.super-admin-metric > .anticon {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 42px;
  height: 42px;
  border-radius: 8px;
  background: rgba(99, 102, 241, 0.1);
  color: #4f46e5;
  font-size: 20px;
}

.super-admin-metric h3 {
  margin: 2px 0 0;
}

.super-admin-grid {
  display: grid;
  grid-template-columns: minmax(0, 1.3fr) minmax(320px, 0.7fr);
  gap: 20px;
}

.super-admin-panel {
  padding: 18px;
}

.super-admin-panel-head {
  align-items: flex-start;
  margin-bottom: 18px;
}

.super-admin-panel-head h4 {
  margin: 0;
}

.role-summary-list {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.role-summary-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 14px;
  padding: 14px;
  border: 1px solid #e2e8f0;
  border-radius: 8px;
  background: rgba(248, 250, 252, 0.74);
}

.super-admin-user-cell {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

@media (max-width: 1100px) {
  .super-admin-metrics {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }

  .super-admin-grid {
    grid-template-columns: 1fr;
  }
}

@media (max-width: 720px) {
  .super-admin-header,
  .super-admin-panel-head,
  .role-summary-row {
    align-items: flex-start;
    flex-direction: column;
  }

  .super-admin-metrics {
    grid-template-columns: 1fr;
  }
}
`;

export default SuperAdmin;
