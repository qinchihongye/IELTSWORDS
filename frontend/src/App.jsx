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
const Login = lazy(() => import('./pages/Login'));
const Register = lazy(() => import('./pages/Register'));
const Home = lazy(() => import('./pages/Home'));
const SequentialSelect = lazy(() => import('./pages/SequentialSelect'));
const Learning = lazy(() => import('./pages/Learning'));
const Review = lazy(() => import('./pages/Review'));
const MistakeBook = lazy(() => import('./pages/MistakeBook'));
const Quiz = lazy(() => import('./pages/Quiz'));
const CheckIn = lazy(() => import('./pages/CheckIn'));
const LearningCalendar = lazy(() => import('./pages/LearningCalendar'));
const Profile = lazy(() => import('./pages/Profile'));
const CustomBooks = lazy(() => import('./pages/CustomBooks'));
const CustomBookLearning = lazy(() => import('./pages/CustomBookLearning'));
const AdminUsers = lazy(() => import('./pages/AdminUsers'));
const AdminContent = lazy(() => import('./pages/AdminContent'));
const SuperAdmin = lazy(() => import('./pages/SuperAdmin'));
const NotFound = lazy(() => import('./pages/NotFound'));

// 路由级全局加载骨架
const PageLoading = () => (
  <div style={{ display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center', height: '100%', minHeight: '50vh' }}>
    <Spin size="large" tip="载入模块中..." />
  </div>
);

function App() {
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
