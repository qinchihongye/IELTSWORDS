import React, { useRef, useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { motion } from 'framer-motion';

const Register = () => {
  const [loading, setLoading] = useState(false);
  const [errors, setErrors] = useState({});
  const [isLensVisible, setIsLensVisible] = useState(false);
  const [isFormFocused, setIsFormFocused] = useState(false);
  const pageRef = useRef(null);
  const { register } = useAuth();
  const navigate = useNavigate();

  const handleLensMove = (e) => {
    if (isFormFocused) return;
    if (!pageRef.current) return;
    pageRef.current.style.setProperty('--lens-x', `${e.clientX + window.scrollX}px`);
    pageRef.current.style.setProperty('--lens-y', `${e.clientY + window.scrollY}px`);
    setIsLensVisible(true);
  };

  const validate = (formData) => {
    const errs = {};
    const username = formData.get('username');
    const email = formData.get('email');
    const password = formData.get('password');
    const confirm = formData.get('confirm');

    if (!username || username.length < 3) errs.username = 'username';
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) errs.email = 'email';
    if (!password || password.length < 8) errs.password = 'password';
    if (password !== confirm) errs.confirm = 'confirm';

    return errs;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    const formData = new FormData(e.target);
    const errs = validate(formData);
    setErrors(errs);
    if (Object.keys(errs).length > 0) return;

    setLoading(true);
    const success = await register(
      formData.get('username'),
      formData.get('email'),
      formData.get('password')
    );
    setLoading(false);
    if (success) navigate('/login');
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
	        {renderRegisterExperience(enCopy, { loading, handleSubmit, errors })}
	        <div className="login-lens-layer" aria-hidden="true">
	          {renderRegisterExperience(enCopy, { loading, handleSubmit, errors })}
	        </div>
	      </div>
	    </>
	  );
	};

const renderRegisterExperience = (copy, { loading, handleSubmit, errors, isMirror = false }) => {
  const getError = (field) => errors[field] ? copy.errors[errors[field]] : null;

  return (
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
            <motion.div className="input-group" initial={isMirror ? false : { opacity: 0, y: 10 }} animate={isMirror ? undefined : { opacity: 1, y: 0 }} transition={{ delay: 0.2, duration: 0.5 }}>
              <div className="input-wrapper">
                <svg className="input-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M16 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2" />
                  <circle cx="8.5" cy="7" r="4" />
                  <line x1="20" y1="8" x2="20" y2="14" />
                  <line x1="23" y1="11" x2="17" y2="11" />
                </svg>
                <input type="text" name="username" placeholder={isMirror ? enCopy.usernamePlaceholder : copy.usernamePlaceholder} className={`login-input ${errors.username ? 'input-error' : ''}`} required disabled={isMirror} data-translation={zhCopy.usernamePlaceholder} />
                {isMirror && <span className="input-translation">{copy.usernamePlaceholder}</span>}
              </div>
              {getError('username') && <span className="field-error">{getError('username')}</span>}
            </motion.div>

            <motion.div className="input-group" initial={isMirror ? false : { opacity: 0, y: 10 }} animate={isMirror ? undefined : { opacity: 1, y: 0 }} transition={{ delay: 0.25, duration: 0.5 }}>
              <div className="input-wrapper">
                <svg className="input-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                </svg>
                <input type="email" name="email" placeholder={isMirror ? enCopy.emailPlaceholder : copy.emailPlaceholder} className={`login-input ${errors.email ? 'input-error' : ''}`} required disabled={isMirror} data-translation={zhCopy.emailPlaceholder} />
                {isMirror && <span className="input-translation">{copy.emailPlaceholder}</span>}
              </div>
              {getError('email') && <span className="field-error">{getError('email')}</span>}
            </motion.div>

            <motion.div className="input-group" initial={isMirror ? false : { opacity: 0, y: 10 }} animate={isMirror ? undefined : { opacity: 1, y: 0 }} transition={{ delay: 0.3, duration: 0.5 }}>
              <div className="input-wrapper">
                <svg className="input-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                </svg>
                <input type="password" name="password" placeholder={isMirror ? enCopy.passwordPlaceholder : copy.passwordPlaceholder} className={`login-input ${errors.password ? 'input-error' : ''}`} required disabled={isMirror} data-translation={zhCopy.passwordPlaceholder} />
                {isMirror && <span className="input-translation">{copy.passwordPlaceholder}</span>}
              </div>
              {getError('password') && <span className="field-error">{getError('password')}</span>}
            </motion.div>

            <motion.div className="input-group" initial={isMirror ? false : { opacity: 0, y: 10 }} animate={isMirror ? undefined : { opacity: 1, y: 0 }} transition={{ delay: 0.35, duration: 0.5 }}>
              <div className="input-wrapper">
                <svg className="input-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
                </svg>
                <input type="password" name="confirm" placeholder={isMirror ? enCopy.confirmPlaceholder : copy.confirmPlaceholder} className={`login-input ${errors.confirm ? 'input-error' : ''}`} required disabled={isMirror} data-translation={zhCopy.confirmPlaceholder} />
                {isMirror && <span className="input-translation">{copy.confirmPlaceholder}</span>}
              </div>
              {getError('confirm') && <span className="field-error">{getError('confirm')}</span>}
            </motion.div>

            <motion.button
              type="submit"
              className="login-submit-btn register-btn"
              disabled={loading || isMirror}
              data-translation={loading ? zhCopy.creatingAccount : zhCopy.signUpButton}
              initial={isMirror ? false : { opacity: 0, y: 10 }}
              animate={isMirror ? undefined : { opacity: 1, y: 0 }}
              transition={{ delay: 0.45, duration: 0.5 }}
            >
              {loading ? renderText('creatingAccount', copy, isMirror) : renderText('signUpButton', copy, isMirror)}
            </motion.button>
          </form>

          <motion.div className="login-divider" initial={isMirror ? false : { opacity: 0 }} animate={isMirror ? undefined : { opacity: 1 }} transition={{ delay: 0.5 }}>
            <span data-translation={zhCopy.divider}>{renderText('divider', copy, isMirror)}</span>
          </motion.div>

          <motion.div className="login-register" initial={isMirror ? false : { opacity: 0 }} animate={isMirror ? undefined : { opacity: 1 }} transition={{ delay: 0.55 }}>
            <span data-translation={zhCopy.hasAccount}>{renderText('hasAccount', copy, isMirror)}</span> {isMirror ? <span>{renderText('logIn', copy, isMirror)}</span> : <Link to="/login" data-translation={zhCopy.logIn}>{copy.logIn}</Link>}
          </motion.div>
        </motion.div>
      </div>
    </div>
  );
};

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
  heroTitle: 'Start your journey.',
  heroTitleBreak: 'Join us today.',
  heroSubtitle: 'Create an account to track your progress and master IELTS vocabulary with visual memory techniques.',
  formTitle: 'Create Account',
  formSubtitle: 'Register to start your personalized learning.',
  usernamePlaceholder: 'Username',
  emailPlaceholder: 'Email Address',
  passwordPlaceholder: 'Password (min 8 chars)',
  confirmPlaceholder: 'Confirm Password',
  creatingAccount: 'CREATING ACCOUNT...',
  signUpButton: 'SIGN UP',
  divider: 'Or',
  hasAccount: 'Already have an account?',
  logIn: 'Log In',
  errors: {
    username: 'Username must be at least 3 characters',
    email: 'Please enter a valid email address',
    password: 'Password must be at least 8 characters',
    confirm: 'Passwords do not match',
  },
};

const zhCopy = {
  heroTitle: '开启你的旅程。',
  heroTitleBreak: '今天就加入。',
  heroSubtitle: '创建账户，记录学习进度，用图像记忆方法掌握雅思词汇。',
  formTitle: '创建账户',
  formSubtitle: '注册后开始你的个性化学习。',
  usernamePlaceholder: '用户名',
  emailPlaceholder: '邮箱地址',
  passwordPlaceholder: '密码（至少 8 位）',
  confirmPlaceholder: '确认密码',
  creatingAccount: '正在创建账户...',
  signUpButton: '注册',
  divider: '或',
  hasAccount: '已有账户？',
  logIn: '登录',
  errors: {
    username: '用户名至少 3 个字符',
    email: '请输入有效的邮箱地址',
    password: '密码至少 8 个字符',
    confirm: '两次输入的密码不一致',
  },
};

// Reusing the exact same CSS as Login.jsx for visual consistency,
// but adding the .input-error and .field-error specific to register.
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

.login-container--mirror .login-input:disabled,
.login-container--mirror .login-submit-btn:disabled {
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
  min-height: 640px;
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
  gap: 16px; /* slightly smaller gap for register due to more fields */
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

.input-error {
  border-color: #ef4444 !important;
}

.input-error + .input-icon {
  color: #ef4444 !important;
}

.field-error {
  display: block;
  color: #ef4444;
  font-size: 13px;
  margin-top: 6px;
  margin-left: 4px;
}

.login-submit-btn {
  width: 100%;
  padding: 16px;
  margin-top: 12px;
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

.register-btn {
  background: linear-gradient(135deg, #10b981 0%, #059669 100%);
  box-shadow: 0 10px 20px rgba(16, 185, 129, 0.25);
}

.login-submit-btn:hover {
  transform: translateY(-2px);
  box-shadow: 0 14px 28px rgba(99, 102, 241, 0.3);
}

.register-btn:hover {
  box-shadow: 0 14px 28px rgba(16, 185, 129, 0.3);
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
  width: calc(50% - 30px);
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

export default Register;
