import React, { useEffect, useMemo, useRef, useState, useCallback } from 'react';
import { Button, Drawer, Dropdown, Empty, FloatButton, Input, Modal, Select, Space, Tooltip, Typography, message } from 'antd';
import { AudioOutlined, SoundOutlined, BulbOutlined, CaretUpOutlined, ClockCircleOutlined, CloseOutlined, DeleteOutlined, DownOutlined, EditOutlined, EllipsisOutlined, ExportOutlined, GlobalOutlined, LinkOutlined, MessageOutlined, PlusOutlined, ReloadOutlined, RightOutlined, RobotOutlined, SearchOutlined, SendOutlined, SettingOutlined, StarFilled, StarOutlined, ThunderboltFilled, ArrowLeftOutlined, CheckOutlined } from '@ant-design/icons';
import { useAIChat, getLocalAISettings } from '../context/AIChatContext';
import { useAuth } from '../context/AuthContext';
import AIMarkdownContent from './AIMarkdownContent';
import UserAvatar from './UserAvatar';
import { getAvatarSrc } from '../utils/avatars';
import deepseekProviderIcon from '../assets/provider-icons/deepseek.png';
import siliconflowProviderIcon from '../assets/provider-icons/siliconflow.png';
import moonshotProviderIcon from '../assets/provider-icons/moonshot.png';

const { Text, Title } = Typography;

const MODEL_PROVIDER_ORDER = ['SiliconFlow', 'DeepSeek', 'OpenAI', 'Anthropic (Claude)', 'Kimi', 'Other models'];
const AI_DRAWER_WIDTH_KEY = 'ieltswords_ai_drawer_width';
const AI_WEB_SEARCH_AUTO_EXPAND_KEY = 'ieltswords_ai_web_search_auto_expand';
const AI_DRAWER_DEFAULT_WIDTH = 420;
const AI_DRAWER_MIN_WIDTH = 360;
const AI_DRAWER_MAX_WIDTH = 760;
const AI_DRAWER_MAX_VIEWPORT_RATIO = 1 / 3;
const AI_DRAWER_DESKTOP_BREAKPOINT = 768;
const AI_DRAWER_VIEWPORT_GAP = 32;

const getMaxDrawerWidth = (viewportWidth) => {
  const safeWidth = Number.isFinite(viewportWidth) ? viewportWidth : AI_DRAWER_DEFAULT_WIDTH;
  const ratioLimitedWidth = Math.floor(safeWidth * AI_DRAWER_MAX_VIEWPORT_RATIO);
  return Math.max(
    240,
    Math.min(AI_DRAWER_MAX_WIDTH, ratioLimitedWidth, safeWidth - AI_DRAWER_VIEWPORT_GAP)
  );
};

const clampDrawerWidth = (width, viewportWidth) => {
  const maxWidth = getMaxDrawerWidth(viewportWidth);
  const minWidth = Math.min(AI_DRAWER_MIN_WIDTH, maxWidth);
  return Math.min(Math.max(width, minWidth), maxWidth);
};

const getModelProvider = (model, provider) => {
  const explicitProvider = String(provider || '').trim().toLowerCase();
  if (explicitProvider === 'siliconflow') return 'SiliconFlow';
  if (explicitProvider === 'deepseek') return 'DeepSeek';
  if (explicitProvider === 'moonshot') return 'Kimi';
  if (explicitProvider === 'openai') return 'OpenAI';

  const value = String(model || '').toLowerCase();
  if (value.includes('deepseek')) return 'DeepSeek';
  if (value.includes('claude') || value.includes('anthropic')) return 'Anthropic (Claude)';
  if (value.includes('kimi') || value.includes('moonshot')) return 'Kimi';
  if (value.includes('gpt') || value.includes('openai')) return 'OpenAI';
  return 'Other models';
};

const MODEL_PROVIDER_ICONS = {
  SiliconFlow: siliconflowProviderIcon,
  DeepSeek: deepseekProviderIcon,
  Kimi: moonshotProviderIcon,
  Moonshot: moonshotProviderIcon,
};

const MODEL_PROVIDER_LABEL_ALIASES = {
  SiliconFlow: ['SiliconFlow', 'Silicon Flow'],
  DeepSeek: ['DeepSeek', 'Deep Seek'],
  Kimi: ['Kimi', 'Moonshot', 'MoonShot'],
  Moonshot: ['Moonshot', 'MoonShot', 'Kimi'],
};

const sanitizeModelLabel = (model, provider) => {
  const label = String(model || '').trim();
  if (!label) {
    return '';
  }

  const aliases = MODEL_PROVIDER_LABEL_ALIASES[provider] || [provider];
  const escapedAliases = aliases
    .filter(Boolean)
    .map((alias) => alias.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));

  if (!escapedAliases.length) {
    return label;
  }

  const suffixPattern = new RegExp(`\\s*\\((?:${escapedAliases.join('|')})\\)\\s*$`, 'i');
  return label.replace(suffixPattern, '').trim();
};

const ProviderModelIcon = ({ provider }) => {
  const iconSrc = MODEL_PROVIDER_ICONS[provider];

  if (!iconSrc) {
    return <ThunderboltFilled style={{ color: '#b590e8', fontSize: 13, flex: 'none' }} />;
  }

  return (
    <span
      style={{
        width: 14,
        height: 14,
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        flex: 'none',
      }}
    >
      <img
        src={iconSrc}
        alt=""
        aria-hidden="true"
        style={{
          width: '100%',
          height: '100%',
          objectFit: 'contain',
          display: 'block',
        }}
      />
    </span>
  );
};

const buildModelLabel = (model, provider) => (
  <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
    <ProviderModelIcon provider={provider} />
    <span>{sanitizeModelLabel(model, provider)}</span>
  </span>
);

const extractModelDisplayName = (model) => {
  if (!model) return '';
  const parts = String(model).split('/');
  return parts[parts.length - 1];
};

const groupModels = (models) => {
  const groups = new Map();

  models.forEach((modelOption) => {
    const provider = getModelProvider(modelOption?.model, modelOption?.provider);
    if (!groups.has(provider)) {
      groups.set(provider, []);
    }

    const labelText = modelOption?.displayName
      || extractModelDisplayName(modelOption?.model || modelOption?.key);
    const label = buildModelLabel(labelText, provider);

    groups.get(provider).push({
      label,
      value: modelOption?.key,
    });
  });

  return MODEL_PROVIDER_ORDER
    .filter((provider) => groups.has(provider))
    .map((provider) => ({
      label: provider,
      options: groups.get(provider),
    }));
};

const formatChatSessionTime = (timestamp) => {
  const date = new Date(timestamp);
  if (Number.isNaN(date.getTime())) {
    return '';
  }

  const pad = (value) => String(value).padStart(2, '0');
  const year = date.getFullYear();
  const month = pad(date.getMonth() + 1);
  const day = pad(date.getDate());
  const hour = pad(date.getHours());
  const minute = pad(date.getMinutes());
  const second = pad(date.getSeconds());

  return `${year}-${month}-${day} ${hour}:${minute}:${second}`;
};

const HISTORY_DATE_GROUPS = [
  { key: 'today', label: '今天' },
  { key: 'yesterday', label: '昨天' },
  { key: 'week', label: '本周' },
  { key: 'earlier', label: '更早' },
];

const normalizeHistoryText = (text) => String(text || '').replace(/\s+/g, ' ').trim();
const escapeHtml = (text) => String(text || '')
  .replace(/&/g, '&amp;')
  .replace(/</g, '&lt;')
  .replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;')
  .replace(/'/g, '&#39;');

const encodeMarkdownExportContent = (text) => {
  const content = String(text || '');
  if (!content) {
    return '';
  }

  try {
    const bytes = new TextEncoder().encode(content);
    let binary = '';
    bytes.forEach((byte) => {
      binary += String.fromCharCode(byte);
    });
    return window.btoa(binary);
  } catch {
    return '';
  }
};

const blobToDataUrl = (blob) => new Promise((resolve, reject) => {
  const reader = new FileReader();
  reader.onloadend = () => resolve(typeof reader.result === 'string' ? reader.result : '');
  reader.onerror = () => reject(new Error('读取资源失败'));
  reader.readAsDataURL(blob);
});

const fetchAssetAsDataUrl = async (assetUrl) => {
  const url = String(assetUrl || '').trim();
  if (!url) {
    return '';
  }

  if (url.startsWith('data:')) {
    return url;
  }

  try {
    const response = await fetch(url, {
      credentials: 'include',
    });
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }
    const blob = await response.blob();
    return await blobToDataUrl(blob);
  } catch (error) {
    console.warn('导出 HTML 时内嵌资源失败:', url, error);
    return url;
  }
};

const getFirstUserQuestion = (session) => {
  const firstUserMessage = Array.isArray(session?.messages)
    ? session.messages.find((messageItem) => messageItem?.role === 'user' && normalizeHistoryText(messageItem?.content))
    : null;

  return normalizeHistoryText(firstUserMessage?.content) || '未开始对话';
};

const startOfLocalDay = (date) => new Date(date.getFullYear(), date.getMonth(), date.getDate());

const getLocalWeekStart = (date) => {
  const weekStart = startOfLocalDay(date);
  const day = weekStart.getDay() || 7;
  weekStart.setDate(weekStart.getDate() - day + 1);
  return weekStart;
};

const getHistoryDateGroupKey = (timestamp) => {
  const date = new Date(timestamp);
  if (Number.isNaN(date.getTime())) {
    return 'earlier';
  }

  const now = new Date();
  const todayStart = startOfLocalDay(now);
  const yesterdayStart = new Date(todayStart);
  yesterdayStart.setDate(yesterdayStart.getDate() - 1);
  const weekStart = getLocalWeekStart(now);
  const sessionDay = startOfLocalDay(date);

  if (sessionDay.getTime() >= todayStart.getTime()) {
    return 'today';
  }
  if (sessionDay.getTime() >= yesterdayStart.getTime()) {
    return 'yesterday';
  }
  if (sessionDay.getTime() >= weekStart.getTime()) {
    return 'week';
  }
  return 'earlier';
};

const groupChatSessionsByDate = (sessions) => {
  const grouped = HISTORY_DATE_GROUPS.map((group) => ({ ...group, sessions: [] }));
  const groupMap = new Map(grouped.map((group) => [group.key, group]));

  sessions.forEach((session) => {
    const groupKey = getHistoryDateGroupKey(session.updatedAt || session.createdAt);
    groupMap.get(groupKey)?.sessions.push(session);
  });

  return grouped.filter((group) => group.sessions.length > 0);
};

const buildWebSearchHTML = (webSearch) => {
  if (!webSearch) return '';
  const sources = Array.isArray(webSearch.sources) ? webSearch.sources : [];
  let sourcesHtml = '';
  if (sources.length > 0) {
    sourcesHtml = `
      <div class="search-sources">
        <div style="margin-bottom: 6px; color: #64748b; font-weight: 500;">参考来源：</div>
        <div style="display: flex; flex-direction: column; gap: 6px; padding-left: 4px;">
          ${sources.map((s, i) => {
            const title = normalizeHistoryText(s.title) || `来源 ${i + 1}`;
            const url = normalizeHistoryText(s.url);
            return url
              ? `<a href="${escapeHtml(url)}" target="_blank" rel="noopener noreferrer" style="display: block; line-height: 1.4; word-break: break-all;">${i + 1}. ${escapeHtml(title)}</a>`
              : `<span style="display: block; line-height: 1.4; word-break: break-all;">${i + 1}. ${escapeHtml(title)}</span>`;
          }).join('')}
        </div>
      </div>
    `;
  }
  const statusText = webSearch.status === 'done' ? '已完成' : webSearch.status === 'error' ? '失败' : '搜索中';
  const queryHtml = webSearch.query ? `<div>搜索词：${escapeHtml(webSearch.query)}</div>` : '';
  const msgHtml = webSearch.message ? `<div>提示：${escapeHtml(webSearch.message)}</div>` : '';
  return `
    <details class="search-box">
      <summary class="search-title">🔍 联网搜索 (${statusText})</summary>
      <div class="search-content">
        ${queryHtml}
        ${msgHtml}
        ${sourcesHtml}
      </div>
    </details>
  `;
};

const buildChatExportHTML = (session, userAvatarSrc, aiAvatarSrc, userName = '用户') => {
  const title = normalizeHistoryText(session?.title) || '新聊天';
  const updatedAt = formatChatSessionTime(session?.updatedAt || session?.createdAt);

  const messagesHtml = (session?.messages || [])
    .filter((msg) => normalizeHistoryText(msg?.content) || msg?.webSearch)
    .map((msg) => {
      const isUser = msg.role === 'user';
      const roleClass = isUser ? 'user' : 'ai';
      const roleName = isUser ? userName : 'Berry';
      const avatarSrc = isUser ? userAvatarSrc : aiAvatarSrc;
      const webSearchHtml = !isUser ? buildWebSearchHTML(msg.webSearch) : '';

      let contentHtml = '';
      if (isUser) {
        contentHtml = msg.content ? `<div>${escapeHtml(msg.content).replace(/\n/g, '<br/>')}</div>` : '';
      } else {
        const encodedMarkdown = encodeMarkdownExportContent(msg.content);
        contentHtml = encodedMarkdown
          ? `<div class="markdown-content" data-markdown="${encodedMarkdown}" style="display:none;"></div><div class="markdown-rendered">加载中...</div>`
          : '';
      }

      return `
        <div class="message ${roleClass}">
          <div class="message-header">
            <img src="${escapeHtml(avatarSrc)}" alt="${escapeHtml(roleName)}" class="message-avatar" />
            <div class="message-author">${escapeHtml(roleName)}</div>
          </div>
          <div class="message-bubble">
            ${webSearchHtml}
            ${contentHtml}
          </div>
        </div>
      `;
    }).join('\n');

  return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${escapeHtml(title)}</title>
<script src="https://cdn.jsdelivr.net/npm/marked/marked.min.js"></script>
<style>
  :root { --primary: #6366f1; --bg: #f8fafc; --text: #334155; --bubble-ai: #ffffff; --bubble-user: #e0e7ff; --border: #e2e8f0; }
  body { font-family: 'Inter', -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif; background-color: var(--bg); color: var(--text); margin: 0; padding: 20px; line-height: 1.6; }
  .container { max-width: 800px; margin: 0 auto; background: #fff; border-radius: 16px; box-shadow: 0 4px 20px rgba(0,0,0,0.05); padding: 30px; }
  .header { text-align: center; border-bottom: 1px solid var(--border); padding-bottom: 20px; margin-bottom: 30px; }
  .header h1 { margin: 0 0 10px 0; font-size: 24px; color: #0f172a; }
  .header p { margin: 0; color: #64748b; font-size: 14px; }
  .chat-list { display: flex; flex-direction: column; gap: 24px; }
  .message { display: flex; flex-direction: column; max-width: 85%; }
  .message.user { align-self: flex-end; }
  .message.ai { align-self: flex-start; }
  .message-header { display: flex; align-items: center; gap: 8px; margin-bottom: 6px; padding: 0 4px; }
  .user .message-header { flex-direction: row-reverse; }
  .message-avatar { width: 28px; height: 28px; border-radius: 50%; object-fit: cover; flex-shrink: 0; }
  .message-author { font-size: 12px; color: #94a3b8; }
  .message-bubble { padding: 12px 18px; border-radius: 16px; font-size: 14px; box-shadow: 0 1px 2px rgba(0,0,0,0.05); word-break: break-word; }
  .user .message-bubble { background-color: var(--bubble-user); color: #1e1b4b; border-bottom-right-radius: 4px; }
  .ai .message-bubble { background-color: var(--bubble-ai); border: 1px solid var(--border); border-bottom-left-radius: 4px; }
  details.search-box { background: #f1f5f9; border-radius: 12px; padding: 12px; margin-bottom: 12px; font-size: 12px; color: #475569; }
  details.search-box summary { font-weight: 600; cursor: pointer; outline: none; user-select: none; }
  .search-content { margin-top: 10px; }
  .search-sources { margin-top: 8px; padding-top: 8px; border-top: 1px dashed #cbd5e1; }
  .search-sources a { color: var(--primary); text-decoration: none; margin-right: 12px; display: inline-block; }
  .search-sources a:hover { text-decoration: underline; }
  .markdown-rendered p { margin-top: 0; margin-bottom: 1em; }
  .markdown-rendered p:last-child { margin-bottom: 0; }
  .markdown-rendered pre { background: #f8fafc; padding: 12px; border-radius: 8px; overflow-x: auto; }
  .markdown-rendered code { font-family: monospace; background: #f1f5f9; padding: 2px 4px; border-radius: 4px; }
  .markdown-rendered pre code { background: none; padding: 0; }
  .markdown-rendered table { border-collapse: collapse; width: 100%; margin-bottom: 1em; }
  .markdown-rendered th, .markdown-rendered td { border: 1px solid var(--border); padding: 8px; text-align: left; }
  .markdown-rendered th { background: #f1f5f9; }
</style>
</head>
<body>
<div class="container">
  <div class="header">
    <h1>${escapeHtml(title)}</h1>
    <p>导出时间：${escapeHtml(updatedAt || '未知')} | 来源：Berry 学习助手</p>
  </div>
  <div class="chat-list">
    ${messagesHtml}
  </div>
</div>
<script>
  document.addEventListener("DOMContentLoaded", function() {
    document.querySelectorAll('.markdown-content').forEach(el => {
      const renderedContainer = el.nextElementSibling;
      if (renderedContainer && renderedContainer.classList.contains('markdown-rendered')) {
        const encodedText = el.dataset.markdown || '';
        let rawText = '';

        try {
          const binary = window.atob(encodedText);
          const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0));
          rawText = new TextDecoder().decode(bytes);
        } catch (error) {
          renderedContainer.textContent = '导出内容解析失败';
          return;
        }

        const sourcePattern = /\\n(?:#{1,6}\\s*)?(?:\\*\\*)?\\s*(?:来源|参考来源|资料来源|Sources|References|Source)\\s*(?:[：:])?\\s*(?:\\*\\*)?\\s*\\n/i;
        const parts = rawText.split(sourcePattern);

        if (parts.length > 1) {
          const bodyText = parts[0];
          const sourcesText = parts.slice(1).join('\\n');
          renderedContainer.innerHTML = marked.parse(bodyText) +
            '<details class="search-box" style="margin-top:16px;">' +
            '<summary class="search-title">🔍 来源</summary>' +
            '<div class="search-content">' + marked.parse(sourcesText) + '</div>' +
            '</details>';
        } else {
          renderedContainer.innerHTML = marked.parse(rawText);
        }
      }
    });
  });
</script>
</body>
</html>`;
};

const createSafeDownloadName = (title) => {
  const safeTitle = normalizeHistoryText(title)
    .replace(/[\\/:*?"<>|]+/g, '_')
    .slice(0, 42) || 'Berry聊天记录';
  return `${safeTitle}.html`;
};

const SOURCE_BADGE_COLORS = ['#2563eb', '#0ea5e9', '#f97316', '#14b8a6', '#8b5cf6', '#ef4444'];
const WEB_SEARCH_FRESHNESS_OPTIONS = [
  { key: 'noLimit', label: '不限' },
  { key: 'oneDay', label: '一天内' },
  { key: 'oneWeek', label: '一周内' },
  { key: 'oneMonth', label: '一个月内' },
  { key: 'oneYear', label: '一年内' },
];
const WEB_SEARCH_FRESHNESS_LABELS = WEB_SEARCH_FRESHNESS_OPTIONS.reduce((labels, option) => {
  labels[option.key] = option.label;
  return labels;
}, {});

const getSourceBadgeText = (source, index) => {
  const title = normalizeHistoryText(source?.title);
  if (!title) {
    return String(index + 1);
  }
  const firstChar = [...title][0];
  return /[a-z0-9]/i.test(firstChar) ? firstChar.toUpperCase() : firstChar;
};

const getSearchSourceDomain = (source) => {
  const rawUrl = normalizeHistoryText(source?.url);
  if (!rawUrl) {
    return '搜索来源';
  }

  try {
    return new URL(rawUrl).hostname.replace(/^www\./, '') || '搜索来源';
  } catch {
    return rawUrl
      .replace(/^https?:\/\//, '')
      .replace(/^www\./, '')
      .split('/')[0]
      || '搜索来源';
  }
};

const getSearchSourceTitle = (source, index) => (
  normalizeHistoryText(source?.title) || normalizeHistoryText(source?.url) || `搜索结果 ${index + 1}`
);

const bubbleStyle = (role, isError) => {
  if (role === 'user') {
    return {
      background: 'linear-gradient(135deg, #d6c1f9 0%, #b590e8 100%)',
      color: '#ffffff',
      border: 'none',
    };
  }

  return {
    background: isError ? 'rgba(254, 242, 242, 0.96)' : 'rgba(255, 255, 255, 0.85)',
    backdropFilter: 'blur(10px)',
    WebkitBackdropFilter: 'blur(10px)',
    color: isError ? '#b91c1c' : '#1e293b',
    border: isError ? '1px solid rgba(239, 68, 68, 0.22)' : '1px solid rgba(255, 255, 255, 0.6)',
  };
};

const ReasoningBlock = ({ reasoning, reasoningComplete }) => {
  const scrollRef = useRef(null);

  useEffect(() => {
    if (scrollRef.current && !reasoningComplete) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [reasoning, reasoningComplete]);

  return (
    <div
      ref={scrollRef}
      style={{
        padding: '0 10px 10px',
        borderTop: '1px solid rgba(181, 144, 232, 0.08)',
        minWidth: 0,
        maxWidth: '100%',
        maxHeight: '180px',
        overflowY: 'auto',
        overflowX: 'hidden',
      }}
    >
      <AIMarkdownContent content={reasoning} tone="subtle" />
    </div>
  );
};

const AIChatWidget = () => {
  const { user } = useAuth();
  const {
    isOpen,
    openDrawer,
    closeDrawer,
    chatContext,
    chatSessions,
    activeChatSessionId,
    messages,
    aiSettings,
    isSettingsSaving,
    isSending,
    sendMessage,
    stopGeneration,
    selectModel,
    setSystemDefaultModel,
    loadChatSession,
    startNewConversation,
    updateChatSessionTitle,
    toggleChatSessionFavorite,
    deleteChatSession,
    setThinkingEnabled,
    setWebSearchEnabled,
    setWebSearchFreshness,
    saveAISettings,
    deleteAISettings,
    resetAISettings,
    testAISettings,
    resetConversation,
  } = useAIChat();
  const [draft, setDraft] = useState('');
  const [isRecording, setIsRecording] = useState(false);
  const recognitionRef = useRef(null);
  const [isSettingsModalOpen, setIsSettingsModalOpen] = useState(false);
  const [editingConfigId, setEditingConfigId] = useState(null);
  const [isHistoryModalOpen, setIsHistoryModalOpen] = useState(false);
  const [historyView, setHistoryView] = useState('all');
  const [historySearchKeyword, setHistorySearchKeyword] = useState('');
  const [editingHistorySession, setEditingHistorySession] = useState(null);
  const [editingHistoryTitle, setEditingHistoryTitle] = useState('');
  const [providerDraft, setProviderDraft] = useState('custom');
  const [baseUrlDraft, setBaseUrlDraft] = useState('');
  const [modelDraft, setModelDraft] = useState('');
  const [modelDisplayNameDraft, setModelDisplayNameDraft] = useState('');
  const [apiKeyDraft, setApiKeyDraft] = useState('');
  const [isTestingConnection, setIsTestingConnection] = useState(false);
  const [testResult, setTestResult] = useState(null);
  const [expandedReasoningIds, setExpandedReasoningIds] = useState(() => new Set());
  const [expandedIntentIds, setExpandedIntentIds] = useState(() => new Set());
  const [expandedWebSearchIds, setExpandedWebSearchIds] = useState(() => new Set());
  const [autoExpandWebSearch, setAutoExpandWebSearch] = useState(() => {
    if (typeof window === 'undefined') {
      return false;
    }
    return window.localStorage.getItem(AI_WEB_SEARCH_AUTO_EXPAND_KEY) === 'true';
  });
  const [viewportWidth, setViewportWidth] = useState(() => (
    typeof window === 'undefined' ? 1280 : window.innerWidth
  ));
  const [drawerWidth, setDrawerWidth] = useState(() => {
    if (typeof window === 'undefined') {
      return AI_DRAWER_DEFAULT_WIDTH;
    }

    const savedWidth = Number(window.localStorage.getItem(AI_DRAWER_WIDTH_KEY));
    return Number.isFinite(savedWidth) && savedWidth > 0
      ? clampDrawerWidth(savedWidth, window.innerWidth)
      : AI_DRAWER_DEFAULT_WIDTH;
  });
  const [isResizingDrawer, setIsResizingDrawer] = useState(false);
  const scrollRef = useRef(null);
  const lastOpenRef = useRef(false);
  const isNearBottomRef = useRef(true);
  const reasoningCompletionRef = useRef(new Set());
  const autoExpandedWebSearchRef = useRef(new Set());
  const canUseAI = aiSettings.canUseAI;
  const isDesktop = viewportWidth >= AI_DRAWER_DESKTOP_BREAKPOINT;
  const activeDrawerWidth = isDesktop ? clampDrawerWidth(drawerWidth, viewportWidth) : '100vw';

  // Draggable Floating Button logic
  const [buttonBottom, setButtonBottom] = useState(28);
  const [isDraggingButton, setIsDraggingButton] = useState(false);
  const dragStartYRef = useRef(0);
  const dragStartBottomRef = useRef(28);
  const dragMoveOccurredRef = useRef(false);

  const handleButtonMouseDown = (e) => {
    if (e.button !== 0) return;
    e.preventDefault();
    setIsDraggingButton(true);
    dragStartYRef.current = e.clientY;
    dragStartBottomRef.current = buttonBottom;
    dragMoveOccurredRef.current = false;

    const handleMouseMove = (moveEvent) => {
      const deltaY = dragStartYRef.current - moveEvent.clientY;
      if (Math.abs(deltaY) > 5) {
        dragMoveOccurredRef.current = true;
      }
      const newBottom = Math.max(20, Math.min(window.innerHeight - 100, dragStartBottomRef.current + deltaY));
      setButtonBottom(newBottom);
    };

    const handleMouseUp = () => {
      setIsDraggingButton(false);
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
  };

  const handleButtonTouchStart = (e) => {
    const touch = e.touches[0];
    setIsDraggingButton(true);
    dragStartYRef.current = touch.clientY;
    dragStartBottomRef.current = buttonBottom;
    dragMoveOccurredRef.current = false;

    const handleTouchMove = (moveEvent) => {
      const touchMove = moveEvent.touches[0];
      const deltaY = dragStartYRef.current - touchMove.clientY;
      if (Math.abs(deltaY) > 5) {
        dragMoveOccurredRef.current = true;
      }
      const newBottom = Math.max(20, Math.min(window.innerHeight - 100, dragStartBottomRef.current + deltaY));
      setButtonBottom(newBottom);
    };

    const handleTouchEnd = () => {
      setIsDraggingButton(false);
      document.removeEventListener('touchmove', handleTouchMove);
      document.removeEventListener('touchend', handleTouchEnd);
    };

    document.addEventListener('touchmove', handleTouchMove);
    document.addEventListener('touchend', handleTouchEnd);
  };

  const handleButtonClick = () => {
    if (!dragMoveOccurredRef.current) {
      openDrawer();
    }
  };

  const contextShortcuts = useMemo(
    () => chatContext?.shortcuts || [],
    [chatContext]
  );
  const modelCount = (aiSettings.availableModelOptions || []).length + (aiSettings.customConfigs || []).length;
  const modelOptions = useMemo(() => {
    const systemModels = (aiSettings.availableModelOptions || []);
    const options = groupModels(systemModels);
    
    if (aiSettings.customConfigs && aiSettings.customConfigs.length > 0) {
      options.unshift({
        label: '我的自定义模型',
        options: aiSettings.customConfigs.map(cfg => ({
          label: buildModelLabel(
            cfg.modelDisplayName || cfg.model,
            getModelProvider(cfg.model, cfg.provider),
          ),
          value: cfg.id,
        })),
      });
    }
    return options;
  }, [
    aiSettings.availableModelOptions,
    aiSettings.customConfigs,
  ]);
  const selectedModel = aiSettings.selectedModel || aiSettings.activeModel || '';
  const handleModelChange = useCallback(async (nextValue) => {
    const normalizedValue = String(nextValue || '').trim();
    if (!normalizedValue) {
      return;
    }

    const isCustomConfig = (aiSettings.customConfigs || []).some((cfg) => cfg.id === normalizedValue);
    if (isCustomConfig) {
      selectModel(normalizedValue);
      return;
    }

    const isSystemModel = (aiSettings.availableModelOptions || []).some((option) => option.key === normalizedValue);
    if (!isSystemModel) {
      selectModel(normalizedValue);
      return;
    }

    if (!aiSettings.canManageSystemModel) {
      selectModel(normalizedValue);
      return;
    }

    if (normalizedValue === (aiSettings.defaultSystemModelKey || '')) {
      selectModel(normalizedValue);
      return;
    }

    try {
      await setSystemDefaultModel(normalizedValue);
      message.success('系统默认模型已更新');
    } catch (error) {
      console.error('切换系统默认模型失败:', error);
      message.error(error?.response?.data?.detail || '切换系统默认模型失败');
    }
  }, [
    aiSettings.availableModelOptions,
    aiSettings.canManageSystemModel,
    aiSettings.customConfigs,
    aiSettings.defaultSystemModelKey,
    selectModel,
    setSystemDefaultModel,
  ]);
  const shouldShowModelBox = Boolean(selectedModel) || modelOptions.length > 0;
  const shouldShowControlRow = shouldShowModelBox || canUseAI;
  const selectedWebSearchFreshness = aiSettings.webSearchFreshness || 'noLimit';
  const selectedWebSearchFreshnessLabel = WEB_SEARCH_FRESHNESS_LABELS[selectedWebSearchFreshness] || '不限';
  const sortedChatSessions = useMemo(() => (
    [...(chatSessions || [])].sort((a, b) => Number(b.updatedAt || 0) - Number(a.updatedAt || 0))
  ), [chatSessions]);
  const favoriteChatSessionCount = useMemo(() => (
    sortedChatSessions.filter((session) => session.favorite).length
  ), [sortedChatSessions]);
  const filteredChatSessions = useMemo(() => {
    const keyword = historySearchKeyword.trim().toLowerCase();
    const baseSessions = historyView === 'favorites'
      ? sortedChatSessions.filter((session) => session.favorite)
      : sortedChatSessions;

    if (!keyword) {
      return baseSessions;
    }

    return baseSessions.filter((session) => {
      const title = String(session.title || '').toLowerCase();
      const preview = String(session.preview || '').toLowerCase();
      const firstQuestion = getFirstUserQuestion(session).toLowerCase();
      return title.includes(keyword) || preview.includes(keyword) || firstQuestion.includes(keyword);
    });
  }, [historySearchKeyword, historyView, sortedChatSessions]);
  const groupedChatSessions = useMemo(() => (
    groupChatSessionsByDate(filteredChatSessions)
  ), [filteredChatSessions]);
  const activeWebSearchPanel = useMemo(() => {
    for (let index = messages.length - 1; index >= 0; index -= 1) {
      const message = messages[index];
      if (message?.role !== 'assistant' || !message.webSearch || !expandedWebSearchIds.has(message.id)) {
        continue;
      }

      return {
        messageId: message.id,
        query: message.webSearch.query || '当前问题',
        status: message.webSearch.status || 'done',
        count: Number(message.webSearch.count || 0),
        message: message.webSearch.message || '',
        sources: Array.isArray(message.webSearch.sources) ? message.webSearch.sources : [],
      };
    }

    return null;
  }, [messages, expandedWebSearchIds]);
  const drawerPixelWidth = typeof activeDrawerWidth === 'number' ? activeDrawerWidth : viewportWidth;
  const webSearchPanelWidth = isDesktop
    ? Math.min(380, Math.max(300, viewportWidth - drawerPixelWidth - 34))
    : Math.max(280, viewportWidth - 24);
  const shouldShowWebSearchPanel = Boolean(activeWebSearchPanel) && isOpen && !isHistoryModalOpen;

  useEffect(() => {
    if (typeof window === 'undefined') {
      return undefined;
    }

    const syncViewportWidth = () => {
      setViewportWidth(window.innerWidth);
    };

    syncViewportWidth();
    window.addEventListener('resize', syncViewportWidth);
    return () => window.removeEventListener('resize', syncViewportWidth);
  }, []);

  useEffect(() => {
    if (!isOpen) {
      setIsHistoryModalOpen(false);
      setHistorySearchKeyword('');
    }
  }, [isOpen]);

  useEffect(() => {
    setDrawerWidth((currentWidth) => clampDrawerWidth(currentWidth, viewportWidth));
  }, [viewportWidth]);

  useEffect(() => {
    if (!isDesktop && isResizingDrawer) {
      setIsResizingDrawer(false);
    }
  }, [isDesktop, isResizingDrawer]);

  useEffect(() => {
    if (typeof window === 'undefined') {
      return;
    }

    window.localStorage.setItem(AI_DRAWER_WIDTH_KEY, String(Math.round(drawerWidth)));
  }, [drawerWidth]);

  useEffect(() => {
    if (typeof window === 'undefined') {
      return;
    }

    window.localStorage.setItem(AI_WEB_SEARCH_AUTO_EXPAND_KEY, autoExpandWebSearch ? 'true' : 'false');
  }, [autoExpandWebSearch]);

  const toggleRecording = useCallback(() => {
    if (isRecording) {
      if (recognitionRef.current) {
        recognitionRef.current.stop();
      }
      setIsRecording(false);
      return;
    }

    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) {
      message.warning('当前浏览器不支持语音输入');
      return;
    }

    const recognition = new SpeechRecognition();
    recognition.lang = 'en-US'; // 默认英语，可以识别带口音的英语
    recognition.continuous = true;
    recognition.interimResults = true;

    recognition.onresult = (event) => {
      let finalTranscript = '';
      for (let i = event.resultIndex; i < event.results.length; ++i) {
        if (event.results[i].isFinal) {
          finalTranscript += event.results[i][0].transcript;
        }
      }
      if (finalTranscript) {
        setDraft(prev => prev + (prev ? ' ' : '') + finalTranscript);
      }
    };

    recognition.onerror = (event) => {
      console.error('Speech recognition error', event.error);
      setIsRecording(false);
      if (event.error !== 'no-speech') {
        message.error('语音识别出错: ' + event.error);
      }
    };

    recognition.onend = () => {
      setIsRecording(false);
    };

    try {
      recognition.start();
      recognitionRef.current = recognition;
      setIsRecording(true);
      message.info('开始语音输入');
    } catch (err) {
      console.error(err);
      setIsRecording(false);
    }
  }, [isRecording]);

  const handleScroll = () => {
    const container = scrollRef.current;
    if (!container) return;
    
    const threshold = 100;
    const isAtBottom = container.scrollHeight - container.scrollTop - container.clientHeight <= threshold;
    isNearBottomRef.current = isAtBottom;
  };

  // Handle scrolling behavior
  useEffect(() => {
    if (!scrollRef.current) {
      return;
    }
    
    const wasJustOpened = isOpen && !lastOpenRef.current;
    lastOpenRef.current = isOpen;

    // Force scroll to bottom when newly opened
    if (wasJustOpened) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
      isNearBottomRef.current = true;
      return;
    }
    
    // For stream updates, only auto-scroll if the user is already near the bottom
    if (isNearBottomRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [isOpen, messages, isSending]);

  useEffect(() => {
    setExpandedReasoningIds((prev) => {
      let changed = false;
      const next = new Set(prev);

      messages.forEach((message) => {
        if (message.reasoningComplete && message.reasoning) {
          if (!reasoningCompletionRef.current.has(message.id)) {
            reasoningCompletionRef.current.add(message.id);
            next.delete(message.id);
            changed = true;
          }
        } else {
          reasoningCompletionRef.current.delete(message.id);
        }
      });

      return changed ? next : prev;
    });
  }, [messages]);

  useEffect(() => {
    if (!autoExpandWebSearch || !isOpen || isHistoryModalOpen) {
      return;
    }

    const searchingMessage = [...messages]
      .reverse()
      .find((message) => (
        message?.role === 'assistant'
        && message.webSearch?.status === 'searching'
        && !autoExpandedWebSearchRef.current.has(message.id)
      ));

    if (!searchingMessage) {
      return;
    }

    autoExpandedWebSearchRef.current.add(searchingMessage.id);
    setExpandedWebSearchIds(new Set([searchingMessage.id]));
  }, [autoExpandWebSearch, isOpen, isHistoryModalOpen, messages]);

  useEffect(() => {
    if (!isResizingDrawer || !isDesktop || typeof window === 'undefined') {
      return undefined;
    }

    const previousCursor = document.body.style.cursor;
    const previousUserSelect = document.body.style.userSelect;

    const handlePointerMove = (event) => {
      const nextWidth = clampDrawerWidth(window.innerWidth - event.clientX, window.innerWidth);
      setDrawerWidth(nextWidth);
    };

    const stopResizing = () => {
      setIsResizingDrawer(false);
    };

    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';

    window.addEventListener('pointermove', handlePointerMove);
    window.addEventListener('pointerup', stopResizing);
    window.addEventListener('pointercancel', stopResizing);

    return () => {
      document.body.style.cursor = previousCursor;
      document.body.style.userSelect = previousUserSelect;
      window.removeEventListener('pointermove', handlePointerMove);
      window.removeEventListener('pointerup', stopResizing);
      window.removeEventListener('pointercancel', stopResizing);
    };
  }, [isDesktop, isResizingDrawer]);

  const handleSend = async () => {
    if (isSending) return;
    const trimmed = draft.trim();
    if (!trimmed) {
      return;
    }

    setDraft('');
    await sendMessage(trimmed);
  };

  const handleStopGeneration = () => {
    stopGeneration();
  };

  const handleStartNewConversation = () => {
    setDraft('');
    startNewConversation();
    setIsHistoryModalOpen(false);
  };

  const handleLoadChatSession = (sessionId) => {
    const loadedSession = loadChatSession(sessionId);
    if (loadedSession) {
      setDraft('');
      setIsHistoryModalOpen(false);
    }
  };

  const handleExportChatSession = async (session) => {
    if (typeof window === 'undefined' || typeof document === 'undefined') {
      return;
    }

    try {
      const aiAvatarUrl = new URL('/ai-avatar.png', window.location.origin).href;
      const rawUserAvatarUrl = getAvatarSrc(user);
      const userAvatarUrl = rawUserAvatarUrl
        ? (rawUserAvatarUrl.startsWith('http') ? rawUserAvatarUrl : new URL(rawUserAvatarUrl, window.location.origin).href)
        : '';

      const [embeddedUserAvatarSrc, embeddedAiAvatarSrc] = await Promise.all([
        fetchAssetAsDataUrl(userAvatarUrl),
        fetchAssetAsDataUrl(aiAvatarUrl),
      ]);

      const userName = user?.username || '用户';
      const blob = new Blob([
        buildChatExportHTML(
          session,
          embeddedUserAvatarSrc || userAvatarUrl,
          embeddedAiAvatarSrc || aiAvatarUrl,
          userName,
        ),
      ], { type: 'text/html;charset=utf-8' });
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = createSafeDownloadName(session.title);
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);
      message.success('聊天记录已导出');
    } catch (error) {
      console.error('导出聊天记录失败:', error);
      message.error('导出聊天记录失败');
    }
  };

  const openEditHistoryTitle = (session) => {
    setEditingHistorySession(session);
    setEditingHistoryTitle(session.title || '新聊天');
  };

  const handleSaveHistoryTitle = () => {
    const nextTitle = editingHistoryTitle.trim();
    if (!editingHistorySession || !nextTitle) {
      message.warning('标题不能为空');
      return;
    }

    updateChatSessionTitle(editingHistorySession.id, nextTitle);
    setEditingHistorySession(null);
    setEditingHistoryTitle('');
    message.success('标题已更新');
  };

  const handleDeleteHistorySession = (session) => {
    Modal.confirm({
      title: '删除聊天记录',
      content: `确定要删除「${session.title || '新聊天'}」吗？删除后无法恢复。`,
      okText: '删除',
      okType: 'danger',
      cancelText: '取消',
      onOk: () => {
        const deleted = deleteChatSession(session.id);
        if (deleted) {
          message.success('聊天记录已删除');
        }
      },
    });
  };

  const handleToggleFavoriteSession = (session) => {
    const nextFavorite = !session.favorite;
    toggleChatSessionFavorite(session.id, nextFavorite);
    message.success(nextFavorite ? '已添加到收藏' : '已取消收藏');
  };

  const handleHistoryCardKeyDown = (event, sessionId) => {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      handleLoadChatSession(sessionId);
    }
  };

  const toggleReasoning = (messageId) => {
    setExpandedReasoningIds((prev) => {
      const next = new Set(prev);
      if (next.has(messageId)) {
        next.delete(messageId);
      } else {
        next.add(messageId);
      }
      return next;
    });
  };

  const toggleIntentPanel = (messageId) => {
    setExpandedIntentIds((prev) => {
      const next = new Set(prev);
      if (next.has(messageId)) {
        next.delete(messageId);
      } else {
        next.add(messageId);
      }
      return next;
    });
  };

  const toggleWebSearchSources = (messageId) => {
    setExpandedWebSearchIds((prev) => {
      if (prev.has(messageId)) {
        return new Set();
      }
      return new Set([messageId]);
    });
  };

  const openSettingsModal = () => {
    setEditingConfigId(null);
    setProviderDraft('custom');
    setBaseUrlDraft('');
    setModelDraft('');
    setModelDisplayNameDraft('');
    setApiKeyDraft('');
    setTestResult(null);
    setIsSettingsModalOpen(true);
  };

  const closeSettingsModal = () => {
    setIsSettingsModalOpen(false);
    setEditingConfigId(null);
    setTestResult(null);
    setApiKeyDraft('');
  };

  const handleSaveSettings = async () => {
    const isNew = editingConfigId === 'new';
    const nextSettings = await saveAISettings({
      provider: providerDraft,
      baseUrl: baseUrlDraft,
      model: modelDraft,
      modelDisplayName: modelDisplayNameDraft,
      apiKey: apiKeyDraft,
    }, isNew ? null : editingConfigId);

    if (nextSettings) {
      message.success('Berry 配置已保存');
      setEditingConfigId(null);
    }
  };

  const handleResetSettings = async () => {
    const nextSettings = await resetAISettings();
    if (nextSettings) {
      message.success('已恢复 Berry 默认配置');
      setEditingConfigId(null);
      setProviderDraft('custom');
      setBaseUrlDraft('');
      setModelDraft('');
      setModelDisplayNameDraft('');
      setApiKeyDraft('');
      setTestResult(null);
    }
  };

  const handleTestConnection = async () => {
    setIsTestingConnection(true);
    setTestResult(null);

    const originalConfig = editingConfigId && editingConfigId !== 'new'
      ? (getLocalAISettings()?.configs || []).find(cfg => cfg.id === editingConfigId)
      : null;
    const apiKeyToTest = apiKeyDraft || originalConfig?.apiKey || '';

    try {
      const result = await testAISettings({
        provider: providerDraft,
        baseUrl: baseUrlDraft,
        model: modelDraft,
        modelDisplayName: modelDisplayNameDraft,
        apiKey: apiKeyToTest,
      });

      if (result?.success) {
        setTestResult({
          success: true,
          message: result.message,
          activeModel: result.active_model,
          activeSource: result.active_source || 'system',
        });
        message.success('连接测试成功');
      } else {
        setTestResult({
          success: false,
          message: result?.message || '连接测试失败，请检查配置后重试',
          activeSource: result?.active_source || aiSettings.activeSource || 'system',
        });
      }
    } finally {
      setIsTestingConnection(false);
    }
  };

  const handleTestConnectionForConfig = async (config) => {
    setIsTestingConnection(true);
    try {
      const storedConfig = (getLocalAISettings()?.configs || []).find(cfg => cfg.id === config.id);
      const result = await testAISettings({
        provider: config.provider,
        baseUrl: config.baseUrl,
        model: config.model,
        modelDisplayName: config.modelDisplayName,
        apiKey: storedConfig?.apiKey || '',
      });

      if (result?.success) {
        message.success(`模型 ${config.modelDisplayName || config.model} 连接测试成功`);
      } else {
        message.error(`模型 ${config.modelDisplayName || config.model} 连接测试失败: ${result?.message || '未知原因'}`);
      }
    } finally {
      setIsTestingConnection(false);
    }
  };

  const handleDeleteSettings = async (configId) => {
    const nextSettings = await deleteAISettings(configId);
    if (nextSettings) {
      message.success('已成功删除该模型配置');
    }
  };

  const openEditConfig = (config) => {
    const storedConfig = (getLocalAISettings()?.configs || []).find(cfg => cfg.id === config.id);
    setEditingConfigId(config.id);
    setProviderDraft(config.provider);
    setBaseUrlDraft(config.baseUrl);
    setModelDraft(config.model);
    setModelDisplayNameDraft(config.modelDisplayName);
    setApiKeyDraft('');
    setTestResult(null);
  };

  const openAddConfig = () => {
    setEditingConfigId('new');
    setProviderDraft('custom');
    setBaseUrlDraft('');
    setModelDraft('');
    setModelDisplayNameDraft('');
    setApiKeyDraft('');
    setTestResult(null);
  };

  const startResizingDrawer = (event) => {
    if (!isDesktop) {
      return;
    }

    event.preventDefault();
    setIsResizingDrawer(true);
  };

  const placeholder = chatContext?.page === 'quiz'
    ? '比如：先别直接告诉我答案，给我一点提示'
    : chatContext?.page === 'learning'
      ? '比如：这个词怎么记最牢？'
      : chatContext?.page === 'mistake-book'
        ? '比如：帮我看看我这批词该怎么复习'
        : '直接输入你想问的问题';
  const finalPlaceholder = canUseAI ? placeholder : '请先配置 Berry，或在右上角填写自定义配置';

  return (
    <>
      <div
        style={{
          position: 'fixed',
          insetInlineEnd: 28,
          bottom: buttonBottom,
          zIndex: 1000,
          cursor: isDraggingButton ? 'grabbing' : 'grab',
          touchAction: 'none'
        }}
        onMouseDown={handleButtonMouseDown}
        onTouchStart={handleButtonTouchStart}
      >
        <FloatButton
          icon={<MessageOutlined style={{ color: '#ffffff' }} />}
          tooltip="Berry"
          onClick={handleButtonClick}
          style={{ 
            position: 'relative', 
            insetInlineEnd: 'auto', 
            bottom: 'auto',
            background: 'linear-gradient(135deg, #d6c1f9 0%, #b590e8 100%)',
            border: 'none',
            boxShadow: '0 4px 14px rgba(181, 144, 232, 0.3)'
          }}
        />
      </div>

      <style>{`
        .ai-assistant-drawer .ant-drawer-content {
          background: linear-gradient(135deg, #e9e2ee 0%, #cabacd 100%) !important;
          overflow: hidden !important;
        }
        .ai-assistant-drawer .ant-drawer-header {
          background: transparent !important;
          border-bottom: 1px solid rgba(148, 163, 184, 0.15) !important;
        }
        .ai-assistant-drawer .ant-drawer-body {
          background: transparent !important;
          overflow: hidden !important;
        }
        .ai-chat-history-sheet {
          animation: aiHistorySheetIn 180ms ease-out;
          box-sizing: border-box;
          max-width: 100%;
        }
        .ai-chat-history-search.ant-input-affix-wrapper {
          height: 36px;
          box-sizing: border-box;
          border-radius: 12px !important;
          border: 1px solid rgba(181, 144, 232, 0.32) !important;
          background: rgba(248, 250, 252, 0.92) !important;
          box-shadow: 0 0 0 3px rgba(181, 144, 232, 0.08) !important;
        }
        .ai-chat-history-search input {
          color: #1f2937 !important;
          font-weight: 600;
          font-size: 12px !important;
        }
        .ai-chat-history-search input::placeholder {
          color: #94a3b8 !important;
        }
        .ai-chat-history-tabs {
          display: inline-flex;
          align-items: center;
          gap: 14px;
          min-width: 0;
        }
        .ai-chat-history-tab {
          position: relative;
          border: none;
          background: transparent;
          padding: 0 0 8px;
          color: #94a3b8;
          cursor: pointer;
          font-size: 16px;
          line-height: 1.2;
          font-weight: 800;
        }
        .ai-chat-history-tab:hover,
        .ai-chat-history-tab--active {
          color: #111827;
        }
        .ai-chat-history-tab--active::after {
          content: '';
          position: absolute;
          left: 0;
          right: 0;
          bottom: 0;
          height: 3px;
          border-radius: 999px;
          background: #8a63d2;
        }
        .ai-chat-history-list {
          scrollbar-width: thin;
          scrollbar-color: rgba(181, 144, 232, 0.45) rgba(226, 232, 240, 0.55);
        }
        .ai-chat-history-list::-webkit-scrollbar {
          width: 6px;
        }
        .ai-chat-history-list::-webkit-scrollbar-track {
          background: rgba(226, 232, 240, 0.55);
          border-radius: 999px;
        }
        .ai-chat-history-list::-webkit-scrollbar-thumb {
          background: rgba(181, 144, 232, 0.5);
          border-radius: 999px;
        }
        .ai-chat-history-section {
          display: grid;
          gap: 8px;
        }
        .ai-chat-history-section + .ai-chat-history-section {
          margin-top: 12px;
        }
        .ai-chat-history-section-title {
          position: sticky;
          top: 0;
          z-index: 2;
          color: #94a3b8;
          font-size: 13px;
          font-weight: 800;
          padding: 4px 2px;
          background: rgba(255, 255, 255, 0.96);
          backdrop-filter: blur(12px);
          -webkit-backdrop-filter: blur(12px);
        }
        .ai-chat-history-card {
          box-sizing: border-box;
          width: 100%;
          max-width: 100%;
          min-width: 0;
          text-align: left;
          border-radius: 14px;
          border: 1px solid rgba(226, 232, 240, 0.86);
          background: rgba(248, 250, 252, 0.92);
          padding: 12px 14px;
          cursor: pointer;
          display: grid;
          gap: 6px;
          color: inherit;
          outline: none;
          overflow: hidden;
          transition: background 160ms ease, border-color 160ms ease, box-shadow 160ms ease;
        }
        .ai-chat-history-card:hover,
        .ai-chat-history-card:focus-visible {
          border-color: rgba(181, 144, 232, 0.36);
          background: rgba(181, 144, 232, 0.06);
          box-shadow: 0 10px 24px rgba(15, 23, 42, 0.08);
        }
        .ai-chat-history-card--active {
          border-color: rgba(181, 144, 232, 0.42);
          background: rgba(181, 144, 232, 0.16);
          box-shadow: 0 10px 22px rgba(181, 144, 232, 0.12);
        }
        .ai-chat-history-card-top {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 10px;
          min-width: 0;
        }
        .ai-chat-history-card-actions {
          display: inline-flex;
          align-items: center;
          gap: 4px;
          flex: none;
          opacity: 0;
          pointer-events: none;
          transition: opacity 160ms ease;
        }
        .ai-chat-history-card:hover .ai-chat-history-card-actions,
        .ai-chat-history-card:focus-within .ai-chat-history-card-actions {
          opacity: 1;
          pointer-events: auto;
        }
        @media (hover: none) {
          .ai-chat-history-card-actions {
            opacity: 1;
            pointer-events: auto;
          }
        }
        .ai-chat-history-more-menu .ant-dropdown-menu {
          padding: 10px !important;
          border-radius: 18px !important;
          min-width: 170px;
          box-shadow: 0 18px 42px rgba(15, 23, 42, 0.2) !important;
        }
        .ai-chat-history-more-menu .ant-dropdown-menu-item {
          border-radius: 12px !important;
          padding: 10px 12px !important;
          font-size: 15px;
          font-weight: 700;
        }
        .ai-web-search-panel {
          animation: aiWebSearchPanelIn 180ms ease-out;
          box-sizing: border-box;
          color: #1f2937;
        }
        .ai-web-search-panel-list {
          scrollbar-width: thin;
          scrollbar-color: rgba(181, 144, 232, 0.45) rgba(255, 255, 255, 0.5);
        }
        .ai-web-search-panel-list::-webkit-scrollbar {
          width: 6px;
        }
        .ai-web-search-panel-list::-webkit-scrollbar-track {
          background: rgba(255, 255, 255, 0.5);
          border-radius: 999px;
        }
        .ai-web-search-panel-list::-webkit-scrollbar-thumb {
          background: rgba(181, 144, 232, 0.5);
          border-radius: 999px;
        }
        .ai-web-search-result {
          display: grid;
          grid-template-columns: 30px minmax(0, 1fr);
          gap: 10px;
          padding: 14px 0;
          color: inherit;
          text-decoration: none;
          border-bottom: 1px solid rgba(255, 255, 255, 0.38);
          min-width: 0;
        }
        .ai-web-search-result:hover .ai-web-search-result-title {
          color: #5b21b6;
        }
        .ai-web-search-result-badge {
          width: 22px;
          height: 22px;
          border-radius: 7px;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          color: #ffffff;
          font-size: 11px;
          font-weight: 900;
          line-height: 1;
          margin-top: 2px;
          box-shadow: 0 0 0 1px rgba(255, 255, 255, 0.12);
        }
        .ai-web-search-result-meta {
          display: block;
          min-width: 0;
          color: rgba(71, 85, 105, 0.72);
          font-size: 13px;
          font-weight: 700;
          line-height: 1.35;
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
        }
        .ai-web-search-result-title {
          display: -webkit-box;
          -webkit-line-clamp: 2;
          -webkit-box-orient: vertical;
          overflow: hidden;
          color: #1f2937;
          font-size: 15px;
          line-height: 1.55;
          font-weight: 700;
          margin-top: 5px;
          overflow-wrap: anywhere;
          transition: color 160ms ease;
        }
        .ai-chat-icon-button.ant-btn {
          width: 30px;
          height: 30px;
          padding: 0;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          background: transparent !important;
          border-color: transparent !important;
          box-shadow: none !important;
          border-radius: 10px;
          transition: color 160ms ease, opacity 160ms ease, transform 160ms ease;
        }
        .ai-chat-icon-button.ant-btn:not(:disabled):hover {
          background: transparent !important;
          transform: translateY(-1px);
          opacity: 0.82;
        }
        .ai-chat-icon-button.ant-btn:disabled {
          background: transparent !important;
          border-color: transparent !important;
          opacity: 0.38;
        }
        .ai-chat-stop-button.ant-btn:not(:disabled):hover,
        .ai-chat-stop-button.ant-btn:not(:disabled):focus-visible {
          background: #7f5af0 !important;
          transform: translateY(-1px);
        }
        @keyframes aiHistorySheetIn {
          from {
            opacity: 0;
            transform: translateY(100%);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }
        @keyframes aiWebSearchPanelIn {
          from {
            opacity: 0;
            transform: translateX(14px);
          }
          to {
            opacity: 1;
            transform: translateX(0);
          }
        }
      `}</style>

      <Drawer
        className="ai-assistant-drawer"
        rootClassName="ai-assistant-drawer"
        title={(
          <Space size={10} style={{ display: 'flex', alignItems: 'center' }}>
            <UserAvatar
              src="/ai-avatar.png"
              size={32}
              previewable={true}
              previewTitle="Berry"
              style={{
                background: 'transparent',
                boxShadow: 'none',
                objectFit: 'cover'
              }}
            />
            <span style={{ 
              fontWeight: 800, 
              fontSize: 16, 
              letterSpacing: '0.5px',
              color: '#2e1065'
            }}>
              Berry
            </span>
          </Space>
        )}
        placement="right"
        open={isOpen}
        onClose={closeDrawer}
        width={activeDrawerWidth}
        extra={(
          <Space size={8}>
            <Button
              icon={<SettingOutlined style={{ color: '#b590e8' }} />}
              size="small"
              onClick={openSettingsModal}
              style={{
                borderRadius: '8px',
                background: 'rgba(181, 144, 232, 0.05)',
                border: '1px solid rgba(181, 144, 232, 0.12)',
                fontWeight: 600,
                color: '#b590e8',
                fontSize: 12
              }}
            >
              配置
            </Button>
            <Button
              icon={<DeleteOutlined style={{ color: '#ef4444' }} />}
              size="small"
              onClick={() => resetConversation()}
              style={{
                borderRadius: '8px',
                background: 'rgba(239, 68, 68, 0.05)',
                border: '1px solid rgba(239, 68, 68, 0.12)',
                fontWeight: 600,
                color: '#ef4444',
                fontSize: 12
              }}
            >
              清空
            </Button>
          </Space>
        )}
        styles={{
          content: {
            background: 'linear-gradient(135deg, #e9e2ee 0%, #cabacd 100%)',
          },
          header: {
            background: 'transparent',
            borderBottom: '1px solid rgba(148, 163, 184, 0.15)',
          },
          body: {
            padding: 0,
            position: 'relative',
            background: 'transparent',
            overflow: 'hidden',
          },
        }}
      >
        <div style={{ height: '100%', display: 'flex', flexDirection: 'column', position: 'relative', minWidth: 0, overflow: 'hidden' }}>
          {isDesktop && (
            <button
              type="button"
              aria-label={isHistoryModalOpen ? '拖拽调整聊天历史宽度' : '拖拽调整 Berry 宽度'}
              onPointerDown={startResizingDrawer}
              style={{
                position: 'absolute',
                insetInlineStart: 0,
                top: 0,
                bottom: 0,
                width: 16,
                padding: 0,
                border: 'none',
                background: 'transparent',
                cursor: 'col-resize',
                zIndex: 70,
              }}
            >
              <span
                style={{
                  position: 'absolute',
                  insetInlineStart: 7,
                  top: 24,
                  bottom: 24,
                  width: 2,
                  borderRadius: 999,
                  background: isResizingDrawer
                    ? 'rgba(181, 144, 232, 0.5)'
                    : 'rgba(148, 163, 184, 0.28)',
                  boxShadow: isResizingDrawer
                    ? '0 0 0 3px rgba(181, 144, 232, 0.12)'
                    : 'none',
                }}
              />
            </button>
          )}
          {contextShortcuts.length > 0 && (
            <div style={{ padding: '16px 16px 10px', borderBottom: '1px solid rgba(148, 163, 184, 0.12)' }}>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                {contextShortcuts.map((shortcut) => (
                  <Button
                    key={shortcut.key}
                    size="small"
                    onClick={() => sendMessage(shortcut.prompt)}
                    disabled={isSending || isSettingsSaving || !canUseAI}
                    style={{
                      borderRadius: 999,
                      background: 'rgba(181, 144, 232, 0.06)',
                      borderColor: 'rgba(181, 144, 232, 0.16)',
                      color: '#8a63d2',
                    }}
                  >
                    {shortcut.label}
                  </Button>
                ))}
              </div>
            </div>
          )}

          <div
            ref={scrollRef}
            onScroll={handleScroll}
            style={{
              flex: 1,
              overflowY: 'auto',
              overflowX: 'hidden',
              padding: '20px 16px',
              display: 'flex',
              flexDirection: 'column',
              gap: 18,
              minWidth: 0,
            }}
          >
            {messages.length === 0 ? (
              <div style={{
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                padding: '40px 16px',
                textAlign: 'center',
                height: '100%',
                color: '#64748b'
              }}>
                <UserAvatar
                  src="/ai-avatar.png"
                  size={64}
                  previewable={true}
                  previewTitle="Berry"
                  style={{
                    background: 'transparent',
                    marginBottom: 20,
                    boxShadow: 'none',
                    objectFit: 'cover'
                  }}
                />
                <Title level={4} style={{ margin: '0 0 8px 0', color: '#1e293b', fontWeight: 800 }}>
                  Berry
                </Title>
                <Text style={{ fontSize: 13, color: '#64748b', maxWidth: 280, marginBottom: 32 }}>
                  你好！我是 Berry，可以为你解答词汇用法、语法搭配，或提供高效的备考建议。
                </Text>
                
                <div style={{
                  width: '100%',
                  display: 'grid',
                  gap: 12,
                  textAlign: 'left'
                }}>
                  <div 
                    onClick={() => setDraft('这个词的核心用法和搭配有哪些？')}
                    style={{
                      background: 'rgba(255, 255, 255, 0.65)',
                      border: '1px solid rgba(226, 232, 240, 0.8)',
                      borderRadius: 16,
                      padding: '12px 16px',
                      cursor: 'pointer',
                      transition: 'all 0.2s',
                    }}
                    onMouseEnter={e => {
                      e.currentTarget.style.borderColor = '#b590e8';
                      e.currentTarget.style.background = '#ffffff';
                    }}
                    onMouseLeave={e => {
                      e.currentTarget.style.borderColor = 'rgba(226, 232, 240, 0.8)';
                      e.currentTarget.style.background = 'rgba(255, 255, 255, 0.65)';
                    }}
                  >
                    <div style={{ fontWeight: 600, color: '#334155', fontSize: 13, marginBottom: 2 }}>📖 词汇精讲</div>
                    <div style={{ color: '#64748b', fontSize: 12 }}>"这个词的核心用法 and 搭配有哪些？"</div>
                  </div>
                  
                  <div 
                    onClick={() => setDraft('帮我分析一下这句例句的结构与考点。')}
                    style={{
                      background: 'rgba(255, 255, 255, 0.65)',
                      border: '1px solid rgba(226, 232, 240, 0.8)',
                      borderRadius: 16,
                      padding: '12px 16px',
                      cursor: 'pointer',
                      transition: 'all 0.2s',
                    }}
                    onMouseEnter={e => {
                      e.currentTarget.style.borderColor = '#b590e8';
                      e.currentTarget.style.background = '#ffffff';
                    }}
                    onMouseLeave={e => {
                      e.currentTarget.style.borderColor = 'rgba(226, 232, 240, 0.8)';
                      e.currentTarget.style.background = 'rgba(255, 255, 255, 0.65)';
                    }}
                  >
                    <div style={{ fontWeight: 600, color: '#334155', fontSize: 13, marginBottom: 2 }}>📝 语法考点剖析</div>
                    <div style={{ color: '#64748b', fontSize: 12 }}>"帮我分析一下这句例句的结构与考点。"</div>
                  </div>

                  <div 
                    onClick={() => setDraft('雅思学术类阅读词汇应该如何高效记忆？')}
                    style={{
                      background: 'rgba(255, 255, 255, 0.65)',
                      border: '1px solid rgba(226, 232, 240, 0.8)',
                      borderRadius: 16,
                      padding: '12px 16px',
                      cursor: 'pointer',
                      transition: 'all 0.2s',
                    }}
                    onMouseEnter={e => {
                      e.currentTarget.style.borderColor = '#b590e8';
                      e.currentTarget.style.background = '#ffffff';
                    }}
                    onMouseLeave={e => {
                      e.currentTarget.style.borderColor = 'rgba(226, 232, 240, 0.8)';
                      e.currentTarget.style.background = 'rgba(255, 255, 255, 0.65)';
                    }}
                  >
                    <div style={{ fontWeight: 600, color: '#334155', fontSize: 13, marginBottom: 2 }}>🎓 备考策略建议</div>
                    <div style={{ color: '#64748b', fontSize: 12 }}>"雅思学术类阅读词汇应该如何高效记忆？"</div>
                  </div>
                </div>
              </div>
            ) : (
              messages.map((message) => {
                const isUser = message.role === 'user';
                const hasReasoning = Boolean(message.reasoning);
                const isReasoningExpanded = hasReasoning && (!message.reasoningComplete || expandedReasoningIds.has(message.id));
                const webSearchState = message.webSearch;
                const hasWebSearch = !isUser && Boolean(webSearchState);
                const webSearchIntent = webSearchState?.intent || null;
                const hasWebSearchIntent = !isUser && Boolean(webSearchIntent);
                const isWebSearchIntentPending = hasWebSearch && Boolean(webSearchIntent?.pending || webSearchState?.status === 'intent_pending');
                const hasIntentDecision = hasWebSearchIntent && !isWebSearchIntentPending && typeof webSearchIntent?.shouldSearch === 'boolean';
                const canToggleIntentPanel = hasIntentDecision;
                const isIntentExpanded = canToggleIntentPanel && expandedIntentIds.has(message.id);
                const intentDisplayQuery = hasWebSearch
                  ? (webSearchIntent?.rewrittenQuery || webSearchIntent?.originalQuery || webSearchState?.query || '')
                  : '';
                const intentPayload = hasIntentDecision
                  ? {
                      should_search: Boolean(webSearchIntent.shouldSearch),
                      rewritten_query: webSearchIntent.rewrittenQuery || '',
                      reason: webSearchIntent.reason || '',
                    }
                  : null;
                const shouldRenderWebSearchStatus = hasWebSearch && hasIntentDecision && webSearchIntent.shouldSearch;
                const isWebSearchExpanded = expandedWebSearchIds.has(message.id);
                const searchSources = Array.isArray(webSearchState?.sources) ? webSearchState.sources : [];
                const canOpenSearchSources = Boolean(webSearchState);

                return (
                  <div
                    key={message.id}
                    style={{
                      display: 'flex',
                      flexDirection: 'column',
                      gap: 6,
                      width: '100%',
                      minWidth: 0,
                      boxSizing: 'border-box',
                      alignItems: isUser ? 'flex-end' : 'flex-start',
                    }}
                  >
                    {/* Header Row (Avatar + Name) */}
                    <div
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: 6,
                        flexDirection: isUser ? 'row-reverse' : 'row',
                        padding: '0 4px',
                      }}
                    >
                      {isUser ? (
                        <UserAvatar user={user} size={20} />
                      ) : (
                        <UserAvatar
                          src="/ai-avatar.png"
                          size={20}
                          previewable={true}
                          previewTitle="Berry"
                          style={{
                            background: 'transparent',
                            border: 'none',
                            boxShadow: 'none',
                            objectFit: 'cover'
                          }}
                        />
                      )}
                      <span style={{ fontSize: '11px', fontWeight: 600, color: '#64748b' }}>
                        {isUser ? (user?.username || '你') : 'Berry'}
                      </span>
                    </div>

                    {/* Message Bubble */}
                    <div
                      style={{
                        maxWidth: '100%',
                        width: isUser ? 'auto' : '100%',
                        minWidth: 0,
                        boxSizing: 'border-box',
                        overflow: 'hidden',
                        borderRadius: '12px',
                        padding: '12px 14px',
                        whiteSpace: 'pre-wrap',
                        overflowWrap: 'anywhere',
                        wordBreak: 'break-word',
                        lineHeight: 1.6,
                        fontSize: isUser ? '12px' : '13px',
                        boxShadow: isUser
                          ? '0 6px 16px rgba(181, 144, 232, 0.08)'
                          : '0 4px 12px rgba(15, 23, 42, 0.02)',
                        ...bubbleStyle(message.role, message.error),
                      }}
                    >
                      {isUser ? (
                        <Text style={{ color: '#ffffff', overflowWrap: 'anywhere', wordBreak: 'break-word' }}>
                          {message.content}
                        </Text>
                      ) : (
                        <div style={{ display: 'grid', gap: 10, minWidth: 0, maxWidth: '100%', overflow: 'hidden' }}>
                          {hasWebSearch && (
                            <div
                              style={{
                                display: 'grid',
                                gap: 8,
                                minWidth: 0,
                                maxWidth: '100%',
                              }}
                            >
                              {hasWebSearchIntent && (
                                <>
                                  <div style={{ display: 'flex', alignItems: 'center', gap: 7, color: '#64748b', fontSize: 12, fontWeight: 700, minWidth: 0 }}>
                                    <LinkOutlined style={{ color: '#8a63d2', fontSize: 14, flex: 'none' }} />
                                    <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                      意图识别
                                    </span>
                                  </div>
                                  <button
                                    type="button"
                                    onClick={() => {
                                      if (canToggleIntentPanel) {
                                        toggleIntentPanel(message.id);
                                      }
                                    }}
                                    style={{
                                      display: 'flex',
                                      alignItems: 'center',
                                      justifyContent: 'space-between',
                                      gap: 10,
                                      width: '100%',
                                      minWidth: 0,
                                      boxSizing: 'border-box',
                                      border: '1px solid rgba(138, 99, 210, 0.12)',
                                      borderRadius: 16,
                                      padding: '10px 12px',
                                      background: 'rgba(250, 245, 255, 0.78)',
                                      color: '#1f2937',
                                      cursor: canToggleIntentPanel ? 'pointer' : 'default',
                                      textAlign: 'left',
                                    }}
                                  >
                                    <span style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
                                      <span
                                        style={{
                                          fontSize: 14,
                                          fontWeight: 800,
                                          color: '#1f2937',
                                          overflow: 'hidden',
                                          textOverflow: 'ellipsis',
                                          whiteSpace: 'nowrap',
                                        }}
                                      >
                                        {intentDisplayQuery || (isWebSearchIntentPending ? '正在分析当前问题' : '未生成 Query')}
                                      </span>
                                    </span>
                                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8, minWidth: 0, flex: 'none' }}>
                                      <span
                                        style={{
                                          padding: '3px 9px',
                                          borderRadius: 999,
                                          background: isWebSearchIntentPending
                                            ? 'rgba(138, 99, 210, 0.12)'
                                            : webSearchIntent.shouldSearch
                                              ? 'rgba(16, 185, 129, 0.14)'
                                              : 'rgba(148, 163, 184, 0.14)',
                                          color: isWebSearchIntentPending
                                            ? '#8a63d2'
                                            : webSearchIntent.shouldSearch ? '#0f766e' : '#64748b',
                                          fontSize: 11,
                                          fontWeight: 800,
                                          lineHeight: 1.4,
                                          whiteSpace: 'nowrap',
                                        }}
                                      >
                                        {isWebSearchIntentPending
                                          ? '意图识别中'
                                          : (webSearchIntent.shouldSearch ? '需要搜索' : '无需搜索')}
                                      </span>
                                      {canToggleIntentPanel && (
                                        isIntentExpanded
                                          ? <DownOutlined style={{ fontSize: 11, color: '#8a63d2', flex: 'none' }} />
                                          : <RightOutlined style={{ fontSize: 11, color: '#8a63d2', flex: 'none' }} />
                                      )}
                                    </span>
                                  </button>
                                  {isIntentExpanded && intentPayload && (
                                    <pre
                                      style={{
                                        margin: 0,
                                        minWidth: 0,
                                        maxWidth: '100%',
                                        overflowX: 'auto',
                                        borderRadius: 12,
                                        padding: '10px 11px',
                                        background: 'rgba(255, 255, 255, 0.88)',
                                        border: '1px solid rgba(226, 232, 240, 0.82)',
                                        color: '#334155',
                                        fontSize: 11,
                                        lineHeight: 1.55,
                                        whiteSpace: 'pre-wrap',
                                        overflowWrap: 'anywhere',
                                        wordBreak: 'break-word',
                                        fontFamily: 'ui-monospace, SFMono-Regular, SFMono-Regular, Menlo, Monaco, Consolas, Liberation Mono, monospace',
                                      }}
                                    >
                                      {JSON.stringify(intentPayload, null, 2)}
                                    </pre>
                                  )}
                                </>
                              )}

                              {shouldRenderWebSearchStatus && (
                                <>
                                  <div style={{ display: 'flex', alignItems: 'center', gap: 7, color: '#64748b', fontSize: 12, fontWeight: 700, minWidth: 0 }}>
                                    <GlobalOutlined style={{ color: '#8a63d2', fontSize: 14, flex: 'none' }} />
                                    <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                      Bocha Searching
                                    </span>
                                  </div>
                                  <button
                                    type="button"
                                    onClick={() => {
                                      if (canOpenSearchSources) {
                                        toggleWebSearchSources(message.id);
                                      }
                                    }}
                                    style={{
                                      display: 'flex',
                                      alignItems: 'center',
                                      justifyContent: 'space-between',
                                      gap: 10,
                                      width: '100%',
                                      minWidth: 0,
                                      boxSizing: 'border-box',
                                      border: '1px solid rgba(148, 163, 184, 0.14)',
                                      borderRadius: 16,
                                      padding: '10px 12px',
                                      background: webSearchState.status === 'error'
                                        ? 'rgba(254, 242, 242, 0.86)'
                                        : 'rgba(15, 23, 42, 0.04)',
                                      color: '#1f2937',
                                      cursor: canOpenSearchSources ? 'pointer' : 'default',
                                      textAlign: 'left',
                                    }}
                                  >
                                    <span style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
                                      <span style={{ fontSize: 14, fontWeight: 800, color: webSearchState.status === 'error' ? '#b91c1c' : '#1f2937' }}>
                                        {webSearchState.status === 'searching'
                                          ? '正在搜索网络来源'
                                          : webSearchState.status === 'error'
                                            ? '联网搜索未完成'
                                            : `基于 ${webSearchState.count || 0} 个搜索来源`}
                                      </span>
                                      {searchSources.length > 0 && (
                                        <span
                                          style={{
                                            display: 'inline-flex',
                                            alignItems: 'center',
                                            marginLeft: 2,
                                            flex: 'none',
                                          }}
                                        >
                                          {searchSources.slice(0, 5).map((source, sourceIndex) => (
                                            <span
                                              key={`${source.url || source.title || sourceIndex}-${sourceIndex}`}
                                              title={source.title || `来源 ${sourceIndex + 1}`}
                                              style={{
                                                width: 18,
                                                height: 18,
                                                marginLeft: sourceIndex === 0 ? 0 : -6,
                                                borderRadius: '50%',
                                                border: '2px solid rgba(255, 255, 255, 0.92)',
                                                background: SOURCE_BADGE_COLORS[sourceIndex % SOURCE_BADGE_COLORS.length],
                                                color: '#ffffff',
                                                fontSize: 9,
                                                fontWeight: 800,
                                                display: 'inline-flex',
                                                alignItems: 'center',
                                                justifyContent: 'center',
                                                lineHeight: 1,
                                              }}
                                            >
                                              {getSourceBadgeText(source, sourceIndex)}
                                            </span>
                                          ))}
                                        </span>
                                      )}
                                    </span>
                                    {canOpenSearchSources && (
                                      isWebSearchExpanded
                                        ? <CloseOutlined style={{ fontSize: 12, color: '#64748b', flex: 'none' }} />
                                        : <RightOutlined style={{ fontSize: 12, color: '#64748b', flex: 'none' }} />
                                    )}
                                  </button>
                                </>
                              )}
                              {webSearchState.message && (
                                <div style={{ color: '#b91c1c', fontSize: 12, lineHeight: 1.6 }}>
                                  {webSearchState.message}
                                </div>
                              )}
                            </div>
                          )}

                          {hasReasoning && (
                            <div
                              style={{
                                minWidth: 0,
                                maxWidth: '100%',
                                boxSizing: 'border-box',
                                borderRadius: 12,
                                overflow: 'hidden',
                                border: '1px solid rgba(181, 144, 232, 0.15)',
                                borderLeft: '3px solid #b590e8',
                                background: 'rgba(181, 144, 232, 0.04)',
                              }}
                            >
                              <button
                                type="button"
                                onClick={() => toggleReasoning(message.id)}
                                style={{
                                  width: '100%',
                                  display: 'flex',
                                  alignItems: 'center',
                                  justifyContent: 'space-between',
                                  gap: 12,
                                  border: 'none',
                                  background: 'transparent',
                                  padding: '8px 10px',
                                  cursor: 'pointer',
                                  color: '#8a63d2',
                                  minWidth: 0,
                                }}
                              >
                                <span style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, fontWeight: 600, minWidth: 0 }}>
                                  <ThunderboltFilled style={{ color: '#b590e8', fontSize: 11 }} />
                                  {message.reasoningComplete ? '深度思考过程' : 'Berry 正在思考...'}
                                </span>
                                {isReasoningExpanded ? <DownOutlined style={{ fontSize: 10 }} /> : <RightOutlined style={{ fontSize: 10 }} />}
                              </button>
                              {isReasoningExpanded && (
                                <ReasoningBlock reasoning={message.reasoning} reasoningComplete={message.reasoningComplete} />
                              )}
                            </div>
                          )}

                          {message.content && (
                            <>
                              <AIMarkdownContent
                                content={message.content}
                                tone="default"
                                fallbackSources={message.webSearch?.sources || []}
                              />
                              <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 4 }}>
                                <button
                                  type="button"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    try {
                                      window.speechSynthesis.cancel();
                                      const utterance = new SpeechSynthesisUtterance(message.content.replace(/[*_#`~>]/g, ''));
                                      window.speechSynthesis.speak(utterance);
                                    } catch {
                                      console.warn('Speech synthesis not available');
                                    }
                                  }}
                                  style={{
                                    display: 'flex', alignItems: 'center', gap: 4,
                                    background: 'transparent', border: 'none', cursor: 'pointer',
                                    color: '#94a3b8', fontSize: 11, fontWeight: 500, padding: '4px 8px', borderRadius: 4, transition: 'all 0.2s'
                                  }}
                                  onMouseEnter={e => { e.currentTarget.style.color = '#64748b'; e.currentTarget.style.background = 'rgba(0,0,0,0.03)'; }}
                                  onMouseLeave={e => { e.currentTarget.style.color = '#94a3b8'; e.currentTarget.style.background = 'transparent'; }}
                                >
                                  <SoundOutlined style={{ fontSize: 12 }} /> 朗读
                                </button>
                              </div>
                            </>
                          )}

                          {!message.content && message.streaming && message.responseStarted && (
                            <div style={{ display: 'flex', alignItems: 'center', gap: 6, color: '#b590e8', fontSize: 13, fontWeight: 500 }}>
                              <span className="dot-flashing-loader" style={{ color: '#b590e8' }} />
                              <span>Berry 正在思考解答</span>
                            </div>
                          )}

                          {message.streamError && (
                            <div
                              style={{
                                borderRadius: 10,
                                padding: '8px 12px',
                                background: 'rgba(254, 242, 242, 0.9)',
                                border: '1px solid rgba(239, 68, 68, 0.15)',
                                color: '#b91c1c',
                                fontSize: 12,
                                lineHeight: 1.6,
                              }}
                            >
                              {message.streamError}
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                );
              })
            )}
          </div>

          <div style={{ 
            padding: '16px 20px', 
            borderTop: '1px solid rgba(148, 163, 184, 0.1)', 
            background: 'rgba(255, 255, 255, 0.35)',
            backdropFilter: 'blur(10px)',
            WebkitBackdropFilter: 'blur(10px)'
          }}>
            <div style={{ marginBottom: 12, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, minWidth: 0 }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-start', flex: 1, minWidth: 0 }}>
                {shouldShowModelBox && (
                  <Select
                    value={selectedModel}
                    options={modelOptions}
                    onChange={handleModelChange}
                    disabled={isSending || isSettingsSaving || !canUseAI || modelCount <= 1}
                    popupMatchSelectWidth={false}
                    suffixIcon={<DownOutlined style={{ color: '#b590e8', fontSize: 11 }} />}
                    style={{ minWidth: 0, width: 200, maxWidth: '100%' }}
                    placeholder="选择模型"
                    styles={{
                      popup: {
                        root: {
                          borderRadius: 16,
                        },
                      },
                    }}
                    className="ai-chat-model-select"
                    popupClassName="ai-chat-model-popup"
                    variant="borderless"
                  />
                )}
              </div>

              <div style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'flex-end', gap: 4, flex: 'none' }}>
                <Tooltip title="聊天历史">
                  <Button
                    size="small"
                    type="text"
                    icon={<ClockCircleOutlined />}
                    onClick={() => {
                      setHistorySearchKeyword('');
                      setIsHistoryModalOpen((open) => !open);
                    }}
                    aria-label="聊天历史"
                    className="ai-chat-icon-button"
                    style={{
                      color: '#334155',
                      flex: 'none',
                    }}
                  />
                </Tooltip>
                <Tooltip title="新聊天">
                  <Button
                    size="small"
                    type="text"
                    onClick={() => void handleStartNewConversation()}
                    aria-label="新聊天"
                    className="ai-chat-icon-button"
                    style={{
                      color: '#7f5af0',
                      flex: 'none',
                    }}
                    icon={(
                      <span style={{ position: 'relative', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 16, height: 16 }}>
                        <MessageOutlined style={{ fontSize: 15 }} />
                        <PlusOutlined style={{ position: 'absolute', fontSize: 8, right: -1, bottom: -1 }} />
                      </span>
                    )}
                  />
                </Tooltip>
              </div>
            </div>
            {shouldShowModelBox && (
              <style>{`
                .ai-chat-model-select .ant-select-selector {
                  min-height: 24px !important;
                  padding: 0 8px !important;
                  border-radius: 12px !important;
                  background: rgba(181, 144, 232, 0.06) !important;
                  border: 1px solid rgba(181, 144, 232, 0.12) !important;
                  box-shadow: none !important;
                }
                .ai-chat-model-select .ant-select-selection-item {
                  display: flex !important;
                  align-items: center !important;
                  gap: 4px !important;
                  font-size: 9px !important;
                  font-weight: 500 !important;
                  color: #8a63d2 !important;
                }
                .ai-chat-model-select.ant-select-disabled .ant-select-selector {
                  opacity: 0.86;
                  cursor: default !important;
                }
                .ai-chat-model-popup {
                  padding: 8px !important;
                  background: rgba(20, 23, 35, 0.96) !important;
                  border: 1px solid rgba(255, 255, 255, 0.08) !important;
                  box-shadow: 0 18px 40px rgba(15, 23, 42, 0.28) !important;
                  backdrop-filter: blur(18px);
                  border-radius: 14px !important;
                }
                .ai-chat-model-popup .ant-select-item-group {
                  color: rgba(255, 255, 255, 0.5) !important;
                  font-size: 11px !important;
                  font-weight: 600 !important;
                  padding: 8px 10px 4px !important;
                }
                .ai-chat-model-popup .ant-select-item-option {
                  border-radius: 10px !important;
                  margin: 3px 0 !important;
                  padding: 8px 10px !important;
                  color: rgba(255, 255, 255, 0.9) !important;
                }
                .ai-chat-model-popup .ant-select-item-option-content {
                  display: flex !important;
                  align-items: center !important;
                  gap: 6px !important;
                  font-size: 13px !important;
                }
                .ai-chat-model-popup .ant-select-item-option-selected:not(.ant-select-item-option-disabled) {
                  background: rgba(181, 144, 232, 0.25) !important;
                }
                .ai-chat-model-popup .ant-select-item-option-active:not(.ant-select-item-option-disabled) {
                  background: rgba(255, 255, 255, 0.08) !important;
                }
                @keyframes dotFlashing {
                  0% { opacity: 0.2; }
                  20% { opacity: 1; }
                  100% { opacity: 0.2; }
                }
                .dot-flashing-loader::after {
                  content: ' . . .';
                  animation: dotFlashing 1.4s infinite both;
                  font-weight: bold;
                }
              `}</style>
            )}

            <div style={{
              background: '#ffffff',
              border: '1px solid rgba(226, 232, 240, 0.8)',
              borderRadius: '16px',
              padding: '12px 14px 10px',
              boxShadow: '0 8px 20px -6px rgba(15, 23, 42, 0.04)',
              transition: 'all 0.2s ease',
              display: 'flex',
              flexDirection: 'column',
              gap: 8
            }}>
              <Input.TextArea
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                placeholder={finalPlaceholder}
                autoSize={{ minRows: 2, maxRows: 6 }}
                variant="borderless"
                onPressEnter={(e) => {
                  if (!e.shiftKey) {
                    e.preventDefault();
                    void handleSend();
                  }
                }}
                style={{
                  padding: 0,
                  fontSize: '14px',
                  resize: 'none',
                  background: 'transparent',
                  color: '#1e293b',
                }}
              />
              <div style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                gap: 8,
                borderTop: '1px solid rgba(241, 245, 249, 0.8)',
                marginTop: 4,
                paddingTop: 8
              }}>
                {shouldShowControlRow ? (
                  <div style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                    <Tooltip title={aiSettings.thinkingEnabled ? '思考 开' : '思考 关'}>
                      <Button
                        size="small"
                        type="text"
                        icon={<BulbOutlined />}
                        onClick={() => setThinkingEnabled(!aiSettings.thinkingEnabled)}
                        disabled={isSending || !canUseAI}
                        aria-label={aiSettings.thinkingEnabled ? '关闭思考' : '开启思考'}
                        className="ai-chat-icon-button"
                        style={{
                          color: aiSettings.thinkingEnabled ? '#8a63d2' : 'rgba(138, 99, 210, 0.34)',
                        }}
                      />
                    </Tooltip>
                    <Tooltip title="网络搜索">
                      <Button
                        size="small"
                        type="text"
                        icon={<GlobalOutlined />}
                        onClick={() => setWebSearchEnabled(!aiSettings.webSearchEnabled)}
                        disabled={isSending || !canUseAI}
                        aria-label={aiSettings.webSearchEnabled ? '关闭网络搜索' : '开启网络搜索'}
                        className="ai-chat-icon-button"
                        style={{
                          color: aiSettings.webSearchEnabled ? '#0ea5e9' : 'rgba(14, 165, 233, 0.34)',
                        }}
                      />
                    </Tooltip>
                    {aiSettings.webSearchEnabled && (
                      <Dropdown
                        trigger={['click']}
                        placement="topLeft"
                        menu={{
                          selectable: true,
                          selectedKeys: [selectedWebSearchFreshness],
                          items: WEB_SEARCH_FRESHNESS_OPTIONS.map((option) => ({
                            key: option.key,
                            label: option.label,
                          })),
                          onClick: ({ key }) => setWebSearchFreshness(key),
                        }}
                      >
                        <Tooltip title={`搜索范围：${selectedWebSearchFreshnessLabel}`}>
                          <Button
                            size="small"
                            type="text"
                            icon={<CaretUpOutlined />}
                            disabled={isSending || !canUseAI}
                            aria-label={`选择网络搜索时间范围，当前为${selectedWebSearchFreshnessLabel}`}
                            className="ai-chat-icon-button"
                            style={{
                              color: '#0ea5e9',
                            }}
                          />
                        </Tooltip>
                      </Dropdown>
                    )}
                    <Tooltip title={isRecording ? '停止录音' : '语音输入'}>
                      <Button
                        size="small"
                        type="text"
                        icon={<AudioOutlined />}
                        onClick={toggleRecording}
                        className="ai-chat-icon-button"
                        style={{
                          color: isRecording ? '#ef4444' : 'rgba(148, 163, 184, 0.8)',
                          animation: isRecording ? 'pulse 2s infinite' : 'none'
                        }}
                      />
                    </Tooltip>
                  </div>
                ) : (
                  <span />
                )}
                {isSending ? (
                  <Tooltip title="停止">
                    <Button
                      type="text"
                      shape="circle"
                      onClick={handleStopGeneration}
                      aria-label="停止"
                      className="ai-chat-stop-button"
                      style={{
                        width: 36,
                        height: 36,
                        minWidth: 36,
                        borderRadius: '50%',
                        display: 'inline-flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        padding: 0,
                        border: 'none',
                        background: '#8a63d2',
                        boxShadow: '0 10px 22px rgba(138, 99, 210, 0.28)',
                      }}
                      icon={(
                        <span
                          aria-hidden="true"
                          style={{
                            width: 12,
                            height: 12,
                            borderRadius: 3,
                            background: '#ffffff',
                            display: 'block',
                          }}
                        />
                      )}
                    />
                  </Tooltip>
                ) : (
                  <Button
                    type="text"
                    shape="circle"
                    icon={<SendOutlined style={{ fontSize: 12 }} />}
                    onClick={() => void handleSend()}
                    disabled={!draft.trim() || isSettingsSaving || !canUseAI}
                    className="ai-chat-icon-button"
                    style={{
                      color: draft.trim() && !isSettingsSaving ? '#8a63d2' : '#94a3b8',
                    }}
                  />
                )}
              </div>
            </div>
          </div>

          {isHistoryModalOpen && (
            <div
              className="ai-chat-history-sheet"
              style={{
                position: 'absolute',
                insetInlineStart: 0,
                insetInlineEnd: 0,
                bottom: 0,
                height: '72%',
                maxHeight: 620,
                minHeight: 320,
                width: '100%',
                maxWidth: '100%',
                boxSizing: 'border-box',
                display: 'flex',
                flexDirection: 'column',
                gap: 14,
                borderRadius: '22px 22px 0 0',
                padding: '10px 18px 18px',
                background: 'rgba(255, 255, 255, 0.98)',
                border: '1px solid rgba(226, 232, 240, 0.9)',
                borderBottom: 'none',
                boxShadow: '0 -24px 55px rgba(15, 23, 42, 0.22)',
                backdropFilter: 'blur(18px)',
                WebkitBackdropFilter: 'blur(18px)',
                color: '#1f2937',
                zIndex: 45,
                overflow: 'hidden',
              }}
            >
              <div
                aria-hidden="true"
                style={{
                  width: 42,
                  height: 4,
                  borderRadius: 999,
                  background: 'rgba(148, 163, 184, 0.42)',
                  alignSelf: 'center',
                  marginBottom: 2,
                  flex: 'none',
                }}
              />

              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flex: 'none' }}>
                <div className="ai-chat-history-tabs" role="tablist" aria-label="聊天历史分类">
                  <button
                    type="button"
                    role="tab"
                    aria-selected={historyView === 'all'}
                    className={`ai-chat-history-tab ${historyView === 'all' ? 'ai-chat-history-tab--active' : ''}`}
                    onClick={() => setHistoryView('all')}
                  >
                    全部
                    <span style={{ marginLeft: 5, fontSize: 11, color: 'inherit', opacity: 0.64 }}>
                      {sortedChatSessions.length}
                    </span>
                  </button>
                  <button
                    type="button"
                    role="tab"
                    aria-selected={historyView === 'favorites'}
                    className={`ai-chat-history-tab ${historyView === 'favorites' ? 'ai-chat-history-tab--active' : ''}`}
                    onClick={() => setHistoryView('favorites')}
                  >
                    我的收藏
                    <span style={{ marginLeft: 5, fontSize: 11, color: 'inherit', opacity: 0.64 }}>
                      {favoriteChatSessionCount}
                    </span>
                  </button>
                </div>
                <Tooltip title="关闭">
                  <Button
                    type="text"
                    size="small"
                    icon={<CloseOutlined />}
                    onClick={() => setIsHistoryModalOpen(false)}
                    aria-label="关闭聊天历史"
                    style={{
                      width: 32,
                      height: 32,
                      display: 'inline-flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      color: '#334155',
                      borderRadius: 12,
                    }}
                  />
                </Tooltip>
              </div>

              <Input
                className="ai-chat-history-search"
                prefix={<SearchOutlined style={{ color: '#64748b', fontSize: 14 }} />}
                placeholder="搜索"
                allowClear
                value={historySearchKeyword}
                onChange={(event) => setHistorySearchKeyword(event.target.value)}
              />

              <div
                className="ai-chat-history-list"
                style={{
                  flex: 1,
                  minHeight: 0,
                  overflowY: 'auto',
                  overflowX: 'hidden',
                  WebkitOverflowScrolling: 'touch',
                  overscrollBehavior: 'contain',
                  scrollbarGutter: 'stable',
                  display: 'grid',
                  alignContent: 'start',
                  gap: 8,
                  paddingRight: 4,
                  touchAction: 'pan-y',
                }}
              >
                {filteredChatSessions.length === 0 ? (
                  <div style={{ padding: '22px 0' }}>
                    <Empty
                      image={Empty.PRESENTED_IMAGE_SIMPLE}
                      description={(
                        <span style={{ color: '#94a3b8' }}>
                          {historySearchKeyword.trim()
                            ? '没有匹配的聊天'
                            : historyView === 'favorites'
                              ? '暂无收藏聊天'
                              : '暂无聊天历史'}
                        </span>
                      )}
                    />
                  </div>
                ) : (
                  groupedChatSessions.map((group) => (
                    <div className="ai-chat-history-section" key={group.key}>
                      <div className="ai-chat-history-section-title">
                        {group.label}
                      </div>
                      {group.sessions.map((session) => {
                        const isActiveSession = session.id === activeChatSessionId;
                        const firstQuestion = getFirstUserQuestion(session);
                        const userMessageCount = Array.isArray(session.messages)
                          ? session.messages.filter((messageItem) => messageItem.role === 'user').length
                          : 0;
                        const timeLabel = formatChatSessionTime(session.updatedAt || session.createdAt);
                        const moreMenuItems = [
                          {
                            key: 'export',
                            icon: <ExportOutlined />,
                            label: '导出',
                          },
                          {
                            key: 'edit-title',
                            icon: <EditOutlined />,
                            label: '编辑标题',
                          },
                          {
                            key: 'delete',
                            danger: true,
                            icon: <DeleteOutlined />,
                            label: '删除',
                          },
                        ];

                        return (
                          <div
                            key={session.id}
                            role="button"
                            tabIndex={0}
                            className={`ai-chat-history-card ${isActiveSession ? 'ai-chat-history-card--active' : ''}`}
                            onClick={() => handleLoadChatSession(session.id)}
                            onKeyDown={(event) => handleHistoryCardKeyDown(event, session.id)}
                          >
                            <div className="ai-chat-history-card-top">
                              <Text
                                style={{ display: 'block', flex: 1, fontSize: 13, fontWeight: 800, color: '#111827', minWidth: 0 }}
                                ellipsis={{ tooltip: session.title }}
                              >
                                {session.title || '新聊天'}
                              </Text>
                              <div className="ai-chat-history-card-actions">
                                <Dropdown
                                  trigger={['click']}
                                  placement="bottomRight"
                                  overlayClassName="ai-chat-history-more-menu"
                                  menu={{
                                    items: moreMenuItems,
                                    onClick: ({ key, domEvent }) => {
                                      domEvent?.stopPropagation();
                                      if (key === 'export') {
                                        handleExportChatSession(session);
                                      } else if (key === 'edit-title') {
                                        openEditHistoryTitle(session);
                                      } else if (key === 'delete') {
                                        handleDeleteHistorySession(session);
                                      }
                                    },
                                  }}
                                >
                                  <Button
                                    type="text"
                                    size="small"
                                    className="ai-chat-icon-button"
                                    icon={<EllipsisOutlined style={{ fontSize: 16 }} />}
                                    aria-label="更多操作"
                                    onClick={(event) => event.stopPropagation()}
                                    style={{ color: '#64748b' }}
                                  />
                                </Dropdown>
                                <Tooltip title={session.favorite ? '取消收藏' : '添加到收藏'}>
                                  <Button
                                    type="text"
                                    size="small"
                                    className="ai-chat-icon-button"
                                    icon={session.favorite ? <StarFilled style={{ fontSize: 16 }} /> : <StarOutlined style={{ fontSize: 16 }} />}
                                    aria-label={session.favorite ? '取消收藏' : '添加到收藏'}
                                    onClick={(event) => {
                                      event.stopPropagation();
                                      handleToggleFavoriteSession(session);
                                    }}
                                    style={{ color: session.favorite ? '#8a63d2' : '#64748b' }}
                                  />
                                </Tooltip>
                              </div>
                            </div>
                            <Text
                              style={{ display: 'block', fontSize: 12, color: '#64748b', lineHeight: 1.6, minWidth: 0 }}
                              ellipsis={{ tooltip: firstQuestion }}
                            >
                              {firstQuestion}
                            </Text>
                            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
                              <Text style={{ fontSize: 11, color: '#94a3b8' }}>
                                {timeLabel}
                              </Text>
                              <Text style={{ fontSize: 11, color: '#94a3b8' }}>
                                {userMessageCount > 0 ? `${userMessageCount} 条提问` : '未开始对话'}
                              </Text>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  ))
                )}
              </div>
            </div>
          )}
        </div>
      </Drawer>

      {shouldShowWebSearchPanel && (
        <aside
          className="ai-web-search-panel"
          aria-label="网页搜索结果"
          style={{
            position: 'fixed',
            top: isDesktop ? 22 : 74,
            bottom: isDesktop ? 22 : 118,
            right: isDesktop ? drawerPixelWidth + 14 : 12,
            width: webSearchPanelWidth,
            maxWidth: isDesktop ? `calc(100vw - ${drawerPixelWidth + 28}px)` : 'calc(100vw - 24px)',
            zIndex: 1101,
            display: 'flex',
            flexDirection: 'column',
            minWidth: 0,
            overflow: 'hidden',
            borderRadius: 24,
            background: 'linear-gradient(135deg, #e9e2ee 0%, #cabacd 100%)',
            border: '1px solid rgba(255, 255, 255, 0.42)',
            boxShadow: '0 22px 70px rgba(88, 28, 135, 0.22)',
            backdropFilter: 'blur(18px)',
            WebkitBackdropFilter: 'blur(18px)',
          }}
        >
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: 12,
              padding: '16px 20px 14px',
              borderBottom: '1px solid rgba(255, 255, 255, 0.38)',
              minWidth: 0,
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
              <GlobalOutlined style={{ color: '#7f5af0', fontSize: 14, flex: 'none' }} />
              <span style={{ fontSize: 16, lineHeight: 1.25, fontWeight: 900, color: '#2e1065' }}>
                网页搜索
              </span>
            </div>
            <div style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'flex-end', gap: 8, flex: 'none' }}>
              <button
                type="button"
                aria-pressed={autoExpandWebSearch}
                onClick={() => setAutoExpandWebSearch((value) => !value)}
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 8,
                  height: 28,
                  padding: 0,
                  borderRadius: 999,
                  border: 'none',
                  background: 'transparent',
                  color: '#2e1065',
                  cursor: 'pointer',
                  fontSize: 13,
                  fontWeight: 800,
                  lineHeight: 1,
                  whiteSpace: 'nowrap',
                }}
              >
                <span>自动展开搜索结果</span>
                <span
                  aria-hidden="true"
                  style={{
                    position: 'relative',
                    display: 'inline-flex',
                    alignItems: 'center',
                    width: 42,
                    height: 24,
                    borderRadius: 999,
                    padding: 2,
                    background: autoExpandWebSearch ? '#7f5af0' : 'rgba(148, 163, 184, 0.5)',
                    boxShadow: autoExpandWebSearch
                      ? '0 0 0 1px rgba(167, 139, 250, 0.28)'
                      : '0 0 0 1px rgba(255, 255, 255, 0.45)',
                    transition: 'background 160ms ease, box-shadow 160ms ease',
                  }}
                >
                  <span
                    style={{
                      width: 20,
                      height: 20,
                      borderRadius: '50%',
                      background: '#ffffff',
                      transform: autoExpandWebSearch ? 'translateX(18px)' : 'translateX(0)',
                      transition: 'transform 160ms ease',
                      boxShadow: '0 2px 6px rgba(15, 23, 42, 0.28)',
                    }}
                  />
                </span>
              </button>
              <Button
                type="text"
                size="small"
                className="ai-chat-icon-button"
                icon={<CloseOutlined style={{ fontSize: 17 }} />}
                aria-label="关闭网页搜索结果"
                onClick={() => toggleWebSearchSources(activeWebSearchPanel.messageId)}
                style={{
                  color: '#5b21b6',
                  flex: 'none',
                }}
              />
            </div>
          </div>

          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              padding: '12px 20px 0',
              color: '#475569',
              fontSize: 13,
              fontWeight: 800,
              minWidth: 0,
            }}
          >
            <SearchOutlined style={{ color: '#7f5af0', fontSize: 14, flex: 'none' }} />
            <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {activeWebSearchPanel.status === 'error'
                ? '联网搜索未完成'
                : `基于 ${activeWebSearchPanel.count || activeWebSearchPanel.sources.length || 0} 个搜索来源`}
            </span>
          </div>

          {activeWebSearchPanel.message && (
            <div
              style={{
                margin: '10px 20px 0',
                borderRadius: 12,
                padding: '9px 11px',
                background: 'rgba(254, 242, 242, 0.82)',
                border: '1px solid rgba(248, 113, 113, 0.22)',
                color: '#b91c1c',
                fontSize: 12,
                lineHeight: 1.6,
              }}
            >
              {activeWebSearchPanel.message}
            </div>
          )}

          <div
            className="ai-web-search-panel-list"
            style={{
              flex: 1,
              overflowY: 'auto',
              overflowX: 'hidden',
              padding: '8px 20px 18px',
              minHeight: 0,
            }}
          >
            {activeWebSearchPanel.sources.length > 0 ? (
              activeWebSearchPanel.sources.map((source, sourceIndex) => {
                const title = getSearchSourceTitle(source, sourceIndex);
                const domain = getSearchSourceDomain(source);
                const href = normalizeHistoryText(source.url);

                return (
                  <a
                    key={`${href || title}-${sourceIndex}-panel`}
                    className="ai-web-search-result"
                    href={href || undefined}
                    target="_blank"
                    rel="noreferrer noopener"
                    title={href || title}
                    onClick={(event) => {
                      if (!href) {
                        event.preventDefault();
                      }
                    }}
                  >
                    <span
                      className="ai-web-search-result-badge"
                      style={{
                        background: SOURCE_BADGE_COLORS[sourceIndex % SOURCE_BADGE_COLORS.length],
                      }}
                    >
                      {getSourceBadgeText(source, sourceIndex)}
                    </span>
                    <span style={{ minWidth: 0 }}>
                      <span className="ai-web-search-result-meta">
                        {domain} · {sourceIndex + 1}
                      </span>
                      <span className="ai-web-search-result-title">
                        {title}
                      </span>
                    </span>
                  </a>
                );
              })
            ) : (
              <div
                style={{
                  display: 'grid',
                  placeItems: 'center',
                  minHeight: 180,
                  textAlign: 'center',
                  color: '#64748b',
                  fontSize: 13,
                  lineHeight: 1.7,
                  padding: '22px 8px',
                }}
              >
                {activeWebSearchPanel.status === 'searching'
                  ? '正在搜索网络来源...'
                  : '暂时没有可展示的网页搜索结果'}
              </div>
            )}
          </div>
        </aside>
      )}

      <Modal
        title="编辑聊天标题"
        open={Boolean(editingHistorySession)}
        onOk={handleSaveHistoryTitle}
        onCancel={() => {
          setEditingHistorySession(null);
          setEditingHistoryTitle('');
        }}
        okText="保存"
        cancelText="取消"
        destroyOnHidden
      >
        <Input
          value={editingHistoryTitle}
          maxLength={60}
          showCount
          autoFocus
          placeholder="请输入聊天标题"
          onChange={(event) => setEditingHistoryTitle(event.target.value)}
          onPressEnter={handleSaveHistoryTitle}
        />
      </Modal>

      {!editingConfigId ? (
        <Modal
          title={
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <SettingOutlined style={{ color: '#b590e8' }} />
              <span>Berry 模型管理</span>
            </div>
          }
          open={isSettingsModalOpen}
          onCancel={closeSettingsModal}
          footer={[
            <Button key="reset" danger icon={<ReloadOutlined />} onClick={() => void handleResetSettings()}>
              恢复默认
            </Button>,
            <Button key="close" type="primary" onClick={closeSettingsModal}>
              完成
            </Button>
          ]}
          width={500}
          destroyOnClose
        >
          <Space direction="vertical" size={16} style={{ width: '100%', marginTop: 8 }}>
            <Text style={{ color: '#64748b', fontSize: 13, lineHeight: 1.6 }}>
              你配置的自定义模型和 API 密钥都保存在当前浏览器本地。你可以添加多个不同的模型或服务商配置。
            </Text>

            <div style={{ maxHeight: 320, overflowY: 'auto', paddingRight: 4 }}>
              {(aiSettings.customConfigs || []).length === 0 ? (
                <div style={{ textAlign: 'center', padding: '32px 0', background: 'rgba(241, 245, 249, 0.5)', borderRadius: 16 }}>
                  <Empty description="暂无自定义配置，默认使用系统配置" image={Empty.PRESENTED_IMAGE_SIMPLE} />
                </div>
              ) : (
                <Space direction="vertical" size={10} style={{ width: '100%' }}>
                  {(aiSettings.customConfigs || []).map((cfg) => {
                    const isActive = selectedModel === cfg.id;
                    return (
                      <div
                        key={cfg.id}
                        onClick={() => selectModel(cfg.id)}
                        style={{
                          padding: '12px 16px',
                          borderRadius: 14,
                          border: `1.5px solid ${isActive ? 'rgba(181, 144, 232, 0.45)' : 'rgba(148, 163, 184, 0.15)'}`,
                          background: isActive ? 'rgba(181, 144, 232, 0.05)' : 'rgba(255, 255, 255, 0.5)',
                          cursor: 'pointer',
                          transition: 'all 0.2s ease',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'space-between',
                          gap: 12,
                        }}
                        onMouseEnter={(e) => {
                          e.currentTarget.style.borderColor = isActive ? 'rgba(181, 144, 232, 0.6)' : 'rgba(181, 144, 232, 0.3)';
                          e.currentTarget.style.background = isActive ? 'rgba(181, 144, 232, 0.08)' : 'rgba(255, 255, 255, 0.8)';
                        }}
                        onMouseLeave={(e) => {
                          e.currentTarget.style.borderColor = isActive ? 'rgba(181, 144, 232, 0.45)' : 'rgba(148, 163, 184, 0.15)';
                          e.currentTarget.style.background = isActive ? 'rgba(181, 144, 232, 0.05)' : 'rgba(255, 255, 255, 0.5)';
                        }}
                      >
                        <div style={{ display: 'flex', alignItems: 'center', gap: 12, minWidth: 0, flex: 1 }}>
                          <div style={{
                            width: 20,
                            height: 20,
                            borderRadius: '50%',
                            border: `2px solid ${isActive ? '#b590e8' : '#cbd5e1'}`,
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            flexShrink: 0,
                            background: isActive ? '#b590e8' : 'transparent',
                            transition: 'all 0.15s ease',
                          }}>
                            {isActive && <CheckOutlined style={{ color: '#fff', fontSize: 10, fontWeight: 'bold' }} />}
                          </div>
                          <div style={{ minWidth: 0 }}>
                            <div style={{ fontWeight: 600, fontSize: 14, color: '#1e293b', display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                              <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 160 }}>
                                {cfg.modelDisplayName || cfg.model}
                              </span>
                              <span style={{
                                fontSize: 10,
                                fontWeight: 500,
                                padding: '2px 6px',
                                borderRadius: 6,
                                background: 'rgba(148, 163, 184, 0.12)',
                                color: '#64748b',
                              }}>
                                {cfg.provider === 'custom' ? '自定义' : cfg.provider === 'deepseek' ? 'DeepSeek' : cfg.provider === 'siliconflow' ? '硅基流动' : cfg.provider === 'moonshot' ? 'Kimi' : cfg.provider}
                              </span>
                            </div>
                            <div style={{ fontSize: 12, color: '#64748b', marginTop: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                              模型名: {cfg.model}
                            </div>
                          </div>
                        </div>

                        <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0 }} onClick={(e) => e.stopPropagation()}>
                          <Tooltip title="测试连接">
                            <Button
                              type="text"
                              size="small"
                              icon={<LinkOutlined style={{ color: '#64748b' }} />}
                              onClick={() => void handleTestConnectionForConfig(cfg)}
                              loading={isTestingConnection}
                            />
                          </Tooltip>
                          <Tooltip title="编辑">
                            <Button
                              type="text"
                              size="small"
                              icon={<EditOutlined style={{ color: '#b590e8' }} />}
                              onClick={() => openEditConfig(cfg)}
                            />
                          </Tooltip>
                          <Tooltip title="删除">
                            <Button
                              type="text"
                              size="small"
                              danger
                              icon={<DeleteOutlined />}
                              onClick={() => void handleDeleteSettings(cfg.id)}
                            />
                          </Tooltip>
                        </div>
                      </div>
                    );
                  })}
                </Space>
              )}
            </div>

            <Button
              type="dashed"
              block
              icon={<PlusOutlined />}
              onClick={openAddConfig}
              style={{
                height: 40,
                borderRadius: 12,
                borderColor: 'rgba(181, 144, 232, 0.4)',
                color: '#b590e8',
              }}
            >
              添加自定义模型配置
            </Button>
          </Space>
        </Modal>
      ) : (
        <Modal
          title={
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <Button
                type="text"
                icon={<ArrowLeftOutlined />}
                onClick={() => setEditingConfigId(null)}
                style={{ padding: 0, width: 24, height: 24, display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}
              />
              <span>{editingConfigId === 'new' ? '添加自定义模型' : '编辑自定义模型'}</span>
            </div>
          }
          open={isSettingsModalOpen}
          onCancel={closeSettingsModal}
          onOk={() => void handleSaveSettings()}
          okText="保存配置"
          cancelText="返回列表"
          cancelButtonProps={{
            onClick: () => setEditingConfigId(null)
          }}
          confirmLoading={isSettingsSaving}
          destroyOnClose
        >
          <Space direction="vertical" size={12} style={{ width: '100%', marginTop: 8 }}>
            <div>
              <Text style={{ display: 'block', marginBottom: 8, fontWeight: 600, color: '#374151' }}>
                配置模式 / 提供商
              </Text>
              <Select
                value={providerDraft}
                onChange={(value) => setProviderDraft(value)}
                style={{ width: '100%' }}
                options={[
                  { value: 'custom', label: '自由配置 (Custom)' },
                  { value: 'siliconflow', label: 'Siliconflow (硅基流动)' },
                  { value: 'deepseek', label: 'DeepSeek (深度求索)' },
                  { value: 'moonshot', label: 'Moonshot (Kimi)' },
                ]}
              />
            </div>

            {providerDraft === 'custom' && (
              <div>
                <Text style={{ display: 'block', marginBottom: 8, fontWeight: 600, color: '#374151' }}>
                  Base URL
                </Text>
                <Input
                  prefix={<LinkOutlined style={{ color: '#94a3b8' }} />}
                  value={baseUrlDraft}
                  onChange={(event) => setBaseUrlDraft(event.target.value)}
                  placeholder="例如: https://api.openai.com/v1"
                  maxLength={300}
                />
              </div>
            )}

            {providerDraft === 'deepseek' && (
              <div style={{ marginBottom: 4 }}>
                <Text type="secondary" style={{ fontSize: 12 }}>
                  已应用 DeepSeek 官方接口默认配置。思考模式受全局【深度思考】开关控制，开启后强度自动设为 high。
                </Text>
              </div>
            )}

            {providerDraft === 'moonshot' && (
              <div style={{ marginBottom: 4 }}>
                <Text type="secondary" style={{ fontSize: 12 }}>
                  已应用 Moonshot (Kimi) 官方接口默认配置。支持 kimi-k2-0711-preview 等模型。
                </Text>
              </div>
            )}

            <div>
              <Text style={{ display: 'block', marginBottom: 8, fontWeight: 600, color: '#374151' }}>
                模型名称
              </Text>
              <Input
                value={modelDraft}
                onChange={(event) => setModelDraft(event.target.value)}
                placeholder="例如: gpt-5.5"
                maxLength={120}
              />
            </div>

            <div>
              <Text style={{ display: 'block', marginBottom: 8, fontWeight: 600, color: '#374151' }}>
                显示名称 <span style={{ fontWeight: 400, color: '#94a3b8' }}>(选填)</span>
              </Text>
              <Input
                value={modelDisplayNameDraft}
                onChange={(event) => setModelDisplayNameDraft(event.target.value)}
                placeholder="例如: gpt-5.5"
                maxLength={120}
              />
            </div>

            <div>
              <Text style={{ display: 'block', marginBottom: 8, fontWeight: 600, color: '#374151' }}>
                API Key
              </Text>
              <Input.Password
                value={apiKeyDraft}
                onChange={(event) => setApiKeyDraft(event.target.value)}
                placeholder={editingConfigId !== 'new' ? '已保存，如需修改请重新输入' : '请输入你的 API Key'}
                maxLength={300}
              />
              {editingConfigId !== 'new' && (
                <Text style={{ display: 'block', marginTop: 8, fontSize: 12, color: '#94a3b8' }}>
                  当前已保存：********
                </Text>
              )}
            </div>

            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginTop: 8 }}>
              <Button
                icon={<LinkOutlined />}
                onClick={() => void handleTestConnection()}
                loading={isTestingConnection}
                disabled={isSettingsSaving}
              >
                检查连接
              </Button>
            </div>

            {testResult && (
              <div
                style={{
                  borderRadius: 12,
                  padding: '12px 14px',
                  background: testResult.success ? 'rgba(240, 253, 244, 0.95)' : 'rgba(254, 242, 242, 0.95)',
                  border: `1px solid ${testResult.success ? 'rgba(34, 197, 94, 0.2)' : 'rgba(239, 68, 68, 0.22)'}`,
                  marginTop: 8,
                }}
              >
                <Text style={{ display: 'block', color: testResult.success ? '#166534' : '#b91c1c', fontWeight: 600 }}>
                  {testResult.message}
                </Text>
                {testResult.success && (
                  <>
                    <Text style={{ display: 'block', marginTop: 6, fontSize: 12, color: '#166534' }}>
                      连接来源：{testResult.activeSource === 'custom' ? '用户自定义配置' : '系统默认配置'}
                    </Text>
                    <Text style={{ display: 'block', marginTop: 4, fontSize: 12, color: '#166534' }}>
                      生效模型：{testResult.activeModel}
                    </Text>
                  </>
                )}
              </div>
            )}
          </Space>
        </Modal>
      )}
    </>
  );
};

export default AIChatWidget;
