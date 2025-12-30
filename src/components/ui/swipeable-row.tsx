import * as React from 'react';
import { cn } from '@/lib/utils';

interface SwipeAction {
  icon: React.ReactNode;
  label: string;
  color: string;
  onAction: () => void;
}

interface SwipeableRowProps {
  children: React.ReactNode;
  leftActions?: SwipeAction[];
  rightActions?: SwipeAction[];
  className?: string;
  threshold?: number;
}

export function SwipeableRow({
  children,
  leftActions = [],
  rightActions = [],
  className,
  threshold = 80,
}: SwipeableRowProps) {
  const containerRef = React.useRef<HTMLDivElement>(null);
  const contentRef = React.useRef<HTMLDivElement>(null);
  const startXRef = React.useRef(0);
  const currentXRef = React.useRef(0);
  const isDraggingRef = React.useRef(false);
  const [offset, setOffset] = React.useState(0);
  const [isOpen, setIsOpen] = React.useState<'left' | 'right' | null>(null);

  const maxLeftOffset = leftActions.length * 72;
  const maxRightOffset = rightActions.length * 72;

  const handleTouchStart = (e: React.TouchEvent) => {
    if (e.touches.length !== 1) return;
    startXRef.current = e.touches[0].clientX;
    currentXRef.current = offset;
    isDraggingRef.current = true;
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    if (!isDraggingRef.current) return;
    
    const diff = e.touches[0].clientX - startXRef.current;
    let newOffset = currentXRef.current + diff;
    
    // Clamp offset
    if (newOffset > maxLeftOffset) {
      newOffset = maxLeftOffset + (newOffset - maxLeftOffset) * 0.2;
    } else if (newOffset < -maxRightOffset) {
      newOffset = -maxRightOffset + (newOffset + maxRightOffset) * 0.2;
    }
    
    setOffset(newOffset);
  };

  const handleTouchEnd = () => {
    isDraggingRef.current = false;
    
    // Determine final position
    if (offset > threshold && leftActions.length > 0) {
      // Open left actions
      setOffset(maxLeftOffset);
      setIsOpen('left');
    } else if (offset < -threshold && rightActions.length > 0) {
      // Open right actions
      setOffset(-maxRightOffset);
      setIsOpen('right');
    } else {
      // Snap back
      setOffset(0);
      setIsOpen(null);
    }
  };

  const handleActionClick = (action: SwipeAction) => {
    setOffset(0);
    setIsOpen(null);
    action.onAction();
  };

  const closeSwipe = () => {
    setOffset(0);
    setIsOpen(null);
  };

  // Close on click outside
  React.useEffect(() => {
    if (!isOpen) return;
    
    const handleClick = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        closeSwipe();
      }
    };
    
    document.addEventListener('click', handleClick);
    return () => document.removeEventListener('click', handleClick);
  }, [isOpen]);

  return (
    <div
      ref={containerRef}
      className={cn('relative overflow-hidden touch-pan-y', className)}
    >
      {/* Left actions (revealed when swiping right) */}
      {leftActions.length > 0 && (
        <div className="absolute inset-y-0 left-0 flex">
          {leftActions.map((action, i) => (
            <button
              key={i}
              onClick={() => handleActionClick(action)}
              className={cn(
                'flex flex-col items-center justify-center w-[72px] text-white text-xs font-medium gap-1 transition-transform active:scale-95',
                action.color
              )}
              style={{
                transform: `translateX(${Math.min(0, offset - maxLeftOffset)}px)`,
              }}
            >
              {action.icon}
              <span className="text-[10px]">{action.label}</span>
            </button>
          ))}
        </div>
      )}

      {/* Right actions (revealed when swiping left) */}
      {rightActions.length > 0 && (
        <div className="absolute inset-y-0 right-0 flex">
          {rightActions.map((action, i) => (
            <button
              key={i}
              onClick={() => handleActionClick(action)}
              className={cn(
                'flex flex-col items-center justify-center w-[72px] text-white text-xs font-medium gap-1 transition-transform active:scale-95',
                action.color
              )}
              style={{
                transform: `translateX(${Math.max(0, offset + maxRightOffset)}px)`,
              }}
            >
              {action.icon}
              <span className="text-[10px]">{action.label}</span>
            </button>
          ))}
        </div>
      )}

      {/* Main content */}
      <div
        ref={contentRef}
        className="relative bg-background transition-transform duration-200 ease-out"
        style={{
          transform: `translateX(${offset}px)`,
          transitionDuration: isDraggingRef.current ? '0ms' : '200ms',
        }}
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
      >
        {children}
      </div>
    </div>
  );
}
