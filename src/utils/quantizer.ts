export function medianCutQuantize(pixels: Uint8ClampedArray, w: number, h: number, numColors: number): Uint8ClampedArray {
  let colors: number[][] = [];
  let step = Math.max(1, Math.floor((w * h) / 50000)); 
  for (let i = 0; i < pixels.length; i += 4 * step) {
    colors.push([pixels[i], pixels[i+1], pixels[i+2]]);
  }

  let buckets = [colors];
  while (buckets.length < numColors) {
    let maxRange = -1;
    let maxIdx = 0;
    let maxChannel = 0;
    for (let b = 0; b < buckets.length; b++) {
      if (buckets[b].length < 2) continue;
      for (let ch = 0; ch < 3; ch++) {
        let vals = buckets[b].map(c => c[ch]);
        let range = Math.max(...vals) - Math.min(...vals);
        if (range > maxRange) {
          maxRange = range;
          maxIdx = b;
          maxChannel = ch;
        }
      }
    }
    if (maxRange <= 0) break;

    let bucket = buckets.splice(maxIdx, 1)[0];
    bucket.sort((a, b) => a[maxChannel] - b[maxChannel]);
    let mid = Math.floor(bucket.length / 2);
    buckets.push(bucket.slice(0, mid));
    buckets.push(bucket.slice(mid));
  }

  let palette = buckets.map(bucket => {
    if (bucket.length === 0) return [0, 0, 0];
    let sum = [0, 0, 0];
    for (let c of bucket) {
      sum[0] += c[0];
      sum[1] += c[1];
      sum[2] += c[2];
    }
    return [
      Math.round(sum[0] / bucket.length),
      Math.round(sum[1] / bucket.length),
      Math.round(sum[2] / bucket.length)
    ];
  });

  let out = new Uint8ClampedArray(pixels.length);
  for (let i = 0; i < pixels.length; i += 4) {
    let r = pixels[i], g = pixels[i+1], b = pixels[i+2];
    let bestDist = Infinity;
    let bestColor = palette[0];
    for (let p of palette) {
      let dr = r - p[0], dg = g - p[1], db = b - p[2];
      let dist = dr*dr + dg*dg + db*db;
      if (dist < bestDist) {
        bestDist = dist;
        bestColor = p;
      }
    }
    out[i] = bestColor[0];
    out[i+1] = bestColor[1];
    out[i+2] = bestColor[2];
    out[i+3] = 255;
  }

  return out;
}
