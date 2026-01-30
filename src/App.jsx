import React, { useRef } from 'react';
import { ShelterProvider } from './context/ShelterContext';
import ControlPanel from './components/ControlPanel';
import Sidebar from './components/Sidebar';
import CanvasArea from './components/CanvasArea';
import './index.css';

const AppContent = () => {
  const stageRef = useRef(null);

  const handleDownload = () => {
    if (stageRef.current) {
      const uri = stageRef.current.toDataURL({ pixelRatio: 2 }); // High res
      const link = document.createElement('a');
      link.download = 'evacuation-layout.png';
      link.href = uri;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    }
  };

  return (
    <div className="app-container">
      <div className="header">
        <h1>避難所レイアウト検討ツール</h1>
        <ControlPanel onDownload={handleDownload} />
      </div>
      <div className="main-content">
        <Sidebar />
        <CanvasArea stageRef={stageRef} />
      </div>
    </div>
  );
};

const App = () => {
  return (
    <ShelterProvider>
      <AppContent />
    </ShelterProvider>
  );
};

export default App;
