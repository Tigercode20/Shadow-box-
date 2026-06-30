import React from 'react';

interface LoadingOverlayProps {
  visible: boolean;
}

export const LoadingOverlay: React.FC<LoadingOverlayProps> = ({ visible }) => {
  if (!visible) return null;

  return (
    <div id="loading-overlay">
      <div className="spinner"></div>
      <div className="loading-text">LOADING OPENCV.JS CORE ENGINE...</div>
      <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginTop: '10px' }}>
        Please wait while the computer graphics library initializes.
      </div>
    </div>
  );
};
