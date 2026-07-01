import { jsPDF } from 'jspdf';
import JSZip from 'jszip';
import { getCV } from './opencv';
import { drawContoursToCanvas, projectWallPanel, assembleCrossFoldLayout, extrudePanelToSTL, generateFoldedBoxSTL } from './projector';
import type { PanelResult } from './projector';

export function downloadCanvasAsSTL(canvas: HTMLCanvasElement, filename: string, thicknessMm: number, pixelsPerMm: number) {
  let ctx = canvas.getContext('2d');
  if (!ctx) return;
  let imgData = ctx.getImageData(0, 0, canvas.width, canvas.height);
  let w = canvas.width;
  let h = canvas.height;
  let panelData = new Uint8Array(w * h);
  for (let i = 0; i < w * h; i++) {
    panelData[i] = imgData.data[i * 4]; // Red channel
  }
  let arrayBuffer = extrudePanelToSTL(panelData, w, h, thicknessMm, pixelsPerMm);
  let blob = new Blob([arrayBuffer], { type: "application/octet-stream" });
  let link = document.createElement('a');
  link.download = `${filename}.stl`;
  link.href = URL.createObjectURL(blob);
  link.click();
}

export function downloadCanvasAsImage(canvas: HTMLCanvasElement, filename: string, format: 'png' | 'jpg') {
  let dataUrl: string;
  if (format === 'png') {
    dataUrl = canvas.toDataURL("image/png");
  } else {
    let temp = document.createElement('canvas');
    temp.width = canvas.width;
    temp.height = canvas.height;
    let ctx = temp.getContext('2d');
    if (ctx) {
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(0, 0, temp.width, temp.height);
      ctx.drawImage(canvas, 0, 0);
    }
    dataUrl = temp.toDataURL("image/jpeg", 0.95);
  }
  let a = document.createElement('a');
  a.download = `${filename}.${format}`;
  a.href = dataUrl;
  a.click();
}

export function downloadCanvasAsPDF(canvas: HTMLCanvasElement, filename: string) {
  let temp = document.createElement('canvas');
  temp.width = canvas.width;
  temp.height = canvas.height;
  let ctx = temp.getContext('2d');
  if (ctx) {
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, temp.width, temp.height);
    ctx.drawImage(canvas, 0, 0);
  }
  let imgData = temp.toDataURL("image/jpeg", 0.9);
  
  let isLandscape = canvas.width > canvas.height;
  let pdf = new jsPDF({
    orientation: isLandscape ? 'landscape' : 'portrait',
    unit: 'px',
    format: [canvas.width, canvas.height]
  });
  pdf.addImage(imgData, 'JPEG', 0, 0, canvas.width, canvas.height);
  pdf.save(`${filename}.pdf`);
}

export function downloadCanvasAsSVG(canvas: HTMLCanvasElement, filename: string) {
  const cv = getCV();
  if (!cv) {
    alert("OpenCV is not loaded yet!");
    return;
  }
  
  let src = cv.imread(canvas);
  let srcGray = new cv.Mat();
  cv.cvtColor(src, srcGray, cv.COLOR_RGBA2GRAY);
  
  let thresh = new cv.Mat();
  cv.threshold(srcGray, thresh, 127, 255, cv.THRESH_BINARY_INV);
  
  let contours = new cv.MatVector();
  let hierarchy = new cv.Mat();
  cv.findContours(thresh, contours, hierarchy, cv.RETR_CCOMP, cv.CHAIN_APPROX_TC89_L1);
  
  let width = canvas.width;
  let height = canvas.height;
  
  let svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" width="${width}" height="${height}">\n`;
  svg += `  <rect width="100%" height="100%" fill="white"/>\n`;
  
  for (let i = 0; i < contours.size(); i++) {
    let contour = contours.get(i);
    let parent = hierarchy.data32S[i * 4 + 3];
    
    if (contour.rows > 0) {
      let pathData = "";
      let p0_x = contour.data32S[0];
      let p0_y = contour.data32S[1];
      pathData += `M ${p0_x} ${p0_y}`;
      for (let j = 1; j < contour.rows; j++) {
        let x = contour.data32S[j * 2];
        let y = contour.data32S[j * 2 + 1];
        pathData += ` L ${x} ${y}`;
      }
      pathData += " Z";
      
      let fill = (parent === -1) ? "black" : "white";
      svg += `  <path d="${pathData}" fill="${fill}" stroke="none"/>\n`;
    }
  }
  
  svg += "</svg>";
  
  src.delete(); srcGray.delete(); thresh.delete(); contours.delete(); hierarchy.delete();
  
  let blob = new Blob([svg], {type: "image/svg+xml;charset=utf-8"});
  let link = document.createElement('a');
  link.download = `${filename}.svg`;
  link.href = URL.createObjectURL(blob);
  link.click();
}

export function exportZipArchive(
  rawTargetImage: HTMLCanvasElement | HTMLImageElement,
  box_w: number,
  box_h: number,
  box_d: number,
  light_z: number,
  front_z: number,
  target_w: number,
  target_h: number,
  panel_bg: number,
  use_edges: boolean,
  thresh1: number,
  thresh2: number,
  use_custom_shape: boolean,
  ground_bottom: boolean,
  draw_slits: boolean,
  img_scale: number,
  offset_x: number,
  offset_y: number,
  preprocessSilhouetteFn: any,
  formats: { svg: boolean; pdf: boolean; png: boolean; jpg: boolean; stl: boolean },
  thickness_mm: number
) {
  const cv = getCV();
  if (!cv) return;
  
  let zip = new JSZip();
  
  function createPanelCanvas(panelObj: PanelResult) {
    let c = document.createElement('canvas');
    c.width = panelObj.width;
    c.height = panelObj.height;
    let ctx = c.getContext('2d');
    if (ctx) {
      let imgData = ctx.createImageData(panelObj.width, panelObj.height);
      for (let i = 0; i < panelObj.data.length; i++) {
        let val = panelObj.data[i];
        imgData.data[i * 4] = val;
        imgData.data[i * 4 + 1] = val;
        imgData.data[i * 4 + 2] = val;
        imgData.data[i * 4 + 3] = 255;
      }
      ctx.putImageData(imgData, 0, 0);
    }
    return c;
  }

  function convertCanvasToSVG(canvasElement: HTMLCanvasElement): string {
    let src = cv.imread(canvasElement);
    let srcGray = new cv.Mat();
    cv.cvtColor(src, srcGray, cv.COLOR_RGBA2GRAY);
    
    let thresh = new cv.Mat();
    cv.threshold(srcGray, thresh, 127, 255, cv.THRESH_BINARY_INV);
    
    let contours = new cv.MatVector();
    let hierarchy = new cv.Mat();
    cv.findContours(thresh, contours, hierarchy, cv.RETR_CCOMP, cv.CHAIN_APPROX_TC89_L1);
    
    let width = canvasElement.width;
    let height = canvasElement.height;
    
    let svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" width="${width}" height="${height}">\n`;
    svg += `  <rect width="100%" height="100%" fill="white"/>\n`;
    
    for (let i = 0; i < contours.size(); i++) {
      let contour = contours.get(i);
      let parent = hierarchy.data32S[i * 4 + 3];
      
      if (contour.rows > 0) {
        let pathData = "";
        let p0_x = contour.data32S[0];
        let p0_y = contour.data32S[1];
        pathData += `M ${p0_x} ${p0_y}`;
        for (let j = 1; j < contour.rows; j++) {
          let x = contour.data32S[j * 2];
          let y = contour.data32S[j * 2 + 1];
          pathData += ` L ${x} ${y}`;
        }
        pathData += " Z";
        
        let fill = (parent === -1) ? "black" : "white";
        svg += `  <path d="${pathData}" fill="${fill}" stroke="none"/>\n`;
      }
    }
    
    svg += "</svg>";
    
    src.delete(); srcGray.delete(); thresh.delete(); contours.delete(); hierarchy.delete();
    return svg;
  }

  function addCanvasToZip(canvasName: string, canvasElement: HTMLCanvasElement) {
    if (formats.png) {
      let dataUrl = canvasElement.toDataURL("image/png");
      let dataBase64 = dataUrl.split(',')[1];
      zip.file(`${canvasName}.png`, dataBase64, {base64: true});
    }
    if (formats.jpg) {
      let temp = document.createElement('canvas');
      temp.width = canvasElement.width;
      temp.height = canvasElement.height;
      let ctx = temp.getContext('2d');
      if (ctx) {
        ctx.fillStyle = "#ffffff";
        ctx.fillRect(0, 0, temp.width, temp.height);
        ctx.drawImage(canvasElement, 0, 0);
      }
      let dataUrl = temp.toDataURL("image/jpeg", 0.95);
      let dataBase64 = dataUrl.split(',')[1];
      zip.file(`${canvasName}.jpg`, dataBase64, {base64: true});
    }
    if (formats.pdf) {
      let temp = document.createElement('canvas');
      temp.width = canvasElement.width;
      temp.height = canvasElement.height;
      let ctx = temp.getContext('2d');
      if (ctx) {
        ctx.fillStyle = "#ffffff";
        ctx.fillRect(0, 0, temp.width, temp.height);
        ctx.drawImage(canvasElement, 0, 0);
      }
      let imgData = temp.toDataURL("image/jpeg", 0.9);
      let isLandscape = canvasElement.width > canvasElement.height;
      let pdf = new jsPDF({
        orientation: isLandscape ? 'landscape' : 'portrait',
        unit: 'px',
        format: [canvasElement.width, canvasElement.height]
      });
      pdf.addImage(imgData, 'JPEG', 0, 0, canvasElement.width, canvasElement.height);
      let arrayBuffer = pdf.output('arraybuffer');
      zip.file(`${canvasName}.pdf`, arrayBuffer);
    }
    if (formats.svg) {
      let svgStr = convertCanvasToSVG(canvasElement);
      zip.file(`${canvasName}.svg`, svgStr);
    }
  }

  function addPanelSTLToZip(panelName: string, panelObj: PanelResult, pixelsPerMm: number, wallName: string) {
    let arrayBuffer = extrudePanelToSTL(
      panelObj.data,
      panelObj.width,
      panelObj.height,
      thickness_mm,
      pixelsPerMm,
      wallName,
      box_w,
      box_h,
      box_d,
      light_z,
      front_z,
      panel_bg
    );
    zip.file(`${panelName}.stl`, arrayBuffer);
  }

  function addTargetSTLToZip(canvasName: string, canvasElement: HTMLCanvasElement) {
    let ctx = canvasElement.getContext('2d')!;
    let imgData = ctx.getImageData(0, 0, canvasElement.width, canvasElement.height);
    let w = canvasElement.width;
    let h = canvasElement.height;
    let panelData = new Uint8Array(w * h);
    for (let i = 0; i < w * h; i++) {
      panelData[i] = imgData.data[i * 4];
    }
    let targetPxPerMm = w / target_w;
    let arrayBuffer = extrudePanelToSTL(panelData, w, h, thickness_mm, targetPxPerMm, undefined, undefined, undefined, undefined, undefined, undefined, panel_bg);
    zip.file(`${canvasName}.stl`, arrayBuffer);
  }

  let exportRes = 12.0; // 12 pixels/mm
  
  let src = cv.imread(rawTargetImage);
  let srcGray = new cv.Mat();
  cv.cvtColor(src, srcGray, cv.COLOR_RGBA2GRAY);
  
  let preprocessedMat = preprocessSilhouetteFn(srcGray, target_w, target_h, use_edges, thresh1, thresh2, use_custom_shape, ground_bottom);
  
  let hiResTargetCanvas = document.createElement('canvas');
  hiResTargetCanvas.width = preprocessedMat.cols;
  hiResTargetCanvas.height = preprocessedMat.rows;
  
  let threshMat = new cv.Mat();
  cv.threshold(preprocessedMat, threshMat, 127, 255, cv.THRESH_BINARY_INV);
  
  let contours = new cv.MatVector();
  let hierarchy = new cv.Mat();
  cv.findContours(threshMat, contours, hierarchy, cv.RETR_CCOMP, cv.CHAIN_APPROX_TC89_L1);
  
  drawContoursToCanvas(hiResTargetCanvas, contours, hierarchy);
  
  let hiResTargetImgData = hiResTargetCanvas.getContext('2d')!.getImageData(0, 0, hiResTargetCanvas.width, hiResTargetCanvas.height);
  
  let hiResWallLeft = projectWallPanel('left', hiResTargetImgData, target_w, target_h, box_w, box_h, box_d, 
                                       front_z, front_z + box_d, light_z, exportRes, panel_bg, img_scale, offset_x, offset_y);
  let hiResWallRight = projectWallPanel('right', hiResTargetImgData, target_w, target_h, box_w, box_h, box_d, 
                                        front_z, front_z + box_d, light_z, exportRes, panel_bg, img_scale, offset_x, offset_y);
  let hiResWallTop = projectWallPanel('top', hiResTargetImgData, target_w, target_h, box_w, box_h, box_d, 
                                       front_z, front_z + box_d, light_z, exportRes, panel_bg, img_scale, offset_x, offset_y);
  let hiResWallBottom = projectWallPanel('bottom', hiResTargetImgData, target_w, target_h, box_w, box_h, box_d, 
                                          front_z, front_z + box_d, light_z, exportRes, panel_bg, img_scale, offset_x, offset_y);
                                          
  let hiResCrossCanvas = assembleCrossFoldLayout(hiResWallLeft, hiResWallRight, hiResWallTop, hiResWallBottom, 
                                                 box_w, box_h, box_d, exportRes, panel_bg, draw_slits);
  
  addCanvasToZip("wall_left", createPanelCanvas(hiResWallLeft));
  addCanvasToZip("wall_right", createPanelCanvas(hiResWallRight));
  addCanvasToZip("wall_top", createPanelCanvas(hiResWallTop));
  addCanvasToZip("wall_bottom", createPanelCanvas(hiResWallBottom));
  addCanvasToZip("cross_fold_layout", hiResCrossCanvas);
  addCanvasToZip("preprocessed_target", hiResTargetCanvas);

  if (formats.stl) {
    addPanelSTLToZip("wall_left", hiResWallLeft, exportRes, "left");
    addPanelSTLToZip("wall_right", hiResWallRight, exportRes, "right");
    addPanelSTLToZip("wall_top", hiResWallTop, exportRes, "top");
    addPanelSTLToZip("wall_bottom", hiResWallBottom, exportRes, "bottom");
    addTargetSTLToZip("preprocessed_target", hiResTargetCanvas);
    
    // Extrude cross layout
    let crossCtx = hiResCrossCanvas.getContext('2d')!;
    let crossImgData = crossCtx.getImageData(0, 0, hiResCrossCanvas.width, hiResCrossCanvas.height);
    let crossW = hiResCrossCanvas.width;
    let crossH = hiResCrossCanvas.height;
    let crossPanelData = new Uint8Array(crossW * crossH);
    for (let i = 0; i < crossW * crossH; i++) {
      crossPanelData[i] = crossImgData.data[i * 4];
    }
    let crossArrayBuffer = extrudePanelToSTL(crossPanelData, crossW, crossH, thickness_mm, exportRes, undefined, undefined, undefined, undefined, undefined, undefined, panel_bg);
    zip.file("cross_fold_layout.stl", crossArrayBuffer);

    // Extrude folded box
    let foldedBoxArrayBuffer = generateFoldedBoxSTL(
      hiResWallLeft,
      hiResWallRight,
      hiResWallTop,
      hiResWallBottom,
      box_w,
      box_h,
      box_d,
      light_z,
      front_z,
      exportRes,
      thickness_mm,
      panel_bg
    );
    zip.file("folded_box.stl", foldedBoxArrayBuffer);
  }
  
  src.delete(); srcGray.delete(); preprocessedMat.delete(); threshMat.delete(); contours.delete(); hierarchy.delete();
  
  zip.generateAsync({type:"blob"}).then(function(content) {
    let link = document.createElement('a');
    link.download = "shadow_lamp_panels.zip";
    link.href = URL.createObjectURL(content);
    link.click();
  });
}
