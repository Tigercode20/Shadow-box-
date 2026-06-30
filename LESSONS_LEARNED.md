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

---

## 💡 Developer Guidelines (Rules for Future Edits)

1. **Maintain high-resolution background rendering**: Never lower the export resolution below `12.0 px/mm` for PNG, JPG, or PDF downloads.
2. **Keep Bilinear mapping intact**: Ensure texture mapping operations always interpolate neighboring pixel values using bilinear weights to prevent pixelated block artifacts.
3. **Respect mobile-first layouts**: Before changing CSS classes, verify that scrollable panels and sticky footers remain unbroken on smaller screen sizes.
4. **Preserve modularity**: Do not combine components back into single monolithic files. Keep layout, step panels, math helpers, and exporters separated.
