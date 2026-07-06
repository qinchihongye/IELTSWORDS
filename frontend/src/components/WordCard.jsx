/**
 * 单词闪卡组件 (3D Flip + 音标 + 记忆提示 + 手势)
 */

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Card, Typography, Button, Tag, message, Grid } from 'antd';
import { SoundOutlined, SyncOutlined, BookOutlined, ReadOutlined, CloseCircleOutlined, ClockCircleOutlined, CheckCircleOutlined, LeftOutlined, RightOutlined, PartitionOutlined, BranchesOutlined, LinkOutlined } from '@ant-design/icons';
import { motion, AnimatePresence, useMotionValue, useSpring, useMotionTemplate } from 'framer-motion';
import { useLearning } from '../context/LearningContext';

const { Title, Text, Paragraph } = Typography;

const WordCardContent = ({ word, learningStatus, onSwipeLeft, onSwipeRight, onStatusChange }) => {
  const [showAnswer, setShowAnswer] = useState(false);
  const [statusLoading, setStatusLoading] = useState(false);
  const [hoveredStatus, setHoveredStatus] = useState(null);
  const [isCardHovered, setIsCardHovered] = useState(false);
  const screens = Grid.useBreakpoint();
  const isMobile = !screens.md;
  const { lensRadius } = useLearning();
  const touchStartRef = useRef(null);
  const cardRef = useRef(null);
  const frontCardRef = useRef(null);

  // X-Ray Lens Animation Values
  const mouseX = useMotionValue(0);
  const mouseY = useMotionValue(0);
  const maskRadius = useMotionValue(0);
  
  const springX = useSpring(mouseX, { stiffness: 500, damping: 28 });
  const springY = useSpring(mouseY, { stiffness: 500, damping: 28 });
  const springRadius = useSpring(maskRadius, { stiffness: 400, damping: 25 });
  
  const clipPath = useMotionTemplate`circle(${springRadius}px at ${springX}px ${springY}px)`;

  const handleMouseMove = useCallback((e) => {
    if (!frontCardRef.current) return;
    const rect = frontCardRef.current.getBoundingClientRect();
    mouseX.set(e.clientX - rect.left);
    mouseY.set(e.clientY - rect.top);
  }, [mouseX, mouseY]);

  useEffect(() => {
    if (isCardHovered) {
      maskRadius.set(lensRadius);
    }
  }, [lensRadius, isCardHovered, maskRadius]);

  const handleMouseEnter = useCallback(() => {
    setIsCardHovered(true);
    maskRadius.set(lensRadius); // 恢复之前的动态光圈大小
  }, [maskRadius, lensRadius]);

  const handleMouseLeave = useCallback(() => {
    setIsCardHovered(false);
    maskRadius.set(0);
  }, [maskRadius]);

  const flipAnimation = {
    initial: (isFront) => ({
      rotateY: isFront ? -90 : 90,
      opacity: 0,
      scale: 0.95
    }),
    animate: {
      rotateY: 0,
      opacity: 1,
      scale: 1,
      transition: { type: 'spring', stiffness: 220, damping: 25 }
    },
    exit: (isFront) => ({
      rotateY: isFront ? 90 : -90,
      opacity: 0,
      scale: 0.95,
      transition: { duration: 0.15 }
    })
  };

  // 播放发音
  const playAudio = useCallback((e, lang) => {
    if (e) e.stopPropagation();
    try {
      window.speechSynthesis.cancel();
      const utterance = new SpeechSynthesisUtterance(word.word);
      utterance.lang = lang;
      utterance.rate = 0.9;
      
      const voices = window.speechSynthesis.getVoices();
      if (voices.length > 0) {
        let targetVoice = voices.find(v => v.lang === lang || v.lang === lang.replace('-', '_'));
        if (!targetVoice) targetVoice = voices.find(v => v.lang.startsWith(lang.split('-')[0]));
        if (targetVoice) utterance.voice = targetVoice;
      }

      window.speechSynthesis.speak(utterance);
    } catch {
      message.warning('语音播报不可用');
    }
  }, [word?.word]);


  // 学习状态标记
  const handleStatusChange = useCallback(async (e, status, quality) => {
    if (e) e.stopPropagation();
    if (statusLoading || !onStatusChange) return;
    setStatusLoading(true);
    await onStatusChange(status, quality);
    setStatusLoading(false);
  }, [statusLoading, onStatusChange]);

  // 键盘快捷键
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (document.activeElement?.tagName === 'INPUT' || document.activeElement?.tagName === 'TEXTAREA') return;
      if (e.code === 'Space') { e.preventDefault(); setShowAnswer(prev => !prev); }
      if (e.code === 'ArrowLeft' && onSwipeRight) onSwipeRight();
      if (e.code === 'ArrowRight' && onSwipeLeft) onSwipeLeft();
      if (e.key === '1') handleStatusChange(null, 'learning', 0);
      if (e.key === '2') handleStatusChange(null, 'learning', 3);
      if (e.key === '3') handleStatusChange(null, 'learning', 4);
      if (e.key === '4') handleStatusChange(null, 'mastered', 5);
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onSwipeLeft, onSwipeRight, handleStatusChange]);

  // 触摸手势
  const handleTouchStart = useCallback((e) => {
    touchStartRef.current = { x: e.touches[0].clientX, y: e.touches[0].clientY };
  }, []);

  const handleTouchEnd = useCallback((e) => {
    if (!touchStartRef.current) return;
    const dx = e.changedTouches[0].clientX - touchStartRef.current.x;
    const dy = e.changedTouches[0].clientY - touchStartRef.current.y;
    if (Math.abs(dx) > Math.abs(dy) && Math.abs(dx) > 60) {
      if (dx < 0 && onSwipeLeft) onSwipeLeft();
      if (dx > 0 && onSwipeRight) onSwipeRight();
    } else if (Math.abs(dy) < 10 && Math.abs(dx) < 10) {
      setShowAnswer(prev => !prev);
    }
    touchStartRef.current = null;
  }, [onSwipeLeft, onSwipeRight]);

  const statusColors = {
    unlearned: { bg: '#f3f4f6', text: '#6b7280', label: '未掌握' },
    learning: { bg: '#fef3c7', text: '#d97706', label: '有印象' },
    mastered: { bg: '#d1fae5', text: '#059669', label: '已掌握' }
  };

  const hasDetails = Boolean(
    word.roots_affixes || word.derivatives
  );

  return (
    <div
      ref={cardRef}
      style={{ perspective: '1200px', width: '100%', marginBottom: 24, position: 'relative' }}
      onTouchStart={handleTouchStart}
      onTouchEnd={handleTouchEnd}
    >
      {/* Navigation Arrows */}
      {onSwipeRight && (
        <Button
          shape="circle"
          type="text"
          icon={<LeftOutlined style={{ fontSize: '24px', color: '#9ca3af', filter: 'drop-shadow(0 2px 4px rgba(0,0,0,0.05))' }} />}
          onClick={(e) => { e.stopPropagation(); onSwipeRight(); }}
          className="gallery-nav-btn"
          style={{
            position: 'absolute', left: 8, top: '50%', transform: 'translateY(-50%)',
            zIndex: 20, opacity: isCardHovered ? 1 : 0, transition: 'opacity 0.3s, transform 0.2s',
            background: 'transparent', border: 'none', width: 48, height: 48
          }}
        />
      )}
      {onSwipeLeft && (
        <Button
          shape="circle"
          type="text"
          icon={<RightOutlined style={{ fontSize: '24px', color: '#9ca3af', filter: 'drop-shadow(0 2px 4px rgba(0,0,0,0.05))' }} />}
          onClick={(e) => { e.stopPropagation(); onSwipeLeft(); }}
          className="gallery-nav-btn"
          style={{
            position: 'absolute', right: 8, top: '50%', transform: 'translateY(-50%)',
            zIndex: 20, opacity: isCardHovered ? 1 : 0, transition: 'opacity 0.3s, transform 0.2s',
            background: 'transparent', border: 'none', width: 48, height: 48
          }}
        />
      )}

      <AnimatePresence mode="wait" custom={!showAnswer}>
        {!showAnswer ? (
          <motion.div
            key="front"
            custom={true}
            variants={flipAnimation}
            initial="initial"
            animate="animate"
            exit="exit"
            style={{ width: '100%', cursor: 'pointer' }}
            onClick={() => setShowAnswer(true)}
          >
            <div
              className="word-card-face"
              ref={frontCardRef}
              onMouseMove={handleMouseMove}
              onMouseEnter={handleMouseEnter}
              onMouseLeave={handleMouseLeave}
              style={{
                borderRadius: '24px',
                background: '#ffffff',
                boxShadow: '0 20px 60px rgba(0,0,0,0.05)',
                height: '480px',
                position: 'relative',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                padding: '40px',
                overflow: 'hidden'
              }}
            >
              {/* === X-Ray Magic Lens Layer === */}
              <motion.div 
                style={{ 
                  position: 'absolute', inset: 0, zIndex: 10, background: '#111827', 
                  clipPath, pointerEvents: 'none',
                  display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '40px'
                }}
              >
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
                  {/* 占位与正面 h1 完全等高 (92px + 16px margin) 确保音标水平线一致 */}
                  <div style={{ minHeight: '92px', margin: '0 0 16px 0', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <div style={{ fontSize: '28px', color: '#ffffff', fontWeight: 700, textAlign: 'center', lineHeight: 1.5, letterSpacing: '1px', whiteSpace: 'pre-line' }}>
                      {word.explanation}
                    </div>
                  </div>
                  
                  {/* 镜像音标 (反色变白) */}
                  <div style={{ display: 'flex', gap: 32, alignItems: 'center', flexWrap: 'wrap', justifyContent: 'center' }}>
                    {word.phonetics_uk && (
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6, color: '#f3f4f6' }}>
                        <span style={{ fontSize: '12px', fontWeight: 700, letterSpacing: '0.5px' }}>UK</span>
                        <span style={{ fontSize: '16px', fontFamily: 'serif', letterSpacing: '0.5px' }}>/{word.phonetics_uk.replace(/\//g, '')}/</span>
                        <SoundOutlined style={{ fontSize: '13px' }} />
                      </div>
                    )}
                    {word.phonetics_us && (
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6, color: '#f3f4f6' }}>
                        <span style={{ fontSize: '12px', fontWeight: 700, letterSpacing: '0.5px' }}>US</span>
                        <span style={{ fontSize: '16px', fontFamily: 'serif', letterSpacing: '0.5px' }}>/{word.phonetics_us.replace(/\//g, '')}/</span>
                        <SoundOutlined style={{ fontSize: '13px' }} />
                      </div>
                    )}
                  </div>
                </div>

                {/* Mirrored Hint (Translated) */}
                <div style={{ position: 'absolute', bottom: 24, left: 0, right: 0, textAlign: 'center', color: '#9ca3af', fontSize: '12px', fontWeight: 600, letterSpacing: '2px' }}>
                  点击或按空格键翻转
                </div>
              </motion.div>

              {/* Top Left: Index */}
              {word.wordNo && (
                <div style={{ 
                  position: 'absolute', top: 32, left: 32, zIndex: 20,
                  width: 32, height: 32, borderRadius: '50%', border: '1.5px solid rgba(212, 175, 55, 0.6)', 
                  display: 'flex', alignItems: 'center', justifyContent: 'center', 
                  color: 'rgba(212, 175, 55, 0.9)', fontSize: 12, fontWeight: 700, lineHeight: 1 
                }}>
                  {word.wordNo}
                </div>
              )}
              
              {/* Top Right: Status Dots */}
              <div style={{ position: 'absolute', top: 32, right: 32, display: 'flex', gap: 12, alignItems: 'center', zIndex: 20 }}>
                {[
                  { status: 'learning', quality: 0, color: '#f43f5e', title: '忘记' },
                  { status: 'learning', quality: 3, color: '#f59e0b', title: '模糊' },
                  { status: 'learning', quality: 4, color: '#10b981', title: '认识' },
                  { status: 'mastered', quality: 5, color: '#3b82f6', title: '简单' },
                ].map((btn, index) => (
                  <div
                    key={btn.title}
                    onMouseEnter={() => setHoveredStatus(btn.title)}
                    onMouseLeave={() => setHoveredStatus(null)}
                    onClick={(e) => handleStatusChange(e, btn.status, btn.quality)}
                    style={{
                      display: 'flex', alignItems: 'center', gap: hoveredStatus === btn.title ? '6px' : '0px',
                      height: 28, borderRadius: '14px',
                      padding: hoveredStatus === btn.title ? '0 10px 0 6px' : '0 4px',
                      cursor: 'pointer', transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
                      background: hoveredStatus === btn.title ? '#f9fafb' : 'transparent',
                    }}
                    title={`快捷键: ${index + 1}`}
                  >
                    <div style={{ 
                      width: 8, 
                      height: 8, 
                      borderRadius: '50%', 
                      background: `${btn.color}30`,
                      transition: 'all 0.3s',
                    }} />
                    <span style={{ 
                      fontSize: '12px', fontWeight: 600, 
                      maxWidth: hoveredStatus === btn.title ? '60px' : '0px',
                      opacity: hoveredStatus === btn.title ? 1 : 0,
                      transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
                      overflow: 'hidden', whiteSpace: 'nowrap',
                      color: btn.color
                    }}>
                      {btn.title}
                    </span>
                  </div>
                ))}
              </div>

              {/* Center: Word and Phonetics */}
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
                <h1 style={{ 
                  fontSize: 'clamp(32px, 9vw, 76px)', fontWeight: 800, color: '#111827', 
                  margin: '0 0 16px 0', letterSpacing: 'clamp(-1.5px, -0.3vw, -0.5px)', lineHeight: 1.1,
                  textAlign: 'center', wordBreak: 'break-word', width: '100%', padding: '0 12px'
                }}>
                  {word.word}
                </h1>
                
                <div style={{ display: 'flex', gap: 32, alignItems: 'center', flexWrap: 'wrap', justifyContent: 'center' }}>
                  {word.phonetics_uk && (
                    <div onClick={(e) => playAudio(e, 'en-GB')} style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer', color: '#9ca3af', transition: 'color 0.2s' }} onMouseEnter={e => e.currentTarget.style.color='#4b5563'} onMouseLeave={e => e.currentTarget.style.color='#9ca3af'}>
                      <span style={{ fontSize: '12px', fontWeight: 700, letterSpacing: '0.5px' }}>UK</span>
                      <span style={{ fontSize: '16px', fontFamily: 'serif', letterSpacing: '0.5px' }}>/{word.phonetics_uk.replace(/\//g, '')}/</span>
                      <SoundOutlined style={{ fontSize: '13px' }} />
                    </div>
                  )}
                  {word.phonetics_us && (
                    <div onClick={(e) => playAudio(e, 'en-US')} style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer', color: '#9ca3af', transition: 'color 0.2s' }} onMouseEnter={e => e.currentTarget.style.color='#4b5563'} onMouseLeave={e => e.currentTarget.style.color='#9ca3af'}>
                      <span style={{ fontSize: '12px', fontWeight: 700, letterSpacing: '0.5px' }}>US</span>
                      <span style={{ fontSize: '16px', fontFamily: 'serif', letterSpacing: '0.5px' }}>/{word.phonetics_us.replace(/\//g, '')}/</span>
                      <SoundOutlined style={{ fontSize: '13px' }} />
                    </div>
                  )}
                </div>
              </div>

              {/* Bottom: Hint */}
              <div style={{ position: 'absolute', bottom: 24, left: 0, right: 0, textAlign: 'center', color: '#d1d5db', fontSize: '12px', fontWeight: 600, letterSpacing: '2px' }}>
                CLICK OR SPACE TO FLIP
              </div>
            </div>
          </motion.div>
        ) : (
          <motion.div
            key="back"
            custom={false}
            variants={flipAnimation}
            initial="initial"
            animate="animate"
            exit="exit"
            style={{ width: '100%', cursor: 'pointer' }}
            onClick={() => setShowAnswer(false)}
          >
            <div
              className="word-card-face"
              style={{
                borderRadius: '24px',
                background: '#ffffff',
                boxShadow: '0 24px 60px rgba(0,0,0,0.08)',
                height: isMobile ? '100%' : '480px',
                display: 'flex',
                flexDirection: 'column',
                position: 'relative'
              }}
            >
              <div style={{ 
                padding: isMobile ? '8px 6px 12px' : 'clamp(20px, 4vw, 32px) clamp(16px, 4vw, 40px)', 
                overflowY: 'auto', 
                flex: 1, 
                minHeight: 0 
              }} className="custom-scroll">
                
                {/* 顶部：视觉锚点 + 状态切换区 */}
                <div style={{ 
                  display: 'flex', 
                  flexDirection: 'row',
                  justifyContent: 'space-between', 
                  alignItems: 'center',
                  gap: 12,
                  marginBottom: 24 
                }}>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 4, minWidth: 0 }}>
                    <div style={{ fontSize: 'clamp(20px, 4vw, 24px)', fontWeight: 800, color: '#374151', letterSpacing: '-0.5px', textAlign: 'left', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {word.word}
                    </div>
                  </div>
                  
                  {/* Status Inline */}
                  <div style={{ 
                    display: 'flex', 
                    gap: isMobile ? 12 : 8, 
                    alignItems: 'center', 
                    background: '#f9fafb', 
                    padding: isMobile ? '6px 12px' : '4px 8px', 
                    borderRadius: '999px',
                    flexShrink: 0
                  }} onClick={e => e.stopPropagation()}>
                    {[
                      { status: 'learning', quality: 0, color: '#f43f5e', title: '忘' },
                      { status: 'learning', quality: 3, color: '#f59e0b', title: '糊' },
                      { status: 'learning', quality: 4, color: '#10b981', title: '认' },
                      { status: 'mastered', quality: 5, color: '#3b82f6', title: '简' },
                    ].map((btn, index) => (
                      <div
                        key={btn.title}
                        onClick={(e) => handleStatusChange(e, btn.status, btn.quality)}
                        style={{
                          width: isMobile ? 32 : 24, height: isMobile ? 32 : 24, borderRadius: '50%',
                          display: 'flex', alignItems: 'center', justifyContent: 'center',
                          cursor: 'pointer', transition: 'all 0.2s',
                          background: 'transparent',
                          color: '#9ca3af',
                          fontSize: isMobile ? '13px' : '11px', fontWeight: 600
                        }}
                        onMouseEnter={(e) => { e.currentTarget.style.background = btn.color; e.currentTarget.style.color = '#fff'; }}
                        onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = '#9ca3af'; }}
                        title={`快捷键: ${index + 1}`}
                      >
                        {btn.title}
                      </div>
                    ))}
                  </div>
                </div>

                {/* 辅助信息结构 (Details) */}
                {hasDetails ? (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }} onClick={e => e.stopPropagation()}>
                    
                    {word.roots_affixes && (
                      <div style={{ background: '#eff6ff', borderRadius: '16px', border: '1px solid #bfdbfe', padding: '16px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8, color: '#2563eb' }}>
                          <PartitionOutlined style={{ fontSize: '16px' }} />
                          <span style={{ fontSize: '13px', fontWeight: 700, letterSpacing: '0.5px' }}>ROOTS & AFFIXES</span>
                        </div>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                          {(() => {
                            let parsedLines = [];
                            try {
                              const jsonObj = JSON.parse(word.roots_affixes);
                              if (Array.isArray(jsonObj)) {
                                parsedLines = jsonObj.map(item => ({ root: item.key, meaning: item.value }));
                              }
                            } catch (e) {
                              const lines = word.roots_affixes.split('\n').filter(Boolean);
                              parsedLines = lines.map(line => {
                                const match = line.trim().match(/^(.+?)（(.+?)）$/);
                                if (match) return { root: match[1].trim(), meaning: match[2].trim() };
                                return { raw: line.trim() };
                              });
                            }
                            
                            const maxRootLen = Math.max(...parsedLines.map(p => (p.root || '').length));
                            const rootColWidth = Math.max(80, Math.min(maxRootLen * 11 + 16, 180));

                            return parsedLines.map((item, idx) => {
                              if (!item.root && item.raw) {
                                return <div key={idx} style={{ fontSize: '15px', color: '#1e3a8a', lineHeight: 1.5 }}>{item.raw}</div>;
                              }
                              return (
                                <div key={idx} style={{ 
                                  display: 'flex', alignItems: 'baseline',
                                  background: 'rgba(37, 99, 235, 0.05)',
                                  padding: '7px 12px',
                                  borderRadius: '10px'
                                }}>
                                  <span style={{ 
                                    fontWeight: 700, color: '#1e40af', fontSize: '15px', 
                                    fontFamily: 'serif', letterSpacing: '0.3px',
                                    width: rootColWidth, minWidth: rootColWidth, flexShrink: 0
                                  }}>
                                    {item.root}
                                  </span>
                                  <span style={{ color: '#3b82f6', fontSize: '14px', lineHeight: 1.5 }}>
                                    {item.meaning}
                                  </span>
                                </div>
                              );
                            });
                          })()}
                        </div>
                      </div>
                    )}

                    {word.derivatives && (
                      <div style={{ background: '#f0fdf4', borderRadius: '16px', border: '1px solid #bbf7d0', padding: '16px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8, color: '#16a34a' }}>
                          <BranchesOutlined style={{ fontSize: '16px' }} />
                          <span style={{ fontSize: '13px', fontWeight: 700, letterSpacing: '0.5px' }}>DERIVATIVES</span>
                        </div>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                          {(() => {
                            let parsedLines = [];
                            try {
                              const jsonObj = JSON.parse(word.derivatives);
                              if (Array.isArray(jsonObj)) {
                                parsedLines = jsonObj.map(item => ({ word: item.key, meaning: item.value }));
                              }
                            } catch (e) {
                              const lines = (word.derivatives.includes('\n') 
                                ? word.derivatives.split('\n') 
                                : word.derivatives.split(/[,;]\s*(?=[a-zA-Z-]+\s*\|)/)
                              ).filter(Boolean);
                              
                              parsedLines = lines.map(line => {
                                const parts = line.split('|');
                                if (parts.length < 2) return { raw: line.trim() };
                                return { word: parts[0].trim(), meaning: parts.slice(1).join('|').trim() };
                              });
                            }
                            
                            const maxWordLen = Math.max(...parsedLines.map(p => (p.word || '').length));
                            const wordColWidth = Math.max(100, Math.min(maxWordLen * 10 + 16, 200));

                            return parsedLines.map((item, idx) => {
                              if (!item.word && item.raw) {
                                return <div key={idx} style={{ fontSize: '15px', color: '#14532d', lineHeight: 1.5 }}>{item.raw}</div>;
                              }
                              return (
                                <div key={idx} style={{ 
                                  display: 'flex', alignItems: 'baseline',
                                  background: 'rgba(22, 163, 74, 0.06)',
                                  padding: '7px 12px',
                                  borderRadius: '10px'
                                }}>
                                  <span style={{ 
                                    fontWeight: 700, color: '#166534', fontSize: '15px', 
                                    fontFamily: 'serif', letterSpacing: '0.3px',
                                    width: wordColWidth, minWidth: wordColWidth, flexShrink: 0
                                  }}>
                                    {item.word}
                                  </span>
                                  <span style={{ color: '#15803d', fontSize: '14px', lineHeight: 1.5 }}>
                                    {item.meaning}
                                  </span>
                                </div>
                              );
                            });
                          })()}
                        </div>
                      </div>
                    )}

                  </div>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '180px', color: '#9ca3af' }}>
                    <span style={{ fontSize: '14px', fontWeight: 500 }}>没有更多的词根词源信息了</span>
                  </div>
                )}
                
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

const WordCard = ({ word, learningStatus, onSwipeLeft, onSwipeRight, onStatusChange }) => {
  if (!word) return null;
  return (
    <WordCardContent
      key={word.id || word.word}
      word={word}
      learningStatus={learningStatus}
      onSwipeLeft={onSwipeLeft}
      onSwipeRight={onSwipeRight}
      onStatusChange={onStatusChange}
    />
  );
};

export default WordCard;
