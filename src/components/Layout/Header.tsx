import React from 'react';

interface HeaderProps {
  activeTab: 'vectorizer' | 'maker' | 'stl-viewer';
  setActiveTab: (tab: 'vectorizer' | 'maker' | 'stl-viewer') => void;
}

export const Header: React.FC<HeaderProps> = ({ activeTab, setActiveTab }) => {
  return (
    <div className="app-header">
      <div className="header-left">
        <div className="header-title">
          <i className="fa-solid fa-cube"></i> Shadow Box Pro
        </div>
      </div>
      
      <div className="tab-nav">
        <button 
          className={`tab-btn ${activeTab === 'vectorizer' ? 'active vectorizer' : ''}`}
          onClick={() => setActiveTab('vectorizer')}
        >
          <i className="fa-solid fa-wand-magic-sparkles"></i> Step 1: Vectorizer
        </button>
        <button 
          className={`tab-btn ${activeTab === 'maker' ? 'active maker' : ''}`}
          onClick={() => setActiveTab('maker')}
        >
          <i className="fa-solid fa-box"></i> Step 2: Unfold Lamp
        </button>
        <button 
          className={`tab-btn ${activeTab === 'stl-viewer' ? 'active stl-viewer' : ''}`}
          onClick={() => setActiveTab('stl-viewer')}
        >
          <i className="fa-solid fa-cube"></i> Step 3: STL Viewer
        </button>
      </div>

      <div className="badge">
        <div className="badge-dot"></div>
        <span>GPU Engine Online</span>
      </div>
    </div>
  );
};
