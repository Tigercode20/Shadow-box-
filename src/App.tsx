import { useEffect, useState } from 'react';
import { Header } from './components/Layout/Header';
import { LoadingOverlay } from './components/Layout/LoadingOverlay';
import { VectorizerPanel } from './components/Step1Vectorizer/VectorizerPanel';
import { MakerPanel } from './components/Step2Maker/MakerPanel';
import { isOpenCvLoaded } from './utils/opencv';

function App() {
  const [activeTab, setActiveTab] = useState<'vectorizer' | 'maker'>('vectorizer');
  const [opencvLoaded, setOpencvLoaded] = useState<boolean>(false);

  // Vectorizer canvases
  const [vecOriginalCanvas, setVecOriginalCanvas] = useState<HTMLCanvasElement | null>(null);
  const [vecOutputCanvas, setVecOutputCanvas] = useState<HTMLCanvasElement | null>(null);

  // Maker raw silhouette (shared)
  const [rawSilhouetteCanvas, setRawSilhouetteCanvas] = useState<HTMLCanvasElement | null>(null);

  useEffect(() => {
    // Check if OpenCV is already loaded
    if (isOpenCvLoaded()) {
      setOpencvLoaded(true);
    } else {
      // Set global callback
      (window as any).onOpenCvReady = () => {
        setOpencvLoaded(true);
      };
    }
  }, []);

  const handleUseSilhouette = () => {
    if (!vecOutputCanvas) {
      alert("Please process an image in Step 1 first!");
      return;
    }
    // Set the shared raw silhouette canvas in Step 2 to our output from Step 1
    const copy = document.createElement('canvas');
    copy.width = vecOutputCanvas.width;
    copy.height = vecOutputCanvas.height;
    const ctx = copy.getContext('2d');
    if (ctx) {
      ctx.drawImage(vecOutputCanvas, 0, 0);
    }
    setRawSilhouetteCanvas(copy);
    setActiveTab('maker');
  };

  return (
    <>
      <LoadingOverlay visible={!opencvLoaded} />
      {opencvLoaded && (
        <>
          <Header activeTab={activeTab} setActiveTab={setActiveTab} />
          <div className="app-body">
            <VectorizerPanel
              active={activeTab === 'vectorizer'}
              vecOriginalCanvas={vecOriginalCanvas}
              setVecOriginalCanvas={setVecOriginalCanvas}
              vecOutputCanvas={vecOutputCanvas}
              setVecOutputCanvas={setVecOutputCanvas}
              onUseSilhouette={handleUseSilhouette}
            />
            <MakerPanel
              active={activeTab === 'maker'}
              rawSilhouetteCanvas={rawSilhouetteCanvas}
              setRawSilhouetteCanvas={setRawSilhouetteCanvas}
            />
          </div>
        </>
      )}
    </>
  );
}

export default App;
