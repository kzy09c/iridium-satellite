import React, { useRef, useEffect, useState, useCallback } from 'react';

interface TimelineScrollBarProps {
  currentTime: number;
  duration: number;
  onTimeChange: (time: number) => void;
  isPaused: boolean;
}

const TimelineScrollBar: React.FC<TimelineScrollBarProps> = ({
  currentTime,
  duration,
  onTimeChange,
  isPaused
}) => {
  const scrollBarRef = useRef<HTMLDivElement>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [localTime, setLocalTime] = useState(currentTime);
  const frameRef = useRef<number>();

  // Update local time when currentTime changes (if not dragging)
  useEffect(() => {
    if (!isDragging) {
      setLocalTime(currentTime);
    }
  }, [currentTime, isDragging]);

  // Convert minutes to hours:minutes format
  const formatTime = (minutes: number) => {
    const hours = Math.floor(minutes / 60);
    const mins = minutes % 60;
    return `${hours.toString().padStart(2, '0')}:${mins.toString().padStart(2, '0')}`;
  };

  // Calculate position percentage based on local time
  const getPositionPercentage = () => {
    return (localTime / duration) * 100;
  };

  // Smoothly update time
  const updateTime = useCallback((newTime: number) => {
    setLocalTime(newTime);
    onTimeChange(newTime);
  }, [onTimeChange]);

  // Handle mouse down on handle
  const handleMouseDown = (e: React.MouseEvent) => {
    e.stopPropagation();
    setIsDragging(true);
    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
  };

  // Handle mouse move while dragging
  const handleMouseMove = useCallback((e: MouseEvent) => {
    if (!isDragging || !scrollBarRef.current) return;

    // Cancel any pending animation frame
    if (frameRef.current) {
      cancelAnimationFrame(frameRef.current);
    }

    // Schedule the next update
    frameRef.current = requestAnimationFrame(() => {
      const rect = scrollBarRef.current!.getBoundingClientRect();
      const percentage = Math.max(0, Math.min(100, ((e.clientX - rect.left) / rect.width) * 100));
      const newTime = Math.round((percentage / 100) * duration);
      updateTime(newTime);
    });
  }, [isDragging, duration, updateTime]);

  // Handle mouse up to stop dragging
  const handleMouseUp = useCallback(() => {
    setIsDragging(false);
    document.removeEventListener('mousemove', handleMouseMove);
    document.removeEventListener('mouseup', handleMouseUp);
    
    // Cancel any pending animation frame
    if (frameRef.current) {
      cancelAnimationFrame(frameRef.current);
    }
  }, [handleMouseMove]);

  // Handle click on timeline
  const handleTimelineClick = (e: React.MouseEvent) => {
    if (!scrollBarRef.current || isDragging) return;

    const rect = scrollBarRef.current.getBoundingClientRect();
    const percentage = ((e.clientX - rect.left) / rect.width) * 100;
    const newTime = Math.round((percentage / 100) * duration);
    updateTime(newTime);
  };

  // Clean up event listeners and animation frames
  useEffect(() => {
    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
      if (frameRef.current) {
        cancelAnimationFrame(frameRef.current);
      }
    };
  }, [handleMouseMove, handleMouseUp]);

  // Generate hour markers
  const hourMarkers = Array.from({ length: 25 }, (_, i) => {
    const position = (i / 24) * 100;
    return (
      <div
        key={i}
        className="timeline-hour-marker"
        style={{ left: `${position}%` }}
      >
        <div className="marker-line"></div>
        <div className="marker-label">{i}h</div>
      </div>
    );
  });

  return (
    <div className="timeline-scroll-container">
      <div className="timeline-current-time">
        {formatTime(localTime)}
      </div>
      <div
        ref={scrollBarRef}
        className="timeline-scroll-bar"
        onClick={handleTimelineClick}
      >
        <div className="timeline-track">
          {hourMarkers}
        </div>
        <div
          className="timeline-handle"
          style={{ left: `${getPositionPercentage()}%` }}
          onMouseDown={handleMouseDown}
        >
          <div className="handle-grip"></div>
        </div>
      </div>
    </div>
  );
};

export default TimelineScrollBar; 