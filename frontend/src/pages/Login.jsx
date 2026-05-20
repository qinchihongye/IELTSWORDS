import React, { useRef, useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { motion } from 'framer-motion';
import { Modal, message } from 'antd';

const Login = () => {
  const [loading, setLoading] = useState(false);
  const [resetLoading, setResetLoading] = useState(false);
  const [resetModalOpen, setResetModalOpen] = useState(false);
  const [resetStep, setResetStep] = useState('email');
  const [resetEmail, setResetEmail] = useState('');
  const [resetCode, setResetCode] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [isLensVisible, setIsLensVisible] = useState(false);
  const [isFormFocused, setIsFormFocused] = useState(false);
  const pageRef = useRef(null);
  const { login, verifyResetEmail, resetPassword } = useAuth();
  const navigate = useNavigate();

  const handleLensMove = (e) => {
    if (isFormFocused) return;
    if (!pageRef.current) return;
    pageRef.current.style.setProperty('--lens-x', `${e.clientX + window.scrollX}px`);
    pageRef.current.style.setProperty('--lens-y', `${e.clientY + window.scrollY}px`);
    setIsLensVisible(true);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    const formData = new FormData(e.target);
    const username = formData.get('username');
    const password = formData.get('password');
    if (!username || !password) return;

    setLoading(true);
    const success = await login(username, password);
    setLoading(false);
    if (success) navigate('/home');
  };

  const openResetModal = () => {
    setResetModalOpen(true);
    setResetStep('email');
    setNewPassword('');
    setConfirmPassword('');
    setResetCode('');
  };

  const closeResetModal = () => {
    setResetModalOpen(false);
    setResetLoading(false);
    setResetStep('email');
    setResetEmail('');
    setResetCode('');
    setNewPassword('');
    setConfirmPassword('');
  };

  const handleVerifyResetEmail = async (e) => {
    e.preventDefault();
    if (!resetEmail) {
      message.warning('请输入注册邮箱');
      return;
    }

    setResetLoading(true);
    const result = await verifyResetEmail(resetEmail);
    setResetLoading(false);
    if (result) {
      setResetStep('password');
    }
  };

  const handleResetPassword = async (e) => {
    e.preventDefault();

    if (newPassword.length < 8) {
      message.warning('密码至少 8 位');
      return;
    }

    if (newPassword !== confirmPassword) {
      message.warning('两次输入的密码不一致');
      return;
    }

    setResetLoading(true);
    const success = await resetPassword(resetEmail, resetCode, newPassword);
    setResetLoading(false);
    if (success) {
      closeResetModal();
    }
  };

  return (
    <>
      <style>{css}</style>

      <div
        ref={pageRef}
        className={`login-page ${isLensVisible ? 'login-page--lens-visible' : ''}`}
        onMouseMove={handleLensMove}
        onMouseLeave={() => {
          setIsLensVisible(false);
        }}
        onFocusCapture={(e) => {
          if (e.target.matches('input, button, a')) {
            setIsFormFocused(true);
            setIsLensVisible(false);
          }
        }}
        onBlurCapture={(e) => {
          if (e.target.matches('input, button, a')) {
            setIsFormFocused(false);
          }
        }}
      >
        {renderLoginExperience(enCopy, { loading, handleSubmit, openResetModal })}
        <div className="login-lens-layer" aria-hidden="true">
          {renderLoginExperience(enCopy, { loading, handleSubmit, openResetModal })}
        </div>
      </div>
      <Modal
        title={resetStep === 'email' ? '验证邮箱' : '修改密码'}
        open={resetModalOpen}
        onCancel={closeResetModal}
        footer={null}
        destroyOnHidden
        centered
      >
        {resetStep === 'email' ? (
          <form className="password-reset-form" onSubmit={handleVerifyResetEmail}>
            <p className="password-reset-hint">请输入注册时使用的邮箱，系统会生成一个验证码。</p>
            <input
              type="email"
              value={resetEmail}
              onChange={(e) => setResetEmail(e.target.value)}
              placeholder="注册邮箱"
              className="login-input password-reset-input"
              required
            />
            <button type="submit" className="login-submit-btn" disabled={resetLoading}>
              {resetLoading ? '验证中...' : '验证邮箱'}
            </button>
          </form>
        ) : (
          <form className="password-reset-form" onSubmit={handleResetPassword}>
            <p className="password-reset-hint">
              请输入邮箱验证码并设置新密码。
            </p>
            <input
              type="text"
              value={resetCode}
              onChange={(e) => setResetCode(e.target.value)}
              placeholder="邮箱验证码"
              className="login-input password-reset-input"
              required
            />
            <input
              type="password"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              placeholder="新密码（至少 8 位）"
              className="login-input password-reset-input"
              required
            />
            <input
              type="password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              placeholder="确认新密码"
              className="login-input password-reset-input"
              required
            />
            <button type="submit" className="login-submit-btn" disabled={resetLoading}>
              {resetLoading ? '更新中...' : '更新密码'}
            </button>
          </form>
        )}
      </Modal>
    </>
  );
};

const renderLoginExperience = (copy, { loading, handleSubmit, openResetModal, isMirror = false }) => (
  <div className={`login-container ${isMirror ? 'login-container--mirror' : ''}`}>
    <div className="login-hero-section">
      <motion.div
        className="hero-content"
        initial={isMirror ? false : { opacity: 0, x: -30 }}
        animate={isMirror ? undefined : { opacity: 1, x: 0 }}
        transition={{ duration: 0.8, ease: "easeOut" }}
      >
        <div className="hero-brand">
          <img src="/favicon.png" alt="Logo" className="hero-logo" />
          <span className="hero-brand-name">IELTS Master</span>
        </div>

        <h1 className="hero-title" data-translation={`${zhCopy.heroTitle} ${zhCopy.heroTitleBreak}`}>
          {renderText('heroTitle', copy, isMirror)}<br/>
          {renderText('heroTitleBreak', copy, isMirror)}
        </h1>
        <p className="hero-subtitle" data-translation={zhCopy.heroSubtitle}>{renderText('heroSubtitle', copy, isMirror)}</p>

        <motion.img
          src="/login-hero.png"
          alt="IELTS Learning Illustration"
          className="hero-illustration"
          initial={isMirror ? false : { opacity: 0, y: 20 }}
          animate={isMirror ? undefined : { opacity: 1, y: 0 }}
          transition={{ delay: 0.3, duration: 0.8 }}
        />
      </motion.div>
    </div>

    <div className="login-form-section">
      <motion.div
        className="login-glass-panel"
        initial={isMirror ? false : { opacity: 0, y: 30 }}
        animate={isMirror ? undefined : { opacity: 1, y: 0 }}
        transition={{ duration: 0.6, ease: [0.4, 0, 0.2, 1] }}
      >
        <div className="form-header">
          <h2 className="form-title" data-translation={zhCopy.formTitle}>{renderText('formTitle', copy, isMirror)}</h2>
          <p className="form-subtitle" data-translation={zhCopy.formSubtitle}>{renderText('formSubtitle', copy, isMirror)}</p>
        </div>

        <form onSubmit={isMirror ? undefined : handleSubmit} className="login-form">
          <motion.div
            className="input-group"
            initial={isMirror ? false : { opacity: 0, y: 10 }}
            animate={isMirror ? undefined : { opacity: 1, y: 0 }}
            transition={{ delay: 0.2, duration: 0.5 }}
          >
            <div className="input-wrapper">
              <svg className="input-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path strokeLinecap="round" strokeLinejoin="round" d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
              </svg>
              <input
                type="text"
                name="username"
                placeholder={isMirror ? enCopy.usernamePlaceholder : copy.usernamePlaceholder}
                className="login-input"
                required
                disabled={isMirror}
                data-translation={zhCopy.usernamePlaceholder}
              />
              {isMirror && <span className="input-translation">{copy.usernamePlaceholder}</span>}
            </div>
          </motion.div>

          <motion.div
            className="input-group"
            initial={isMirror ? false : { opacity: 0, y: 10 }}
            animate={isMirror ? undefined : { opacity: 1, y: 0 }}
            transition={{ delay: 0.3, duration: 0.5 }}
          >
            <div className="input-wrapper">
              <svg className="input-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
              </svg>
              <input
                type="password"
                name="password"
                placeholder={isMirror ? enCopy.passwordPlaceholder : copy.passwordPlaceholder}
                className="login-input"
                required
                disabled={isMirror}
                data-translation={zhCopy.passwordPlaceholder}
              />
              {isMirror && <span className="input-translation">{copy.passwordPlaceholder}</span>}
            </div>
          </motion.div>

          <motion.div
            className="forgot-password"
            initial={isMirror ? false : { opacity: 0 }}
            animate={isMirror ? undefined : { opacity: 1 }}
            transition={{ delay: 0.4 }}
          >
            {isMirror ? (
              <span>{renderText('forgotPassword', copy, isMirror)}</span>
            ) : (
              <a
                href="#"
                data-translation={zhCopy.forgotPassword}
                onClick={(event) => {
                  event.preventDefault();
                  openResetModal();
                }}
              >
                {copy.forgotPassword}
              </a>
            )}
          </motion.div>

          <motion.button
            type="submit"
            className="login-submit-btn"
            disabled={loading || isMirror}
            data-translation={loading ? zhCopy.loggingIn : zhCopy.loginButton}
            initial={isMirror ? false : { opacity: 0, y: 10 }}
            animate={isMirror ? undefined : { opacity: 1, y: 0 }}
            transition={{ delay: 0.4, duration: 0.5 }}
          >
            {loading ? renderText('loggingIn', copy, isMirror) : renderText('loginButton', copy, isMirror)}
          </motion.button>
        </form>

        <motion.div
          className="login-divider"
          initial={isMirror ? false : { opacity: 0 }}
          animate={isMirror ? undefined : { opacity: 1 }}
          transition={{ delay: 0.5 }}
        >
          <span data-translation={zhCopy.socialDivider}>{renderText('socialDivider', copy, isMirror)}</span>
        </motion.div>

        <motion.div
          className="social-login"
          initial={isMirror ? false : { opacity: 0 }}
          animate={isMirror ? undefined : { opacity: 1 }}
          transition={{ delay: 0.6 }}
        >
          <button className="social-btn" disabled={isMirror}>
            <svg viewBox="0 0 24 24" width="24" height="24" xmlns="http://www.w3.org/2000/svg">
              <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
              <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
              <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/>
              <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
            </svg>
          </button>
          <button className="social-btn" disabled={isMirror}>
            <svg viewBox="0 0 24 24" width="24" height="24" xmlns="http://www.w3.org/2000/svg" fill="currentColor">
              <path d="M17.05 20.28c-.98.95-2.05.8-3.08.35-1.09-.46-2.09-.48-3.24 0-1.44.62-2.2.44-3.06-.35C2.79 15.25 3.51 7.59 9.05 7.31c1.35.05 2.25.82 2.98.82.74 0 1.94-.92 3.44-.79 1.15.04 2.23.47 3.02 1.25-2.6 1.56-2.14 4.88.54 5.92-.68 1.9-1.63 4.1-2.98 5.77zm-3.72-13.8c-.28-2.26 1.4-4.22 3.65-4.48.33 2.4-1.66 4.41-3.65 4.48z"/>
            </svg>
          </button>
        </motion.div>

        <motion.div
          className="login-register"
          initial={isMirror ? false : { opacity: 0 }}
          animate={isMirror ? undefined : { opacity: 1 }}
          transition={{ delay: 0.7 }}
        >
          <span data-translation={zhCopy.noAccount}>{renderText('noAccount', copy, isMirror)}</span> {isMirror ? <span>{renderText('signUp', copy, isMirror)}</span> : <Link to="/register" data-translation={zhCopy.signUp}>{copy.signUp}</Link>}
        </motion.div>
      </motion.div>
    </div>
  </div>
);

const renderText = (key, copy, isMirror) => {
  if (!isMirror) return copy[key];
  return <MirrorText base={enCopy[key]} translation={copy[key]} />;
};

const MirrorText = ({ base, translation }) => (
  <span className="mirror-text">
    <span className="mirror-text__spacer">{base}</span>
    <span className="mirror-text__translation">{translation}</span>
  </span>
);

const enCopy = {
  heroTitle: 'Unlock your potential.',
  heroTitleBreak: 'Achieve your dreams.',
  heroSubtitle: 'Welcome to IELTS Master. Prepare for success with our personalized, image-based vocabulary learning system.',
  formTitle: 'Log In to Your Account',
  formSubtitle: 'Access your personalized learning path.',
  usernamePlaceholder: 'Email or Username',
  passwordPlaceholder: 'Password',
  forgotPassword: 'Forgot password?',
  loggingIn: 'LOGGING IN...',
  loginButton: 'LOG IN',
  socialDivider: 'Or login with:',
  noAccount: "Don't have an account?",
  signUp: 'Sign Up',
};

const zhCopy = {
  heroTitle: '释放你的潜力。',
  heroTitleBreak: '抵达你的目标。',
  heroSubtitle: '欢迎使用 IELTS Master。用个性化、图像化的词汇学习系统，为雅思备考建立更稳的记忆路径。',
  formTitle: '登录你的账户',
  formSubtitle: '进入你的个性化学习路径。',
  usernamePlaceholder: '邮箱或用户名',
  passwordPlaceholder: '密码',
  forgotPassword: '忘记密码？',
  loggingIn: '登录中...',
  loginButton: '登录',
  socialDivider: '或使用以下方式登录：',
  noAccount: '还没有账户？',
  signUp: '注册',
};

const css = `
.login-page {
  --lens-x: 50vw;
  --lens-y: 50vh;
  --lens-radius: 233px;
  position: relative;
  min-height: 100vh;
  overflow: hidden;
}

.login-container {
  display: flex;
  justify-content: center;
  min-height: 100vh;
  background-color: #f8fafc;
  font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
  position: relative;
}

.login-lens-layer {
  position: absolute;
  inset: 0;
  z-index: 18;
  pointer-events: none;
  opacity: 0;
  clip-path: circle(var(--lens-radius) at var(--lens-x) var(--lens-y));
  transition: opacity 0.18s ease;
}

.login-page--lens-visible .login-lens-layer {
  opacity: 1;
}

.login-page::after {
  content: '';
  position: absolute;
  left: calc(var(--lens-x) - var(--lens-radius));
  top: calc(var(--lens-y) - var(--lens-radius));
  width: calc(var(--lens-radius) * 2);
  height: calc(var(--lens-radius) * 2);
  border-radius: 50%;
  z-index: 16;
  pointer-events: none;
  opacity: 0;
  box-shadow:
    inset 0 0 0 1px rgba(255, 255, 255, 0.75),
    inset 0 0 34px rgba(255, 255, 255, 0.56),
    0 14px 42px rgba(15, 23, 42, 0.16);
  transition: opacity 0.18s ease;
}

.login-page--lens-visible::after {
  opacity: 1;
}

.login-container--mirror {
  color: #0f172a;
}

.login-container--mirror .login-input:disabled,
.login-container--mirror .login-submit-btn:disabled,
.login-container--mirror .social-btn:disabled {
  opacity: 1;
  cursor: default;
}

.login-container--mirror .login-input:disabled {
  color: #334155;
  background: #ffffff;
  -webkit-text-fill-color: #334155;
}

.login-container--mirror .login-input::placeholder {
  color: transparent;
}

.input-translation {
  position: absolute;
  left: 48px;
  right: 16px;
  top: 50%;
  transform: translateY(-50%);
  color: #334155;
  font-size: 15px;
  pointer-events: none;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.login-container--mirror .forgot-password span,
.login-container--mirror .login-register span {
  color: #4f46e5;
  font-weight: 600;
}

.mirror-text {
  position: relative;
  display: inline-block;
  white-space: nowrap;
}

.mirror-text__spacer {
  visibility: hidden;
}

.mirror-text__translation {
  position: absolute;
  left: 50%;
  top: 0;
  color: inherit;
  visibility: visible;
  white-space: nowrap;
  transform: translateX(-50%);
}

/* --- Left Hero Section --- */
.login-hero-section {
  width: 50%;
  max-width: 650px;
  display: flex;
  flex-direction: column;
  justify-content: center;
  padding: 60px 80px;
  background: radial-gradient(circle at top left, #ffffff, #f1f5f9);
  position: relative;
  overflow: hidden;
}

.hero-content {
  max-width: 600px;
  position: relative;
  z-index: 2;
}

.hero-brand {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-bottom: 60px;
}

.hero-logo {
  width: 36px;
  height: 36px;
  border-radius: 8px;
  box-shadow: 0 4px 12px rgba(99, 102, 241, 0.2);
}

.hero-brand-name {
  font-size: 20px;
  font-weight: 700;
  color: #1e293b;
  letter-spacing: -0.5px;
}

.hero-title {
  font-size: 48px;
  line-height: 1.15;
  font-weight: 800;
  color: #0f172a;
  margin-bottom: 24px;
  letter-spacing: -1px;
}

.hero-subtitle {
  font-size: 18px;
  line-height: 1.6;
  color: #475569;
  margin-bottom: 40px;
  max-width: 480px;
}

.hero-illustration {
  width: 100%;
  max-width: 500px;
  height: auto;
  object-fit: contain;
  filter: drop-shadow(0 20px 40px rgba(0,0,0,0.08));
}

/* --- Right Form Section --- */
.login-form-section {
  width: 50%;
  max-width: 650px;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 40px;
  background: transparent;
}

.login-glass-panel {
  width: 100%;
  max-width: 440px;
  min-height: 620px;
  box-sizing: border-box;
  background: rgba(255, 255, 255, 0.85);
  backdrop-filter: blur(20px);
  -webkit-backdrop-filter: blur(20px);
  border: 1px solid rgba(255, 255, 255, 0.5);
  border-radius: 24px;
  padding: 48px;
  box-shadow: 0 20px 60px rgba(0, 0, 0, 0.05), 0 0 0 1px rgba(0,0,0,0.02);
}

.form-header {
  margin-bottom: 32px;
}

.form-title {
  font-size: 28px;
  font-weight: 700;
  color: #1e293b;
  margin: 0 0 8px 0;
  letter-spacing: -0.5px;
}

.form-subtitle {
  font-size: 15px;
  color: #64748b;
  margin: 0;
}

/* --- Form Elements --- */
.login-form {
  display: flex;
  flex-direction: column;
  gap: 20px;
}

.input-group {
  width: 100%;
}

.input-wrapper {
  position: relative;
  display: flex;
  align-items: center;
}

.input-icon {
  position: absolute;
  left: 16px;
  width: 20px;
  height: 20px;
  color: #94a3b8;
  pointer-events: none;
  transition: color 0.3s;
}

.login-input {
  width: 100%;
  padding: 16px 16px 16px 48px;
  background: #ffffff;
  border: 1px solid #e2e8f0;
  border-radius: 12px;
  font-size: 15px;
  color: #334155;
  transition: all 0.3s ease;
  box-shadow: 0 2px 4px rgba(0,0,0,0.02);
}

.login-input::placeholder {
  color: #94a3b8;
}

.login-input:focus {
  outline: none;
  border-color: #6366f1;
  box-shadow: 0 0 0 4px rgba(99, 102, 241, 0.1);
}

.login-input:focus + .input-icon,
.login-input:not(:placeholder-shown) + .input-icon {
  color: #6366f1;
}

.forgot-password {
  text-align: right;
  margin-top: -8px;
}

.forgot-password a {
  font-size: 13px;
  font-weight: 500;
  color: #64748b;
  text-decoration: none;
  transition: color 0.2s;
}

.forgot-password a:hover {
  color: #4f46e5;
}

.login-submit-btn {
  width: 100%;
  padding: 16px;
  margin-top: 8px;
  background: linear-gradient(135deg, #6366f1 0%, #4f46e5 100%);
  color: white;
  border: none;
  border-radius: 12px;
  font-size: 16px;
  font-weight: 600;
  letter-spacing: 0.5px;
  cursor: pointer;
  box-shadow: 0 10px 20px rgba(99, 102, 241, 0.25);
  transition: all 0.3s ease;
}

.login-submit-btn:hover {
  transform: translateY(-2px);
  box-shadow: 0 14px 28px rgba(99, 102, 241, 0.3);
}

.login-submit-btn:active {
  transform: translateY(0);
}

.login-submit-btn:disabled {
  opacity: 0.7;
  cursor: not-allowed;
  transform: none;
}

/* --- Divider --- */
.login-divider {
  display: flex;
  align-items: center;
  justify-content: center;
  margin: 32px 0 24px;
  position: relative;
}

.login-divider::before,
.login-divider::after {
  content: '';
  position: absolute;
  top: 50%;
  width: calc(50% - 60px);
  height: 1px;
  background: #e2e8f0;
}

.login-divider::before { left: 0; }
.login-divider::after { right: 0; }

.login-divider span {
  font-size: 13px;
  color: #64748b;
  background: transparent;
  padding: 0;
}

/* --- Social & Register --- */
.social-login {
  display: flex;
  justify-content: center;
  gap: 16px;
  margin-bottom: 32px;
}

.social-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 56px;
  height: 56px;
  background: #ffffff;
  border: 1px solid #e2e8f0;
  border-radius: 50%;
  cursor: pointer;
  transition: all 0.3s ease;
  color: #334155;
  box-shadow: 0 2px 8px rgba(0,0,0,0.04);
}

.social-btn:hover {
  border-color: #cbd5e1;
  transform: translateY(-2px);
  box-shadow: 0 6px 12px rgba(0,0,0,0.06);
}

.login-register {
  text-align: center;
  font-size: 14px;
  color: #475569;
}

.login-register a {
  color: #4f46e5;
  font-weight: 600;
  text-decoration: none;
  margin-left: 4px;
  transition: color 0.2s;
}

.login-register a:hover {
  text-decoration: underline;
  color: #4338ca;
}

.password-reset-form {
  display: flex;
  flex-direction: column;
  gap: 16px;
  padding-top: 4px;
}

.password-reset-hint {
  margin: 0 0 4px;
  color: #64748b;
  font-size: 14px;
  line-height: 1.6;
}

.password-reset-input {
  box-sizing: border-box;
}

/* --- Responsive Design --- */
@media (max-width: 1024px) {
  .hero-title { font-size: 40px; }
  .login-form-section { width: 50%; padding: 32px; }
  .login-hero-section { width: 50%; padding: 40px; }
}

@media (max-width: 768px) {
  .login-hero-section { display: none; }
  .login-form-section { width: 100%; max-width: 100%; padding: 24px; }
  .login-glass-panel { min-height: auto; padding: 32px 24px; }
  .login-page { --lens-radius: 195px; }
}
`;

export default Login;
