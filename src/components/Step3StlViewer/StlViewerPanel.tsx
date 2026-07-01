import React, { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { parseSTL } from '../../utils/stlParser';
import type { GeneratedStl } from '../../App';

interface StlViewerPanelProps {
  active: boolean;
  generatedStls: GeneratedStl[];
}

export const StlViewerPanel: React.FC<StlViewerPanelProps> = ({ active, generatedStls }) => {
  const mountRef = useRef<HTMLDivElement | null>(null);
  const [fileInfo, setFileInfo] = useState<{
    name: string;
    triangles: number;
    sizeX: number;
    sizeY: number;
    sizeZ: number;
  } | null>(null);

  const [dragActive, setDragActive] = useState<boolean>(false);
  const [selectedStlName, setSelectedStlName] = useState<string>('');
  const sceneRef = useRef<THREE.Scene | null>(null);
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null);
  const controlsRef = useRef<OrbitControls | null>(null);
  const meshRef = useRef<THREE.Mesh | null>(null);

  // Auto-load first model when tab is activated or STLs regenerate
  useEffect(() => {
    if (active && generatedStls.length > 0 && !selectedStlName) {
      const first = generatedStls[0];
      setTimeout(() => {
        loadSTLBuffer(first.buffer, first.name);
        setSelectedStlName(first.name);
      }, 100);
    }
  }, [active, generatedStls, selectedStlName]);

  // Keep selectedStlName in sync when generatedStls are updated
  useEffect(() => {
    if (active && generatedStls.length > 0 && selectedStlName) {
      const matched = generatedStls.find(x => x.name === selectedStlName);
      if (matched) {
        loadSTLBuffer(matched.buffer, matched.name);
      }
    }
  }, [generatedStls]);

  const downloadSTL = (buffer: ArrayBuffer, name: string) => {
    const blob = new Blob([buffer], { type: 'application/octet-stream' });
    const link = document.createElement('a');
    link.download = `${name.toLowerCase().replace(/\s+/g, '_')}.stl`;
    link.href = URL.createObjectURL(blob);
    link.click();
  };

  const downloadOBJ = (text: string, name: string) => {
    const blob = new Blob([text], { type: 'text/plain' });
    const link = document.createElement('a');
    link.download = `${name.toLowerCase().replace(/\s+/g, '_')}.obj`;
    link.href = URL.createObjectURL(blob);
    link.click();
  };

  useEffect(() => {
    if (!active || !mountRef.current) return;

    // Create scene
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x0c0c12);
    sceneRef.current = scene;

    // Create camera
    const camera = new THREE.PerspectiveCamera(
      45,
      mountRef.current.clientWidth / mountRef.current.clientHeight,
      0.1,
      1000
    );
    camera.position.set(0, 120, 200);

    // Create renderer
    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setSize(mountRef.current.clientWidth, mountRef.current.clientHeight);
    renderer.setPixelRatio(window.devicePixelRatio);
    renderer.autoClear = false; // Disable autoClear to support overlay rendering
    mountRef.current.appendChild(renderer.domElement);
    rendererRef.current = renderer;

    // Orbit controls
    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.05;
    controlsRef.current = controls;

    // Lights
    const ambientLight = new THREE.AmbientLight(0x404040, 1.5);
    scene.add(ambientLight);

    const dirLight1 = new THREE.DirectionalLight(0xffffff, 2.0);
    dirLight1.position.set(100, 200, 100);
    scene.add(dirLight1);

    const dirLight2 = new THREE.DirectionalLight(0x00f0ff, 1.0);
    dirLight2.position.set(-100, -200, -100);
    scene.add(dirLight2);

    // Grid helper
    const grid = new THREE.GridHelper(200, 50, 0x00f0ff, 0x2c2c35);
    grid.position.y = -0.01;
    scene.add(grid);

    // Set up Axis Gizmo Scene (Blender/SolidWorks style)
    const gizmoScene = new THREE.Scene();

    // X Axis - Red
    const arrowX = new THREE.ArrowHelper(
      new THREE.Vector3(1, 0, 0),
      new THREE.Vector3(0, 0, 0),
      1.1,
      0xff3b30, // iOS Red
      0.3,
      0.2
    );
    gizmoScene.add(arrowX);

    // Y Axis - Green
    const arrowY = new THREE.ArrowHelper(
      new THREE.Vector3(0, 1, 0),
      new THREE.Vector3(0, 0, 0),
      1.1,
      0x34c759, // iOS Green
      0.3,
      0.2
    );
    gizmoScene.add(arrowY);

    // Z Axis - Blue
    const arrowZ = new THREE.ArrowHelper(
      new THREE.Vector3(0, 0, 1),
      new THREE.Vector3(0, 0, 0),
      1.1,
      0x007aff, // iOS Blue
      0.3,
      0.2
    );
    gizmoScene.add(arrowZ);

    // Canvas-based labels X, Y, Z
    const createTextSprite = (text: string, color: string) => {
      const canvas = document.createElement('canvas');
      canvas.width = 64;
      canvas.height = 64;
      const ctx = canvas.getContext('2d');
      if (ctx) {
        ctx.font = 'bold 36px Outfit, sans-serif';
        ctx.fillStyle = color;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(text, 32, 32);
      }
      const texture = new THREE.CanvasTexture(canvas);
      const material = new THREE.SpriteMaterial({ map: texture, transparent: true });
      const sprite = new THREE.Sprite(material);
      sprite.scale.set(0.6, 0.6, 1);
      return sprite;
    };

    const labelX = createTextSprite('X', '#ff3b30');
    labelX.position.set(1.4, 0, 0);
    gizmoScene.add(labelX);

    const labelY = createTextSprite('Y', '#34c759');
    labelY.position.set(0, 1.4, 0);
    gizmoScene.add(labelY);

    const labelZ = createTextSprite('Z', '#007aff');
    labelZ.position.set(0, 0, 1.4);
    gizmoScene.add(labelZ);

    // Gizmo camera
    const gizmoCamera = new THREE.PerspectiveCamera(50, 1, 0.1, 10);
    gizmoCamera.position.set(0, 0, 3.5);

    // Animation loop
    let animationFrameId: number;
    const animate = () => {
      animationFrameId = requestAnimationFrame(animate);
      controls.update();

      const width = mountRef.current?.clientWidth || 800;
      const height = mountRef.current?.clientHeight || 600;

      // Sync gizmo camera position with main camera's angle
      const dir = new THREE.Vector3();
      camera.getWorldDirection(dir);
      gizmoCamera.position.copy(dir).multiplyScalar(-3.5);
      gizmoCamera.up.copy(camera.up);
      gizmoCamera.lookAt(0, 0, 0);

      // Render main scene
      renderer.clear(); // Clear all buffers manually once per frame
      renderer.setViewport(0, 0, width, height);
      renderer.setScissor(0, 0, width, height);
      renderer.setScissorTest(true);
      renderer.render(scene, camera);

      // Render overlay gizmo in bottom-right corner
      const gizmoSize = 80;
      renderer.setViewport(width - gizmoSize - 15, 15, gizmoSize, gizmoSize);
      renderer.setScissor(width - gizmoSize - 15, 15, gizmoSize, gizmoSize);
      renderer.setScissorTest(true);
      renderer.clearDepth(); // Clear depth buffer so axes render on top
      renderer.render(gizmoScene, gizmoCamera);
    };
    animate();

    // Handle resize
    const handleResize = () => {
      if (!mountRef.current) return;
      camera.aspect = mountRef.current.clientWidth / mountRef.current.clientHeight;
      camera.updateProjectionMatrix();
      renderer.setSize(mountRef.current.clientWidth, mountRef.current.clientHeight);
    };
    window.addEventListener('resize', handleResize);

    return () => {
      window.removeEventListener('resize', handleResize);
      cancelAnimationFrame(animationFrameId);
      if (rendererRef.current && mountRef.current) {
        try {
          mountRef.current.removeChild(renderer.domElement);
        } catch (_) {}
      }
      renderer.dispose();
    };
  }, [active]);

  const loadSTLBuffer = (buffer: ArrayBuffer, name: string) => {
    const scene = sceneRef.current;
    if (!scene) return;

    // Remove old mesh
    if (meshRef.current) {
      scene.remove(meshRef.current);
      meshRef.current.geometry.dispose();
      (meshRef.current.material as THREE.Material).dispose();
    }

    try {
      const geometry = parseSTL(buffer);
      
      // Compute metadata
      geometry.computeBoundingBox();
      const box = geometry.boundingBox!;
      const size = new THREE.Vector3();
      box.getSize(size);

      // Center X/Z, and align bottom Y to 0 so the model sits on the floor grid helper
      const center = new THREE.Vector3();
      box.getCenter(center);
      geometry.translate(-center.x, -box.min.y, -center.z);

      const material = new THREE.MeshPhongMaterial({
        color: 0x00f0ff,
        specular: 0x111111,
        shininess: 200,
        side: THREE.DoubleSide
      });

      const mesh = new THREE.Mesh(geometry, material);
      scene.add(mesh);
      meshRef.current = mesh;

      setFileInfo({
        name,
        triangles: geometry.getAttribute('position').count / 3,
        sizeX: parseFloat(size.x.toFixed(2)),
        sizeY: parseFloat(size.y.toFixed(2)),
        sizeZ: parseFloat(size.z.toFixed(2))
      });

      // Fit camera to object
      const maxDim = Math.max(size.x, size.y, size.z);
      if (controlsRef.current) {
        const camera = controlsRef.current.object as THREE.PerspectiveCamera;
        camera.position.set(maxDim * 1.2, maxDim * 1.2, maxDim * 1.5);
        controlsRef.current.target.set(0, 0, 0);
        controlsRef.current.update();
      }

    } catch (e) {
      alert("Error parsing STL file. Make sure it is a valid STL format.");
      console.error(e);
    }
  };

  const handleFile = (file: File) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      if (e.target?.result instanceof ArrayBuffer) {
        loadSTLBuffer(e.target.result, file.name);
      }
    };
    reader.readAsArrayBuffer(file);
  };

  const handleDrag = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === "dragenter" || e.type === "dragover") {
      setDragActive(true);
    } else if (e.type === "dragleave") {
      setDragActive(false);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      handleFile(e.dataTransfer.files[0]);
    }
  };

  return (
    <div className={`workspace-panel ${active ? 'active' : ''}`} id="panel-stl-viewer" style={{ padding: '0', display: active ? 'flex' : 'none', height: 'calc(100vh - 70px)' }}>
      {/* Sidebar Metadata */}
      <div className="sidebar" style={{ width: '320px', flexShrink: 0, padding: '24px', borderRight: '1px solid var(--card-border)', background: 'rgba(11, 11, 16, 0.98)', display: 'flex', flexDirection: 'column', gap: '20px', overflowY: 'auto' }}>
        {generatedStls.length > 0 && (
          <div className="card">
            <div className="card-title">
              <i className="fa-solid fa-list-check" style={{ color: 'var(--primary)' }}></i> Generated Panels
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginTop: '10px' }}>
              {generatedStls.map((stl) => (
                <div 
                  key={stl.name}
                  className={`format-option-row ${selectedStlName === stl.name ? 'active' : ''}`}
                  onClick={() => {
                    loadSTLBuffer(stl.buffer, stl.name);
                    setSelectedStlName(stl.name);
                  }}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    padding: '10px 14px',
                    borderRadius: '8px',
                    cursor: 'pointer',
                    fontSize: '0.85rem'
                  }}
                >
                  <span style={{ fontWeight: 600, color: 'var(--text-main)' }}>{stl.name}</span>
                  <div style={{ display: 'flex', gap: '6px' }}>
                    {stl.objText && (
                      <button 
                        className="btn btn-secondary" 
                        onClick={(e) => {
                          e.stopPropagation();
                          downloadOBJ(stl.objText!, stl.name);
                        }}
                        style={{
                          padding: '4px 8px',
                          fontSize: '0.75rem',
                          borderColor: 'rgba(0, 240, 255, 0.25)',
                          color: 'var(--primary)'
                        }}
                      >
                        OBJ
                      </button>
                    )}
                    <button 
                      className="btn btn-secondary" 
                      onClick={(e) => {
                        e.stopPropagation();
                        downloadSTL(stl.buffer, stl.name);
                      }}
                      style={{
                        padding: '4px 8px',
                        fontSize: '0.75rem',
                        borderColor: 'rgba(0, 240, 255, 0.25)',
                        color: 'var(--primary)'
                      }}
                    >
                      <i className="fa-solid fa-download"></i>
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        <div className="card">
          <div className="card-title">
            <i className="fa-solid fa-cube" style={{ color: 'var(--primary)' }}></i> 3D STL Inspector
          </div>
          
          <div 
            className={`file-upload-zone ${dragActive ? 'active' : ''}`}
            onDragEnter={handleDrag}
            onDragLeave={handleDrag}
            onDragOver={handleDrag}
            onDrop={handleDrop}
            style={{
              border: '2px dashed var(--card-border)',
              borderRadius: '12px',
              padding: '24px',
              textAlign: 'center',
              cursor: 'pointer',
              background: dragActive ? 'rgba(0, 240, 255, 0.05)' : 'rgba(255,255,255,0.01)',
              transition: 'all 0.3s ease',
              borderColor: dragActive ? 'var(--primary)' : 'var(--card-border)'
            }}
            onClick={() => document.getElementById('stl-file-input')?.click()}
          >
            <i className="fa-solid fa-cloud-arrow-up" style={{ fontSize: '1.8rem', color: 'var(--text-muted)', marginBottom: '10px' }}></i>
            <p style={{ fontSize: '0.85rem', color: 'var(--text-main)', margin: '0' }}>Drag & drop STL file here</p>
            <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)', margin: '4px 0 0 0' }}>or click to browse</p>
            <input 
              type="file" 
              id="stl-file-input" 
              accept=".stl" 
              style={{ display: 'none' }}
              onChange={(e) => e.target.files?.[0] && handleFile(e.target.files[0])}
            />
          </div>
        </div>

        {fileInfo && (
          <div className="card" style={{ animation: 'fadeIn 0.3s ease' }}>
            <div className="card-title" style={{ fontSize: '0.95rem' }}>
              <i className="fa-solid fa-circle-info" style={{ color: 'var(--primary)' }}></i> File Details
            </div>
            
            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', fontSize: '0.85rem', color: 'var(--text-main)', marginTop: '8px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid rgba(255,255,255,0.05)', paddingBottom: '6px' }}>
                <span style={{ color: 'var(--text-muted)' }}>Filename:</span>
                <span style={{ fontWeight: 600, wordBreak: 'break-all', textAlign: 'right' }}>{fileInfo.name}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid rgba(255,255,255,0.05)', paddingBottom: '6px' }}>
                <span style={{ color: 'var(--text-muted)' }}>Triangles:</span>
                <span style={{ fontWeight: 600, color: 'var(--primary)' }}>{fileInfo.triangles.toLocaleString()}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid rgba(255,255,255,0.05)', paddingBottom: '6px' }}>
                <span style={{ color: 'var(--text-muted)' }}>Width (X):</span>
                <span style={{ fontWeight: 600 }}>{fileInfo.sizeX} mm</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid rgba(255,255,255,0.05)', paddingBottom: '6px' }}>
                <span style={{ color: 'var(--text-muted)' }}>Height (Y):</span>
                <span style={{ fontWeight: 600 }}>{fileInfo.sizeY} mm</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ color: 'var(--text-muted)' }}>Thickness (Z):</span>
                <span style={{ fontWeight: 600, color: 'var(--primary)' }}>{fileInfo.sizeZ} mm</span>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* 3D Canvas Area */}
      <div ref={mountRef} style={{ flex: 1, height: '100%', position: 'relative' }}>
        {!fileInfo && (
          <div style={{ position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%, -50%)', textAlign: 'center', pointerEvents: 'none' }}>
            <i className="fa-solid fa-cube" style={{ fontSize: '3rem', color: 'rgba(0, 240, 255, 0.1)', animation: 'spin 8s linear infinite', marginBottom: '15px' }}></i>
            <h3 style={{ margin: '0', color: 'var(--text-muted)', fontWeight: 600 }}>3D STL Preview</h3>
            <p style={{ margin: '5px 0 0 0', color: 'rgba(255,255,255,0.2)', fontSize: '0.85rem' }}>Upload a file in the sidebar to inspect in 3D</p>
          </div>
        )}
      </div>
    </div>
  );
};
