# Project Guide: 📐 Premium 3D Shadow Box Maker & Vectorizer

This document explains the codebase, modular component structures, calculations, and overall design of the Shadow Box Maker application.

---

## 📂 Project Directory Structure

The project has been migrated from a single-file Vanilla HTML/JS structure into a modular React + TypeScript + Vite project under `scratch/Shadow-box-/`:

```
/
├── public/                 # Static assets (Favicons, SVG icons)
├── src/
│   ├── assets/             # Images & visual assets
│   ├── components/         # Reusable React UI Components
│   │   ├── Common/
│   │   │   └── SliderControl.tsx  # Touch-friendly slider inputs with precision steppers (+/-)
│   │   ├── Layout/
│   │   │   ├── Header.tsx         # Sleek header with navigation tabs and GPU status badge
│   │   │   └── LoadingOverlay.tsx # Neon splash loading screen while OpenCV.js initializes
│   │   ├── Step1Vectorizer/
│   │   │   └── VectorizerPanel.tsx# Quantization, Otsu auto-adjust, and contour preview
│   │   ├── Step2Maker/
│   │   │   └── MakerPanel.tsx     # Silhouette fitting, physical size setup, and multi-format exports
│   │   └── Step3StlViewer/
│   │       └── StlViewerPanel.tsx # 3D STL viewer using Three.js and OrbitControls
│   ├── utils/              # Code utilities & Math engines
│   │   ├── opencv.ts       # Global OpenCV.js initialization check and hooks
│   │   ├── projector.ts    # Core ray-tracing equations and bilinear interpolation logic
│   │   ├── quantizer.ts    # Median Cut Color Quantization algorithm
│   │   ├── exporters.ts    # Export handlers for high-res PNG, JPG, PDF, SVG, & ZIP
│   │   └── stlParser.ts    # Custom ASCII/Binary STL parser for 3D BufferGeometry
│   ├── App.tsx             # Application wrapper, tabs, and shared canvas states
│   ├── index.css           # Futuristic glassmorphism theme stylesheet & mobile viewports
│   └── main.tsx            # React application entry point
├── index.html              # Core HTML file loading OpenCV.js, Google Font, and FontAwesome
├── vite.config.ts          # Vite bundler configurations
└── package.json            # Project dependencies & build scripts
```

---

## ⚙️ Core Libraries & Integration

1. **OpenCV.js**:
   - Loaded asynchronously from docs CDN: `https://docs.opencv.org/4.5.4/opencv.js`.
   - Managed in React via `src/utils/opencv.ts` checking `window.opencvReady`.
   - Controls Canny edge detection, Otsu thresholding, and vector contours path generation.
2. **jsPDF**:
   - Compiles vector contours or high-resolution canvas drawings into standard PDF layout.
3. **JSZip**:
   - Packages all computed high-resolution layout assets into a single ZIP archive download.

---

## 📐 Computational & Ray Projection Logic

The application simulates light ray propagation from a point light source $S(0, 0, Z_{light})$ through a target silhouette projection $P(X_w, Y_w, Z_w)$ onto the box boundaries.

### Bilinear Color Mapping Formula
To eliminate aliased, pixelated jagged edges, color interpolation coordinates are calculated mapping decimal indices to floor/ceil color bounds:
$$\text{val} = (1-dc)(1-dr)V_{11} + dc(1-dr)V_{12} + (1-dc)drV_{21} + dcdrV_{22}$$
Where $dc$ and $dr$ represent fractional offsets between pixel coordinates, and $V$ represents the neighboring pixel color values.

### SVG Path Construction
Contours are extracted using OpenCV's `cv.findContours` hierarchically. Outer contours represent borders (colored black), whereas nested child contours are treated as cutout holes (colored white), rendered into perfect vector SVG path strings (`<path d="..." />`).

### 🖨️ 3D STL Mesh Extrusion
For 3D printing, 2D binary projection panels are extruded into 3D watertight solid meshes (`.stl`).
- **Smooth Vector Contour-based Extrusion**:
  - Instead of pixel block extrusion, OpenCV's `cv.findContours` extracts the vector paths.
  - `THREE.Shape` instances are constructed using parent (CCW winding) and hole (CW winding) paths.
  - Three.js `THREE.ExtrudeGeometry` compiles these shapes into watertight manifold models.
- **Ray-Aligned Slanted Extrusion**:
  - The side cuts of the details are slanted matching the point light source $S(0, 0, Z_{light})$ to prevent shadow casting from thickness.
  - Flat panel edges contacting the outer box boundaries are locked to a flat 90-degree slant to keep mounting interfaces straight.
- **Geometry Flipping & Alignment**:
  - Left and Top walls are extruded directly.
  - Right and Bottom walls are flipped horizontally/vertically via `cvFlip` before extrusion to match their exact correct orientations in the unfolded box layout.
- **X-axis Rotation**:
  - Geometries are rotated 90 degrees around the X-axis (`geometry.rotateX(-Math.PI / 2)`) so the 3D models lie flat in the XZ plane (on the print bed) with their thickness pointing upwards (Y direction).


