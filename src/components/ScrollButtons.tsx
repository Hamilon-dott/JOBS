import React, { useState, useEffect, useCallback } from 'react';
import { ArrowUp, ArrowDown } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

interface ScrollButtonsProps {
  containerRef?: React.RefObject<HTMLDivElement | null>;
}

export default function ScrollButtons({ containerRef }: ScrollButtonsProps) {
  const [showTop, setShowTop] = useState(false);
  const [showBottom, setShowBottom] = useState(true);

  const getContainer = useCallback(() => {
    const containers = document.querySelectorAll('.custom-scrollbar');
    if (containers.length > 1) {
      return containers[containers.length - 1] as HTMLDivElement;
    }
    if (containerRef && containerRef.current) return containerRef.current;
    return document.querySelector('.custom-scrollbar') as HTMLDivElement | null;
  }, [containerRef]);

  const checkScroll = useCallback(() => {
    const container = getContainer();
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
  }, [getContainer]);

  useEffect(() => {
    // Check initially
    checkScroll();

    // Use a capture-phase listener to catch ALL scroll events from any element
    const handleScroll = (e: Event) => {
      const target = e.target as HTMLElement;
      if (target && target.classList && target.classList.contains('custom-scrollbar')) {
        checkScroll();
      }
    };

    window.addEventListener('scroll', handleScroll, true);

    // To catch size changes when Job Details open/close or images load
    const interval = setInterval(() => {
      checkScroll();
    }, 1000);

    return () => {
      window.removeEventListener('scroll', handleScroll, true);
      clearInterval(interval);
    };
  }, [checkScroll]);

  const scrollToTop = () => {
    const container = getContainer();
    if (container) {
      container.scrollTo({ top: 0, behavior: 'smooth' });
    }
  };

  const scrollToBottom = () => {
    const container = getContainer();
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
      boxShadow: "0 0 0 20px rgba(59, 130, 246, 0)",
      transition: { duration: 0.4 }
    }
  };

  return (
    <div className="fixed bottom-6 right-6 md:bottom-8 md:right-8 flex flex-col gap-3 md:gap-4 z-[2000] pointer-events-none">
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
            className="p-3 md:p-3.5 bg-blue-600 text-white rounded-full shadow-lg hover:bg-blue-700 hover:shadow-2xl focus:outline-none flex items-center justify-center transition-all duration-300 pointer-events-auto border border-blue-500/20"
            title="উপরে যান"
          >
            <ArrowUp size={22} className="md:w-6 md:h-6" />
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
            className="p-3 md:p-3.5 bg-[#057a41] text-white rounded-full shadow-lg hover:bg-[#046335] hover:shadow-2xl focus:outline-none flex items-center justify-center transition-all duration-300 pointer-events-auto border border-[#057a41]/20"
            title="নিচে যান"
          >
            <ArrowDown size={22} className="md:w-6 md:h-6" />
          </motion.button>
        )}
      </AnimatePresence>
    </div>
  );
}

