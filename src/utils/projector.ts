import { getCV } from './opencv';
import * as THREE from 'three';

export interface PanelResult {
  data: Uint8Array;
  width: number;
  height: number;
}

export function preprocessSilhouette(
  srcMat: any,
  target_w_mm: number,
  target_h_mm: number,
  use_edges: boolean,
  thresh1: number,
  thresh2: number,
  use_custom_shape: boolean,
  ground_bottom: boolean
): any {
  const cv = getCV();
  if (!cv) return null;

  let binary = new cv.Mat();
  let target_aspect = target_w_mm / target_h_mm;
  
  // 1. Base binary threshold
  let thresh = new cv.Mat();
  cv.threshold(srcMat, thresh, 127, 255, cv.THRESH_BINARY);
  
  if (use_edges) {
    let smoothed = new cv.Mat();
    cv.bilateralFilter(srcMat, smoothed, 9, 75, 75);
    let edges = new cv.Mat();
    cv.Canny(smoothed, edges, thresh1, thresh2);
    let kernel = cv.getStructuringElement(cv.MORPH_RECT, new cv.Size(3, 3));
    cv.dilate(edges, edges, kernel);
    cv.bitwise_not(edges, binary);
    
    smoothed.delete(); edges.delete();
  } else {
    thresh.copyTo(binary);
  }
  
  // 2. Custom Shape & Grounding
  if (use_custom_shape && ground_bottom) {
    let body_mask = new cv.Mat();
    cv.threshold(binary, body_mask, 127, 255, cv.THRESH_BINARY_INV);
    
    let h_mask = body_mask.rows;
    let w_mask = body_mask.cols;
    let cols_sum = new Int32Array(w_mask);
    for (let c = 0; c < w_mask; c++) {
      let sum = 0;
      for (let r = 0; r < h_mask; r++) {
        if (body_mask.ucharAt(r, c) > 0) {
          sum += 1;
        }
      }
      cols_sum[c] = sum;
    }
    
    let c_min = -1, c_max = -1;
    for (let c = 0; c < w_mask; c++) {
      if (cols_sum[c] > 0) {
        if (c_min === -1) c_min = c;
        c_max = c;
      }
    }
    
    if (c_min !== -1) {
      let span_w = c_max - c_min;
      let start_c = Math.round(c_min + 0.225 * span_w);
      let end_c = Math.round(c_min + 0.775 * span_w);
      
      for (let c = start_c; c < end_c; c++) {
        let r_max = -1;
        for (let r = h_mask - 1; r >= 0; r--) {
          if (body_mask.ucharAt(r, c) > 0) {
            r_max = r;
            break;
          }
        }
        if (r_max !== -1) {
          for (let r = r_max; r < h_mask; r++) {
            binary.data[r * w_mask + c] = 0; // Ground to black
          }
        }
      }
    }
    body_mask.delete();
  }
  
  thresh.delete();
  
  // 3. Aspect ratio padding
  let img_h = binary.rows;
  let img_w = binary.cols;
  let img_aspect = img_w / img_h;
  
  let padded;
  if (img_aspect > target_aspect) {
    let new_h = Math.round(img_w / target_aspect);
    let pad = Math.round((new_h - img_h) / 2);
    padded = new cv.Mat(new_h, img_w, cv.CV_8UC1, new cv.Scalar(255));
    
    let rect = new cv.Rect(0, pad, img_w, img_h);
    let roi = padded.roi(rect);
    binary.copyTo(roi);
    roi.delete();
  } else {
    let new_w = Math.round(img_h * target_aspect);
    let pad = Math.round((new_w - img_w) / 2);
    padded = new cv.Mat(img_h, new_w, cv.CV_8UC1, new cv.Scalar(255));
    
    let rect = new cv.Rect(pad, 0, img_w, img_h);
    let roi = padded.roi(rect);
    binary.copyTo(roi);
    roi.delete();
  }
  
  binary.delete();
  return padded;
}

export function projectWallPanel(
  wall_name: string,
  targetImgData: ImageData,
  target_w_mm: number,
  target_h_mm: number,
  box_w: number,
  box_h: number,
  box_d: number,
  _Z_start: number,
  Z_end: number,
  Z_light: number,
  pixels_per_mm: number,
  panel_bg: number,
  scale_factor: number,
  offset_x: number,
  offset_y: number
): PanelResult {
  let W_res = Math.round(box_w * pixels_per_mm);
  let H_res = Math.round(box_h * pixels_per_mm);
  let D_res = Math.round(box_d * pixels_per_mm);
  
  let w: number, h: number;
  if (wall_name === 'left' || wall_name === 'right') {
    w = D_res;
    h = H_res;
  } else {
    w = W_res;
    h = D_res;
  }
  
  let panelData = new Uint8Array(w * h);
  panelData.fill(panel_bg);
  
  let tgt_w = targetImgData.width;
  let tgt_h = targetImgData.height;
  let tgt_pixels = targetImgData.data;
  
  for (let r = 0; r < h; r++) {
    for (let c = 0; c < w; c++) {
      let X_wall = 0, Y_wall = 0, Z_wall = 0;
      
      if (wall_name === 'left') {
        Z_wall = Z_end - (c / (D_res - 1)) * box_d;
        Y_wall = box_h / 2.0 - (r / (H_res - 1)) * box_h;
        X_wall = -box_w / 2.0;
      } else if (wall_name === 'right') {
        Z_wall = Z_end - (c / (D_res - 1)) * box_d;
        Y_wall = box_h / 2.0 - (r / (H_res - 1)) * box_h;
        X_wall = box_w / 2.0;
      } else if (wall_name === 'top') {
        X_wall = -box_w / 2.0 + (c / (W_res - 1)) * box_w;
        Z_wall = Z_end - (r / (D_res - 1)) * box_d;
        Y_wall = box_h / 2.0;
      } else if (wall_name === 'bottom') {
        X_wall = -box_w / 2.0 + (c / (W_res - 1)) * box_w;
        Z_wall = Z_end - (r / (D_res - 1)) * box_d;
        Y_wall = -box_h / 2.0;
      }
      
      if (Z_wall >= Z_light) continue;
      
      let denom = Z_light - Z_wall;
      if (Math.abs(denom) < 0.001) {
        denom = denom >= 0 ? 0.001 : -0.001;
      }
      let t = (Z_light - _Z_start) / denom;
      
      let X_w = X_wall * t;
      let Y_w = Y_wall * t;
      
      let X_w_trans = (X_w - offset_x) / scale_factor;
      let Y_w_trans = (Y_w - offset_y) / scale_factor;
      
      let col_tgt_frac = (X_w_trans + target_w_mm / 2.0) / target_w_mm * (tgt_w - 1);
      let row_tgt_frac = ((target_h_mm / 2.0) - Y_w_trans) / target_h_mm * (tgt_h - 1);
      
      if (col_tgt_frac >= 0 && col_tgt_frac < tgt_w && row_tgt_frac >= 0 && row_tgt_frac < tgt_h) {
        let c1 = Math.floor(col_tgt_frac);
        let c2 = Math.min(tgt_w - 1, c1 + 1);
        let r1 = Math.floor(row_tgt_frac);
        let r2 = Math.min(tgt_h - 1, r1 + 1);
        
        let dc = col_tgt_frac - c1;
        let dr = row_tgt_frac - r1;
        
        let val11 = tgt_pixels[(r1 * tgt_w + c1) * 4];
        let val12 = tgt_pixels[(r1 * tgt_w + c2) * 4];
        let val21 = tgt_pixels[(r2 * tgt_w + c1) * 4];
        let val22 = tgt_pixels[(r2 * tgt_w + c2) * 4];
        
        let val = (1 - dc) * (1 - dr) * val11 +
                  dc * (1 - dr) * val12 +
                  (1 - dc) * dr * val21 +
                  dc * dr * val22;
                  
        panelData[r * w + c] = Math.round(val);
      }
    }
  }
  
  if (panel_bg === 0) {
    for (let i = 0; i < panelData.length; i++) {
      panelData[i] = 255 - panelData[i];
    }
  }
  
  return { data: panelData, width: w, height: h };
}

export function assembleCrossFoldLayout(
  left: PanelResult,
  right: PanelResult,
  top: PanelResult,
  bottom: PanelResult,
  box_w: number,
  box_h: number,
  box_d: number,
  pixels_per_mm: number,
  panel_bg: number,
  draw_slits: boolean
): HTMLCanvasElement {
  let W_res = Math.round(box_w * pixels_per_mm);
  let H_res = Math.round(box_h * pixels_per_mm);
  let D_res = Math.round(box_d * pixels_per_mm);
  
  let canvas_w = 2 * D_res + W_res;
  let canvas_h = 2 * D_res + H_res;
  
  let canvas = document.createElement('canvas');
  canvas.width = canvas_w;
  canvas.height = canvas_h;
  let ctx = canvas.getContext('2d');
  if (!ctx) return canvas;
  
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, canvas_w, canvas_h);
  
  let base_x_start = D_res;
  let base_y_start = D_res;
  let base_x_end = D_res + W_res;
  let base_y_end = D_res + H_res;
  
  ctx.fillStyle = '#f0f0f5';
  ctx.fillRect(base_x_start, base_y_start, W_res, H_res);
  
  ctx.strokeStyle = '#646473';
  ctx.lineWidth = 2;
  ctx.strokeRect(base_x_start, base_y_start, W_res, H_res);
  
  let center_x = base_x_start + Math.floor(W_res / 2);
  let center_y = base_y_start + Math.floor(H_res / 2);
  ctx.fillStyle = '#32323c';
  ctx.beginPath();
  ctx.arc(center_x, center_y, Math.round(5 * pixels_per_mm), 0, Math.PI * 2);
  ctx.fill();
  
  function drawPanel(panel: PanelResult, dx: number, dy: number, flipCode?: number) {
    let p = panel;
    if (flipCode !== undefined) {
      p = cvFlip(panel, flipCode);
    }
    let imgData = ctx!.createImageData(p.width, p.height);
    for (let i = 0; i < p.data.length; i++) {
      let val = p.data[i];
      imgData.data[i * 4] = val;
      imgData.data[i * 4 + 1] = val;
      imgData.data[i * 4 + 2] = val;
      imgData.data[i * 4 + 3] = 255;
    }
    ctx!.putImageData(imgData, dx, dy);
  }
  
  function cvFlip(panel: PanelResult, flipCode: number): PanelResult {
    let w = panel.width;
    let h = panel.height;
    let src = panel.data;
    let dst = new Uint8Array(w * h);
    for (let r = 0; r < h; r++) {
      for (let c = 0; c < w; c++) {
        let src_r = r;
        let src_c = c;
        if (flipCode === 0) src_r = h - 1 - r;
        else if (flipCode === 1) src_c = w - 1 - c;
        dst[r * w + c] = src[src_r * w + src_c];
      }
    }
    return { data: dst, width: w, height: h };
  }
  
  drawPanel(top, base_x_start, 0);
  drawPanel(bottom, base_x_start, base_y_end, 0); 
  drawPanel(left, 0, base_y_start);
  drawPanel(right, base_x_end, base_y_start, 1); 
  
  ctx.setLineDash([5, 5]);
  ctx.strokeStyle = '#7f7f8c';
  ctx.lineWidth = 2;
  
  ctx.beginPath();
  ctx.moveTo(base_x_start, base_y_start);
  ctx.lineTo(base_x_end, base_y_start);
  ctx.moveTo(base_x_start, base_y_end);
  ctx.lineTo(base_x_end, base_y_end);
  ctx.moveTo(base_x_start, base_y_start);
  ctx.lineTo(base_x_start, base_y_end);
  ctx.moveTo(base_x_end, base_y_start);
  ctx.lineTo(base_x_end, base_y_end);
  ctx.stroke();
  ctx.setLineDash([]); 
  
  ctx.strokeStyle = '#000000';
  ctx.lineWidth = 3;
  ctx.strokeRect(0, 0, canvas_w, canvas_h);
  
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(0, base_y_start); ctx.lineTo(base_x_start, base_y_start);
  ctx.moveTo(0, base_y_end); ctx.lineTo(base_x_start, base_y_end);
  ctx.moveTo(base_x_end, base_y_start); ctx.lineTo(canvas_w, base_y_start);
  ctx.moveTo(base_x_end, base_y_end); ctx.lineTo(canvas_w, base_y_end);
  
  ctx.moveTo(base_x_start, 0); ctx.lineTo(base_x_start, base_y_start);
  ctx.moveTo(base_x_end, 0); ctx.lineTo(base_x_end, base_y_start);
  ctx.moveTo(base_x_start, base_y_end); ctx.lineTo(base_x_start, canvas_h);
  ctx.moveTo(base_x_end, base_y_end); ctx.lineTo(base_x_end, canvas_h);
  ctx.stroke();
  
  if (draw_slits) {
    let slit_w = Math.max(1, Math.round(3 * pixels_per_mm));
    let slit_l = Math.max(1, Math.round(30 * pixels_per_mm));
    ctx.fillStyle = (panel_bg === 255) ? '#ffffff' : '#000000';
    
    ctx.fillRect(center_x - Math.floor(slit_w/2), base_y_start - Math.floor(slit_l/2), slit_w, slit_l);
    ctx.fillRect(center_x - Math.floor(slit_w/2), base_y_end - Math.floor(slit_l/2), slit_w, slit_l);
    ctx.fillRect(base_x_start - Math.floor(slit_l/2), center_y - Math.floor(slit_w/2), slit_l, slit_w);
    ctx.fillRect(base_x_end - Math.floor(slit_l/2), center_y - Math.floor(slit_w/2), slit_l, slit_w);
  }
  
  ctx.fillStyle = '#8a8a9e';
  ctx.font = '14px Outfit';
  ctx.fillText("LEFT", 20, center_y + 5);
  ctx.fillText("RIGHT", base_x_end + 20, center_y + 5);
  ctx.fillText("TOP", base_x_start + 20, 30);
  ctx.fillText("BOTTOM", base_x_start + 20, base_y_end + 30);
  
  return canvas;
}

export function drawContoursToCanvas(canvas: HTMLCanvasElement, contours: any, hierarchy: any) {
  let ctx = canvas.getContext('2d');
  if (!ctx) return;
  let w = canvas.width;
  let h = canvas.height;
  
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, w, h);
  
  ctx.fillStyle = "#000000";
  for (let i = 0; i < contours.size(); i++) {
    let parent = hierarchy.data32S[i * 4 + 3];
    if (parent === -1) {
      drawSingleContour(ctx, contours.get(i));
      ctx.fill();
    }
  }
  
  ctx.fillStyle = "#ffffff";
  for (let i = 0; i < contours.size(); i++) {
    let parent = hierarchy.data32S[i * 4 + 3];
    if (parent !== -1) {
      drawSingleContour(ctx, contours.get(i));
      ctx.fill();
    }
  }
}

function drawSingleContour(ctx: CanvasRenderingContext2D, contour: any) {
  if (contour.rows === 0) return;
  ctx.beginPath();
  let p0_x = contour.data32S[0];
  let p0_y = contour.data32S[1];
  ctx.moveTo(p0_x, p0_y);
  for (let j = 1; j < contour.rows; j++) {
    let x = contour.data32S[j * 2];
    let y = contour.data32S[j * 2 + 1];
    ctx.lineTo(x, y);
  }
  ctx.closePath();
}

export function extrudePanelToSTL(
  panelData: Uint8Array,
  width: number,
  height: number,
  thicknessMm: number,
  pixelsPerMm: number,
  wallName?: string,
  boxW?: number,
  boxH?: number,
  boxD?: number,
  lightZ?: number,
  frontZ?: number,
  panelBg: number = 255
): ArrayBuffer {
  const cv = getCV();
  if (!cv) return new ArrayBuffer(84);

  // Load into OpenCV mat using direct buffer copy to avoid Invalid array length error on large images
  const mat = new cv.Mat(height, width, cv.CV_8UC1);
  mat.data.set(panelData);
  
  // We ALWAYS use THRESH_BINARY_INV because we want the solid details (value 0) to be white (255)
  // so that we can find their contours!
  const threshMat = new cv.Mat();
  cv.threshold(mat, threshMat, 127, 255, cv.THRESH_BINARY_INV);

  const contours = new cv.MatVector();
  const hierarchy = new cv.Mat();
  cv.findContours(threshMat, contours, hierarchy, cv.RETR_CCOMP, cv.CHAIN_APPROX_TC89_L1);

  const shapes: THREE.Shape[] = [];

  // Winding order helpers
  const forceClockwise = (pts: THREE.Vector2[]) => {
    let sum = 0;
    for (let j = 0; j < pts.length; j++) {
      const p1 = pts[j];
      const p2 = pts[(j + 1) % pts.length];
      sum += (p2.x - p1.x) * (p2.y + p1.y);
    }
    if (sum < 0) pts.reverse();
    return pts;
  };

  const forceCounterClockwise = (pts: THREE.Vector2[]) => {
    let sum = 0;
    for (let j = 0; j < pts.length; j++) {
      const p1 = pts[j];
      const p2 = pts[(j + 1) % pts.length];
      sum += (p2.x - p1.x) * (p2.y + p1.y);
    }
    if (sum > 0) pts.reverse();
    return pts;
  };

  if (panelBg === 0) {
    // ==========================================
    // SOLID MODE: Solid plate with cutout holes
    // ==========================================
    
    // Create the main rectangular outer shape in pixel space (oriented CCW)
    const outerPoints = [
      new THREE.Vector2(0, 0),
      new THREE.Vector2(width, 0),
      new THREE.Vector2(width, height),
      new THREE.Vector2(0, height)
    ];
    const mainShape = new THREE.Shape(outerPoints);
    shapes.push(mainShape);

    // Map to store Level 2 shapes (solid islands inside Level 1 holes)
    const holeToIslandMap = new Map<number, THREE.Shape>();

    // 1. First pass: build Level 1 holes (CW) and Level 2 islands (CCW)
    for (let i = 0; i < contours.size(); i++) {
      const contour = contours.get(i);
      if (contour.rows < 3) continue;

      const area = cv.contourArea(contour);
      if (area < 0.5) continue; // Skip degenerate or zero-area noise

      const parentIdx = hierarchy.data32S[i * 4 + 3];

      const points: THREE.Vector2[] = [];
      for (let j = 0; j < contour.rows; j++) {
        const c_val = contour.data32S[j * 2];
        const r_val = contour.data32S[j * 2 + 1];
        points.push(new THREE.Vector2(c_val, height - r_val));
      }

      if (parentIdx === -1) {
        // Level 1: Cutout Hole (empty space) -> Must be Clockwise
        forceClockwise(points);
        mainShape.holes.push(new THREE.Path(points));
      } else {
        // Level 2: Solid Island inside Level 1 Hole -> Must be Counter-Clockwise
        forceCounterClockwise(points);
        const islandShape = new THREE.Shape(points);
        shapes.push(islandShape);
        holeToIslandMap.set(i, islandShape);
      }
    }

    // 2. Second pass: link Level 3 holes (CW) inside Level 2 islands
    for (let i = 0; i < contours.size(); i++) {
      const parentIdx = hierarchy.data32S[i * 4 + 3];
      if (parentIdx !== -1) {
        const grandParentIdx = hierarchy.data32S[parentIdx * 4 + 3];
        if (grandParentIdx !== -1) {
          // Level 3 hole inside Level 2 island
          const parentIsland = holeToIslandMap.get(parentIdx);
          if (parentIsland) {
            const contour = contours.get(i);
            if (contour.rows >= 3) {
              const points: THREE.Vector2[] = [];
              for (let j = 0; j < contour.rows; j++) {
                const c_val = contour.data32S[j * 2];
                const r_val = contour.data32S[j * 2 + 1];
                points.push(new THREE.Vector2(c_val, height - r_val));
              }
              forceClockwise(points);
              parentIsland.holes.push(new THREE.Path(points));
            }
          }
        }
      }
    }

  } else {
    // ==========================================
    // CUTOUT MODE: Extrude only the solid details (no outer rectangle, no extra border frames)
    // ==========================================

    // Map to store Level 1 shapes (outer details)
    const shapeMap = new Map<number, THREE.Shape>();

    // 1. First pass: build all Level 1 shapes (CCW)
    for (let i = 0; i < contours.size(); i++) {
      const contour = contours.get(i);
      if (contour.rows < 3) continue;

      const area = cv.contourArea(contour);
      if (area < 0.5) continue; // Skip degenerate or zero-area noise

      const parentIdx = hierarchy.data32S[i * 4 + 3];

      if (parentIdx === -1) {
        const points: THREE.Vector2[] = [];
        for (let j = 0; j < contour.rows; j++) {
          const c_val = contour.data32S[j * 2];
          const r_val = contour.data32S[j * 2 + 1];
          points.push(new THREE.Vector2(c_val, height - r_val));
        }
        forceCounterClockwise(points);
        const detailShape = new THREE.Shape(points);
        shapes.push(detailShape);
        shapeMap.set(i, detailShape);
      }
    }

    // 2. Second pass: link Level 2 holes (CW) to parent shapes
    for (let i = 0; i < contours.size(); i++) {
      const parentIdx = hierarchy.data32S[i * 4 + 3];

      if (parentIdx !== -1) {
        const contour = contours.get(i);
        if (contour.rows < 3) continue;

        const area = cv.contourArea(contour);
        if (area < 0.5) continue; // Skip degenerate or zero-area noise

        const parentShape = shapeMap.get(parentIdx);
        if (parentShape) {
          const points: THREE.Vector2[] = [];
          for (let j = 0; j < contour.rows; j++) {
            const c_val = contour.data32S[j * 2];
            const r_val = contour.data32S[j * 2 + 1];
            points.push(new THREE.Vector2(c_val, height - r_val));
          }
          forceClockwise(points);
          parentShape.holes.push(new THREE.Path(points));
        }
      }
    }
  }

  // Cleanup OpenCV
  mat.delete();
  threshMat.delete();
  contours.delete();
  hierarchy.delete();

  // Extrude shape using Three.js
  const extrudeSettings = {
    depth: thicknessMm,
    bevelEnabled: false
  };

  const geometry = new THREE.ExtrudeGeometry(shapes, extrudeSettings);
  const posAttr = geometry.getAttribute('position') as THREE.BufferAttribute;

  const isSlanted = !!(wallName && boxW && boxH && boxD && lightZ !== undefined && frontZ !== undefined);

  // Apply slant and millimeter scaling and origin shift
  for (let i = 0; i < posAttr.count; i++) {
    const x_out = posAttr.getX(i);
    const y_out = posAttr.getY(i);
    const z = posAttr.getZ(i);

    const cg = x_out;
    const rg = height - y_out;

    // 1. Calculate unslanted coordinates in millimeter space
    const x_mm_unslanted = x_out / pixelsPerMm;
    const y_mm_unslanted = y_out / pixelsPerMm;

    // Shift unslanted coordinates temporarily to check physical outer borders
    let x_mm_shifted = x_mm_unslanted;
    let y_mm_shifted = y_mm_unslanted;
    if (isSlanted) {
      if (wallName === 'left' || wallName === 'right') {
        y_mm_shifted = y_mm_unslanted - boxH! / 2.0;
      } else if (wallName === 'top' || wallName === 'bottom') {
        x_mm_shifted = x_mm_unslanted - boxW! / 2.0;
      }
    }

    // 2. Check if the vertex lies on the outer boundary of the panel in millimeters (using 1.2 mm tolerance)
    const eps = 1.2;
    let isOnBorder = false;
    if (isSlanted) {
      if (wallName === 'left' || wallName === 'right') {
        isOnBorder = (x_mm_shifted <= eps || x_mm_shifted >= boxD! - eps || y_mm_shifted <= -boxH!/2.0 + eps || y_mm_shifted >= boxH!/2.0 - eps);
      } else if (wallName === 'top' || wallName === 'bottom') {
        isOnBorder = (x_mm_shifted <= -boxW!/2.0 + eps || x_mm_shifted >= boxW!/2.0 - eps || y_mm_shifted <= eps || y_mm_shifted >= boxD! - eps);
      }
    }

    // 3. Calculate final slanted coordinates if not on the border
    let x_final = x_out;
    let y_final = y_out;

    let t_val = 1.0;
    if (isSlanted && !isOnBorder) {
      if (wallName === 'left' || wallName === 'right') {
        t_val = 1.0 - thicknessMm / (boxW! / 2.0);
      } else if (wallName === 'top' || wallName === 'bottom') {
        t_val = 1.0 - thicknessMm / (boxH! / 2.0);
      }
    }

    if (z > 0 && isSlanted && !isOnBorder) {
      if (wallName === 'left' || wallName === 'right') {
        const Z_wall = (frontZ! + boxD!) - (cg / width) * boxD!;
        const Y_wall = (boxH! / 2.0) - (rg / height) * boxH!;
        
        const Z_in = lightZ! + t_val * (Z_wall - lightZ!);
        const Y_in = t_val * Y_wall;

        x_final = (Z_in - frontZ!) * pixelsPerMm;
        y_final = (Y_in + boxH! / 2.0) * pixelsPerMm;
      } else {
        const X_wall = (-boxW! / 2.0) + (cg / width) * boxW!;
        const Z_wall = (frontZ! + boxD!) - (rg / height) * boxD!;

        const X_in = t_val * X_wall;
        const Z_in = lightZ! + t_val * (Z_wall - lightZ!);

        x_final = (X_in + boxW! / 2.0) * pixelsPerMm;
        y_final = (Z_in - frontZ!) * pixelsPerMm;
      }
    }

    // 4. Convert final coordinates to millimeter space
    let x_mm = x_final / pixelsPerMm;
    let y_mm = y_final / pixelsPerMm;

    // 5. Shift origin to the center of the front edge of the panel
    if (isSlanted) {
      if (wallName === 'left' || wallName === 'right') {
        y_mm = y_mm - boxH! / 2.0;
      } else if (wallName === 'top' || wallName === 'bottom') {
        x_mm = x_mm - boxW! / 2.0;
      }
    }

    posAttr.setX(i, x_mm);
    posAttr.setY(i, y_mm);
  }

  geometry.rotateX(-Math.PI / 2); // Rotate 90 degrees around X to lie flat on the floor (XZ plane)
  geometry.computeVertexNormals();

  // Convert BufferGeometry to Binary STL
  const normAttr = geometry.getAttribute('normal') as THREE.BufferAttribute;
  const numTriangles = posAttr.count / 3;

  const bufferSize = 80 + 4 + numTriangles * 50;
  const buffer = new ArrayBuffer(bufferSize);
  const view = new DataView(buffer);

  // Write number of triangles
  view.setUint32(80, numTriangles, true);

  let offset = 84;
  for (let i = 0; i < posAttr.count; i += 3) {
    let nx = 0, ny = 0, nz = 0;
    if (normAttr) {
      nx = normAttr.getX(i);
      ny = normAttr.getY(i);
      nz = normAttr.getZ(i);
    }
    
    const v1x = posAttr.getX(i);
    const v1y = posAttr.getY(i);
    const v1z = posAttr.getZ(i);
    
    const v2x = posAttr.getX(i + 1);
    const v2y = posAttr.getY(i + 1);
    const v2z = posAttr.getZ(i + 1);
    
    const v3x = posAttr.getX(i + 2);
    const v3y = posAttr.getY(i + 2);
    const v3z = posAttr.getZ(i + 2);

    // Write normal
    view.setFloat32(offset, nx, true);
    view.setFloat32(offset + 4, ny, true);
    view.setFloat32(offset + 8, nz, true);
    
    // Write V1, V2, V3
    view.setFloat32(offset + 12, v1x, true);
    view.setFloat32(offset + 16, v1y, true);
    view.setFloat32(offset + 20, v1z, true);
    
    view.setFloat32(offset + 24, v2x, true);
    view.setFloat32(offset + 28, v2y, true);
    view.setFloat32(offset + 32, v2z, true);
    
    view.setFloat32(offset + 36, v3x, true);
    view.setFloat32(offset + 40, v3y, true);
    view.setFloat32(offset + 44, v3z, true);

    view.setUint16(offset + 48, 0, true);
    offset += 50;
  }

  geometry.dispose();
  return buffer;
}
