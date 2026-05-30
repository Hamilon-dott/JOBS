import React, { useState, useEffect } from 'react';
import { ArrowUp, ArrowDown } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

export default function ScrollButtons() {
  const [showTop, setShowTop] = useState(false);
  const [showBottom, setShowBottom] = useState(true);

  const checkScroll = () => {
    const container = document.querySelector('.custom-scrollbar');
    if (!container) return;

    if (container.scrollTop > 300) {
      setShowTop(true);
    } else {
      setShowTop(false);
    }

    if (container.clientHeight + Math.round(container.scrollTop) >= container.scrollHeight - 100) {
      setShowBottom(false);
    } else {
      setShowBottom(true);
    }
  };

  useEffect(() => {
    const container = document.querySelector('.custom-scrollbar');
    if (container) {
      container.addEventListener('scroll', checkScroll);
      checkScroll(); // initial check
    }

    // Since the container might not exist immediately or change, we might want to poll or use observer, 
    // but a short timeout helps ensure it mounts first.
    const timeout = setTimeout(() => {
      const laterContainer = document.querySelector('.custom-scrollbar');
      if (laterContainer) {
        laterContainer.addEventListener('scroll', checkScroll);
        checkScroll();
      }
    }, 1000);

    return () => {
      clearTimeout(timeout);
      const containerToCleanup = document.querySelector('.custom-scrollbar');
      if (containerToCleanup) {
        containerToCleanup.removeEventListener('scroll', checkScroll);
      }
    };
  }, []);

  const scrollToTop = () => {
    const container = document.querySelector('.custom-scrollbar');
    if (container) {
      container.scrollTo({ top: 0, behavior: 'smooth' });
    }
  };

  const scrollToBottom = () => {
    const container = document.querySelector('.custom-scrollbar');
    if (container) {
      container.scrollTo({ top: container.scrollHeight, behavior: 'smooth' });
    }
  };

  const variants = {
    initial: { scale: 0, opacity: 0 },
    animate: { scale: 1, opacity: 1 },
    exit: { scale: 0, opacity: 0 },
    tap: {
      scale: 0.8,
      boxShadow: "0 0 0 20px rgba(59, 130, 246, 0)", // Ripple/splash color effect
      transition: { duration: 0.4 }
    }
  };

  return (
    <div className="fixed bottom-8 right-8 flex flex-col gap-4 z-50">
      <AnimatePresence>
        {showTop && (
          <motion.button
            key="top"
            variants={variants}
            initial="initial"
            animate="animate"
            exit="exit"
            whileTap="tap"
            onClick={scrollToTop}
            style={{ originX: 0.5, originY: 0.5 }}
            className="p-3 bg-blue-600 text-white rounded-full shadow-xl hover:bg-blue-700 hover:shadow-2xl focus:outline-none flex items-center justify-center transition-colors"
            title="উপরে যান"
          >
            <ArrowUp size={24} />
          </motion.button>
        )}
      </AnimatePresence>
      <AnimatePresence>
        {showBottom && (
          <motion.button
            key="bottom"
            variants={variants}
            initial="initial"
            animate="animate"
            exit="exit"
            whileTap="tap"
            onClick={scrollToBottom}
            style={{ originX: 0.5, originY: 0.5 }}
            className="p-3 bg-[#057a41] text-white rounded-full shadow-xl hover:bg-[#046335] hover:shadow-2xl focus:outline-none flex items-center justify-center transition-colors"
            title="নিচে যান"
          >
            <ArrowDown size={24} />
          </motion.button>
        )}
      </AnimatePresence>
    </div>
  );
}
