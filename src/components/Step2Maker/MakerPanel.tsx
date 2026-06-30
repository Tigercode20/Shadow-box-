import { useEffect, useRef, useState } from 'react';
import { getCV } from '../../utils/opencv';
import { preprocessSilhouette, projectWallPanel, assembleCrossFoldLayout, drawContoursToCanvas } from '../../utils/projector';
import { downloadCanvasAsImage, downloadCanvasAsPDF, downloadCanvasAsSVG, exportZipArchive } from '../../utils/exporters';
import { SliderControl } from '../Common/SliderControl';

interface MakerPanelProps {
  active: boolean;
  rawSilhouetteCanvas: HTMLCanvasElement | null;
  setRawSilhouetteCanvas: (canvas: HTMLCanvasElement | null) => void;
}

export const MakerPanel: React.FC<MakerPanelProps> = ({
  active,
  rawSilhouetteCanvas,
  setRawSilhouetteCanvas,
}) => {
  // Placement
  const [scale, setScale] = useState<number>(100);
  const [offsetX, setOffsetX] = useState<number>(0);
  const [offsetY, setOffsetY] = useState<number>(100);

  // Box dimensions
  const [boxW, setBoxW] = useState<number>(114);
  const [boxH, setBoxH] = useState<number>(150);
  const [boxD, setBoxD] = useState<number>(70);

  // Optical Settings
  const [lightZ, setLightZ] = useState<number>(130);
  const [frontZ, setFrontZ] = useState<number>(80);
  const [targetW, setTargetW] = useState<number>(1140);
  const [targetH, setTargetH] = useState<number>(1500);

  // Settings & Outputs
  const [resolution, setResolution] = useState<number>(2.0);
  const [panelType, setPanelType] = useState<number>(255); // 255 = cutout, 0 = solid
  const [useEdges, setUseEdges] = useState<boolean>(false);
  const [thresh1, setThresh1] = useState<number>(50);
  const [thresh2, setThresh2] = useState<number>(150);
  const [useCustomShape, setUseCustomShape] = useState<boolean>(true);
  const [groundBottom, setGroundBottom] = useState<boolean>(false);
  const [drawSlits, setDrawSlits] = useState<boolean>(false);

  const [crossCanvas, setCrossCanvas] = useState<HTMLCanvasElement | null>(null);
  const [isModalOpen, setIsModalOpen] = useState<boolean>(false);
  const [selectedFormats, setSelectedFormats] = useState({
    svg: true,
    pdf: true,
    png: true,
    jpg: true
  });

  const targetCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const crossCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const [fileName, setFileName] = useState<string>('Browse Raw Silhouette');

  // Trigger preview update when active or elements change
  useEffect(() => {
    if (!rawSilhouetteCanvas) return;
    updateProjections();
  }, [rawSilhouetteCanvas, active, scale, offsetX, offsetY, boxW, boxH, boxD, lightZ, frontZ, targetW, targetH, resolution, panelType, useEdges, thresh1, thresh2, useCustomShape, groundBottom, drawSlits]);

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
          setRawSilhouetteCanvas(canvas);
        };
        img.src = event.target?.result as string;
      };
      reader.readAsDataURL(file);
    }
  };

  const updateProjections = () => {
    if (!rawSilhouetteCanvas) return;
    const cv = getCV();
    if (!cv) return;

    const src = cv.imread(rawSilhouetteCanvas);
    const srcGray = new cv.Mat();
    cv.cvtColor(src, srcGray, cv.COLOR_RGBA2GRAY);

    const preprocessedMat = preprocessSilhouette(
      srcGray,
      targetW,
      targetH,
      useEdges,
      thresh1,
      thresh2,
      useCustomShape,
      groundBottom
    );

    // Render smooth preprocessed silhouette target
    const targetCanvas = targetCanvasRef.current;
    if (targetCanvas) {
      targetCanvas.width = preprocessedMat.cols;
      targetCanvas.height = preprocessedMat.rows;

      const threshMat = new cv.Mat();
      cv.threshold(preprocessedMat, threshMat, 127, 255, cv.THRESH_BINARY_INV);
      const contours = new cv.MatVector();
      const hierarchy = new cv.Mat();
      cv.findContours(threshMat, contours, hierarchy, cv.RETR_CCOMP, cv.CHAIN_APPROX_TC89_L1);

      drawContoursToCanvas(targetCanvas, contours, hierarchy);

      threshMat.delete();
      contours.delete();
      hierarchy.delete();
    }

    const targetImgData = targetCanvas?.getContext('2d')?.getImageData(0, 0, targetCanvas.width, targetCanvas.height);
    if (!targetImgData) {
      src.delete();
      srcGray.delete();
      preprocessedMat.delete();
      return;
    }

    const imgScaleFract = scale / 100.0;

    // Calculate panels
    const leftPanel = projectWallPanel('left', targetImgData, targetW, targetH, boxW, boxH, boxD, 
                                       frontZ, frontZ + boxD, lightZ, resolution, panelType, imgScaleFract, offsetX, offsetY);
    const rightPanel = projectWallPanel('right', targetImgData, targetW, targetH, boxW, boxH, boxD, 
                                        frontZ, frontZ + boxD, lightZ, resolution, panelType, imgScaleFract, offsetX, offsetY);
    const topPanel = projectWallPanel('top', targetImgData, targetW, targetH, boxW, boxH, boxD, 
                                      frontZ, frontZ + boxD, lightZ, resolution, panelType, imgScaleFract, offsetX, offsetY);
    const bottomPanel = projectWallPanel('bottom', targetImgData, targetW, targetH, boxW, boxH, boxD, 
                                         frontZ, frontZ + boxD, lightZ, resolution, panelType, imgScaleFract, offsetX, offsetY);



    // Assemble layout
    const crossLayoutCanvas = assembleCrossFoldLayout(leftPanel, rightPanel, topPanel, bottomPanel, boxW, boxH, boxD, resolution, panelType, drawSlits);
    setCrossCanvas(crossLayoutCanvas);

    const destCrossCanvas = crossCanvasRef.current;
    if (destCrossCanvas) {
      destCrossCanvas.width = crossLayoutCanvas.width;
      destCrossCanvas.height = crossLayoutCanvas.height;
      const ctx = destCrossCanvas.getContext('2d');
      if (ctx) {
        ctx.drawImage(crossLayoutCanvas, 0, 0);
      }
    }

    src.delete();
    srcGray.delete();
    preprocessedMat.delete();
  };

  const autoFitSilhouette = () => {
    if (!rawSilhouetteCanvas) return;
    const cv = getCV();
    if (!cv) return;

    const src = cv.imread(rawSilhouetteCanvas);
    const srcGray = new cv.Mat();
    cv.cvtColor(src, srcGray, cv.COLOR_RGBA2GRAY);

    const thresh = new cv.Mat();
    cv.threshold(srcGray, thresh, 240, 255, cv.THRESH_BINARY_INV);

    const yIndices: number[] = [];
    for (let r = 0; r < thresh.rows; r++) {
      for (let c = 0; c < thresh.cols; c++) {
        if (thresh.ucharAt(r, c) > 0) {
          yIndices.push(r);
        }
      }
    }

    if (yIndices.length === 0) {
      alert("Could not detect any silhouette inside the image!");
      src.delete();
      srcGray.delete();
      thresh.delete();
      return;
    }

    const yMinPx = Math.min(...yIndices);
    const yMaxPx = Math.max(...yIndices);

    const hImg = thresh.rows;
    const yMin = targetH / 2.0 - (yMaxPx / (hImg - 1)) * targetH;
    const yMax = targetH / 2.0 - (yMinPx / (hImg - 1)) * targetH;
    const hSil = yMax - yMin;

    const tMin = lightZ / (lightZ - frontZ);
    const tMax = lightZ / (lightZ - (frontZ + boxD));
    const hBoxProj = boxH * tMax;

    const targetScale = hBoxProj / hSil;
    const scalePct = Math.round(Math.min(500.0, Math.max(10.0, targetScale * 100.0)));

    const yNeck = yMax - 0.42 * hSil;
    const yBoxTop = (boxH / 2.0) * tMin;
    const shiftY = Math.round(yBoxTop - (scalePct / 100.0) * yNeck);

    setScale(scalePct);
    setOffsetY(shiftY);
    setOffsetX(0);

    src.delete();
    srcGray.delete();
    thresh.delete();

    // Trigger preview update
    setTimeout(updateProjections, 50);
  };

  // High-Res Renderers for Export
  const getHiResTargetCanvas = () => {
    if (!rawSilhouetteCanvas) return null;
    const cv = getCV();
    if (!cv) return null;

    const src = cv.imread(rawSilhouetteCanvas);
    const srcGray = new cv.Mat();
    cv.cvtColor(src, srcGray, cv.COLOR_RGBA2GRAY);

    const preprocessedMat = preprocessSilhouette(
      srcGray,
      targetW,
      targetH,
      useEdges,
      thresh1,
      thresh2,
      useCustomShape,
      groundBottom
    );

    const hiResCanvas = document.createElement('canvas');
    hiResCanvas.width = preprocessedMat.cols;
    hiResCanvas.height = preprocessedMat.rows;

    const threshMat = new cv.Mat();
    cv.threshold(preprocessedMat, threshMat, 127, 255, cv.THRESH_BINARY_INV);
    const contours = new cv.MatVector();
    const hierarchy = new cv.Mat();
    cv.findContours(threshMat, contours, hierarchy, cv.RETR_CCOMP, cv.CHAIN_APPROX_TC89_L1);

    drawContoursToCanvas(hiResCanvas, contours, hierarchy);

    src.delete();
    srcGray.delete();
    preprocessedMat.delete();
    threshMat.delete();
    contours.delete();
    hierarchy.delete();

    return hiResCanvas;
  };

  const getHiResTemplateCanvas = () => {
    if (!rawSilhouetteCanvas) return null;
    const cv = getCV();
    if (!cv) return null;

    const exportRes = 12.0; // 12 px/mm (print resolution)

    const src = cv.imread(rawSilhouetteCanvas);
    const srcGray = new cv.Mat();
    cv.cvtColor(src, srcGray, cv.COLOR_RGBA2GRAY);

    const preprocessedMat = preprocessSilhouette(
      srcGray,
      targetW,
      targetH,
      useEdges,
      thresh1,
      thresh2,
      useCustomShape,
      groundBottom
    );

    const hiResTargetCanvas = document.createElement('canvas');
    hiResTargetCanvas.width = preprocessedMat.cols;
    hiResTargetCanvas.height = preprocessedMat.rows;

    const threshMat = new cv.Mat();
    cv.threshold(preprocessedMat, threshMat, 127, 255, cv.THRESH_BINARY_INV);
    const contours = new cv.MatVector();
    const hierarchy = new cv.Mat();
    cv.findContours(threshMat, contours, hierarchy, cv.RETR_CCOMP, cv.CHAIN_APPROX_TC89_L1);

    drawContoursToCanvas(hiResTargetCanvas, contours, hierarchy);

    const targetImgData = hiResTargetCanvas.getContext('2d')?.getImageData(0, 0, hiResTargetCanvas.width, hiResTargetCanvas.height);
    if (!targetImgData) {
      src.delete();
      srcGray.delete();
      preprocessedMat.delete();
      threshMat.delete();
      contours.delete();
      hierarchy.delete();
      return null;
    }

    const imgScaleFract = scale / 100.0;

    const leftPanel = projectWallPanel('left', targetImgData, targetW, targetH, boxW, boxH, boxD, 
                                       frontZ, frontZ + boxD, lightZ, exportRes, panelType, imgScaleFract, offsetX, offsetY);
    const rightPanel = projectWallPanel('right', targetImgData, targetW, targetH, boxW, boxH, boxD, 
                                        frontZ, frontZ + boxD, lightZ, exportRes, panelType, imgScaleFract, offsetX, offsetY);
    const topPanel = projectWallPanel('top', targetImgData, targetW, targetH, boxW, boxH, boxD, 
                                      frontZ, frontZ + boxD, lightZ, exportRes, panelType, imgScaleFract, offsetX, offsetY);
    const bottomPanel = projectWallPanel('bottom', targetImgData, targetW, targetH, boxW, boxH, boxD, 
                                         frontZ, frontZ + boxD, lightZ, exportRes, panelType, imgScaleFract, offsetX, offsetY);

    const hiResCrossCanvas = assembleCrossFoldLayout(leftPanel, rightPanel, topPanel, bottomPanel, boxW, boxH, boxD, exportRes, panelType, drawSlits);

    src.delete();
    srcGray.delete();
    preprocessedMat.delete();
    threshMat.delete();
    contours.delete();
    hierarchy.delete();

    return hiResCrossCanvas;
  };

  const handleExportTarget = (format: 'svg' | 'pdf' | 'png' | 'jpg') => {
    if (!rawSilhouetteCanvas) {
      alert("Please load or generate a silhouette first!");
      return;
    }
    const hiRes = getHiResTargetCanvas();
    if (!hiRes) return;

    if (format === 'svg') downloadCanvasAsSVG(hiRes, "preprocessed_silhouette");
    else if (format === 'pdf') downloadCanvasAsPDF(hiRes, "preprocessed_silhouette");
    else downloadCanvasAsImage(hiRes, "preprocessed_silhouette", format);
  };

  const handleExportTemplate = (format: 'svg' | 'pdf' | 'png' | 'jpg') => {
    if (!crossCanvas) {
      alert("Please generate a preview first!");
      return;
    }
    const hiRes = getHiResTemplateCanvas();
    if (!hiRes) return;

    if (format === 'svg') downloadCanvasAsSVG(hiRes, "unfolded_lamp_template");
    else if (format === 'pdf') downloadCanvasAsPDF(hiRes, "unfolded_lamp_template");
    else downloadCanvasAsImage(hiRes, "unfolded_lamp_template", format);
  };

  const handleExportZip = () => {
    if (!rawSilhouetteCanvas || !crossCanvas) {
      alert("Please generate a preview first!");
      return;
    }
    exportZipArchive(
      rawSilhouetteCanvas,
      boxW,
      boxH,
      boxD,
      lightZ,
      frontZ,
      targetW,
      targetH,
      panelType,
      useEdges,
      thresh1,
      thresh2,
      useCustomShape,
      groundBottom,
      drawSlits,
      scale,
      offsetX,
      offsetY,
      preprocessSilhouette,
      selectedFormats
    );
  };

  return (
    <div className={`workspace-panel ${active ? 'active' : ''}`} id="panel-maker">
      <div className="sidebar">
        {/* Silhouette Placement */}
        <div className="card">
          <div className="card-title">
            <i className="fa-solid fa-arrows-to-eye" style={{ color: 'var(--primary)' }}></i> Silhouette Placement
          </div>
          
          <div className="input-group">
            <label className="file-upload-btn" htmlFor="imageFileInput">
              <i className="fa-solid fa-cloud-arrow-up"></i>
              <span>{fileName}</span>
            </label>
            <input 
              type="file" 
              id="imageFileInput" 
              accept="image/*" 
              style={{ display: 'none' }} 
              onChange={handleFileChange}
            />
          </div>

          <SliderControl 
            label="Scale (%)"
            min={10}
            max={500}
            value={scale}
            suffix="%"
            onChange={setScale}
          />
          <SliderControl 
            label="Shift X (mm)"
            min={-500}
            max={500}
            value={offsetX}
            suffix=" mm"
            onChange={setOffsetX}
          />
          <SliderControl 
            label="Shift Y (mm)"
            min={-500}
            max={500}
            value={offsetY}
            suffix=" mm"
            onChange={setOffsetY}
          />
          <button className="btn btn-secondary" onClick={autoFitSilhouette}>
            <i className="fa-solid fa-wand-magic-sparkles"></i> Auto-Fit Silhouette
          </button>
        </div>

        {/* Box Physical Dimensions */}
        <details>
          <summary>
            <i className="fa-solid fa-cube" style={{ color: 'var(--primary)', marginRight: '8px' }}></i> Box Dimensions (mm)
          </summary>
          <div className="details-content">
            <div className="form-grid">
              <div className="input-group">
                <label>Width (X)</label>
                <input 
                  type="number" 
                  value={boxW} 
                  onChange={(e) => setBoxW(parseFloat(e.target.value) || 0)} 
                  step="0.1"
                />
              </div>
              <div className="input-group">
                <label>Height (Y)</label>
                <input 
                  type="number" 
                  value={boxH} 
                  onChange={(e) => setBoxH(parseFloat(e.target.value) || 0)} 
                  step="0.1"
                />
              </div>
              <div className="input-group full-width">
                <label>Depth (Z)</label>
                <input 
                  type="number" 
                  value={boxD} 
                  onChange={(e) => setBoxD(parseFloat(e.target.value) || 0)} 
                  step="0.1"
                />
              </div>
            </div>
          </div>
        </details>

        {/* Optical Distances and Target Display */}
        <details>
          <summary>
            <i className="fa-solid fa-lightbulb" style={{ color: 'var(--primary)', marginRight: '8px' }}></i> Optical Settings (mm)
          </summary>
          <div className="details-content">
            <div className="form-grid">
              <div className="input-group">
                <label>Light Source Z</label>
                <input 
                  type="number" 
                  value={lightZ} 
                  onChange={(e) => setLightZ(parseFloat(e.target.value) || 0)} 
                  step="0.1"
                />
              </div>
              <div className="input-group">
                <label>Front Opening Z</label>
                <input 
                  type="number" 
                  value={frontZ} 
                  onChange={(e) => setFrontZ(parseFloat(e.target.value) || 0)} 
                  step="0.1"
                />
              </div>
              <div className="input-group">
                <label>Target Width</label>
                <input 
                  type="number" 
                  value={targetW} 
                  onChange={(e) => setTargetW(parseFloat(e.target.value) || 0)} 
                  step="0.1"
                />
              </div>
              <div className="input-group">
                <label>Target Height</label>
                <input 
                  type="number" 
                  value={targetH} 
                  onChange={(e) => setTargetH(parseFloat(e.target.value) || 0)} 
                  step="0.1"
                />
              </div>
            </div>
          </div>
        </details>

        {/* Settings & Outputs */}
        <details>
          <summary>
            <i className="fa-solid fa-sliders" style={{ color: 'var(--primary)', marginRight: '8px' }}></i> Settings & Outputs
          </summary>
          <div className="details-content">
            <div className="input-group">
              <label>Resolution (pixels/mm)</label>
              <input 
                type="number" 
                value={resolution} 
                onChange={(e) => setResolution(parseFloat(e.target.value) || 1)} 
                step="0.1"
              />
            </div>
            
            <div className="input-group">
              <label>Panel Type</label>
              <label className="radio-option">
                <input 
                  type="radio" 
                  name="panel_type" 
                  value="255" 
                  checked={panelType === 255} 
                  onChange={() => setPanelType(255)}
                />
                <span>Cutout (White bg / Solid cuts)</span>
              </label>
              <label className="radio-option">
                <input 
                  type="radio" 
                  name="panel_type" 
                  value="0" 
                  checked={panelType === 0} 
                  onChange={() => setPanelType(0)}
                />
                <span>Solid (Black bg / Cutout holes)</span>
              </label>
            </div>

            <div className="input-group" style={{ borderTop: '1px solid var(--card-border)', paddingTop: '10px' }}>
              <label className="checkbox-group">
                <input 
                  type="checkbox" 
                  checked={useEdges} 
                  onChange={(e) => setUseEdges(e.target.checked)}
                />
                <span>Outline Mode (Canny Edges)</span>
              </label>
            </div>

            {useEdges && (
              <div className="form-grid">
                <div className="input-group">
                  <label>Thresh 1</label>
                  <input 
                    type="number" 
                    value={thresh1} 
                    onChange={(e) => setThresh1(parseInt(e.target.value) || 0)}
                  />
                </div>
                <div className="input-group">
                  <label>Thresh 2</label>
                  <input 
                    type="number" 
                    value={thresh2} 
                    onChange={(e) => setThresh2(parseInt(e.target.value) || 0)}
                  />
                </div>
              </div>
            )}

            <div className="input-group" style={{ borderTop: '1px solid var(--card-border)', paddingTop: '10px' }}>
              <label className="checkbox-group">
                <input 
                  type="checkbox" 
                  checked={useCustomShape} 
                  onChange={(e) => setUseCustomShape(e.target.checked)}
                />
                <span>Custom Panel Shape (Silhouette)</span>
              </label>
            </div>

            <div className="input-group">
              <label className="checkbox-group">
                <input 
                  type="checkbox" 
                  checked={groundBottom} 
                  onChange={(e) => setGroundBottom(e.target.checked)}
                />
                <span>Ground Bottom Silhouette</span>
              </label>
            </div>

            <div className="input-group">
              <label className="checkbox-group">
                <input 
                  type="checkbox" 
                  checked={drawSlits} 
                  onChange={(e) => setDrawSlits(e.target.checked)}
                />
                <span>Add Alignment Slits (Mortise)</span>
              </label>
            </div>
          </div>
        </details>

        {/* Generate / Export buttons */}
        <div className="sticky-footer">
          <button className="btn btn-secondary" onClick={updateProjections}>
            <i className="fa-solid fa-play"></i> Generate
          </button>
          <button className="btn" onClick={() => setIsModalOpen(true)}>
            <i className="fa-solid fa-file-zipper"></i> Export ZIP
          </button>
        </div>
      </div>

      {/* Previews for Maker */}
      <div className="canvas-area">
        <div className="grid-workspace">
          <div className="preview-card">
            <div className="preview-header">
              <div className="preview-header-title">
                <i className="fa-solid fa-bullseye"></i> Preprocessed Silhouette
              </div>
            </div>
            <div className="canvas-frame">
              <canvas ref={targetCanvasRef}></canvas>
            </div>
            <div className="download-formats-bar" style={{ display: 'flex', gap: '8px', borderTop: '1px solid var(--card-border)', paddingTop: '12px', marginTop: '5px', flexShrink: 0, alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap' }}>
              <span style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-muted)' }}>DOWNLOAD SILHOUETTE:</span>
              <div style={{ display: 'flex', gap: '6px' }}>
                <button className="btn btn-secondary" onClick={() => handleExportTarget('svg')} style={{ padding: '6px 12px', fontSize: '0.8rem', fontWeight: 700, borderColor: 'rgba(0, 240, 255, 0.35)', color: 'var(--primary)' }}><i className="fa-solid fa-file-code"></i> SVG</button>
                <button className="btn btn-secondary" onClick={() => handleExportTarget('pdf')} style={{ padding: '6px 12px', fontSize: '0.8rem', fontWeight: 700, borderColor: 'rgba(0, 240, 255, 0.35)', color: 'var(--primary)' }}><i className="fa-solid fa-file-pdf"></i> PDF</button>
                <button className="btn btn-secondary" onClick={() => handleExportTarget('png')} style={{ padding: '6px 12px', fontSize: '0.8rem', fontWeight: 700, borderColor: 'rgba(0, 240, 255, 0.35)', color: 'var(--primary)' }}><i className="fa-solid fa-file-image"></i> PNG</button>
                <button className="btn btn-secondary" onClick={() => handleExportTarget('jpg')} style={{ padding: '6px 12px', fontSize: '0.8rem', fontWeight: 700, borderColor: 'rgba(0, 240, 255, 0.35)', color: 'var(--primary)' }}><i className="fa-solid fa-file-image"></i> JPG</button>
              </div>
            </div>
          </div>

          <div className="preview-card">
            <div className="preview-header">
              <div className="preview-header-title">
                <i className="fa-solid fa-map"></i> Unfolded 3D Lamp Template
              </div>
            </div>
            <div className="canvas-frame">
              <canvas ref={crossCanvasRef}></canvas>
            </div>
            <div className="download-formats-bar" style={{ display: 'flex', gap: '8px', borderTop: '1px solid var(--card-border)', paddingTop: '12px', marginTop: '5px', flexShrink: 0, alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap' }}>
              <span style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-muted)' }}>DOWNLOAD TEMPLATE:</span>
              <div style={{ display: 'flex', gap: '6px' }}>
                <button className="btn btn-secondary" onClick={() => handleExportTemplate('svg')} style={{ padding: '6px 12px', fontSize: '0.8rem', fontWeight: 700, borderColor: 'rgba(0, 240, 255, 0.35)', color: 'var(--primary)' }}><i className="fa-solid fa-file-code"></i> SVG</button>
                <button className="btn btn-secondary" onClick={() => handleExportTemplate('pdf')} style={{ padding: '6px 12px', fontSize: '0.8rem', fontWeight: 700, borderColor: 'rgba(0, 240, 255, 0.35)', color: 'var(--primary)' }}><i className="fa-solid fa-file-pdf"></i> PDF</button>
                <button className="btn btn-secondary" onClick={() => handleExportTemplate('png')} style={{ padding: '6px 12px', fontSize: '0.8rem', fontWeight: 700, borderColor: 'rgba(0, 240, 255, 0.35)', color: 'var(--primary)' }}><i className="fa-solid fa-file-image"></i> PNG</button>
                <button className="btn btn-secondary" onClick={() => handleExportTemplate('jpg')} style={{ padding: '6px 12px', fontSize: '0.8rem', fontWeight: 700, borderColor: 'rgba(0, 240, 255, 0.35)', color: 'var(--primary)' }}><i className="fa-solid fa-file-image"></i> JPG</button>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Export Format Selector Modal */}
      {isModalOpen && (
        <div className="modal-backdrop" onClick={() => setIsModalOpen(false)}>
          <div className="modal-card" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <i className="fa-solid fa-file-zipper" style={{ color: 'var(--primary)' }}></i>
              <span>Select Export Formats</span>
            </div>
            
            <div className="modal-body">
              <div 
                className={`format-option-row ${selectedFormats.svg ? 'active' : ''}`}
                onClick={() => setSelectedFormats({ ...selectedFormats, svg: !selectedFormats.svg })}
              >
                <div>
                  <div className="format-label-title">SVG Vector Contours</div>
                  <div className="format-label-desc">Best for laser cutters, CNC routers, & Illustrator.</div>
                </div>
                <input 
                  type="checkbox" 
                  checked={selectedFormats.svg} 
                  onChange={() => {}} 
                  style={{ accentColor: 'var(--primary)', width: '18px', height: '18px' }}
                />
              </div>

              <div 
                className={`format-option-row ${selectedFormats.pdf ? 'active' : ''}`}
                onClick={() => setSelectedFormats({ ...selectedFormats, pdf: !selectedFormats.pdf })}
              >
                <div>
                  <div className="format-label-title">PDF Document Layout</div>
                  <div className="format-label-desc">Ideal for direct high-resolution printing.</div>
                </div>
                <input 
                  type="checkbox" 
                  checked={selectedFormats.pdf} 
                  onChange={() => {}} 
                  style={{ accentColor: 'var(--primary)', width: '18px', height: '18px' }}
                />
              </div>

              <div 
                className={`format-option-row ${selectedFormats.png ? 'active' : ''}`}
                onClick={() => setSelectedFormats({ ...selectedFormats, png: !selectedFormats.png })}
              >
                <div>
                  <div className="format-label-title">PNG Raster Images</div>
                  <div className="format-label-desc">Lossless transparency and clean details.</div>
                </div>
                <input 
                  type="checkbox" 
                  checked={selectedFormats.png} 
                  onChange={() => {}} 
                  style={{ accentColor: 'var(--primary)', width: '18px', height: '18px' }}
                />
              </div>

              <div 
                className={`format-option-row ${selectedFormats.jpg ? 'active' : ''}`}
                onClick={() => setSelectedFormats({ ...selectedFormats, jpg: !selectedFormats.jpg })}
              >
                <div>
                  <div className="format-label-title">JPEG Compressed Images</div>
                  <div className="format-label-desc">Standard image format for previews & sharing.</div>
                </div>
                <input 
                  type="checkbox" 
                  checked={selectedFormats.jpg} 
                  onChange={() => {}} 
                  style={{ accentColor: 'var(--primary)', width: '18px', height: '18px' }}
                />
              </div>
            </div>

            <div className="modal-footer">
              <button className="btn btn-secondary" onClick={() => setIsModalOpen(false)}>Cancel</button>
              <button 
                className="btn" 
                onClick={() => {
                  if (!Object.values(selectedFormats).some(v => v)) {
                    alert("Please select at least one format!");
                    return;
                  }
                  setIsModalOpen(false);
                  handleExportZip();
                }}
              >
                Export ZIP
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
