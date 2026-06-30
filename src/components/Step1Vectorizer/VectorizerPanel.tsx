import { useEffect, useRef, useState } from 'react';
import { getCV } from '../../utils/opencv';
import { medianCutQuantize } from '../../utils/quantizer';
import { drawContoursToCanvas } from '../../utils/projector';
import { SliderControl } from '../Common/SliderControl';
import { downloadCanvasAsImage, downloadCanvasAsPDF, downloadCanvasAsSVG } from '../../utils/exporters';

interface VectorizerPanelProps {
  active: boolean;
  vecOriginalCanvas: HTMLCanvasElement | null;
  setVecOriginalCanvas: (canvas: HTMLCanvasElement | null) => void;
  vecOutputCanvas: HTMLCanvasElement | null;
  setVecOutputCanvas: (canvas: HTMLCanvasElement | null) => void;
  onUseSilhouette: () => void;
}

export const VectorizerPanel: React.FC<VectorizerPanelProps> = ({
  active,
  vecOriginalCanvas,
  setVecOriginalCanvas,
  vecOutputCanvas,
  setVecOutputCanvas,
  onUseSilhouette,
}) => {
  const [numColors, setNumColors] = useState<number>(2);
  const [threshold, setThreshold] = useState<number>(128);
  const [contrast, setContrast] = useState<number>(100);
  const [showOriginal, setShowOriginal] = useState<boolean>(false);
  const [swatches, setSwatches] = useState<string[]>([]);
  const [fileName, setFileName] = useState<string>('Browse Image File');
  const [resolutionInfo, setResolutionInfo] = useState<string>('Browse an image to start vectorizing');

  const previewCanvasRef = useRef<HTMLCanvasElement | null>(null);

  // Trigger processing when inputs change
  useEffect(() => {
    if (!vecOriginalCanvas) return;
    processImage();
  }, [vecOriginalCanvas, numColors, threshold, contrast]);

  // Render preview canvas
  useEffect(() => {
    renderPreview();
  }, [vecOriginalCanvas, vecOutputCanvas, showOriginal, active]);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      const file = e.target.files[0];
      setFileName(file.name);

      const reader = new FileReader();
      reader.onload = (event) => {
        const img = new Image();
        img.onload = () => {
          const canvas = document.createElement('canvas');
          canvas.width = img.width;
          canvas.height = img.height;
          const ctx = canvas.getContext('2d');
          if (ctx) {
            ctx.drawImage(img, 0, 0);
          }
          setVecOriginalCanvas(canvas);
          setResolutionInfo(`${img.width} x ${img.height} px`);
        };
        img.src = event.target?.result as string;
      };
      reader.readAsDataURL(file);
    }
  };

  const processImage = () => {
    if (!vecOriginalCanvas) return;
    const cv = getCV();
    if (!cv) return;

    const w = vecOriginalCanvas.width;
    const h = vecOriginalCanvas.height;
    const srcCtx = vecOriginalCanvas.getContext('2d');
    if (!srcCtx) return;

    const srcData = srcCtx.getImageData(0, 0, w, h);
    const pixels = srcData.data;

    const contrastMultiplier = contrast / 100.0;
    const adjusted = new Uint8ClampedArray(pixels.length);
    for (let i = 0; i < pixels.length; i += 4) {
      for (let ch = 0; ch < 3; ch++) {
        let v = pixels[i + ch];
        v = ((v / 255.0 - 0.5) * contrastMultiplier + 0.5) * 255.0;
        adjusted[i + ch] = Math.max(0, Math.min(255, Math.round(v)));
      }
      adjusted[i + 3] = 255;
    }

    let outData: Uint8ClampedArray;
    if (numColors <= 2) {
      outData = new Uint8ClampedArray(pixels.length);
      for (let i = 0; i < adjusted.length; i += 4) {
        const gray = 0.299 * adjusted[i] + 0.587 * adjusted[i + 1] + 0.114 * adjusted[i + 2];
        const val = gray > threshold ? 255 : 0;
        outData[i] = val;
        outData[i + 1] = val;
        outData[i + 2] = val;
        outData[i + 3] = 255;
      }
    } else {
      outData = medianCutQuantize(adjusted, w, h, numColors);
    }

    const outCanvas = document.createElement('canvas');
    outCanvas.width = w;
    outCanvas.height = h;
    const outCtx = outCanvas.getContext('2d');
    if (!outCtx) return;

    // Draw background
    outCtx.fillStyle = '#ffffff';
    outCtx.fillRect(0, 0, w, h);

    // Vector Contour Drawing
    const tempCanvas = document.createElement('canvas');
    tempCanvas.width = w;
    tempCanvas.height = h;
    const tempCtx = tempCanvas.getContext('2d');
    if (tempCtx) {
      const outImgData = tempCtx.createImageData(w, h);
      outImgData.data.set(outData);
      tempCtx.putImageData(outImgData, 0, 0);
    }

    const mat = cv.imread(tempCanvas);
    const grayMat = new cv.Mat();
    cv.cvtColor(mat, grayMat, cv.COLOR_RGBA2GRAY);

    const threshMat = new cv.Mat();
    cv.threshold(grayMat, threshMat, 127, 255, cv.THRESH_BINARY_INV);

    const contours = new cv.MatVector();
    const hierarchy = new cv.Mat();
    cv.findContours(threshMat, contours, hierarchy, cv.RETR_CCOMP, cv.CHAIN_APPROX_TC89_L1);

    drawContoursToCanvas(outCanvas, contours, hierarchy);

    mat.delete();
    grayMat.delete();
    threshMat.delete();
    contours.delete();
    hierarchy.delete();

    setVecOutputCanvas(outCanvas);
    updateSwatches(outData, w, h);
    setShowOriginal(false);
  };

  const updateSwatches = (data: Uint8ClampedArray, w: number, h: number) => {
    const colorSet = new Map<string, number>();
    const step = Math.max(1, Math.floor((w * h) / 5000));
    for (let i = 0; i < data.length; i += 4 * step) {
      const key = `${data[i]},${data[i + 1]},${data[i + 2]}`;
      colorSet.set(key, (colorSet.get(key) || 0) + 1);
    }
    const sorted = [...colorSet.entries()].sort((a, b) => b[1] - a[1]);
    setSwatches(sorted.map(([key]) => `rgb(${key})`));
  };

  const renderPreview = () => {
    const canvas = previewCanvasRef.current;
    if (!canvas) return;
    const src = showOriginal ? vecOriginalCanvas : vecOutputCanvas;
    if (!src) return;

    canvas.width = src.width;
    canvas.height = src.height;
    const ctx = canvas.getContext('2d');
    if (ctx) {
      ctx.drawImage(src, 0, 0);
    }
  };

  const autoAdjustParameters = () => {
    if (!vecOriginalCanvas) {
      alert("Please upload a photo first!");
      return;
    }
    const cv = getCV();
    if (!cv) return;

    const src = cv.imread(vecOriginalCanvas);
    const srcGray = new cv.Mat();
    cv.cvtColor(src, srcGray, cv.COLOR_RGBA2GRAY);
    const dst = new cv.Mat();

    const otsuThresh = cv.threshold(srcGray, dst, 0, 255, cv.THRESH_BINARY | cv.THRESH_OTSU);
    const thresholdVal = Math.round(otsuThresh);
    setThreshold(thresholdVal);
    setContrast(100);

    src.delete();
    srcGray.delete();
    dst.delete();
  };

  const handleDownload = (format: 'svg' | 'pdf' | 'png' | 'jpg') => {
    const canvas = previewCanvasRef.current;
    if (!canvas || !vecOutputCanvas) {
      alert("Please process an image first!");
      return;
    }

    if (format === 'svg') {
      downloadCanvasAsSVG(canvas, "vector_silhouette");
    } else if (format === 'pdf') {
      downloadCanvasAsPDF(canvas, "vector_silhouette");
    } else {
      downloadCanvasAsImage(canvas, "vector_silhouette", format);
    }
  };

  return (
    <div className={`workspace-panel ${active ? 'active' : ''}`} id="panel-vectorizer">
      <div className="sidebar">
        {/* Upload original image */}
        <div className="card">
          <div className="card-title">
            <i className="fa-solid fa-photo-film" style={{ color: 'var(--accent)' }}></i> Upload Original Photo
          </div>
          <div className="input-group">
            <label className="file-upload-btn accent-upload" htmlFor="vecFileInput">
              <i className="fa-solid fa-cloud-arrow-up"></i>
              <span>{fileName}</span>
            </label>
            <input 
              type="file" 
              id="vecFileInput" 
              accept="image/*" 
              style={{ display: 'none' }} 
              onChange={handleFileChange}
            />
          </div>
        </div>

        {/* Color quantization */}
        <div className="card">
          <div className="card-title">
            <i className="fa-solid fa-palette" style={{ color: 'var(--accent)' }}></i> Color Quantization
          </div>
          <div className="input-group">
            <label>Target Number of Colors</label>
            <div className="palette-presets">
              {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((n) => (
                <button
                  key={n}
                  className={`palette-btn ${numColors === n ? 'active' : ''}`}
                  onClick={() => setNumColors(n)}
                >
                  {n}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Adjustments */}
        <div className="card">
          <div className="card-title">
            <i className="fa-solid fa-sliders" style={{ color: 'var(--accent)' }}></i> Vectorizer Adjustments
          </div>
          <SliderControl 
            label="Threshold / Brightness"
            min={0}
            max={255}
            value={threshold}
            onChange={setThreshold}
          />
          <SliderControl 
            label="Contrast Boost"
            min={0}
            max={300}
            value={contrast}
            suffix="%"
            onChange={setContrast}
          />
          <button 
            className="btn btn-secondary" 
            onClick={autoAdjustParameters}
            style={{ fontSize: '0.85rem', padding: '12px', marginTop: '10px', borderColor: 'rgba(245, 158, 11, 0.3)', color: 'var(--accent)' }}
          >
            <i className="fa-solid fa-wand-magic-sparkles"></i> Auto-Adjust Parameters
          </button>
        </div>

        {/* Sticky Use Silhouette Button */}
        <div className="sticky-footer">
          <button className="btn btn-accent" onClick={onUseSilhouette} style={{ width: '100%' }}>
            <i className="fa-solid fa-arrow-right"></i> Use Silhouette & Go to Step 2
          </button>
        </div>
      </div>

      {/* Real-time Preview Canvases */}
      <div className="canvas-area">
        <div className="grid-workspace" style={{ gridTemplateColumns: '1fr' }}>
          <div className="preview-card">
            <div className="preview-header">
              <div className="preview-header-title accent-title">
                <i className="fa-solid fa-palette"></i> Vectorizer Real-time Preview
              </div>
              <div className="toggle-btn-bar" style={{ width: '200px' }}>
                <button 
                  className={showOriginal ? 'active' : ''} 
                  onClick={() => setShowOriginal(true)}
                >
                  Original
                </button>
                <button 
                  className={!showOriginal ? 'active' : ''} 
                  onClick={() => setShowOriginal(false)}
                >
                  Processed
                </button>
              </div>
            </div>

            <div className="canvas-frame">
              <canvas ref={previewCanvasRef}></canvas>
            </div>

            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexShrink: 0 }}>
              <div className="color-swatches">
                {swatches.map((color, idx) => (
                  <div 
                    key={idx} 
                    className="color-swatch" 
                    style={{ background: color }}
                    title={color}
                  ></div>
                ))}
              </div>
              <div className="vec-info" style={{ fontSize: '0.8rem' }}>{resolutionInfo}</div>
            </div>

            {/* Downloads */}
            <div className="download-formats-bar" style={{ display: 'flex', gap: '8px', borderTop: '1px solid var(--card-border)', paddingTop: '12px', marginTop: '5px', flexShrink: 0, alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap' }}>
              <span style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-muted)' }}>DOWNLOAD SILHOUETTE:</span>
              <div style={{ display: 'flex', gap: '6px' }}>
                <button className="btn btn-secondary" onClick={() => handleDownload('svg')} style={{ padding: '6px 12px', fontSize: '0.8rem', fontWeight: 700, borderColor: 'rgba(245, 158, 11, 0.35)', color: 'var(--accent)' }}><i className="fa-solid fa-file-code"></i> SVG</button>
                <button className="btn btn-secondary" onClick={() => handleDownload('pdf')} style={{ padding: '6px 12px', fontSize: '0.8rem', fontWeight: 700, borderColor: 'rgba(245, 158, 11, 0.35)', color: 'var(--accent)' }}><i className="fa-solid fa-file-pdf"></i> PDF</button>
                <button className="btn btn-secondary" onClick={() => handleDownload('png')} style={{ padding: '6px 12px', fontSize: '0.8rem', fontWeight: 700, borderColor: 'rgba(245, 158, 11, 0.35)', color: 'var(--accent)' }}><i className="fa-solid fa-file-image"></i> PNG</button>
                <button className="btn btn-secondary" onClick={() => handleDownload('jpg')} style={{ padding: '6px 12px', fontSize: '0.8rem', fontWeight: 700, borderColor: 'rgba(245, 158, 11, 0.35)', color: 'var(--accent)' }}><i className="fa-solid fa-file-image"></i> JPG</button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
