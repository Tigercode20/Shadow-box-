import { useEffect, useState } from 'react';
import { Header } from './components/Layout/Header';
import { LoadingOverlay } from './components/Layout/LoadingOverlay';
import { VectorizerPanel } from './components/Step1Vectorizer/VectorizerPanel';
import { MakerPanel } from './components/Step2Maker/MakerPanel';
import { StlViewerPanel } from './components/Step3StlViewer/StlViewerPanel';
import { isOpenCvLoaded } from './utils/opencv';

export interface GeneratedStl {
  name: string;
  buffer: ArrayBuffer;
  objText?: string;
}

function App() {
  const [activeTab, setActiveTab] = useState<'vectorizer' | 'maker' | 'stl-viewer'>('vectorizer');
  const [opencvLoaded, setOpencvLoaded] = useState<boolean>(false);
  const [generatedStls, setGeneratedStls] = useState<GeneratedStl[]>([]);

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
              onStlsGenerated={setGeneratedStls}
            />
            <StlViewerPanel
              active={activeTab === 'stl-viewer'}
              generatedStls={generatedStls}
            />
          </div>
        </>
      )}
    </>
  );
}

export default App;
