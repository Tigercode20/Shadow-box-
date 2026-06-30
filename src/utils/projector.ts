import { getCV } from './opencv';

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
            binary.setUCharAt(r, c, 0); // Ground to black
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
      let t = Z_light / denom;
      
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
    let parent = hierarchy.intPtr(0, i)[3];
    if (parent === -1) {
      drawSingleContour(ctx, contours.get(i));
      ctx.fill();
    }
  }
  
  ctx.fillStyle = "#ffffff";
  for (let i = 0; i < contours.size(); i++) {
    let parent = hierarchy.intPtr(0, i)[3];
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
