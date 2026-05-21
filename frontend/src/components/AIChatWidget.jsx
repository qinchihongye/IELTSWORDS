import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Button, Drawer, FloatButton, Input, Modal, Select, Space, Typography, message } from 'antd';
import { BulbOutlined, DeleteOutlined, DownOutlined, LinkOutlined, MessageOutlined, ReloadOutlined, RightOutlined, RobotOutlined, SendOutlined, SettingOutlined, ThunderboltFilled } from '@ant-design/icons';
import { useAIChat } from '../context/AIChatContext';
import { useAuth } from '../context/AuthContext';
import AIMarkdownContent from './AIMarkdownContent';
import UserAvatar from './UserAvatar';

const { Text, Title } = Typography;

const MODEL_PROVIDER_ORDER = ['OpenAI', 'DeepSeek', 'Anthropic (Claude)', 'Kimi', 'Other models'];
const AI_DRAWER_WIDTH_KEY = 'ieltswords_ai_drawer_width';
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

const getModelProvider = (model) => {
  const value = String(model || '').toLowerCase();
  if (value.includes('deepseek')) return 'DeepSeek';
  if (value.includes('claude') || value.includes('anthropic')) return 'Anthropic (Claude)';
  if (value.includes('kimi') || value.includes('moonshot')) return 'Kimi';
  if (value.includes('gpt') || value.includes('openai')) return 'OpenAI';
  return 'Other models';
};

const buildModelLabel = (model) => (
  <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
    <ThunderboltFilled style={{ color: '#b590e8', fontSize: 13 }} />
    <span>{model}</span>
  </span>
);

const extractModelDisplayName = (model) => {
  if (!model) return '';
  const parts = String(model).split('/');
  return parts[parts.length - 1];
};

const groupModels = (models, activeModel, activeModelDisplayName) => {
  const groups = new Map();

  models.forEach((model) => {
    const provider = getModelProvider(model);
    if (!groups.has(provider)) {
      groups.set(provider, []);
    }
    const labelText = (model === activeModel && activeModelDisplayName)
      ? activeModelDisplayName
      : extractModelDisplayName(model);
      
    const label = buildModelLabel(labelText);
      
    groups.get(provider).push({
      label,
      value: model,
    });
  });

  return MODEL_PROVIDER_ORDER
    .filter((provider) => groups.has(provider))
    .map((provider) => ({
      label: provider,
      options: groups.get(provider),
    }));
};

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

const AIChatWidget = () => {
  const { user } = useAuth();
  const {
    isOpen,
    openDrawer,
    closeDrawer,
    chatContext,
    messages,
    aiSettings,
    isSettingsSaving,
    isSending,
    sendMessage,
    selectModel,
    saveAISettings,
    resetAISettings,
    testAISettings,
    resetConversation,
  } = useAIChat();
  const [draft, setDraft] = useState('');
  const [isSettingsModalOpen, setIsSettingsModalOpen] = useState(false);
  const [baseUrlDraft, setBaseUrlDraft] = useState('');
  const [modelDraft, setModelDraft] = useState('');
  const [modelDisplayNameDraft, setModelDisplayNameDraft] = useState('');
  const [apiKeyDraft, setApiKeyDraft] = useState('');
  const [isTestingConnection, setIsTestingConnection] = useState(false);
  const [testResult, setTestResult] = useState(null);
  const [expandedReasoningIds, setExpandedReasoningIds] = useState(() => new Set());
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
  const modelCount = (aiSettings.availableModels || []).length + (aiSettings.customModel ? 1 : 0);
  const modelOptions = useMemo(() => {
    const systemModels = (aiSettings.availableModels || []).filter(m => m !== aiSettings.customModel);
    const options = groupModels(
      systemModels,
      aiSettings.activeModel,
      aiSettings.activeModelDisplayName
    );
    
    if (aiSettings.customModel) {
      options.unshift({
        label: '我的自定义模型',
        options: [{
          label: buildModelLabel(aiSettings.customModelDisplayName || aiSettings.customModel),
          value: aiSettings.customModel,
        }],
      });
    }
    return options;
  }, [aiSettings.availableModels, aiSettings.activeModel, aiSettings.activeModelDisplayName, aiSettings.customModel, aiSettings.customModelDisplayName]);
  const selectedModel = aiSettings.selectedModel || aiSettings.activeModel || '';
  const shouldShowModelBox = Boolean(selectedModel) || modelOptions.length > 0;

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

    // Force scroll to bottom when newly opened, or when sending a message
    if (wasJustOpened || isSending) {
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
    const trimmed = draft.trim();
    if (!trimmed) {
      return;
    }

    setDraft('');
    await sendMessage(trimmed);
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

  const openSettingsModal = () => {
    setBaseUrlDraft(aiSettings.customBaseUrl || '');
    setModelDraft(aiSettings.customModel || '');
    setModelDisplayNameDraft(aiSettings.customModelDisplayName || '');
    setApiKeyDraft('');
    setTestResult(null);
    setIsSettingsModalOpen(true);
  };

  const closeSettingsModal = () => {
    setIsSettingsModalOpen(false);
    setTestResult(null);
    setApiKeyDraft('');
  };

  const handleSaveSettings = async () => {
    const nextSettings = await saveAISettings({
      baseUrl: baseUrlDraft,
      model: modelDraft,
      modelDisplayName: modelDisplayNameDraft,
      apiKey: apiKeyDraft,
    });

    if (nextSettings) {
      message.success('AI 配置已保存');
      closeSettingsModal();
    }
  };

  const handleResetSettings = async () => {
    const nextSettings = await resetAISettings();
    if (nextSettings) {
      message.success('已恢复系统默认 AI 配置');
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

    try {
      const result = await testAISettings({
        baseUrl: baseUrlDraft,
        model: modelDraft,
        modelDisplayName: modelDisplayNameDraft,
        apiKey: apiKeyDraft,
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
  const finalPlaceholder = canUseAI ? placeholder : '请先配置系统默认 AI，或在右上角填写自定义配置';

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
          tooltip="AI 助手 (可拖动)"
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
        }
        .ai-assistant-drawer .ant-drawer-header {
          background: transparent !important;
          border-bottom: 1px solid rgba(148, 163, 184, 0.15) !important;
        }
        .ai-assistant-drawer .ant-drawer-body {
          background: transparent !important;
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
              previewTitle="IELTS AI 助手"
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
              IELTS AI 助手
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
          },
        }}
      >
        <div style={{ height: '100%', display: 'flex', flexDirection: 'column', position: 'relative' }}>
          {isDesktop && (
            <button
              type="button"
              aria-label="拖拽调整 AI 助手宽度"
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
                zIndex: 20,
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
              padding: '20px 16px',
              display: 'flex',
              flexDirection: 'column',
              gap: 18,
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
                  previewTitle="IELTS AI 助手"
                  style={{
                    background: 'transparent',
                    marginBottom: 20,
                    boxShadow: 'none',
                    objectFit: 'cover'
                  }}
                />
                <Title level={4} style={{ margin: '0 0 8px 0', color: '#1e293b', fontWeight: 800 }}>
                  IELTS 智能学习助手
                </Title>
                <Text style={{ fontSize: 13, color: '#64748b', maxWidth: 280, marginBottom: 32 }}>
                  你好！我是你的专属 AI 助手，可以为你解答词汇用法、语法搭配，或提供高效的备考建议。
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

                return (
                  <div
                    key={message.id}
                    style={{
                      display: 'flex',
                      flexDirection: 'column',
                      gap: 6,
                      width: '100%',
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
                          previewTitle="IELTS AI 助手"
                          style={{
                            background: 'transparent',
                            border: 'none',
                            boxShadow: 'none',
                            objectFit: 'cover'
                          }}
                        />
                      )}
                      <span style={{ fontSize: '11px', fontWeight: 600, color: '#64748b' }}>
                        {isUser ? (user?.username || '你') : 'IELTS AI 助手'}
                      </span>
                    </div>

                    {/* Message Bubble */}
                    <div
                      style={{
                        maxWidth: '100%',
                        width: isUser ? 'auto' : '100%',
                        borderRadius: '12px',
                        padding: '12px 14px',
                        whiteSpace: 'pre-wrap',
                        lineHeight: 1.7,
                        fontSize: '14px',
                        boxShadow: isUser
                          ? '0 6px 16px rgba(181, 144, 232, 0.08)'
                          : '0 4px 12px rgba(15, 23, 42, 0.02)',
                        ...bubbleStyle(message.role, message.error),
                      }}
                    >
                      {isUser ? (
                        <Text style={{ color: '#ffffff' }}>
                          {message.content}
                        </Text>
                      ) : (
                        <div style={{ display: 'grid', gap: 10 }}>
                          {hasReasoning && (
                            <div
                              style={{
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
                                }}
                              >
                                <span style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, fontWeight: 600 }}>
                                  <ThunderboltFilled style={{ color: '#b590e8', fontSize: 11 }} />
                                  {message.reasoningComplete ? '深度思考过程' : 'AI 正在思考...'}
                                </span>
                                {isReasoningExpanded ? <DownOutlined style={{ fontSize: 10 }} /> : <RightOutlined style={{ fontSize: 10 }} />}
                              </button>
                              {isReasoningExpanded && (
                                <div
                                  style={{
                                    padding: '0 10px 10px',
                                    borderTop: '1px solid rgba(181, 144, 232, 0.08)',
                                  }}
                                >
                                  <AIMarkdownContent content={message.reasoning} tone="subtle" />
                                </div>
                              )}
                            </div>
                          )}

                          {message.content && (
                            <AIMarkdownContent content={message.content} tone="default" />
                          )}

                          {!message.content && message.streaming && (
                            <div style={{ display: 'flex', alignItems: 'center', gap: 6, color: '#b590e8', fontSize: 13, fontWeight: 500 }}>
                              <span className="dot-flashing-loader" style={{ color: '#b590e8' }} />
                              <span>AI 正在思考解答</span>
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
            {shouldShowModelBox && (
              <div style={{ marginBottom: 12, display: 'flex', alignItems: 'center', gap: 10 }}>
                <Select
                  value={selectedModel}
                  options={modelOptions}
                  onChange={selectModel}
                  disabled={isSending || !canUseAI || modelCount <= 1}
                  popupMatchSelectWidth={false}
                  suffixIcon={<DownOutlined style={{ color: '#b590e8', fontSize: 11 }} />}
                  style={{ minWidth: 200, maxWidth: '100%' }}
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
              </div>
            )}
            {shouldShowModelBox && (
              <style>{`
                .ai-chat-model-select .ant-select-selector {
                  min-height: 32px !important;
                  padding: 0 12px !important;
                  border-radius: 12px !important;
                  background: rgba(181, 144, 232, 0.06) !important;
                  border: 1px solid rgba(181, 144, 232, 0.12) !important;
                  box-shadow: none !important;
                }
                .ai-chat-model-select .ant-select-selection-item {
                  display: flex !important;
                  align-items: center !important;
                  gap: 6px !important;
                  font-size: 13px !important;
                  font-weight: 700 !important;
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
                borderTop: '1px solid rgba(241, 245, 249, 0.8)',
                paddingTop: 8
              }}>
                <Text style={{ fontSize: 11, color: '#94a3b8' }}>
                  Enter 发送，Shift + Enter 换行
                </Text>
                <Button
                  type="primary"
                  shape="circle"
                  icon={<SendOutlined style={{ fontSize: 12 }} />}
                  onClick={() => void handleSend()}
                  disabled={!draft.trim() || isSending || isSettingsSaving || !canUseAI}
                  style={{ 
                    background: draft.trim() && !isSending && !isSettingsSaving ? 'linear-gradient(135deg, #d6c1f9 0%, #b590e8 100%)' : '#f1f5f9',
                    border: 'none',
                    color: draft.trim() && !isSending && !isSettingsSaving ? '#ffffff' : '#94a3b8',
                    width: 30,
                    height: 30,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    boxShadow: draft.trim() && !isSending && !isSettingsSaving ? '0 4px 10px rgba(181, 144, 232, 0.2)' : 'none'
                  }}
                />
              </div>
            </div>
          </div>
        </div>
      </Drawer>

      <Modal
        title="AI 配置"
        open={isSettingsModalOpen}
        onCancel={closeSettingsModal}
        onOk={() => void handleSaveSettings()}
        okText="保存配置"
        cancelText="取消"
        confirmLoading={isSettingsSaving}
        destroyOnHidden
      >
        <Space direction="vertical" size={12} style={{ width: '100%' }}>
          <Text style={{ color: '#64748b', lineHeight: 1.7 }}>
            {aiSettings.systemConfigured
              ? '系统默认 AI 已经可以直接使用。你也可以额外配置自己的模型；你的自定义配置和聊天记录将仅保存在当前浏览器本地，保护隐私。'
              : '当前系统默认 AI 未配置。你可以填写自己的配置，自定义配置和聊天记录将仅保存在当前浏览器本地。'}
          </Text>

          <div>
            <Text style={{ display: 'block', marginBottom: 8, fontWeight: 600, color: '#374151' }}>
              Base URL
            </Text>
            <Input
              prefix={<LinkOutlined style={{ color: '#94a3b8' }} />}
              value={baseUrlDraft}
              onChange={(event) => setBaseUrlDraft(event.target.value)}
              placeholder="例如 https://api.openai.com/v1"
              maxLength={300}
            />
          </div>

          <div>
            <Text style={{ display: 'block', marginBottom: 8, fontWeight: 600, color: '#374151' }}>
              模型名称
            </Text>
            <Input
              value={modelDraft}
              onChange={(event) => setModelDraft(event.target.value)}
              placeholder="例如 gpt-4o-mini"
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
              placeholder="例如 深度思考模型"
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
              placeholder={aiSettings.hasApiKey ? '已保存，如需修改请重新输入' : '请输入你的 API Key'}
              maxLength={300}
            />
            {aiSettings.maskedApiKey && (
              <Text style={{ display: 'block', marginTop: 8, fontSize: 12, color: '#94a3b8' }}>
                当前已保存：{aiSettings.maskedApiKey}
              </Text>
            )}
          </div>

          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
            <Button
              icon={<LinkOutlined />}
              onClick={() => void handleTestConnection()}
              loading={isTestingConnection}
              disabled={isSettingsSaving}
            >
              测试当前生效配置
            </Button>
            <Button
              icon={<ReloadOutlined />}
              danger
              onClick={() => void handleResetSettings()}
              loading={isSettingsSaving}
            >
              恢复默认
            </Button>
          </div>

          {testResult && (
            <div
              style={{
                borderRadius: 12,
                padding: '12px 14px',
                background: testResult.success ? 'rgba(240, 253, 244, 0.95)' : 'rgba(254, 242, 242, 0.95)',
                border: `1px solid ${testResult.success ? 'rgba(34, 197, 94, 0.2)' : 'rgba(239, 68, 68, 0.22)'}`,
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
    </>
  );
};

export default AIChatWidget;
