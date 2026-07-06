import React, { useState } from 'react';
import { Layout, Menu, Button, Typography, Dropdown, Modal, Avatar, Drawer, Grid } from 'antd';
import { 
  AppstoreOutlined, 
  ReadOutlined, 
  HistoryOutlined, 
  ContainerOutlined, 
  FireOutlined,
  LogoutOutlined,
  UserOutlined,
  BlockOutlined,
  ThunderboltOutlined,
  TeamOutlined,
  CrownOutlined,
  CalendarOutlined,
  EditOutlined,
  BookOutlined,
  PictureOutlined,
  BranchesOutlined,
  MenuOutlined
} from '@ant-design/icons';
import { useNavigate, useLocation, Outlet } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useLearning } from '../context/LearningContext';
import { useQuiz } from '../context/QuizContext';
import apiClient from '../api/client';
import { hasMinRole, ROLE_COLORS, ROLE_LABELS } from '../utils/roles';
import { getAvatarSrc, getAvatarFallbackText, getAvatarName } from '../utils/avatars';
import AIChatWidget from './AIChatWidget';
import UserAvatar from './UserAvatar';

const { Header, Sider, Content } = Layout;
const { Title, Text } = Typography;

const SidebarIcon = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ display: 'inline-block', verticalAlign: 'middle' }}>
    <rect x="3" y="3" width="18" height="18" rx="4" ry="4" />
    <line x1="9" y1="3" x2="9" y2="21" />
  </svg>
);

const MainLayout = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const { user, logout } = useAuth();
  const { resetLearning, setMode } = useLearning();
  const { quizSession, setQuizSession } = useQuiz();
  const [collapsed, setCollapsed] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [isHeaderHovered, setIsHeaderHovered] = useState(false);
  const [avatarPreviewOpen, setAvatarPreviewOpen] = useState(false);
  const screens = Grid.useBreakpoint();
  const isMobile = !screens.md;

  const confirmQuizExit = (onConfirm) => {
    if (location.pathname === '/quiz' && quizSession && !quizSession.completed_at) {
      Modal.confirm({
        title: '确认退出测试？',
        content: '退出后将不保留当前的测试状态，本次答题进度将丢失。',
        okText: '确认退出',
        cancelText: '取消',
        okButtonProps: { danger: true },
        onOk: async () => {
          try {
            await apiClient.delete(`/api/quiz/session/${quizSession.id}`);
          } catch (e) {
            console.error('删除测试会话失败:', e);
          }
          setQuizSession(null);
          onConfirm();
        }
      });
    } else {
      onConfirm();
    }
  };

  const handleMenuClick = ({ key }) => {
    if (isMobile) {
      setMobileMenuOpen(false);
    }
    confirmQuizExit(() => {
      resetLearning();
      if (key === '/home') {
        navigate('/home');
      } else {
        // Map keys to modes
        const modeMap = {
          '/chapter-select': 'sequential',
          '/random-group': 'random-group',
          '/random-word': 'random-word',
          '/review': 'review',
          '/mistake-book': 'mistake-book',
          '/quiz': 'quiz',
          '/check-in': 'check-in'
        };
        if (modeMap[key]) {
          setMode(modeMap[key]);
        }
        navigate(key);
      }
    });
  };

  const menuItems = [
    {
      key: '/home',
      icon: <AppstoreOutlined />,
      label: '学习中心',
    },
    {
      type: 'divider',
    },
    {
      key: 'learning',
      label: '学习中心',
      type: 'group',
      children: [
        {
          key: '/chapter-select',
          icon: <ReadOutlined />,
          label: '顺序学习',
        },
        {
          key: '/random-group',
          icon: <BlockOutlined />,
          label: '随机分组',
        },
        {
          key: '/random-word',
          icon: <ThunderboltOutlined />,
          label: '随机单词',
        },
        {
          key: '/custom-books',
          icon: <BookOutlined />,
          label: '自定义词书',
        },
      ]
    },
    {
      type: 'divider',
    },
    {
      key: 'advanced',
      label: '能力提升',
      type: 'group',
      children: [
        {
          key: '/review',
          icon: <HistoryOutlined />,
          label: '智能复习',
        },
        {
          key: '/mistake-book',
          icon: <ContainerOutlined />,
          label: '错词本',
        },
        {
          key: '/quiz',
          icon: <ReadOutlined />, // Using Read as test icon
          label: '模拟测试',
        },
        {
          key: '/check-in',
          icon: <FireOutlined />,
          label: '每日打卡',
        },
        {
          key: '/calendar',
          icon: <CalendarOutlined />,
          label: '学习日历',
        },
      ]
    }
  ];

  if (hasMinRole(user, 'admin')) {
    menuItems.push(
      {
        type: 'divider',
      },
      {
        key: 'admin',
        label: '管理后台',
        type: 'group',
        children: [
          {
            key: '/admin/users',
            icon: <TeamOutlined />,
            label: '用户管理',
          },
          {
            key: '/admin/content',
            icon: <EditOutlined />,
            label: '内容管理',
          },
          ...(hasMinRole(user, 'super_admin') ? [
            {
              key: '/admin/super',
              icon: <CrownOutlined />,
              label: '超级管理',
            },
            {
              key: '/admin/avatars',
              icon: <PictureOutlined />,
              label: '内置头像',
            },
            {
              key: '/admin/avatar-unlocks',
              icon: <BranchesOutlined />,
              label: '头像解锁',
            },
          ] : []),
        ],
      }
    );
  }

  const userRoleLabel = ROLE_LABELS[user?.role] || '普通用户';
  const userRoleColor = ROLE_COLORS[user?.role] || '#6b7280';

  const userMenu = {
    items: [
      ...(user?.uid ? [{
        key: 'uid-display',
        disabled: true,
        label: <Text type="secondary" style={{ fontFamily: 'monospace', fontSize: 12 }}>UID: {user.uid}</Text>,
      }] : []),
      {
        key: 'role-display',
        disabled: true,
        label: (
          <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ width: 8, height: 8, borderRadius: '50%', background: userRoleColor }} />
            <Text style={{ fontSize: 13, color: '#374151' }}>{userRoleLabel}</Text>
          </span>
        ),
      },
      {
        type: 'divider',
      },
      {
        key: 'profile',
        icon: <UserOutlined />,
        label: '个人资料',
        onClick: () => confirmQuizExit(() => navigate('/profile')),
      },
      {
        key: 'logout',
        icon: <LogoutOutlined />,
        label: '退出登录',
        onClick: () => confirmQuizExit(logout),
      },
    ],
  };

  // Determine active route for menu highlighting
  // Fallback to /home if not matching perfectly
  let selectedKey = location.pathname;
  if (selectedKey === '/group-select' || selectedKey === '/word-select') selectedKey = '/chapter-select';
  if (selectedKey.startsWith('/custom-books')) selectedKey = '/custom-books';

  return (
    <Layout style={{ height: '100dvh', overflow: 'hidden', background: 'transparent' }}>
      {!isMobile && (
        <Sider
          trigger={null}
          theme="light"
          collapsible
          collapsed={collapsed}
          onCollapse={setCollapsed}
          width={250}
          style={{
            height: '100vh',
            overflow: 'auto',
            background: 'rgba(255, 255, 255, 0.4)',
            backdropFilter: 'blur(20px)',
            WebkitBackdropFilter: 'blur(20px)',
            boxShadow: '4px 0 24px rgba(0,0,0,0.02)',
            zIndex: 10
          }}
        >
          <div
            onMouseEnter={() => setIsHeaderHovered(true)}
            onMouseLeave={() => setIsHeaderHovered(false)}
            style={{
              height: 64,
              display: 'flex',
              alignItems: 'center',
              justifyContent: collapsed ? 'center' : 'space-between',
              padding: collapsed ? '0' : '0 20px',
              overflow: 'hidden'
            }}
          >
            {(!collapsed || !isHeaderHovered) && (
              <div style={{ display: 'flex', alignItems: 'center' }}>
                <img
                  src="/favicon.png"
                  alt="Logo"
                  style={{
                    width: 32,
                    height: 32,
                    borderRadius: '6px',
                    boxShadow: '0 4px 10px rgba(99, 102, 241, 0.2)',
                    objectFit: 'cover'
                  }}
                />
              </div>
            )}
            {(!collapsed || isHeaderHovered) && (
              <Button
                type="text"
                icon={<SidebarIcon />}
                onClick={() => setCollapsed(!collapsed)}
                style={{
                  width: 36,
                  height: 36,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  color: '#6b7280',
                  borderRadius: '8px',
                  flexShrink: 0
                }}
              />
            )}
          </div>
          <Menu
            theme="light"
            mode="inline"
            selectedKeys={[selectedKey]}
            onClick={handleMenuClick}
            items={menuItems}
            style={{ borderRight: 0, background: 'transparent' }}
          />
        </Sider>
      )}
      <Drawer
        open={mobileMenuOpen}
        onClose={() => setMobileMenuOpen(false)}
        placement="left"
        width="min(86vw, 320px)"
        bodyStyle={{ padding: 0, background: 'rgba(255,255,255,0.94)' }}
        headerStyle={{ borderBottom: '1px solid rgba(148, 163, 184, 0.18)' }}
        title="菜单"
      >
        <Menu
          theme="light"
          mode="inline"
          selectedKeys={[selectedKey]}
          onClick={handleMenuClick}
          items={menuItems}
          style={{ borderRight: 0, background: 'transparent', padding: '8px 0' }}
        />
      </Drawer>
      
      <Layout style={{ height: '100dvh', overflow: 'hidden', background: 'transparent' }}>
        <Header style={{ 
          padding: isMobile ? '0 12px' : '0 32px',
          height: isMobile ? 56 : 64,
          lineHeight: isMobile ? '56px' : '64px',
          background: 'rgba(255, 255, 255, 0.5)', 
          backdropFilter: 'blur(20px)',
          WebkitBackdropFilter: 'blur(20px)',
          display: 'flex', 
          justifyContent: 'space-between', 
          alignItems: 'center',
          boxShadow: '0 4px 30px rgba(0,0,0,0.03)',
          borderBottom: '1px solid rgba(255, 255, 255, 0.5)',
          zIndex: 9
        }}>
          <div style={{ display: 'flex', alignItems: 'center' }}>
            {isMobile && (
              <Button
                type="text"
                icon={<MenuOutlined />}
                onClick={() => setMobileMenuOpen(true)}
                style={{
                  width: 40,
                  height: 40,
                  display: 'inline-flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  marginRight: 8,
                  borderRadius: 10,
                }}
              />
            )}
            <Title level={5} style={{ margin: 0, fontWeight: 600, color: '#374151' }}>
              {menuItems.flatMap(g => g.children || [g]).find(i => i.key === selectedKey)?.label || 'Dashboard'}
            </Title>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: isMobile ? 8 : 16 }}>
            <Dropdown menu={userMenu} placement="bottomRight" arrow>
              <div 
                onDoubleClick={() => setAvatarPreviewOpen(true)}
                title="双击预览头像"
                style={{ display: 'flex', alignItems: 'center', cursor: 'pointer', gap: 10, padding: '4px 12px 4px 6px', borderRadius: 20, background: 'rgba(99,102,241,0.05)' }}
              >
                <UserAvatar user={user} size={28} />
                {!isMobile && <Text style={{ fontWeight: 500, color: '#4b5563' }}>{user?.username}</Text>}
              </div>
            </Dropdown>

            <Modal
              open={avatarPreviewOpen}
              onCancel={() => setAvatarPreviewOpen(false)}
              footer={null}
              centered
              destroyOnClose
              width={400}
              title={`${user?.username || '用户'} 的头像`}
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
                  size={240}
                  src={getAvatarSrc(user)}
                  icon={!getAvatarSrc(user) ? <UserOutlined /> : undefined}
                  shape="circle"
                  style={{
                    boxShadow: '0 8px 30px rgba(0,0,0,0.12)',
                    background: 'rgba(99, 102, 241, 0.12)',
                    color: '#4f46e5',
                    fontSize: 80,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  {!getAvatarSrc(user) ? getAvatarFallbackText(user?.username || user?.email || '') : null}
                </Avatar>
                <span style={{ color: '#6b7280', fontSize: 14 }}>{getAvatarName(user)}</span>
              </div>
            </Modal>
          </div>
        </Header>
        
        <Content style={{ 
          padding: isMobile ? '12px' : '24px 32px',
          position: 'relative',
          overflowY: 'auto',
          overflowX: 'hidden'
        }}>
          <Outlet />
          <AIChatWidget />
        </Content>
      </Layout>
    </Layout>
  );
};

export default MainLayout;
