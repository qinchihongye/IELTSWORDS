/**
 * 现代配图画廊组件 (Sidebar Variant)
 */

import React, { useEffect, useState, useRef } from 'react';
import { Card, Image, Modal, Spin, Button, Typography, Slider } from 'antd';
import { LeftOutlined, RightOutlined, PictureOutlined, SearchOutlined, BulbOutlined } from '@ant-design/icons';
import { motion, useMotionValue, useSpring, useMotionTemplate } from 'framer-motion';
import apiClient from '../api/client';
import { useLearning } from '../context/LearningContext';

const { Text } = Typography;
const IMAGE_OBJECT_URL_CACHE_LIMIT = 80;
const IMAGE_PERSISTENT_CACHE_LIMIT = 180;
const IMAGE_CACHE_VERSION = 'v2';
const imageObjectUrlCache = new Map();

const getImageCacheKey = (imageUrl) => {
  const token = localStorage.getItem('access_token') || '';
  return `${token}:${imageUrl}`;
};

const getPersistentCacheName = () => {
  let userKey = '';
  try {
    const user = JSON.parse(localStorage.getItem('user') || 'null');
    userKey = user?.id || user?.uid || user?.username || '';
  } catch {
    userKey = '';
  }

  if (!userKey) {
    userKey = (localStorage.getItem('access_token') || 'anonymous').slice(-16);
  }
  return `ieltswords-image-cache-${IMAGE_CACHE_VERSION}-${userKey}`;
};

const getAbsoluteImageUrl = (imageUrl) => {
  const baseUrl = apiClient.defaults.baseURL || window.location.origin;
  return new URL(imageUrl, baseUrl).href;
};

const getCachedObjectUrl = (imageUrl) => {
  const cacheKey = getImageCacheKey(imageUrl);
  const cachedObjectUrl = imageObjectUrlCache.get(cacheKey);
  if (!cachedObjectUrl) {
    return null;
  }

  imageObjectUrlCache.delete(cacheKey);
  imageObjectUrlCache.set(cacheKey, cachedObjectUrl);
  return cachedObjectUrl;
};

const cacheObjectUrl = (imageUrl, objectUrl) => {
  const cacheKey = getImageCacheKey(imageUrl);
  if (imageObjectUrlCache.has(cacheKey)) {
    return imageObjectUrlCache.get(cacheKey);
  }
  imageObjectUrlCache.set(cacheKey, objectUrl);

  while (imageObjectUrlCache.size > IMAGE_OBJECT_URL_CACHE_LIMIT) {
    const [oldestKey] = imageObjectUrlCache.entries().next().value;
    imageObjectUrlCache.delete(oldestKey);
  }

  return objectUrl;
};

const openImageDatabase = () => new Promise((resolve) => {
  if (!('indexedDB' in window)) {
    resolve(null);
    return;
  }

  const request = indexedDB.open(`ieltswords-image-cache-${IMAGE_CACHE_VERSION}`, 1);
  request.onupgradeneeded = () => {
    const db = request.result;
    if (!db.objectStoreNames.contains('images')) {
      db.createObjectStore('images');
    }
  };
  request.onsuccess = () => resolve(request.result);
  request.onerror = () => resolve(null);
});

const getIndexedDbImageKey = (absoluteUrl) => `${getPersistentCacheName()}:${absoluteUrl}`;

const readIndexedImageBlob = async (absoluteUrl) => {
  const db = await openImageDatabase();
  if (!db) {
    return null;
  }

  return new Promise((resolve) => {
    const transaction = db.transaction('images', 'readonly');
    const request = transaction.objectStore('images').get(getIndexedDbImageKey(absoluteUrl));
    request.onsuccess = () => resolve(request.result || null);
    request.onerror = () => resolve(null);
  });
};

const writeIndexedImageBlob = async (absoluteUrl, blob) => {
  const db = await openImageDatabase();
  if (!db) {
    return;
  }

  await new Promise((resolve) => {
    const transaction = db.transaction('images', 'readwrite');
    transaction.objectStore('images').put(blob, getIndexedDbImageKey(absoluteUrl));
    transaction.oncomplete = resolve;
    transaction.onerror = resolve;
  });
};

const deleteIndexedImageBlob = async (absoluteUrl) => {
  const db = await openImageDatabase();
  if (!db) {
    return;
  }

  await new Promise((resolve) => {
    const transaction = db.transaction('images', 'readwrite');
    transaction.objectStore('images').delete(getIndexedDbImageKey(absoluteUrl));
    transaction.oncomplete = resolve;
    transaction.onerror = resolve;
  });
};

const readPersistentImageBlob = async (imageUrl) => {
  const absoluteUrl = getAbsoluteImageUrl(imageUrl);
  const shouldPreferWebp = imageUrl.startsWith('/api/images/');
  const validateBlob = async (blob) => {
    if (!blob) {
      return null;
    }
    if (shouldPreferWebp && blob.type && blob.type !== 'image/webp') {
      await deleteIndexedImageBlob(absoluteUrl);
      if ('caches' in window) {
        try {
          const cache = await caches.open(getPersistentCacheName());
          await cache.delete(absoluteUrl);
        } catch {
          // Ignore stale cache cleanup failures.
        }
      }
      return null;
    }
    return blob;
  };

  if (!('caches' in window)) {
    return validateBlob(await readIndexedImageBlob(absoluteUrl));
  }

  try {
    const cache = await caches.open(getPersistentCacheName());
    const cachedResponse = await cache.match(absoluteUrl);
    if (!cachedResponse) {
      return validateBlob(await readIndexedImageBlob(absoluteUrl));
    }
    return validateBlob(await cachedResponse.blob());
  } catch {
    return validateBlob(await readIndexedImageBlob(absoluteUrl));
  }
};

const readPersistentCacheIndex = () => {
  try {
    return JSON.parse(localStorage.getItem(`ieltswords_image_cache_index_${IMAGE_CACHE_VERSION}`) || '[]');
  } catch {
    return [];
  }
};

const writePersistentCacheIndex = (items) => {
  try {
    localStorage.setItem(`ieltswords_image_cache_index_${IMAGE_CACHE_VERSION}`, JSON.stringify(items));
  } catch {
    // Ignore quota issues; Cache Storage remains best-effort.
  }
};

const deletePersistentCacheItem = async (item) => {
  if ('caches' in window) {
    try {
      const cache = await caches.open(item.cacheName);
      await cache.delete(item.url);
    } catch {
      // Cache Storage eviction is best-effort.
    }
  }
  await deleteIndexedImageBlob(item.url);
};

const rememberPersistentCacheItem = async (absoluteUrl) => {
  const cacheName = getPersistentCacheName();
  const cacheKey = `${cacheName}:${absoluteUrl}`;
  const nextItems = readPersistentCacheIndex().filter((item) => item.key !== cacheKey);
  nextItems.push({ key: cacheKey, cacheName, url: absoluteUrl, savedAt: Date.now() });

  while (nextItems.length > IMAGE_PERSISTENT_CACHE_LIMIT) {
    const oldest = nextItems.shift();
    if (oldest) {
      await deletePersistentCacheItem(oldest);
    }
  }

  writePersistentCacheIndex(nextItems);
};

const writePersistentImageBlob = async (imageUrl, blob) => {
  if (!blob) {
    return;
  }

  try {
    const absoluteUrl = getAbsoluteImageUrl(imageUrl);
    if ('caches' in window) {
      const cache = await caches.open(getPersistentCacheName());
      await cache.put(
        absoluteUrl,
        new Response(blob, {
          headers: {
            'Content-Type': blob.type || 'application/octet-stream',
            'Cache-Control': 'private, max-age=604800',
          },
        })
      );
    }
    await writeIndexedImageBlob(absoluteUrl, blob);
    await rememberPersistentCacheItem(absoluteUrl);
  } catch {
    // Persistent image caching is best-effort.
  }
};

const loadImageBlob = async (imageUrl) => {
  const cachedBlob = await readPersistentImageBlob(imageUrl);
  if (cachedBlob) {
    return cachedBlob;
  }

  const response = await apiClient.get(imageUrl, {
    responseType: 'blob',
  });
  void writePersistentImageBlob(imageUrl, response.data);
  return response.data;
};

const ImageGallery = ({ images = [], emptyMode }) => {
  const [previewVisible, setPreviewVisible] = useState(false);
  const [previewImage, setPreviewImage] = useState('');
  const [imageUrls, setImageUrls] = useState({});
  const [loading, setLoading] = useState(false);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isHovered, setIsHovered] = useState(false);
  const { lensRadius, magnifierScale, setMagnifierScale, spotlightOpacity, setSpotlightOpacity } = useLearning();
  const [isMagnifierMode, setIsMagnifierMode] = useState(false);
  const frameRef = useRef(null);

  // X-Ray Lens Animation Values
  const mouseX = useMotionValue(0);
  const mouseY = useMotionValue(0);
  const maskRadius = useMotionValue(0);
  
  const springX = useSpring(mouseX, { stiffness: 500, damping: 28 });
  const springY = useSpring(mouseY, { stiffness: 500, damping: 28 });
  const springRadius = useSpring(maskRadius, { stiffness: 400, damping: 25 });
  
  const clipPath = useMotionTemplate`circle(${springRadius}px at ${springX}px ${springY}px)`;
  const transformOrigin = useMotionTemplate`${springX}px ${springY}px`;
  
  const lensLeft = useMotionTemplate`calc(${springX}px - ${springRadius}px)`;
  const lensTop = useMotionTemplate`calc(${springY}px - ${springRadius}px)`;
  const lensSize = useMotionTemplate`calc(${springRadius}px * 2)`;
  
  // Dynamic scalable glass shadow based on lens radius
  const glassBoxShadow = useMotionTemplate`
    inset 0 0 calc(${springRadius}px * 0.3) rgba(0,0,0,0.4), 
    inset calc(${springRadius}px * 0.15) calc(${springRadius}px * 0.15) calc(${springRadius}px * 0.5) rgba(255,255,255,0.6), 
    inset calc(${springRadius}px * -0.15) calc(${springRadius}px * -0.15) calc(${springRadius}px * 0.5) rgba(0,0,0,0.3), 
    0 calc(${springRadius}px * 0.15) calc(${springRadius}px * 0.3) rgba(0,0,0,0.15)
  `;

  const handleMouseMove = (e) => {
    if (!frameRef.current) return;
    const rect = frameRef.current.getBoundingClientRect();
    mouseX.set(e.clientX - rect.left);
    mouseY.set(e.clientY - rect.top);
  };

  // Wheel resize has been removed in favor of explicit sliders to prevent page scroll conflicts

  const handleMouseEnter = () => {
    setIsHovered(true);
    maskRadius.set(lensRadius);
  };

  const handleMouseLeave = () => {
    setIsHovered(false);
    maskRadius.set(0);
  };

  useEffect(() => {
    if (isHovered) {
      maskRadius.set(lensRadius);
    }
  }, [lensRadius, isHovered, maskRadius]);

  const hasImages = images.length > 0;
  const selectedImage = images[currentIndex];
  const selectedObjectUrl = selectedImage ? imageUrls[selectedImage.imageUrl] : '';

  useEffect(() => {
    setCurrentIndex(0);
    setImageUrls({});
  }, [images]);

  useEffect(() => {
    const selectedImage = images[currentIndex];
    const selectedUrl = selectedImage?.imageUrl;

    if (!hasImages || !selectedUrl) {
      setLoading(false);
      return;
    }

    if (imageUrls[selectedUrl]) {
      setLoading(false);
      return;
    }

    const cachedObjectUrl = getCachedObjectUrl(selectedUrl);
    if (cachedObjectUrl) {
      setImageUrls((currentUrls) => ({
        ...currentUrls,
        [selectedUrl]: cachedObjectUrl,
      }));
      setLoading(false);
      return;
    }

    let active = true;

    const loadImage = async () => {
      setLoading(true);

      try {
        const imageBlob = await loadImageBlob(selectedUrl);
        const objectUrl = cacheObjectUrl(selectedUrl, URL.createObjectURL(imageBlob));
        if (active) {
          setImageUrls((currentUrls) => ({
            ...currentUrls,
            [selectedUrl]: objectUrl,
          }));
        }
      } catch {
        if (active) {
          setImageUrls((currentUrls) => {
            const nextUrls = { ...currentUrls };
            delete nextUrls[selectedUrl];
            return nextUrls;
          });
        }
      } finally {
        if (active) {
          setLoading(false);
        }
      }
    };

    loadImage();

    return () => {
      active = false;
    };
  }, [currentIndex, hasImages, imageUrls, images]);

  useEffect(() => {
    if (!hasImages || !selectedImage || !selectedObjectUrl || images.length < 2) {
      return undefined;
    }

    let cancelled = false;
    const nextImage = images[(currentIndex + 1) % images.length];
    const nextUrl = nextImage?.imageUrl;

    if (!nextUrl || getCachedObjectUrl(nextUrl)) {
      return undefined;
    }

    const preload = async () => {
      if (cancelled) {
        return;
      }
      const persistentBlob = await readPersistentImageBlob(nextUrl);
      if (cancelled || persistentBlob) {
        return;
      }
      try {
        const response = await apiClient.get(nextUrl, {
          responseType: 'blob',
          skipErrorHandler: true,
        });
        if (!cancelled) {
          await writePersistentImageBlob(nextUrl, response.data);
        }
      } catch {
        // Prefetch failures should not affect the visible image.
      }
    };

    const schedulePreload = () => {
      if ('requestIdleCallback' in window) {
        const idleId = window.requestIdleCallback(preload, { timeout: 4000 });
        return () => window.cancelIdleCallback(idleId);
      }
      const timeoutId = window.setTimeout(preload, 1800);
      return () => window.clearTimeout(timeoutId);
    };

    const cancelScheduledPreload = schedulePreload();
    return () => {
      cancelled = true;
      cancelScheduledPreload();
    };
  }, [currentIndex, hasImages, images, selectedImage, selectedObjectUrl]);

  if (!hasImages) {
    return (
      <Card
        className="image-gallery-card empty-gallery-card"
        bodyStyle={{ 
          padding: '40px 24px', 
          display: 'flex', 
          flexDirection: 'column', 
          alignItems: 'center', 
          justifyContent: 'center',
          height: '480px'
        }}
      >
        <div style={{
          width: 80, height: 80,
          borderRadius: '50%',
          background: 'rgba(255, 255, 255, 0.4)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          marginBottom: 16,
          boxShadow: 'inset 0 2px 4px rgba(255,255,255,0.8)'
        }}>
          <PictureOutlined style={{ fontSize: 32, color: '#a78bfa' }} />
        </div>
        <div style={{ color: '#111827', fontSize: '18px', fontWeight: 700, marginBottom: 8 }}>
          {emptyMode === 'random-word' ? '当前词条暂缺配图记录' : '暂无视觉映射内容'}
        </div>
        <p style={{ color: '#6b7280', fontSize: '14px', textAlign: 'center', margin: 0, fontWeight: 500 }}>
          深呼吸，尝试仅凭意群和例句来攻克它，这对增强纯文本记忆也大有裨益。
        </p>
      </Card>
    );
  }

  const handlePreview = (imageUrl) => {
    setPreviewImage(imageUrl);
    setPreviewVisible(true);
  };

  const handlePrev = (e) => {
    e.stopPropagation();
    setCurrentIndex((prev) => (prev > 0 ? prev - 1 : images.length - 1));
  };

  const handleNext = (e) => {
    e.stopPropagation();
    setCurrentIndex((prev) => (prev < images.length - 1 ? prev + 1 : 0));
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '18px' }}>
      {/* Control bar for sidebar (Parallel to WordCard toolbar) */}
      <div style={{ height: 32, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, minWidth: 0 }}>
        <Button
          type="text"
          size="small"
          onClick={() => setIsMagnifierMode(!isMagnifierMode)}
          style={{ 
            color: isMagnifierMode ? '#6366f1' : '#6b7280',
            fontWeight: 600,
            fontSize: '13px',
            display: 'flex',
            alignItems: 'center',
            gap: 4,
            paddingLeft: 0,
            minWidth: 0,
            flexShrink: 1
          }}
        >
          {isMagnifierMode ? <SearchOutlined /> : <BulbOutlined />}
          {isMagnifierMode ? `放大镜 (${magnifierScale.toFixed(1)}x)` : '聚光灯'}
        </Button>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 10, minWidth: 0, flexShrink: 0 }}>
          {isMagnifierMode ? (
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <span style={{ fontSize: '11px', color: '#9ca3af', fontWeight: 600 }}>倍数</span>
              <Slider
                min={1.1}
                max={2.5}
                step={0.1}
                value={magnifierScale}
                onChange={setMagnifierScale}
                style={{ width: 44, margin: 0 }}
                tooltip={{ formatter: (val) => `${val.toFixed(1)}x` }}
              />
            </div>
          ) : (
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <span style={{ fontSize: '11px', color: '#9ca3af', fontWeight: 600 }}>透明度</span>
              <Slider
                min={30}
                max={100}
                step={5}
                value={spotlightOpacity}
                onChange={setSpotlightOpacity}
                style={{ width: 44, margin: 0 }}
                tooltip={{ formatter: (val) => `${val}%` }}
              />
            </div>
          )}
          <span
            style={{
              fontSize: '12px',
              color: '#6b7280',
              fontWeight: 700,
              letterSpacing: 0.3,
              whiteSpace: 'nowrap'
            }}
          >
            第 {currentIndex + 1}/{images.length} 张
          </span>
        </div>
      </div>

      <Card
        className="image-gallery-card"
        bodyStyle={{ padding: '10px', height: '100%' }}
        style={{ overflow: 'hidden', height: '480px' }}
      >
      <div className="image-gallery-card__body modern-gallery-body" style={{ position: 'relative', padding: 0, height: '100%' }}>

        {loading || !selectedObjectUrl ? (
          <div className="image-gallery-card__loading" style={{ minHeight: '360px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <Spin size="large" />
          </div>
        ) : (

            <div
              ref={frameRef}
              className="modern-image-frame"
              onClick={() => handlePreview(selectedObjectUrl)}
              onMouseMove={handleMouseMove}
              onMouseEnter={handleMouseEnter}
              onMouseLeave={handleMouseLeave}
              style={{ 
                position: 'relative', 
                cursor: 'zoom-in', 
                borderRadius: 16, 
                overflow: 'hidden',
                background: '#ffffff',
                boxShadow: 'inset 0 0 0 1px rgba(0,0,0,0.05)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                width: '100%',
                height: '100%'
              }}
            >
              {/* === Shade Overlay === */}
              <div style={{
                position: 'absolute', inset: 0, zIndex: 5, pointerEvents: 'none',
                background: `rgba(0, 0, 0, ${spotlightOpacity / 100})`,
                opacity: isHovered && !isMagnifierMode ? 1 : 0, transition: 'opacity 0.3s'
              }} />

            {/* === X-Ray Magic Lens Layer === */}
            <motion.div 
              style={{ 
                position: 'absolute', inset: 0, zIndex: 10, 
                clipPath, pointerEvents: 'none',
                display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
                overflow: 'hidden'
              }}
            >
              <motion.img
                src={selectedObjectUrl}
                alt=""
                animate={{ scale: isMagnifierMode ? magnifierScale : 1 }}
                transition={{ type: 'spring', stiffness: 300, damping: 30 }}
                style={{
                  width: '100%',
                  height: '100%',
                  objectFit: 'contain',
                  position: 'absolute',
                  inset: 0,
                  zIndex: 1,
                  display: 'block',
                  transformOrigin
                }}
              />
            </motion.div>

            {/* === Frameless Spherical Glass Overlay === */}
            {isMagnifierMode && (
              <motion.div
                style={{
                  position: 'absolute',
                  zIndex: 30,
                  pointerEvents: 'none',
                  left: lensLeft,
                  top: lensTop,
                  width: lensSize,
                  height: lensSize,
                  borderRadius: '50%',
                  // Pure glass spherical shading (scales dynamically with lens size)
                  boxShadow: glassBoxShadow,
                  background: 'radial-gradient(circle at 35% 35%, rgba(255,255,255,0.4) 0%, rgba(255,255,255,0) 45%)',
                  opacity: isHovered ? 1 : 0,
                  transition: 'opacity 0.3s'
                }}
              />
            )}

            {/* === Base Image === */}
            <img
              src={selectedObjectUrl}
              alt={`配图 ${currentIndex + 1}`}
              style={{
                width: '100%',
                height: '100%',
                objectFit: 'contain',
                position: 'relative',
                zIndex: 1,
                display: 'block'
              }}
            />

            {images.length > 1 && (
              <>
                <Button
                  shape="circle"
                  type="text"
                  icon={<LeftOutlined style={{ fontSize: '24px', color: '#ffffff', filter: 'drop-shadow(0 2px 4px rgba(0,0,0,0.5))' }} />}
                  onClick={handlePrev}
                  className="gallery-nav-btn"
                  style={{
                    position: 'absolute', left: 8, top: '50%', transform: 'translateY(-50%)',
                    zIndex: 20, background: 'transparent', border: 'none',
                    width: 48, height: 48,
                    opacity: isHovered ? 1 : 0, transition: 'opacity 0.3s, transform 0.2s'
                  }}
                />
                <Button
                  shape="circle"
                  type="text"
                  icon={<RightOutlined style={{ fontSize: '24px', color: '#ffffff', filter: 'drop-shadow(0 2px 4px rgba(0,0,0,0.5))' }} />}
                  onClick={handleNext}
                  className="gallery-nav-btn"
                  style={{
                    position: 'absolute', right: 8, top: '50%', transform: 'translateY(-50%)',
                    zIndex: 20, background: 'transparent', border: 'none',
                    width: 48, height: 48,
                    opacity: isHovered ? 1 : 0, transition: 'opacity 0.3s, transform 0.2s'
                  }}
                />
              </>
            )}
          </div>
        )}
      </div>
      </Card>
      <Modal
        open={previewVisible}
        footer={null}
        onCancel={() => setPreviewVisible(false)}
        width="auto"
        centered
        style={{ padding: 0 }}
        bodyStyle={{ padding: 0, background: 'transparent', display: 'flex', justifyContent: 'center' }}
        wrapClassName="image-preview-modal-wrap"
      >
        <img
          src={previewImage}
          alt="预览放大"
          style={{
            maxWidth: '100%',
            maxHeight: '85vh',
            objectFit: 'contain',
            borderRadius: 16,
            display: 'block',
            boxShadow: '0 20px 60px rgba(0,0,0,0.3)'
          }}
        />
      </Modal>
    </div>
  );
};

export default ImageGallery;
