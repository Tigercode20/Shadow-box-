export function getCV(): any {
  if (typeof window !== 'undefined' && (window as any).cv) {
    return (window as any).cv;
  }
  return null;
}

export function isOpenCvLoaded(): boolean {
  return typeof window !== 'undefined' && !!(window as any).opencvReady && !!(window as any).cv;
}
