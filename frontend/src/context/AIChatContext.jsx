import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import apiClient from '../api/client';
import { useAuth } from './AuthContext';

const AIChatContext = createContext(null);

const DEFAULT_SHORTCUTS = [
  {
    key: 'general-explain',
    label: '解释一下',
    prompt: '请根据我当前页面的内容，用简洁中文帮我解释重点。',
  },
  {
    key: 'general-plan',
    label: '给我建议',
    prompt: '请结合我当前页面的内容，给我一个下一步学习建议。',
  },
];

const DEFAULT_CONTEXT = {
  page: 'general',
  label: 'Berry',
  description: '可以结合你当前页面的内容，随时提问。',
  shortcuts: DEFAULT_SHORTCUTS,
  payload: {},
};

const DEFAULT_WEB_SEARCH_FRESHNESS = 'noLimit';
const WEB_SEARCH_FRESHNESS_VALUES = ['noLimit', 'oneDay', 'oneWeek', 'oneMonth', 'oneYear'];
const CONTEXT_HISTORY_PAGE_WHITELIST = new Set(['learning', 'quiz', 'mistake-book']);

const DEFAULT_AI_SETTINGS = {
  customBaseUrl: '',
  customModel: '',
  customModelDisplayName: '',
  hasApiKey: false,
  maskedApiKey: '',
  usesCustomConfig: false,
  systemConfigured: false,
  canUseAI: false,
  activeSource: 'system',
  activeModel: '',
  activeModelDisplayName: '',
  availableModels: [],
  availableModelOptions: [],
  selectedModel: '',
  systemModelKey: '',
  defaultSystemModelKey: '',
  canManageSystemModel: false,
  thinkingEnabled: false,
  webSearchEnabled: false,
  webSearchFreshness: DEFAULT_WEB_SEARCH_FRESHNESS,
};

const createMessageId = () => `${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;

const createMessage = (role, content, extra = {}) => ({
  id: createMessageId(),
  role,
  content,
  sendable: true,
  ...extra,
});

const buildContextScopeKey = (context) => {
  const normalizedContext = context || DEFAULT_CONTEXT;
  const page = normalizedContext.page || 'general';
  const payload = normalizedContext.payload || {};
  const subject = (
    payload.word
    || payload.selectedWord
    || payload.questionText
    || payload.groupLabel
    || payload.chapterTitle
    || payload.label
    || ''
  );

  return `${page}:${String(subject || '').trim()}`;
};

const shouldLimitHistoryToContext = (context) => {
  const normalizedContext = context || DEFAULT_CONTEXT;
  const page = normalizedContext.page || 'general';
  const payload = normalizedContext.payload || {};

  if (!CONTEXT_HISTORY_PAGE_WHITELIST.has(page)) {
    return false;
  }

  return Boolean(
    payload.word
    || payload.selectedWord
    || payload.questionText
    || payload.groupLabel
  );
};

const LOCAL_SETTINGS_KEY = 'ieltswords_custom_ai_settings';
const THINKING_ENABLED_KEY = 'ieltswords_ai_thinking_enabled';
const WEB_SEARCH_ENABLED_KEY = 'ieltswords_ai_web_search_enabled';
const WEB_SEARCH_FRESHNESS_KEY = 'ieltswords_ai_web_search_freshness';

const getChatHistoryBundleKey = (userId) => `ieltswords_ai_chat_history_bundle_${userId || 'guest'}`;
const getLegacyChatHistoryKey = (userId) => `ieltswords_ai_chat_history_${userId || 'guest'}`;

export const getLocalAISettings = () => {
  try {
    const data = localStorage.getItem(LOCAL_SETTINGS_KEY);
    if (!data) {
      return { configs: [], activeConfigId: null };
    }
    const parsed = JSON.parse(data);
    if (Array.isArray(parsed)) {
      return { configs: parsed, activeConfigId: parsed[0]?.id || null };
    }
    if (parsed && typeof parsed === 'object') {
      if (parsed.configs && Array.isArray(parsed.configs)) {
        return parsed;
      }
      // Migrate old format
      if (parsed.model || parsed.apiKey || parsed.provider || parsed.baseUrl) {
        const singleConfig = {
          id: 'config_default',
          provider: parsed.provider || 'custom',
          baseUrl: parsed.baseUrl || '',
          model: parsed.model || '',
          modelDisplayName: parsed.modelDisplayName || '',
          apiKey: parsed.apiKey || '',
        };
        const migrated = {
          configs: [singleConfig],
          activeConfigId: 'config_default',
        };
        try {
          localStorage.setItem(LOCAL_SETTINGS_KEY, JSON.stringify(migrated));
        } catch (e) {
          console.error('Failed to save migrated settings:', e);
        }
        return migrated;
      }
    }
    return { configs: [], activeConfigId: null };
  } catch {
    return { configs: [], activeConfigId: null };
  }
};

const getLocalThinkingEnabled = () => {
  try {
    const raw = localStorage.getItem(THINKING_ENABLED_KEY);
    if (raw === null) {
      return null;
    }
    if (raw === 'true') {
      return true;
    }
    if (raw === 'false') {
      return false;
    }
  } catch {
    return null;
  }

  return null;
};

const setLocalThinkingEnabled = (value) => {
  try {
    if (value === null || value === undefined) {
      localStorage.removeItem(THINKING_ENABLED_KEY);
      return;
    }

    localStorage.setItem(THINKING_ENABLED_KEY, value ? 'true' : 'false');
  } catch {
    // ignore localStorage failures
  }
};

const getLocalWebSearchEnabled = () => {
  try {
    return localStorage.getItem(WEB_SEARCH_ENABLED_KEY) === 'true';
  } catch {
    return false;
  }
};

const setLocalWebSearchEnabled = (value) => {
  try {
    localStorage.setItem(WEB_SEARCH_ENABLED_KEY, value ? 'true' : 'false');
  } catch {
    // ignore localStorage failures
  }
};

const normalizeWebSearchFreshness = (value) => (
  WEB_SEARCH_FRESHNESS_VALUES.includes(value) ? value : DEFAULT_WEB_SEARCH_FRESHNESS
);

const getLocalWebSearchFreshness = () => {
  try {
    return normalizeWebSearchFreshness(localStorage.getItem(WEB_SEARCH_FRESHNESS_KEY));
  } catch {
    return DEFAULT_WEB_SEARCH_FRESHNESS;
  }
};

const setLocalWebSearchFreshness = (value) => {
  try {
    localStorage.setItem(WEB_SEARCH_FRESHNESS_KEY, normalizeWebSearchFreshness(value));
  } catch {
    // ignore localStorage failures
  }
};

const createChatSessionId = () => `chat_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;

const truncateText = (text, maxLength) => {
  const value = String(text || '').replace(/\s+/g, ' ').trim();
  if (!value) {
    return '';
  }
  if (value.length <= maxLength) {
    return value;
  }
  return `${value.slice(0, maxLength)}…`;
};

const hasUserMessage = (messages) => (
  Array.isArray(messages)
  && messages.some((message) => message?.role === 'user' && String(message?.content || '').trim())
);

const buildConversationTitle = (messages) => {
  const firstUserMessage = Array.isArray(messages)
    ? messages.find((message) => message?.role === 'user' && String(message?.content || '').trim())
    : null;
  return firstUserMessage ? truncateText(firstUserMessage.content, 18) : '新聊天';
};

const buildConversationPreview = (messages) => {
  if (!Array.isArray(messages) || messages.length === 0) {
    return '';
  }

  const lastContentMessage = [...messages].reverse().find((message) => String(message?.content || '').trim());
  return lastContentMessage ? truncateText(lastContentMessage.content, 42) : '';
};

const normalizeChatMessage = (message) => {
  if (!message || typeof message !== 'object') {
    return null;
  }

  const role = ['user', 'assistant', 'system'].includes(message.role) ? message.role : 'assistant';
  const content = String(message.content || '');
  const isGreeting = message.kind === 'greeting';
  const isCompletedAssistant = (
    role === 'assistant'
    && content.trim()
    && !message.streaming
    && !message.error
    && !isGreeting
  );

  return {
    ...message,
    role,
    content,
    contextPage: typeof message.contextPage === 'string' && message.contextPage.trim()
      ? message.contextPage.trim()
      : 'general',
    contextScopeKey: typeof message.contextScopeKey === 'string'
      ? message.contextScopeKey
      : '',
    sendable: isCompletedAssistant ? true : message.sendable,
  };
};

const normalizeChatSession = (session, defaultContext) => {
  const context = normalizeContext(session?.context || defaultContext);
  const normalizedMessages = Array.isArray(session?.messages) && session.messages.length > 0
    ? session.messages.map(normalizeChatMessage).filter(Boolean)
    : [];
  const messages = normalizedMessages.length > 0 ? normalizedMessages : [buildGreeting(context)];
  const createdAt = Number.isFinite(Number(session?.createdAt))
    ? Number(session.createdAt)
    : Date.now();
  const updatedAt = Number.isFinite(Number(session?.updatedAt))
    ? Number(session.updatedAt)
    : createdAt;

  return {
    id: session?.id || createChatSessionId(),
    title: session?.title || buildConversationTitle(messages),
    titleEdited: Boolean(session?.titleEdited),
    preview: session?.preview || buildConversationPreview(messages),
    favorite: Boolean(session?.favorite || session?.isFavorite),
    createdAt,
    updatedAt,
    context,
    messages,
  };
};

const createDefaultChatHistory = (defaultContext) => {
  const session = normalizeChatSession({
    id: createChatSessionId(),
    context: defaultContext,
    messages: [buildGreeting(defaultContext)],
  }, defaultContext);

  return {
    activeSessionId: session.id,
    sessions: [session],
  };
};

const loadChatHistoryBundle = (userId, defaultContext) => {
  if (!userId) {
    return createDefaultChatHistory(defaultContext);
  }

  try {
    const bundleKey = getChatHistoryBundleKey(userId);
    const bundleData = localStorage.getItem(bundleKey);
    if (bundleData) {
      const parsed = JSON.parse(bundleData);
      const sessions = Array.isArray(parsed?.sessions)
        ? parsed.sessions.map((session) => normalizeChatSession(session, defaultContext))
        : [];

      if (sessions.length > 0) {
        const activeSessionId = sessions.some((session) => session.id === parsed?.activeSessionId)
          ? parsed.activeSessionId
          : sessions[0].id;

        return {
          activeSessionId,
          sessions,
        };
      }
    }
  } catch (e) {
    console.error('Failed to load chat history:', e);
  }

  try {
    const legacyKey = getLegacyChatHistoryKey(userId);
    const legacyData = localStorage.getItem(legacyKey);
    if (legacyData) {
      const parsed = JSON.parse(legacyData);
      if (Array.isArray(parsed) && parsed.length > 0) {
        const session = normalizeChatSession({
          id: createChatSessionId(),
          context: defaultContext,
          messages: parsed,
        }, defaultContext);
        const bundle = {
          activeSessionId: session.id,
          sessions: [session],
        };
        localStorage.setItem(getChatHistoryBundleKey(userId), JSON.stringify(bundle));
        return bundle;
      }
    }
  } catch (e) {
    console.error('Failed to save chat history:', e);
  }

  return createDefaultChatHistory(defaultContext);
};

const persistChatHistoryBundle = (userId, bundle) => {
  if (!userId) {
    return;
  }

  try {
    localStorage.setItem(getChatHistoryBundleKey(userId), JSON.stringify(bundle));
  } catch (e) {
    console.error('Failed to save chat history:', e);
  }
};

const upsertChatSession = (sessions, sessionId, { messages, context }) => {
  const now = Date.now();
  const nextSessions = Array.isArray(sessions) ? [...sessions] : [];
  const sessionIndex = nextSessions.findIndex((session) => session.id === sessionId);

  if (sessionIndex < 0) {
    const session = normalizeChatSession({
      id: sessionId,
      context,
      messages,
      createdAt: now,
      updatedAt: now,
    }, context);
    return [session, ...nextSessions];
  }

  const current = nextSessions[sessionIndex];
  const isMessagesChanged = !current.messages || current.messages.length !== messages.length || 
    JSON.stringify(current.messages[current.messages.length - 1]) !== JSON.stringify(messages[messages.length - 1]);

  nextSessions[sessionIndex] = {
    ...current,
    context: normalizeContext(context || current.context),
    messages,
    title: current.titleEdited ? current.title : buildConversationTitle(messages),
    preview: buildConversationPreview(messages),
    updatedAt: isMessagesChanged ? now : current.updatedAt,
  };

  return nextSessions;
};

const normalizeContext = (context) => ({
  ...DEFAULT_CONTEXT,
  ...(context || {}),
  payload: context?.payload || {},
  shortcuts: context?.shortcuts?.length ? context.shortcuts : DEFAULT_SHORTCUTS,
});

const normalizeModelList = (models) => {
  const items = Array.isArray(models) ? models : [];
  return Array.from(new Set(items.map((item) => String(item || '').trim()).filter(Boolean)));
};

const inferSystemModelProvider = (model, provider, key) => {
  const explicitProvider = String(provider || '').trim().toLowerCase();
  if (explicitProvider) {
    return explicitProvider;
  }

  const value = `${String(model || '')} ${String(key || '')}`.toLowerCase();
  if (value.includes('siliconflow')) return 'siliconflow';
  if (value.includes('deepseek')) return 'deepseek';
  if (value.includes('moonshot') || value.includes('kimi')) return 'moonshot';
  if (value.includes('gpt') || value.includes('openai')) return 'openai';
  return 'custom';
};

const normalizeSystemModelOptions = (options, fallbackModels = [], activeModel = '', activeModelDisplayName = '') => {
  const explicitOptions = Array.isArray(options) ? options : [];
  const normalizedExplicit = [];
  const seenKeys = new Set();

  explicitOptions.forEach((item, index) => {
    const key = String(item?.key || '').trim();
    const model = String(item?.model || '').trim();
    if (!key || !model || seenKeys.has(key)) {
      return;
    }

    seenKeys.add(key);
    normalizedExplicit.push({
      key,
      model,
      displayName: String(item?.display_name || item?.displayName || model).trim() || model,
      provider: inferSystemModelProvider(model, item?.provider, key),
      source: 'system',
      isDefault: Boolean(item?.is_default ?? item?.isDefault ?? index === 0),
    });
  });

  if (normalizedExplicit.length > 0) {
    return normalizedExplicit;
  }

  return normalizeModelList(fallbackModels).map((model, index) => ({
    key: model,
    model,
    displayName: model === activeModel && activeModelDisplayName
      ? activeModelDisplayName
      : model,
    provider: inferSystemModelProvider(model, '', model),
    source: 'system',
    isDefault: index === 0,
  }));
};

const normalizeAISettings = (data, previousSelectedModel = '') => {
  const localSettings = getLocalAISettings() || { configs: [], activeConfigId: null };
  const systemThinkingEnabled = typeof data?.thinking_enabled === 'boolean'
    ? data.thinking_enabled
    : null;
  const storedThinkingEnabled = getLocalThinkingEnabled();
  const storedWebSearchEnabled = getLocalWebSearchEnabled();
  const storedWebSearchFreshness = getLocalWebSearchFreshness();
  
  const systemModel = data?.active_model || '';
  const systemModelDisplayName = data?.active_model_display_name || '';
  const availableModelOptions = normalizeSystemModelOptions(
    data?.available_model_options,
    data?.available_models,
    systemModel,
    systemModelDisplayName,
  );
  const availableModels = availableModelOptions.map((item) => item.key);
  const systemModelKey = data?.active_system_model_key
    || availableModelOptions.find((item) => item.isDefault)?.key
    || availableModels[0]
    || '';
  const defaultSystemModelKey = data?.default_system_model_key || systemModelKey;

  const customConfigs = (localSettings.configs || []).map(cfg => ({
    id: cfg.id,
    provider: cfg.provider || 'custom',
    baseUrl: cfg.baseUrl || '',
    model: cfg.model || '',
    modelDisplayName: cfg.modelDisplayName || '',
    hasApiKey: Boolean(cfg.apiKey),
    maskedApiKey: cfg.apiKey ? '*'.repeat(8) : '',
  }));

  const systemDefault = defaultSystemModelKey || availableModels[0] || '';
  const customDefault = customConfigs.find(cfg => cfg.id === localSettings.activeConfigId) || customConfigs[0] || null;
  
  let selectedModel = '';
  
  const isPrevValid = previousSelectedModel && (
    availableModels.includes(previousSelectedModel) ||
    customConfigs.some(cfg => cfg.id === previousSelectedModel)
  );
  
  if (isPrevValid) {
    selectedModel = previousSelectedModel;
  } else if (customDefault) {
    selectedModel = customDefault.id;
  } else {
    selectedModel = systemDefault;
  }

  const activeConfig = customConfigs.find(cfg => cfg.id === selectedModel);
  const matchingSystemModel = availableModelOptions.find((item) => item.key === selectedModel) || null;
  const activeModelName = activeConfig ? activeConfig.model : (matchingSystemModel?.model || systemModel);
  const activeModelDisplayName = activeConfig 
    ? (activeConfig.modelDisplayName || activeConfig.model)
    : (matchingSystemModel?.displayName || systemModelDisplayName || selectedModel);

  return {
    customConfigs,
    activeConfigId: localSettings.activeConfigId,
    customProvider: activeConfig ? activeConfig.provider : 'custom',
    customBaseUrl: activeConfig ? activeConfig.baseUrl : '',
    customModel: activeConfig ? activeConfig.model : '',
    customModelDisplayName: activeConfig ? activeConfig.modelDisplayName : '',
    hasApiKey: customConfigs.some(cfg => cfg.hasApiKey),
    usesCustomConfig: Boolean(activeConfig),
    systemConfigured: Boolean(data?.system_configured),
    canUseAI: customConfigs.some(cfg => cfg.hasApiKey) || Boolean(data?.system_configured),
    activeSource: activeConfig ? 'custom' : 'system',
    activeModel: activeModelName,
    activeModelDisplayName,
    availableModels,
    availableModelOptions,
    selectedModel,
    systemModel,
    systemModelDisplayName,
    systemModelKey,
    defaultSystemModelKey,
    canManageSystemModel: Boolean(data?.can_manage_system_model),
    thinkingEnabled: storedThinkingEnabled ?? systemThinkingEnabled ?? false,
    systemThinkingEnabled,
    webSearchEnabled: storedWebSearchEnabled,
    webSearchFreshness: storedWebSearchFreshness || normalizeWebSearchFreshness(data?.web_search_freshness),
  };
};

const buildApiUrl = (path) => {
  const baseUrl = apiClient.defaults.baseURL || window.location.origin;
  return new URL(path, `${String(baseUrl).replace(/\/$/, '')}/`).toString();
};

const buildStreamRequestHeaders = () => {
  const headers = {
    'Content-Type': 'application/json',
  };
  const token = localStorage.getItem('access_token');
  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }
  return headers;
};

const parseErrorResponse = async (response) => {
  const contentType = response.headers.get('content-type') || '';

  try {
    if (contentType.includes('application/json')) {
      const data = await response.json();
      return data?.detail || data?.message || 'Berry 暂时没能回复成功，请稍后再试。';
    }

    const text = await response.text();
    return text || 'Berry 暂时没能回复成功，请稍后再试。';
  } catch (error) {
    console.error('解析流式响应错误信息失败:', error);
    return 'Berry 暂时没能回复成功，请稍后再试。';
  }
};

const readNDJSONStream = async (response, onEvent) => {
  if (!response.body) {
    throw new Error('当前环境不支持流式响应');
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder('utf-8');
  let buffer = '';

  const processLine = (line) => {
    const trimmed = line.trim();
    if (!trimmed) {
      return;
    }

    const event = JSON.parse(trimmed);
    onEvent(event);
  };

  while (true) {
    const { value, done } = await reader.read();
    buffer += decoder.decode(value || new Uint8Array(), { stream: !done });

    let newlineIndex = buffer.indexOf('\n');
    while (newlineIndex >= 0) {
      const line = buffer.slice(0, newlineIndex);
      buffer = buffer.slice(newlineIndex + 1);
      processLine(line);
      newlineIndex = buffer.indexOf('\n');
    }

    if (done) {
      break;
    }
  }

  if (buffer.trim()) {
    processLine(buffer);
  }
};

const buildGreeting = (context) => {
  const page = context?.page || 'general';

  if (page === 'learning') {
    return createMessage('assistant', '我已经拿到你当前正在学的单词和分组信息了。想让我解释词义、近义辨析，或者帮你想记忆技巧，都可以直接问。', {
      sendable: false,
      kind: 'greeting',
    });
  }

  if (page === 'quiz') {
    return createMessage('assistant', '我看得到你当前这道测试题的上下文。你可以让我讲题、分析错因，或者先给提示不直接剧透答案。', {
      sendable: false,
      kind: 'greeting',
    });
  }

  if (page === 'mistake-book') {
    return createMessage('assistant', '我可以结合你当前的错词本，帮你分析为什么总错、哪些词该先复习，以及怎么安排这一轮回顾。', {
      sendable: false,
      kind: 'greeting',
    });
  }

  return createMessage('assistant', '你好，我是 Berry。你可以直接问我单词、题目、复习方法，或者让我结合当前页面给建议。', {
    sendable: false,
    kind: 'greeting',
  });
};

export const AIChatProvider = ({ children }) => {
  const { isAuthenticated, user } = useAuth();
  const userKey = user?.id || user?.username;
  const [initialChatData] = useState(() => {
    const history = loadChatHistoryBundle(user?.id || user?.username, DEFAULT_CONTEXT);
    const activeSession = history.sessions.find((session) => session.id === history.activeSessionId);
    return {
      history,
      messages: activeSession?.messages || [buildGreeting(DEFAULT_CONTEXT)],
    };
  });
  const [isOpen, setIsOpen] = useState(false);
  const [chatContext, setChatContextState] = useState(DEFAULT_CONTEXT);
  const [messages, setMessages] = useState(initialChatData.messages);
  const [chatHistory, setChatHistory] = useState(initialChatData.history);
  const [isSending, setIsSending] = useState(false);
  const [aiSettings, setAISettings] = useState(DEFAULT_AI_SETTINGS);
  const [isSettingsLoading, setIsSettingsLoading] = useState(false);
  const [isSettingsSaving, setIsSettingsSaving] = useState(false);
  const messagesRef = useRef(messages);
  const chatContextRef = useRef(chatContext);
  const chatHistoryRef = useRef(chatHistory);
  const aiSettingsRef = useRef(aiSettings);
  const activeStreamAbortRef = useRef(null);
  const settingsLoadedRef = useRef(false);
  const loadedUserKeyRef = useRef(userKey || null);
  const chatSessions = chatHistory.sessions;
  const activeChatSessionId = chatHistory.activeSessionId || null;

  const selectModel = useCallback((model) => {
    const normalizedModel = typeof model === 'string' ? model.trim() : '';
    setAISettings((prev) => {
      if (!normalizedModel || normalizedModel === prev.selectedModel) {
        return prev;
      }

      const isValidSystemModel = (prev.availableModels || []).includes(normalizedModel);
      const isValidCustomConfig = (prev.customConfigs || []).some(cfg => cfg.id === normalizedModel);

      if (!isValidSystemModel && !isValidCustomConfig) {
        return prev;
      }

      if (isValidCustomConfig) {
        try {
          const localSettings = getLocalAISettings() || { configs: [], activeConfigId: null };
          localSettings.activeConfigId = normalizedModel;
          localStorage.setItem(LOCAL_SETTINGS_KEY, JSON.stringify(localSettings));
        } catch (e) {
          console.error('Failed to update activeConfigId in localStorage:', e);
        }
      }

      const next = {
        ...prev,
        selectedModel: normalizedModel,
      };

      const activeConfig = (prev.customConfigs || []).find(cfg => cfg.id === normalizedModel);
      const systemModelOption = (prev.availableModelOptions || []).find(option => option.key === normalizedModel);
      const nextNormalized = {
        ...next,
        activeConfigId: activeConfig ? activeConfig.id : prev.activeConfigId,
        customProvider: activeConfig ? activeConfig.provider : 'custom',
        customBaseUrl: activeConfig ? activeConfig.baseUrl : '',
        customModel: activeConfig ? activeConfig.model : '',
        customModelDisplayName: activeConfig ? activeConfig.modelDisplayName : '',
        usesCustomConfig: Boolean(activeConfig),
        activeSource: activeConfig ? 'custom' : 'system',
        systemModelKey: activeConfig ? prev.systemModelKey : (systemModelOption?.key || prev.systemModelKey),
        systemModel: activeConfig ? prev.systemModel : (systemModelOption?.model || prev.systemModel),
        systemModelDisplayName: activeConfig
          ? prev.systemModelDisplayName
          : (systemModelOption?.displayName || prev.systemModelDisplayName),
        activeModel: activeConfig ? activeConfig.model : (systemModelOption?.model || normalizedModel),
        activeModelDisplayName: activeConfig
          ? (activeConfig.modelDisplayName || activeConfig.model)
          : (systemModelOption?.displayName || prev.systemModelDisplayName || normalizedModel),
      };

      aiSettingsRef.current = nextNormalized;
      return nextNormalized;
    });
  }, []);

  useEffect(() => {
    messagesRef.current = messages;
    if (isAuthenticated && userKey && loadedUserKeyRef.current === userKey) {
      setChatHistory((prev) => {
        const activeSessionId = prev.activeSessionId || createChatSessionId();
        const next = {
          activeSessionId,
          sessions: upsertChatSession(prev.sessions, activeSessionId, {
            messages,
            context: chatContext,
          }),
        };
        chatHistoryRef.current = next;
        persistChatHistoryBundle(userKey, next);
        return next;
      });
    }
  }, [messages, isAuthenticated, userKey, chatContext]);

  useEffect(() => {
    chatContextRef.current = chatContext;
  }, [chatContext]);

  useEffect(() => {
    chatHistoryRef.current = chatHistory;
  }, [chatHistory]);

  useEffect(() => {
    aiSettingsRef.current = aiSettings;
  }, [aiSettings]);

  useEffect(() => {
    const currentContext = chatContextRef.current;
    if (isAuthenticated && userKey) {
      const nextHistory = loadChatHistoryBundle(userKey, currentContext);
      const activeSession = nextHistory.sessions.find((session) => session.id === nextHistory.activeSessionId);
      loadedUserKeyRef.current = userKey;
      chatHistoryRef.current = nextHistory;
      setChatHistory(nextHistory);
      setMessages(activeSession?.messages || [buildGreeting(currentContext)]);
    } else {
      loadedUserKeyRef.current = null;
      const nextHistory = createDefaultChatHistory(currentContext);
      chatHistoryRef.current = nextHistory;
      setChatHistory(nextHistory);
      setMessages([buildGreeting(currentContext)]);
    }
  }, [isAuthenticated, userKey]);

  const fetchAISettings = useCallback(async (force = false) => {
    if (!isAuthenticated) {
      settingsLoadedRef.current = false;
      setAISettings(DEFAULT_AI_SETTINGS);
      return DEFAULT_AI_SETTINGS;
    }

    if (!force && settingsLoadedRef.current) {
      return aiSettingsRef.current;
    }

    setIsSettingsLoading(true);
    try {
      const response = await apiClient.get('/api/ai/settings', {
        skipErrorHandler: true,
      });
      const nextSettings = normalizeAISettings(response.data, aiSettingsRef.current.selectedModel);
      settingsLoadedRef.current = true;
      setAISettings(nextSettings);
      return nextSettings;
    } catch (error) {
      console.error('获取 AI 设置失败:', error);
      settingsLoadedRef.current = false;
      return DEFAULT_AI_SETTINGS;
    } finally {
      setIsSettingsLoading(false);
    }
  }, [isAuthenticated]);

  const setSystemDefaultModel = useCallback(async (modelKey) => {
    const normalizedModelKey = typeof modelKey === 'string' ? modelKey.trim() : '';
    if (!normalizedModelKey || !isAuthenticated) {
      return null;
    }

    setIsSettingsSaving(true);
    try {
      const response = await apiClient.patch('/api/ai/settings/system-default-model', {
        model_key: normalizedModelKey,
      }, {
        skipErrorHandler: true,
      });
      const nextSettings = normalizeAISettings(response.data, normalizedModelKey);
      settingsLoadedRef.current = true;
      aiSettingsRef.current = nextSettings;
      setAISettings(nextSettings);
      return nextSettings;
    } catch (error) {
      console.error('设置系统默认模型失败:', error);
      throw error;
    } finally {
      setIsSettingsSaving(false);
    }
  }, [isAuthenticated]);

  useEffect(() => {
    if (!isAuthenticated) {
      settingsLoadedRef.current = false;
      setAISettings(DEFAULT_AI_SETTINGS);
      return;
    }

    void fetchAISettings(true);
  }, [fetchAISettings, isAuthenticated]);

  const setPageContext = useCallback((context) => {
    setChatContextState(normalizeContext(context));
  }, []);

  const clearPageContext = useCallback((page) => {
    setChatContextState((prev) => (
      !page || prev.page === page ? DEFAULT_CONTEXT : prev
    ));
  }, []);

  const loadChatSession = useCallback((sessionId) => {
    if (!sessionId) {
      return null;
    }

    const currentHistory = chatHistoryRef.current;
    const session = currentHistory.sessions.find((item) => item.id === sessionId);
    if (!session) {
      return null;
    }

    const finalContext = normalizeContext(session.context || chatContext);
    setChatContextState(finalContext);

    const nextMessages = Array.isArray(session.messages) && session.messages.length > 0
      ? session.messages
      : [buildGreeting(finalContext)];
    const nextHistory = {
      ...currentHistory,
      activeSessionId: session.id,
    };

    chatHistoryRef.current = nextHistory;
    setChatHistory(nextHistory);
    messagesRef.current = nextMessages;
    setMessages(nextMessages);

    if (isAuthenticated && userKey) {
      persistChatHistoryBundle(userKey, nextHistory);
    }

    return session;
  }, [chatContext, isAuthenticated, userKey]);

  const startNewConversation = useCallback((nextContext) => {
    const finalContext = normalizeContext(nextContext || chatContext);
    if (nextContext) {
      setChatContextState(finalContext);
    }

    const nextMessages = [buildGreeting(finalContext)];
    const currentHistory = chatHistoryRef.current;
    const canReuseCurrentSession = Boolean(currentHistory.activeSessionId) && !hasUserMessage(messagesRef.current);

    let nextHistory;
    if (canReuseCurrentSession) {
      nextHistory = {
        activeSessionId: currentHistory.activeSessionId,
        sessions: upsertChatSession(currentHistory.sessions, currentHistory.activeSessionId, {
          messages: nextMessages,
          context: finalContext,
        }),
      };
    } else {
      const freshSession = normalizeChatSession({
        id: createChatSessionId(),
        context: finalContext,
        messages: nextMessages,
      }, finalContext);
      nextHistory = {
        activeSessionId: freshSession.id,
        sessions: [freshSession, ...(currentHistory.sessions || [])],
      };
    }

    chatHistoryRef.current = nextHistory;
    setChatHistory(nextHistory);
    messagesRef.current = nextMessages;
    setMessages(nextMessages);

    if (isAuthenticated && userKey) {
      persistChatHistoryBundle(userKey, nextHistory);
    }

    return nextMessages;
  }, [chatContext, isAuthenticated, userKey]);

  const updateChatSessionTitle = useCallback((sessionId, title) => {
    const normalizedTitle = truncateText(title, 60) || '新聊天';
    const currentHistory = chatHistoryRef.current;
    const nextHistory = {
      ...currentHistory,
      sessions: currentHistory.sessions.map((session) => (
        session.id === sessionId
          ? {
              ...session,
              title: normalizedTitle,
              titleEdited: true,
            }
          : session
      )),
    };

    chatHistoryRef.current = nextHistory;
    setChatHistory(nextHistory);

    if (isAuthenticated && userKey) {
      persistChatHistoryBundle(userKey, nextHistory);
    }

    return nextHistory.sessions.find((session) => session.id === sessionId) || null;
  }, [isAuthenticated, userKey]);

  const toggleChatSessionFavorite = useCallback((sessionId, nextFavorite) => {
    const currentHistory = chatHistoryRef.current;
    let updatedSession = null;
    const nextHistory = {
      ...currentHistory,
      sessions: currentHistory.sessions.map((session) => {
        if (session.id !== sessionId) {
          return session;
        }

        updatedSession = {
          ...session,
          favorite: typeof nextFavorite === 'boolean' ? nextFavorite : !session.favorite,
        };
        return updatedSession;
      }),
    };

    chatHistoryRef.current = nextHistory;
    setChatHistory(nextHistory);

    if (isAuthenticated && userKey) {
      persistChatHistoryBundle(userKey, nextHistory);
    }

    return updatedSession;
  }, [isAuthenticated, userKey]);

  const deleteChatSession = useCallback((sessionId) => {
    const currentHistory = chatHistoryRef.current;
    const remainingSessions = currentHistory.sessions.filter((session) => session.id !== sessionId);
    if (remainingSessions.length === currentHistory.sessions.length) {
      return false;
    }

    let nextSessions = remainingSessions;
    let nextActiveSessionId = currentHistory.activeSessionId;
    let nextContext = chatContextRef.current;
    let nextMessages = messagesRef.current;

    if (currentHistory.activeSessionId === sessionId) {
      if (nextSessions.length > 0) {
        const nextActiveSession = nextSessions[0];
        nextActiveSessionId = nextActiveSession.id;
        nextContext = normalizeContext(nextActiveSession.context || chatContextRef.current);
        nextMessages = Array.isArray(nextActiveSession.messages) && nextActiveSession.messages.length > 0
          ? nextActiveSession.messages
          : [buildGreeting(nextContext)];
      } else {
        const fallbackSession = normalizeChatSession({
          id: createChatSessionId(),
          context: chatContextRef.current,
          messages: [buildGreeting(chatContextRef.current)],
        }, chatContextRef.current);
        nextSessions = [fallbackSession];
        nextActiveSessionId = fallbackSession.id;
        nextContext = fallbackSession.context;
        nextMessages = fallbackSession.messages;
      }
    }

    const nextHistory = {
      activeSessionId: nextActiveSessionId,
      sessions: nextSessions,
    };

    chatHistoryRef.current = nextHistory;
    setChatHistory(nextHistory);

    if (currentHistory.activeSessionId === sessionId) {
      setChatContextState(nextContext);
      messagesRef.current = nextMessages;
      setMessages(nextMessages);
    }

    if (isAuthenticated && userKey) {
      persistChatHistoryBundle(userKey, nextHistory);
    }

    return true;
  }, [isAuthenticated, userKey]);

  const resetConversation = useCallback((nextContext) => {
    return startNewConversation(nextContext);
  }, [startNewConversation]);

  const openDrawer = useCallback(() => {
    if (!isOpen) {
      startNewConversation(chatContextRef.current);
    }
    setIsOpen(true);
    void fetchAISettings();
  }, [fetchAISettings, isOpen, startNewConversation]);
  const closeDrawer = useCallback(() => setIsOpen(false), []);

  const saveAISettings = useCallback(async (settings, configId = null) => {
    if (!isAuthenticated) {
      return null;
    }

    setIsSettingsSaving(true);
    try {
      const payload = {
        provider: settings?.provider?.trim() || 'custom',
        baseUrl: settings?.baseUrl?.trim() || '',
        model: settings?.model?.trim() || '',
        modelDisplayName: settings?.modelDisplayName?.trim() || '',
        apiKey: settings?.apiKey?.trim() || '',
      };
      
      const currentLocal = getLocalAISettings() || { configs: [], activeConfigId: null };
      const configs = [...(currentLocal.configs || [])];
      
      let nextActiveConfigId = currentLocal.activeConfigId;
      
      if (configId) {
        // Update existing config
        const index = configs.findIndex(cfg => cfg.id === configId);
        if (index >= 0) {
          const oldConfig = configs[index];
          configs[index] = {
            ...oldConfig,
            provider: payload.provider,
            baseUrl: payload.baseUrl,
            model: payload.model,
            modelDisplayName: payload.modelDisplayName,
            // Keep old api key if new one is empty (placeholder/no change)
            apiKey: payload.apiKey ? payload.apiKey : oldConfig.apiKey,
          };
        }
      } else {
        // Add new config
        const newId = `config_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
        configs.push({
          id: newId,
          provider: payload.provider,
          baseUrl: payload.baseUrl,
          model: payload.model,
          modelDisplayName: payload.modelDisplayName,
          apiKey: payload.apiKey,
        });
        // Set new config as active
        nextActiveConfigId = newId;
      }
      
      const newLocal = {
        configs,
        activeConfigId: nextActiveConfigId,
      };
      
      localStorage.setItem(LOCAL_SETTINGS_KEY, JSON.stringify(newLocal));
      
      const nextSettings = await fetchAISettings(true);
      // Auto select the new or updated config
      if (!configId && nextActiveConfigId) {
        selectModel(nextActiveConfigId);
      }
      return nextSettings;
    } catch (error) {
      console.error('保存 AI 设置失败:', error);
      return null;
    } finally {
      setIsSettingsSaving(false);
    }
  }, [isAuthenticated, fetchAISettings, selectModel]);

  const deleteAISettings = useCallback(async (configId) => {
    if (!isAuthenticated || !configId) {
      return null;
    }

    setIsSettingsSaving(true);
    try {
      const currentLocal = getLocalAISettings() || { configs: [], activeConfigId: null };
      const configs = (currentLocal.configs || []).filter(cfg => cfg.id !== configId);
      
      let nextActiveConfigId = currentLocal.activeConfigId;
      if (nextActiveConfigId === configId) {
        nextActiveConfigId = configs[0]?.id || null;
      }
      
      const newLocal = {
        configs,
        activeConfigId: nextActiveConfigId,
      };
      
      localStorage.setItem(LOCAL_SETTINGS_KEY, JSON.stringify(newLocal));
      const nextSettings = await fetchAISettings(true);
      
      // Update selectedModel
      setAISettings((prev) => {
        let nextSelected = prev.selectedModel;
        if (prev.selectedModel === configId) {
          nextSelected = nextActiveConfigId || prev.availableModels[0] || '';
        }
        const next = {
          ...prev,
          selectedModel: nextSelected,
        };
        aiSettingsRef.current = next;
        return next;
      });
      
      return nextSettings;
    } catch (error) {
      console.error('删除 AI 配置失败:', error);
      return null;
    } finally {
      setIsSettingsSaving(false);
    }
  }, [isAuthenticated, fetchAISettings]);

  const resetAISettings = useCallback(async () => {
    if (!isAuthenticated) {
      return null;
    }

    setIsSettingsSaving(true);
    try {
      localStorage.removeItem(LOCAL_SETTINGS_KEY);
      setLocalThinkingEnabled(null);
      return await fetchAISettings(true);
    } catch (error) {
      console.error('恢复 AI 默认配置失败:', error);
      return null;
    } finally {
      setIsSettingsSaving(false);
    }
  }, [isAuthenticated, fetchAISettings]);


  const setThinkingEnabled = useCallback((enabled) => {
    const nextValue = Boolean(enabled);
    setLocalThinkingEnabled(nextValue);
    setAISettings((prev) => {
      const next = {
        ...prev,
        thinkingEnabled: nextValue,
      };
      aiSettingsRef.current = next;
      return next;
    });
  }, []);

  const setWebSearchEnabled = useCallback((enabled) => {
    const nextValue = Boolean(enabled);
    setLocalWebSearchEnabled(nextValue);
    setAISettings((prev) => {
      const next = {
        ...prev,
        webSearchEnabled: nextValue,
      };
      aiSettingsRef.current = next;
      return next;
    });
  }, []);

  const setWebSearchFreshness = useCallback((freshness) => {
    const nextValue = normalizeWebSearchFreshness(freshness);
    setLocalWebSearchFreshness(nextValue);
    setAISettings((prev) => {
      const next = {
        ...prev,
        webSearchFreshness: nextValue,
      };
      aiSettingsRef.current = next;
      return next;
    });
  }, []);

  const testAISettings = useCallback(async (settings = {}) => {
    if (!isAuthenticated) {
      return null;
    }

    try {
      const payload = {};
      const nextProvider = settings.provider?.trim() || 'custom';
      const nextBaseUrl = settings.baseUrl?.trim() || '';
      const nextModel = settings.model?.trim() || '';
      const nextModelDisplayName = settings.modelDisplayName?.trim() || '';
      const nextApiKey = settings.apiKey?.trim() || '';

      if (nextProvider !== 'custom') {
        payload.provider = nextProvider;
      }

      if (nextBaseUrl) {
        payload.base_url = nextBaseUrl;
      }
      if (nextModel) {
        payload.model = nextModel;
      }
      if (nextModelDisplayName) {
        payload.model_display_name = nextModelDisplayName;
      }
      if (nextApiKey) {
        payload.api_key = nextApiKey;
      }

      const response = await apiClient.post('/api/ai/settings/test', payload);
      return response.data;
    } catch (error) {
      console.error('测试 AI 设置失败:', error);
      return {
        success: false,
        message: error?.response?.data?.detail || '连接测试失败，请检查配置后重试',
        active_source: settings.apiKey?.trim() ? 'custom' : aiSettingsRef.current.activeSource,
      };
    }
  }, [isAuthenticated]);

  const sendMessage = useCallback(async (content, options = {}) => {
    const trimmed = content.trim();
    if (!trimmed || isSending) {
      return null;
    }

    const currentSettings = aiSettingsRef.current;
    const activeContext = normalizeContext(options.context || chatContext);
    if (options.context) {
      setChatContextState(activeContext);
    }

    let currentMessages = messagesRef.current;
    const shouldOpenDrawer = options.openDrawer !== false;
    if (shouldOpenDrawer && !isOpen) {
      currentMessages = startNewConversation(activeContext);
    }

    if (options.openDrawer !== false) {
      setIsOpen(true);
    }

    const activeContextScopeKey = buildContextScopeKey(activeContext);
    const contextMessageMeta = {
      contextPage: activeContext.page || 'general',
      contextScopeKey: activeContextScopeKey,
    };
    const userMessage = createMessage('user', trimmed, contextMessageMeta);
    const assistantMessage = createMessage('assistant', '', {
      sendable: false,
      reasoning: '',
      reasoningComplete: false,
      streaming: true,
      responseStarted: !currentSettings.webSearchEnabled,
      streamError: '',
      error: false,
      webSearch: currentSettings.webSearchEnabled ? {
        status: 'intent_pending',
        query: trimmed,
        count: 0,
        sources: [],
        message: '',
        freshness: normalizeWebSearchFreshness(currentSettings.webSearchFreshness),
        intent: {
          originalQuery: trimmed,
          rewrittenQuery: '',
          shouldSearch: null,
          forced: false,
          reason: '',
          pending: true,
        },
      } : undefined,
      ...contextMessageMeta,
    });
    const nextDisplayMessages = [...currentMessages, userMessage, assistantMessage];
    messagesRef.current = nextDisplayMessages;
    setMessages(nextDisplayMessages);
    setIsSending(true);
    const streamAbortController = new AbortController();
    activeStreamAbortRef.current = streamAbortController;

    // --- Batched delta updates via requestAnimationFrame ---
    // Instead of calling setMessages on every single token (which causes
    // a full React re-render each time), we accumulate pending patches
    // and flush them once per animation frame (~16ms / 60fps).
    const pendingPatchesRef = { current: [] };
    const rafIdRef = { current: null };

    const flushPatches = () => {
      rafIdRef.current = null;
      const patches = pendingPatchesRef.current;
      if (patches.length === 0) return;
      pendingPatchesRef.current = [];

      setMessages((prev) => {
        const next = prev.map((message) => {
          if (message.id !== assistantMessage.id) {
            return message;
          }

          let merged = message;
          for (const updater of patches) {
            const patch = typeof updater === 'function' ? updater(merged) : updater;
            merged = { ...merged, ...patch };
          }
          return merged;
        });
        messagesRef.current = next;
        return next;
      });
    };

    const patchAssistantMessage = (updater) => {
      pendingPatchesRef.current.push(updater);
      if (rafIdRef.current === null) {
        rafIdRef.current = requestAnimationFrame(flushPatches);
      }
    };

    // For non-streaming final updates (done/error), flush immediately.
    const patchAssistantMessageSync = (updater) => {
      // Cancel any pending RAF and flush everything together.
      if (rafIdRef.current !== null) {
        cancelAnimationFrame(rafIdRef.current);
        rafIdRef.current = null;
      }
      pendingPatchesRef.current.push(updater);
      flushPatches();
    };

    try {
      const selectedModel = currentSettings.selectedModel;
      const matchingCustomConfig = currentSettings.customConfigs?.find(cfg => cfg.id === selectedModel);
      const useCustomConfig = Boolean(matchingCustomConfig);
      const requestSourceMessages = shouldLimitHistoryToContext(activeContext)
        ? nextDisplayMessages.filter((message) => (
            message.sendable !== false
            && message.contextScopeKey === activeContextScopeKey
          ))
        : nextDisplayMessages.filter((message) => message.sendable !== false);
      
      const payload = {
        messages: requestSourceMessages
          .map(({ role, content: messageContent }) => ({ role, content: messageContent })),
        context: activeContext,
        model: useCustomConfig ? matchingCustomConfig.model : (selectedModel || undefined),
        enable_thinking: currentSettings.thinkingEnabled,
        enable_web_search: currentSettings.webSearchEnabled,
        web_search_freshness: currentSettings.webSearchEnabled
          ? normalizeWebSearchFreshness(currentSettings.webSearchFreshness)
          : undefined,
        custom_config: useCustomConfig ? {
          provider: matchingCustomConfig.provider || 'custom',
          base_url: matchingCustomConfig.baseUrl || undefined,
          api_key: (getLocalAISettings()?.configs || []).find(cfg => cfg.id === matchingCustomConfig.id)?.apiKey || undefined,
          model: matchingCustomConfig.model || undefined,
        } : undefined,
      };

      const response = await fetch(buildApiUrl('/api/ai/chat/stream'), {
        method: 'POST',
        headers: buildStreamRequestHeaders(),
        signal: streamAbortController.signal,
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        if (response.status === 401) {
          localStorage.removeItem('access_token');
          localStorage.removeItem('user');
          window.location.href = '/login';
          return null;
        }
        throw new Error(await parseErrorResponse(response));
      }

      let didFinish = false;

      await readNDJSONStream(response, (event) => {
        if (event.type === 'start') {
          setAISettings((prev) => ({
            ...prev,
            activeModel: event.model || prev.activeModel,
            activeModelDisplayName: event.model_display_name || prev.activeModelDisplayName,
            activeSource: event.active_source || prev.activeSource,
            systemModelKey: event.system_model_key || prev.systemModelKey,
            canUseAI: true,
            selectedModel: prev.selectedModel || event.system_model_key || event.model || prev.activeModel,
          }));
          return;
        }

        if (event.type === 'reasoning_delta') {
          patchAssistantMessage((message) => ({
            reasoning: `${message.reasoning || ''}${event.delta || ''}`,
            reasoningComplete: false,
            responseStarted: true,
          }));
          return;
        }

        if (event.type === 'web_search_intent') {
          patchAssistantMessageSync({
            webSearch: {
              status: event.should_search ? 'planned' : 'skipped',
              query: event.rewritten_query || event.query || trimmed,
              count: 0,
              sources: [],
              message: '',
              freshness: event.freshness || '',
              intent: {
                originalQuery: event.query || trimmed,
                rewrittenQuery: event.rewritten_query || '',
                shouldSearch: Boolean(event.should_search),
                forced: Boolean(event.forced),
                reason: event.reason || '',
                pending: false,
              },
            },
          });
          return;
        }

        if (event.type === 'web_search_start') {
          patchAssistantMessageSync((message) => ({
            webSearch: {
              ...(message.webSearch || {}),
              status: 'searching',
              query: event.query || message.webSearch?.query || trimmed,
              count: 0,
              sources: [],
              message: '',
            },
          }));
          return;
        }

        if (event.type === 'web_search_done') {
          patchAssistantMessageSync((message) => ({
            webSearch: {
              ...(message.webSearch || {}),
              status: 'done',
              query: event.query || message.webSearch?.query || trimmed,
              count: Number(event.count || 0),
              sources: Array.isArray(event.sources) ? event.sources : [],
              message: '',
            },
          }));
          return;
        }

        if (event.type === 'web_search_error') {
          patchAssistantMessageSync((message) => ({
            webSearch: {
              ...(message.webSearch || {}),
              status: 'error',
              query: event.query || message.webSearch?.query || trimmed,
              count: 0,
              sources: [],
              message: event.message || '联网搜索失败',
            },
          }));
          return;
        }

        if (event.type === 'content_delta') {
          patchAssistantMessage((message) => ({
            content: `${message.content || ''}${event.delta || ''}`,
            responseStarted: true,
          }));
          return;
        }

        if (event.type === 'done') {
          didFinish = true;
          patchAssistantMessageSync({
            content: event.answer || '',
            reasoning: event.reasoning || '',
            reasoningComplete: true,
            streaming: false,
            responseStarted: true,
            sendable: true,
            error: false,
            streamError: '',
          });
          setAISettings((prev) => ({
            ...prev,
            activeModel: event.model || prev.activeModel,
            activeModelDisplayName: event.model_display_name || prev.activeModelDisplayName,
            activeSource: event.active_source || prev.activeSource,
            systemModelKey: event.system_model_key || prev.systemModelKey,
            canUseAI: true,
            selectedModel: prev.selectedModel || event.system_model_key || event.model || prev.activeModel,
          }));
          return;
        }

        if (event.type === 'error') {
          didFinish = true;
          patchAssistantMessageSync((message) => {
            const hasOutput = Boolean(message.content || message.reasoning);
            return {
              content: hasOutput ? message.content : (event.message || 'Berry 暂时没能回复成功，请稍后再试。'),
              reasoning: message.reasoning || '',
              reasoningComplete: true,
              streaming: false,
              responseStarted: true,
              sendable: false,
              error: true,
              streamError: hasOutput ? (event.message || 'Berry 暂时没能回复成功，请稍后再试。') : '',
            };
          });
        }
      });

      if (!didFinish) {
        patchAssistantMessageSync((message) => ({
          streaming: false,
          reasoningComplete: Boolean(message.reasoning),
          sendable: Boolean(message.content),
        }));
      }

      const finalAssistantMessage = messagesRef.current.find((message) => message.id === assistantMessage.id);
      return finalAssistantMessage;
    } catch (error) {
      if (streamAbortController.signal.aborted) {
        patchAssistantMessageSync((message) => {
          const hasOutput = Boolean(message.content || message.reasoning);
          return {
            content: hasOutput ? message.content : '已停止生成',
            reasoning: message.reasoning || '',
            reasoningComplete: Boolean(message.reasoning),
            streaming: false,
            responseStarted: true,
            sendable: Boolean(message.content),
            error: false,
            streamError: '',
          };
        });
        return null;
      }

      const fallbackText = error?.message || error?.response?.data?.detail || 'Berry 暂时没能回复成功，请稍后再试。';
      patchAssistantMessageSync((message) => {
        const hasOutput = Boolean(message.content || message.reasoning);
        return {
          content: hasOutput ? message.content : fallbackText,
          reasoning: message.reasoning || '',
          reasoningComplete: Boolean(message.reasoning),
          streaming: false,
          responseStarted: true,
          sendable: false,
          error: true,
          streamError: hasOutput ? fallbackText : '',
        };
      });
      return null;
    } finally {
      if (rafIdRef.current !== null) {
        cancelAnimationFrame(rafIdRef.current);
        rafIdRef.current = null;
      }
      if (activeStreamAbortRef.current === streamAbortController) {
        activeStreamAbortRef.current = null;
      }
      setIsSending(false);
    }
  }, [chatContext, isOpen, isSending, startNewConversation]);

  const stopGeneration = useCallback(() => {
    activeStreamAbortRef.current?.abort();
  }, []);

  const openWithPrompt = useCallback((prompt, options = {}) => (
    sendMessage(prompt, { ...options, openDrawer: true })
  ), [sendMessage]);

  const value = useMemo(() => ({
    isOpen,
    openDrawer,
    closeDrawer,
    chatContext,
    chatSessions,
    activeChatSessionId,
    setPageContext,
    clearPageContext,
    messages,
    aiSettings,
    isSettingsLoading,
    isSettingsSaving,
    fetchAISettings,
    saveAISettings,
    deleteAISettings,
    resetAISettings,
    testAISettings,
    isSending,
    sendMessage,
    stopGeneration,
    selectModel,
    setSystemDefaultModel,
    openWithPrompt,
    loadChatSession,
    startNewConversation,
    updateChatSessionTitle,
    toggleChatSessionFavorite,
    deleteChatSession,
    resetConversation,
    setThinkingEnabled,
    setWebSearchEnabled,
    setWebSearchFreshness,
  }), [
    isOpen,
    openDrawer,
    closeDrawer,
    chatContext,
    chatSessions,
    activeChatSessionId,
    setPageContext,
    clearPageContext,
    messages,
    aiSettings,
    isSettingsLoading,
    isSettingsSaving,
    fetchAISettings,
    saveAISettings,
    deleteAISettings,
    resetAISettings,
    testAISettings,
    isSending,
    sendMessage,
    stopGeneration,
    selectModel,
    setSystemDefaultModel,
    openWithPrompt,
    loadChatSession,
    startNewConversation,
    updateChatSessionTitle,
    toggleChatSessionFavorite,
    deleteChatSession,
    resetConversation,
    setThinkingEnabled,
    setWebSearchEnabled,
    setWebSearchFreshness,
  ]);

  return <AIChatContext.Provider value={value}>{children}</AIChatContext.Provider>;
};

export const useAIChat = () => {
  const context = useContext(AIChatContext);
  if (!context) {
    throw new Error('useAIChat必须在AIChatProvider内部使用');
  }
  return context;
};

export default AIChatContext;
