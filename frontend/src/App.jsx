/**
 * 主应用组件
 */

import React, { Suspense, lazy, useEffect } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate, useNavigate } from 'react-router-dom';
import { ConfigProvider, Spin } from 'antd';
import zhCN from 'antd/locale/zh_CN';
import { AppProviders } from './context/AppProviders';
import { setNavigate } from './api/client';
import ProtectedRoute from './components/ProtectedRoute';
import MainLayout from './components/MainLayout';

// 将 navigate 注入到 axios 客户端，用于 401 跳转
function NavigateSetter() {
  const navigate = useNavigate();
  useEffect(() => { setNavigate(navigate); }, [navigate]);
  return null;
}

// 页面组件按需懒加载 (Lazy Load)
const lazyWithPreload = (loader) => {
  const Component = lazy(loader);
  Component.preload = loader;
  return Component;
};

const Login = lazyWithPreload(() => import('./pages/Login'));
const Register = lazyWithPreload(() => import('./pages/Register'));
const Home = lazyWithPreload(() => import('./pages/Home'));
const SequentialSelect = lazyWithPreload(() => import('./pages/SequentialSelect'));
const Learning = lazyWithPreload(() => import('./pages/Learning'));
const Review = lazyWithPreload(() => import('./pages/Review'));
const MistakeBook = lazyWithPreload(() => import('./pages/MistakeBook'));
const Quiz = lazyWithPreload(() => import('./pages/Quiz'));
const CheckIn = lazyWithPreload(() => import('./pages/CheckIn'));
const LearningCalendar = lazyWithPreload(() => import('./pages/LearningCalendar'));
const Profile = lazyWithPreload(() => import('./pages/Profile'));
const CustomBooks = lazyWithPreload(() => import('./pages/CustomBooks'));
const CustomBookLearning = lazyWithPreload(() => import('./pages/CustomBookLearning'));
const AdminUsers = lazyWithPreload(() => import('./pages/AdminUsers'));
const AdminContent = lazyWithPreload(() => import('./pages/AdminContent'));
const SuperAdmin = lazyWithPreload(() => import('./pages/SuperAdmin'));
const AdminBuiltinAvatars = lazyWithPreload(() => import('./pages/AdminBuiltinAvatars'));
const AdminAvatarUnlockRules = lazyWithPreload(() => import('./pages/AdminAvatarUnlockRules'));
const NotFound = lazyWithPreload(() => import('./pages/NotFound'));

const COMMON_ROUTE_PRELOADERS = [
  Home.preload,
  SequentialSelect.preload,
  Learning.preload,
  Review.preload,
  MistakeBook.preload,
  CheckIn.preload,
  Profile.preload,
];

const preloadCommonRoutes = () => {
  const connection = navigator.connection || navigator.mozConnection || navigator.webkitConnection;
  if (connection?.saveData) {
    return () => {};
  }

  let cancelled = false;
  let timeoutId = null;
  let idleId = null;

  const run = async () => {
    for (const preload of COMMON_ROUTE_PRELOADERS) {
      if (cancelled) {
        return;
      }
      try {
        await preload();
      } catch {
        // Route preloading is best-effort.
      }
      await new Promise((resolve) => {
        timeoutId = window.setTimeout(resolve, 1200);
      });
    }
  };

  const start = () => {
    if ('requestIdleCallback' in window) {
      idleId = window.requestIdleCallback(() => { void run(); }, { timeout: 6000 });
    } else {
      timeoutId = window.setTimeout(() => { void run(); }, 3500);
    }
  };

  start();
  return () => {
    cancelled = true;
    if (idleId) window.cancelIdleCallback(idleId);
    if (timeoutId) window.clearTimeout(timeoutId);
  };
};

// 路由级全局加载骨架
const PageLoading = () => (
  <div style={{ display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center', height: '100%', minHeight: '50vh' }}>
    <Spin size="large" tip="载入模块中..." />
  </div>
);

function App() {
  useEffect(() => preloadCommonRoutes(), []);

  return (
    <ConfigProvider
      locale={zhCN}
      theme={{
        token: {
          colorPrimary: '#6366f1',
          colorInfo: '#6366f1',
          colorSuccess: '#10b981',
          colorBgContainer: 'rgba(255, 255, 255, 0.65)',
          colorBgElevated: 'rgba(255, 255, 255, 0.85)',
          borderRadius: 12,
          fontFamily: "'Outfit', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif",
        },
        components: {
          Card: {
            colorBgContainer: 'rgba(255, 255, 255, 0.6)',
          },
          Button: {
            borderRadius: 8,
            controlHeight: 40,
            controlHeightLG: 48,
          },
          Input: {
            colorBgContainer: 'rgba(255, 255, 255, 0.7)',
            borderRadius: 8,
            controlHeight: 44,
          }
        }
      }}
    >
      <AppProviders>
        <Router>
          <NavigateSetter />
          <Suspense fallback={<PageLoading />}>
            <Routes>
              {/* 公开路由 */}
              <Route path="/login" element={<Login />} />
              <Route path="/register" element={<Register />} />

              {/* 受保护的路由 (采用 Dashboard 布局) */}
              <Route path="/" element={<ProtectedRoute><MainLayout /></ProtectedRoute>}>
                <Route index element={<Navigate to="/home" replace />} />
                <Route path="home" element={<Home />} />
                <Route path="chapter-select" element={<SequentialSelect />} />
                <Route path="learning" element={<Learning />} />
                <Route path="random-group" element={<Learning />} />
                <Route path="random-word" element={<Learning />} />
                <Route path="review" element={<Review />} />
                <Route path="mistake-book" element={<MistakeBook />} />
                <Route path="quiz" element={<Quiz />} />
                <Route path="check-in" element={<CheckIn />} />
                <Route path="calendar" element={<LearningCalendar />} />
                <Route path="profile" element={<Profile />} />
                <Route path="custom-books" element={<CustomBooks />} />
                <Route path="custom-books/:bookId" element={<CustomBooks />} />
                <Route path="custom-books/:bookId/groups/:groupId/learn" element={<CustomBookLearning />} />
                <Route path="admin/users" element={<ProtectedRoute minRole="admin"><AdminUsers /></ProtectedRoute>} />
                <Route path="admin/content" element={<ProtectedRoute minRole="admin"><AdminContent /></ProtectedRoute>} />
                <Route path="admin/super" element={<ProtectedRoute minRole="super_admin"><SuperAdmin /></ProtectedRoute>} />
                <Route path="admin/avatars" element={<ProtectedRoute minRole="super_admin"><AdminBuiltinAvatars /></ProtectedRoute>} />
                <Route path="admin/avatar-unlocks" element={<ProtectedRoute minRole="super_admin"><AdminAvatarUnlockRules /></ProtectedRoute>} />
              </Route>

              {/* 404 页面 */}
              <Route path="*" element={<NotFound />} />
            </Routes>
          </Suspense>
        </Router>
      </AppProviders>
    </ConfigProvider>
  );
}

export default App;
