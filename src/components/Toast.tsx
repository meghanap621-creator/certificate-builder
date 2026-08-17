import React, { useEffect } from 'react';
import { Icons } from './Icons';

interface ToastProps {
  message: string;
  type: 'success' | 'error';
  onClose: () => void;
  duration?: number;
}

export default function Toast({ message, type, onClose, duration = 4000 }: ToastProps) {
  useEffect(() => {
    const timer = setTimeout(() => {
      onClose();
    }, duration);

    return () => clearTimeout(timer);
  }, [onClose, duration]);

  return (
    <div className={`toast toast-${type === 'success' ? 'success' : 'error'}`}>
      {type === 'success' ? (
        <Icons.Check size={18} style={{ color: '#10b981' }} />
      ) : (
        <Icons.X size={18} style={{ color: '#ef4444' }} />
      )}
      <span>{message}</span>
      <button 
        onClick={onClose} 
        style={{ 
          background: 'none', 
          border: 'none', 
          color: 'inherit', 
          cursor: 'pointer', 
          marginLeft: '12px',
          opacity: 0.7 
        }}
      >
        <Icons.X size={14} />
      </button>
    </div>
  );
}
