# Lessons Learned & User Feedback Tracker 📝

This document records the mistakes made, user complaints, and implementation rules to prevent these issues from recurring.

---

## 🚫 User Complaints & Resolutions

### 1. Jagged & Pixelated Projection Contours
- **Complaint**: *"ليه الصور فيها مكعبات كده انا عاوز خطوط حاده صريحه..."* (Why are the images blocky? I want sharp, clean lines like vector pin drawings).
- **Resolution**:
  - Replaced nearest-neighbor mapping in pixel ray tracing with manual **Bilinear Color Interpolation** to eliminate stepping block artifacts.
  - Implemented real-time vector contour tracing (`cv.findContours` + SVG Path drawing) for previews and high-quality vector downloads.

### 2. Broken Responsive Layout on Mobile
- **Complaint**: *"مبقاش في اي استغلال للمساحات... في وضع ال pc التقسيم جميل جدا لكن وضع الموبايل التقسيم سئ"* (There's no space optimization... The PC layout is great, but the mobile layout is bad).
- **Resolution**:
  - Pinned previews at the top of the mobile viewport (`38vh` height, horizontal swipe indicators) so adjustments are seen in real-time.
  - Controls scroll independently in the remaining screen height (`62vh`).
  - Added a sticky footer for primary action buttons (Generate, Use Silhouette, Export ZIP).

### 3. Low Resolution Exports
- **Complaint**: *"لما جيت احمل الصوره png جات التفاصيل دي مش كويسه"* (When I downloaded the PNG, the details were not good quality).
- **Resolution**:
  - Separated screen preview resolution (`2.0 px/mm` to avoid UI lag) from export resolution.
  - Configured exports to spin up hidden canvases in the background at **`12.0 px/mm`** (305 DPI) to guarantee razor-sharp print files.

### 4. Default Parameter Synchronization
- **Complaint**: *"عاوز الارقام دي ال default"* (I want these specific parameters as defaults).
- **Resolution**: Standardized application default states to:
  - Box dimensions: Width (X) = `114`, Height (Y) = `150`, Depth (Z) = `70`.
  - Optical settings: Light Z = `130`, Front opening Z = `80`, Target Width = `1140`, Target Height = `1500`.
  - Shift Y = `100.0`. Scale = `100%`.

### 5. Squashed Projection Mappings (Gradients on Export)
- **Complaint**: *"شوف الخرج بتاعك بين الاول و دا... انتا المنطق بتاعك بايظ"* (Look at your outputs... your logic is broken - panels showing vertical gradients instead of Gojo details).
- **Resolution**:
  - The scale slider state uses percentage units (e.g. `100` for 100%), whereas the projection math expects a fractional value (e.g. `1.0`).
  - In `handleExportZip`, the percentage `scale` was passed directly instead of being divided by `100.0`, mapping the entire wall projection coordinates to a sub-pixel fraction of the target Gojo drawing. This mapped the entire projection to a single boundary pixel transition, resulting in wide gradients.
  - Divided `scale` by `100.0` before passing to `exportZipArchive` to match the exact mathematical fractional scale.

### 6. Straight 3D Extrusion Blocking Light Rays (Slanted Cutouts)
- **Complaint**: *"تخن بتاع الحيطه دا بيخلي جذء من شعاع النور يتقطع و يتصد... في التصميم الاصلي كان القطع مائل"* (The wall thickness blocks some of the light rays. In the original design, the cutouts were made at an angle).
- **Resolution**:
  - Replaced standard straight parallel extrusion for wall panels with **Ray-Aligned Slanted Extrusion** matching the physics of the point light source $S(0, 0, Z_{light})$.
  - Dynamically scale the inner face geometry by perspective scaling factor $t = 1.0 - \text{thickness} / (\text{boundary}/2)$ and project inner corner vertices relative to the spot light, resulting in perfectly slanted cutout walls that don't block the light rays.

### 7. STL Viewer Tab Syncing (Dynamic STL Loading)
- **Complaint**: *"التصاميم عملت genrate ماتنقلتش ل صفحه stl viewer عاوز الملفات يتم عرضها و لو تمام يبقي في امكانيه التحميل للملفات منفصله"* (The generated files were not transferred to the STL viewer tab. I want the generated files to be shown there, with the option to download them individually).
- **Resolution**:
  - Implemented a shared React state (`generatedStls`) in `App.tsx` mapped to Step 2 calculations.
  - When the user generates panels, the local STL buffers for the 6 panels are calculated instantly at preview resolution and stored in state.
  - In Step 3 (STL Viewer), the sidebar displays the list of "Generated Panels". Clicking any panel loads it in 3D, and each has an individual `[Download]` button.

### 8. Smooth Vector Contour-based 3D STL Extrusion
- **Complaint**: *"التصميم كله بيكسيلز و كوالتي قليله و في نقاط طائره مش منطقيه للطباعه"* (The design is pixelated and low quality, and has floating points that are not printable).
- **Resolution**:
  - Replaced voxel/pixel block extrusion with **Smooth Vector Contour-based Extrusion**.
  - Extract exact 2D contours from projected silhouette mats using OpenCV's `cv.findContours` and build continuous nested `THREE.Shape` geometry paths (auto-mapping outer borders and inner hole paths).
  - Filter out floating noise and small components by setting a minimum area threshold (ignoring islands with area < 15 px).
  - Extrude the shapes cleanly using Three.js `THREE.ExtrudeGeometry` (which yields perfectly smooth curves/walls and watertight triangulation) and export to binary STL.

### 9. Flat Panel Borders and Front-Edge-Centered Origin (STL Alignment)
- **Complaint**: *"الضلع المستقيم لكل ضلع ملامس للصندوق للداخل مش عاوز يكون فيه ميل لا يكون قائم الزاويه عادي و يكون ال orgin بتاع كل مجسم في منتصف طرف الضلع دا"* (The side of each panel touching the box should remain perpendicular/unslanted, and the origin must be in the middle of this edge).
- **Resolution**:
  - Implemented boundary check in `extrudePanelToSTL`: if a vertex lies on the outer rectangular border of the wall panel, its slant scale factor $t$ is forced to `1.0` (keeping it perfectly straight at a normal 90-degree angle to sit flush against the box frames).
  - Shifted the coordinates of the extruded mesh vertices so that the origin $(0,0,0)$ of the generated STL lies precisely at the center of the front-facing edge (which is the edge of the panel that contacts the front opening border).

### 10. Contour Filtering and Shift-Aware Border Tolerance (Detail Restoration)
- **Complaint**: *"في تصاميم اتشال منها تفاصيل و تصاميم باظت خالص"* (Some details were removed from the designs, and some designs got completely ruined).
- **Resolution**:
  - The previous high area noise filter (`area < 15 px`) removed thin lines of the silhouette at low preview resolutions, deleting details. Lowered the noise threshold to `2 px` to preserve all fine contours.
  - Checked the `isOnBorder` condition on unslanted coordinates in millimeter space with a tolerance of `0.5 mm` before applying shifts/slants. This prevents the outer boundary of the panel from warping due to pixel approximations, keeping the outer edges perfectly rectangular and straight while allowing details to slant correctly.

### 11. Solid/Cutout Mode Inversions and Outer Border Frames (STL Completeness)
- **Complaint**: Visual inspection of STL outputs showed that the walls in Cutout mode had details inverted (empty background became a solid sheet, and solid detail became a cutout), and the physical outer frame limits were missing (partial fragments of the silhouette details were generated instead of the full size rectangular wall panel).
- **Resolution**:
  - Rewrote the contour parsing of `extrudePanelToSTL` to accept the `panelBg` configuration.
  - In `Solid` mode, the cutout holes are extracted using `cv.THRESH_BINARY_INV`.
  - In `Cutout` mode, we force a solid outer border frame (3 mm wide) on the mat and extract the empty background slots using `cv.THRESH_BINARY`.
  - Manually construct the outermost perimeter of the 3D shape as a perfect unwarped rectangle of the exact panel dimensions ($W \times H$ in pixels), and insert the extracted contours as holes. This guarantees that the wall panel STL always has the full correct physical bounding box size ($70 \times 150$ or $114 \times 70$ mm) and is 3D printable.

### 12. OpenCV.js setUCharAt TypeError Fix (Runtime Crash)
- **Complaint**: Console logs showed `TypeError: p.setUCharAt is not a function` when generating in Cutout mode.
- **Resolution**:
  - OpenCV.js does not expose a `setUCharAt` writing function for Mat elements.
  - Replaced all writing loops with direct data buffer index assignments: `mat.data[r * width + c] = value` (which is standard and extremely fast in JS).

### 13. Three.js Shape Winding Order and Nested Islands Triangulation (Earcut Fix)
- **Complaint**: STL models generated as completely solid green sheets with no holes, or lost inner detail components.
- **Resolution**:
  - Three.js Shape Earcut triangulation requires opposite winding orders to cut out holes (outer shape must be Counter-Clockwise [CCW], and hole paths must be Clockwise [CW]). Because OpenCV contours can have arbitrary winding orders, Earcut failed and filled the holes completely, making the wall solid.
  - Implemented automated winding order enforcement: forced all Level 1 holes to Clockwise (`forceClockwise`), and Level 2 solid islands to Counter-Clockwise (`forceCounterClockwise`).
  - Organized the contours by hierarchy: Level 1 contours are added as holes inside the main CCW rectangle; Level 2 contours (solid islands inside Level 1 holes, e.g. Gojo's eye pupils and skin details) are extruded as separate solid shapes inside the holes; and Level 3 contours (holes inside Level 2 islands) are added as holes to the Level 2 shapes. This guarantees perfect watertight CSG rendering in 3D without any triangulation failures.

### 14. Distinct Solid and Cutout Modes for STL Extrusion
- **Complaint**: *"لما تيجي تعمل ال 3d اعمل علي اساس الملفات المنفصله مش الملف المجمع علشان مايعملش حاجات زياده زي الحواف"* (When you make the 3D, make it based on the individual files, not the merged/assembled file, so it doesn't make extra things like the borders).
- **Resolution**:
  - Differentiated the shape extrusion logic in `extrudePanelToSTL`:
    - **Solid Mode** (`panelBg === 0`): Manually constructs the CCW outer rectangular frame of the panel and subtracts the contours as CW holes, preserving the solid wall plate with detail cutouts.
    - **Cutout Mode** (`panelBg === 255`): Extrudes only the detail shapes themselves (Level 1 contours as CCW outer shapes, Level 2 contours as CW inner holes). This removes all forced rectangular background boundaries, frames, or extra margins, ensuring the 3D model contains only the actual vector details, matching the individual exported 2D files exactly.

### 15. Two-Pass Shape/Hole Extraction (Cutout Mode Detail Losses)
- **Complaint**: Left and Right walls in Cutout mode rendered as completely solid blocks (losing inner cutouts/details).
- **Resolution**:
  - In Cutout mode, OpenCV's contour list is not sorted by parent-child hierarchy. A single-pass loop resulted in trying to add Level 2 holes to parent Level 1 shapes before the parent shape was registered in the `shapeMap`.
  - Implemented a strict two-pass parser: Pass 1 loops through the contours to construct and map all Level 1 parent shapes. Pass 2 loops to extract and successfully link Level 2 holes (`parentShape.holes.push(new THREE.Path(points))`) to their registered parents. This preserves all fine details and holes inside solid regions.

### 16. Increased Border Tolerance for Unslanted Boundaries
- **Complaint**: Left and Right walls in Cutout mode had slanted/warped top and bottom edges instead of perfectly straight, unslanted perpendicular boundaries.
- **Resolution**:
  - Because contours are approximated in pixel space, vertex coordinates along the panel boundaries can be slightly offset (e.g. 0.5-0.8 mm away from the border). A small border detection tolerance of `0.5 mm` failed to match these vertices, resulting in unwanted slanting at the outer margins.
  - Increased the `eps` boundary detection tolerance to `1.2 mm` in `extrudePanelToSTL`. This reliably catches all boundary-adjacent vertices and locks them to a flat 90-degree slant factor (`t = 1.0`), ensuring all sides that contact the box frame remain straight and mountable.

### 17. Correcting Projection Math to Level 1 Silhouette Target Plane
- **Complaint**: The light projection on the side walls did not align with the front silhouette central point.
- **Resolution**:
  - The previous projection formula assumed the silhouette intersected at $Z=0$.
  - Corrected the projection factor `t` to target the actual front opening plane `_Z_start` (i.e. `t = (Z_light - _Z_start) / denom`), which aligns the ray projection angle perfectly with the central point.

### 18. Preventing Call Stack Size Exceeded RangeErrors
- **Complaint**: React page crashes with `RangeError: Maximum call stack size exceeded` in `autoFitSilhouette`.
- **Resolution**:
  - Replaced the spread operator (`...yIndices`) in `Math.min`/`Math.max` calls on large arrays with a single linear `for` loop to find the boundaries.

### 19. Adding Input Validation to Prevent Canvas Size IndexSizeErrors
- **Complaint**: Clearing input fields causes `Failed to execute 'createImageData'` canvas size crashes.
- **Resolution**:
  - Added comprehensive state parameter checks at the beginning of `updateProjections` and `autoFitSilhouette` to exit early if any parameter is `NaN`, `0`, or `undefined`.

### 20. Direct Memory Copying for OpenCV Mat Creation
- **Complaint**: Converting large templates causes `Uncaught RangeError: Invalid array length` in `Array.from`.
- **Resolution**:
  - Avoided `Array.from` which clones typed arrays and exhausts JavaScript memory limits.
  - Initialized OpenCV `cv.Mat` directly and used high-performance direct buffer assignment: `mat.data.set(panelData)`.

### 21. Blender/SolidWorks Style Axis Gizmo Viewer Overlay
- **Complaint**: User wanted a SolidWorks/Blender style 3D XYZ axis helper in the bottom-right corner.
- **Resolution**:
  - Created a corner viewport overlay rendering of a synchronized `THREE.AxesHelper` and text sprites inside the animation frame loop.

### 22. Rotating STL Geometries 90 Degrees around X-Axis to Lie Flat
- **Complaint**: User wanted the 3D models to be rotated around the X axis by 90 degrees.
- **Resolution**:
  - Added `geometry.rotateX(-Math.PI / 2)` after extrusion and vertex calculations in `extrudePanelToSTL`. This rotates the model flat onto the floor (XZ plane) with its thickness pointing upwards (Y direction) for optimal viewing and 3D printing.

---

## 💡 Developer Guidelines (Rules for Future Edits)

1. **Maintain high-resolution background rendering**: Never lower the export resolution below `12.0 px/mm` for PNG, JPG, or PDF downloads.
2. **Keep Bilinear mapping intact**: Ensure texture mapping operations always interpolate neighboring pixel values using bilinear weights to prevent pixelated block artifacts.
3. **Respect mobile-first layouts**: Before changing CSS classes, verify that scrollable panels and sticky footers remain unbroken on smaller screen sizes.
4. **Preserve modularity**: Do not combine components back into single monolithic files. Keep layout, step panels, math helpers, and exporters separated.
