import * as THREE from 'three';

export function parseSTL(buffer: ArrayBuffer): THREE.BufferGeometry {
  const isBinary = (buf: ArrayBuffer) => {
    if (buf.byteLength < 84) return false;
    const view = new DataView(buf);
    const numTriangles = view.getUint32(80, true);
    return (84 + numTriangles * 50) === buf.byteLength;
  };

  const geometry = new THREE.BufferGeometry();
  const positions: number[] = [];
  const normals: number[] = [];

  if (isBinary(buffer)) {
    const view = new DataView(buffer);
    const numTriangles = view.getUint32(80, true);
    let offset = 84;
    for (let i = 0; i < numTriangles; i++) {
      if (offset + 50 > buffer.byteLength) break;
      // Normal
      const nx = view.getFloat32(offset, true);
      const ny = view.getFloat32(offset + 4, true);
      const nz = view.getFloat32(offset + 8, true);
      // Vertices
      const v1x = view.getFloat32(offset + 12, true);
      const v1y = view.getFloat32(offset + 16, true);
      const v1z = view.getFloat32(offset + 20, true);
      
      const v2x = view.getFloat32(offset + 24, true);
      const v2y = view.getFloat32(offset + 28, true);
      const v2z = view.getFloat32(offset + 32, true);
      
      const v3x = view.getFloat32(offset + 36, true);
      const v3y = view.getFloat32(offset + 40, true);
      const v3z = view.getFloat32(offset + 44, true);

      positions.push(v1x, v1y, v1z, v2x, v2y, v2z, v3x, v3y, v3z);
      normals.push(nx, ny, nz, nx, ny, nz, nx, ny, nz);

      offset += 50;
    }
  } else {
    // ASCII parsing
    const decoder = new TextDecoder('utf-8');
    const text = decoder.decode(buffer);
    const lines = text.split('\n');
    let currentNormal = [0, 0, 0];
    const vertices: number[][] = [];

    for (let line of lines) {
      line = line.trim().toLowerCase();
      if (line.startsWith('facet normal')) {
        const parts = line.split(/\s+/);
        currentNormal = [
          parseFloat(parts[2]) || 0,
          parseFloat(parts[3]) || 0,
          parseFloat(parts[4]) || 0
        ];
      } else if (line.startsWith('vertex')) {
        const parts = line.split(/\s+/);
        vertices.push([
          parseFloat(parts[1]) || 0,
          parseFloat(parts[2]) || 0,
          parseFloat(parts[3]) || 0
        ]);
        if (vertices.length === 3) {
          positions.push(...vertices[0], ...vertices[1], ...vertices[2]);
          normals.push(...currentNormal, ...currentNormal, ...currentNormal);
          vertices.length = 0; // reset
        }
      }
    }
  }

  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
  geometry.computeVertexNormals();
  return geometry;
}
