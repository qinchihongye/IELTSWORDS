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
  label: 'AI 助手',
  description: '可以结合你当前页面的内容，随时提问。',
  shortcuts: DEFAULT_SHORTCUTS,
  payload: {},
};

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
  selectedModel: '',
};

const createMessageId = () => `${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;

const createMessage = (role, content, extra = {}) => ({
  id: createMessageId(),
  role,
  content,
  sendable: true,
  ...extra,
});

const LOCAL_SETTINGS_KEY = 'ieltswords_custom_ai_settings';

const getChatHistoryKey = (userId) => `ieltswords_ai_chat_history_${userId || 'guest'}`;

const getLocalAISettings = () => {
  try {
    const data = localStorage.getItem(LOCAL_SETTINGS_KEY);
    return data ? JSON.parse(data) : null;
  } catch {
    return null;
  }
};

const loadMessagesFromStorage = (userId, defaultContext) => {
  if (!userId) return [buildGreeting(defaultContext)];
  try {
    const key = getChatHistoryKey(userId);
    const data = localStorage.getItem(key);
    if (data) {
      const parsed = JSON.parse(data);
      if (Array.isArray(parsed) && parsed.length > 0) {
        return parsed;
      }
    }
  } catch (e) {
    console.error('Failed to load chat history:', e);
  }
  return [buildGreeting(defaultContext)];
};

const saveMessagesToStorage = (userId, messages) => {
  if (!userId || !messages || messages.length === 0) return;
  try {
    const key = getChatHistoryKey(userId);
    localStorage.setItem(key, JSON.stringify(messages));
  } catch (e) {
    console.error('Failed to save chat history:', e);
  }
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

const normalizeAISettings = (data, previousSelectedModel = '') => {
  const localSettings = getLocalAISettings() || {};
  const availableModels = normalizeModelList(data?.available_models);
  
  const customModel = localSettings.model || '';
  const hasApiKey = Boolean(localSettings.apiKey);
  const activeModel = customModel || availableModels[0] || '';
  const defaultModel = availableModels[0] || activeModel;
  
  const selectedModel = (
    previousSelectedModel && (availableModels.includes(previousSelectedModel) || previousSelectedModel === customModel)
      ? previousSelectedModel
      : defaultModel
  );

  return {
    customBaseUrl: localSettings.baseUrl || '',
    customModel,
    customModelDisplayName: localSettings.modelDisplayName || '',
    hasApiKey,
    maskedApiKey: localSettings.apiKey ? '*'.repeat(8) : '',
    usesCustomConfig: hasApiKey,
    systemConfigured: Boolean(data?.system_configured),
    canUseAI: hasApiKey || Boolean(data?.system_configured),
    activeSource: hasApiKey ? 'custom' : 'system',
    activeModel,
    activeModelDisplayName: localSettings.modelDisplayName || activeModel,
    availableModels,
    selectedModel,
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
      return data?.detail || data?.message || 'AI 助手暂时没能回复成功，请稍后再试。';
    }

    const text = await response.text();
    return text || 'AI 助手暂时没能回复成功，请稍后再试。';
  } catch (error) {
    console.error('解析流式响应错误信息失败:', error);
    return 'AI 助手暂时没能回复成功，请稍后再试。';
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

  return createMessage('assistant', '你好，我是你的 IELTS 学习助手。你可以直接问我单词、题目、复习方法，或者让我结合当前页面给建议。', {
    sendable: false,
    kind: 'greeting',
  });
};

export const AIChatProvider = ({ children }) => {
  const { isAuthenticated, user } = useAuth();
  const [isOpen, setIsOpen] = useState(false);
  const [chatContext, setChatContextState] = useState(DEFAULT_CONTEXT);
  const [messages, setMessages] = useState(() => loadMessagesFromStorage(user?.id || user?.username, DEFAULT_CONTEXT));
  const [isSending, setIsSending] = useState(false);
  const [aiSettings, setAISettings] = useState(DEFAULT_AI_SETTINGS);
  const [isSettingsLoading, setIsSettingsLoading] = useState(false);
  const [isSettingsSaving, setIsSettingsSaving] = useState(false);
  const messagesRef = useRef(messages);
  const aiSettingsRef = useRef(aiSettings);
  const settingsLoadedRef = useRef(false);

  useEffect(() => {
    messagesRef.current = messages;
    if (isAuthenticated && (user?.id || user?.username)) {
      saveMessagesToStorage(user?.id || user?.username, messages);
    }
  }, [messages, isAuthenticated, user]);

  useEffect(() => {
    aiSettingsRef.current = aiSettings;
  }, [aiSettings]);

  useEffect(() => {
    if (isAuthenticated && (user?.id || user?.username)) {
      setMessages((prev) => {
        const loaded = loadMessagesFromStorage(user?.id || user?.username, chatContext);
        // If the loaded messages are more robust than just one greeting, use them.
        if (loaded.length > 1 || prev.length <= 1) {
          return loaded;
        }
        return prev;
      });
    } else {
      setMessages([buildGreeting(chatContext)]);
    }
  }, [isAuthenticated, user?.id, user?.username]);

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

  const resetConversation = useCallback((nextContext) => {
    const finalContext = normalizeContext(nextContext || chatContext);
    if (nextContext) {
      setChatContextState(finalContext);
    }

    const nextMessages = [buildGreeting(finalContext)];
    messagesRef.current = nextMessages;
    setMessages(nextMessages);
    
    if (isAuthenticated && (user?.id || user?.username)) {
      saveMessagesToStorage(user?.id || user?.username, nextMessages);
    }
  }, [chatContext, isAuthenticated, user]);

  const openDrawer = useCallback(() => {
    setIsOpen(true);
    void fetchAISettings();
  }, [fetchAISettings]);
  const closeDrawer = useCallback(() => setIsOpen(false), []);

  const saveAISettings = useCallback(async (settings) => {
    if (!isAuthenticated) {
      return null;
    }

    setIsSettingsSaving(true);
    try {
      const payload = {
        baseUrl: settings?.baseUrl?.trim() || '',
        model: settings?.model?.trim() || '',
        modelDisplayName: settings?.modelDisplayName?.trim() || '',
        apiKey: settings?.apiKey?.trim() || '',
      };
      
      const currentLocal = getLocalAISettings() || {};
      const newLocal = {
        ...currentLocal,
        baseUrl: payload.baseUrl || currentLocal.baseUrl,
        model: payload.model || currentLocal.model,
        modelDisplayName: payload.modelDisplayName || currentLocal.modelDisplayName,
        apiKey: payload.apiKey || currentLocal.apiKey,
      };
      
      localStorage.setItem(LOCAL_SETTINGS_KEY, JSON.stringify(newLocal));
      
      // We don't need to patch backend anymore, but we can refetch the available models to rebuild the settings
      return await fetchAISettings(true);
    } catch (error) {
      console.error('保存 AI 设置失败:', error);
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
      return await fetchAISettings(true);
    } catch (error) {
      console.error('恢复 AI 默认配置失败:', error);
      return null;
    } finally {
      setIsSettingsSaving(false);
    }
  }, [isAuthenticated, fetchAISettings]);

  const selectModel = useCallback((model) => {
    const normalizedModel = typeof model === 'string' ? model.trim() : '';
    setAISettings((prev) => {
      if (!normalizedModel || normalizedModel === prev.selectedModel || !prev.availableModels.includes(normalizedModel)) {
        return prev;
      }

      const next = {
        ...prev,
        selectedModel: normalizedModel,
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
      const nextBaseUrl = settings.baseUrl?.trim() || '';
      const nextModel = settings.model?.trim() || '';
      const nextModelDisplayName = settings.modelDisplayName?.trim() || '';
      const nextApiKey = settings.apiKey?.trim() || '';

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

    const activeContext = normalizeContext(options.context || chatContext);
    if (options.context) {
      setChatContextState(activeContext);
    }

    if (options.openDrawer !== false) {
      setIsOpen(true);
    }

    const userMessage = createMessage('user', trimmed);
    const assistantMessage = createMessage('assistant', '', {
      sendable: false,
      reasoning: '',
      reasoningComplete: false,
      streaming: true,
      streamError: '',
      error: false,
    });
    const currentMessages = messagesRef.current;
    const nextDisplayMessages = [...currentMessages, userMessage, assistantMessage];
    messagesRef.current = nextDisplayMessages;
    setMessages(nextDisplayMessages);
    setIsSending(true);

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
      const currentSettings = aiSettingsRef.current;
      const selectedModel = currentSettings.selectedModel;
      const useCustomConfig = currentSettings.customModel && selectedModel === currentSettings.customModel;
      
      const payload = {
        messages: nextDisplayMessages
          .filter((message) => message.sendable !== false)
          .map(({ role, content: messageContent }) => ({ role, content: messageContent })),
        context: activeContext,
        model: selectedModel || undefined,
        custom_config: useCustomConfig ? {
          base_url: currentSettings.customBaseUrl || undefined,
          api_key: getLocalAISettings()?.apiKey || undefined,
          model: currentSettings.customModel || undefined,
        } : undefined,
      };

      const response = await fetch(buildApiUrl('/api/ai/chat/stream'), {
        method: 'POST',
        headers: buildStreamRequestHeaders(),
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
            activeSource: event.active_source || prev.activeSource,
            canUseAI: true,
            selectedModel: prev.selectedModel || event.model || prev.activeModel,
          }));
          return;
        }

        if (event.type === 'reasoning_delta') {
          patchAssistantMessage((message) => ({
            reasoning: `${message.reasoning || ''}${event.delta || ''}`,
            reasoningComplete: false,
          }));
          return;
        }

        if (event.type === 'content_delta') {
          patchAssistantMessage((message) => ({
            content: `${message.content || ''}${event.delta || ''}`,
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
            error: false,
            streamError: '',
          });
          setAISettings((prev) => ({
            ...prev,
            activeModel: event.model || prev.activeModel,
            activeSource: event.active_source || prev.activeSource,
            canUseAI: true,
            selectedModel: prev.selectedModel || event.model || prev.activeModel,
          }));
          return;
        }

        if (event.type === 'error') {
          didFinish = true;
          patchAssistantMessageSync((message) => {
            const hasOutput = Boolean(message.content || message.reasoning);
            return {
              content: hasOutput ? message.content : (event.message || 'AI 助手暂时没能回复成功，请稍后再试。'),
              reasoning: message.reasoning || '',
              reasoningComplete: true,
              streaming: false,
              error: true,
              streamError: hasOutput ? (event.message || 'AI 助手暂时没能回复成功，请稍后再试。') : '',
            };
          });
        }
      });

      if (!didFinish) {
        patchAssistantMessageSync((message) => ({
          streaming: false,
          reasoningComplete: Boolean(message.reasoning),
        }));
      }

      const finalAssistantMessage = messagesRef.current.find((message) => message.id === assistantMessage.id);
      return finalAssistantMessage;
    } catch (error) {
      const fallbackText = error?.message || error?.response?.data?.detail || 'AI 助手暂时没能回复成功，请稍后再试。';
      patchAssistantMessageSync((message) => {
        const hasOutput = Boolean(message.content || message.reasoning);
        return {
          content: hasOutput ? message.content : fallbackText,
          reasoning: message.reasoning || '',
          reasoningComplete: Boolean(message.reasoning),
          streaming: false,
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
      setIsSending(false);
    }
  }, [chatContext, isSending]);

  const openWithPrompt = useCallback((prompt, options = {}) => (
    sendMessage(prompt, { ...options, openDrawer: true })
  ), [sendMessage]);

  const value = useMemo(() => ({
    isOpen,
    openDrawer,
    closeDrawer,
    chatContext,
    setPageContext,
    clearPageContext,
    messages,
    aiSettings,
    isSettingsLoading,
    isSettingsSaving,
    fetchAISettings,
    saveAISettings,
    resetAISettings,
    testAISettings,
    isSending,
    sendMessage,
    selectModel,
    openWithPrompt,
    resetConversation,
  }), [
    isOpen,
    openDrawer,
    closeDrawer,
    chatContext,
    setPageContext,
    clearPageContext,
    messages,
    aiSettings,
    isSettingsLoading,
    isSettingsSaving,
    fetchAISettings,
    saveAISettings,
    resetAISettings,
    testAISettings,
    isSending,
    sendMessage,
    selectModel,
    openWithPrompt,
    resetConversation,
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
