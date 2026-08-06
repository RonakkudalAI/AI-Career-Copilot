export type ProjectedJob = { x: number; y: number; depth: number; visible: boolean };

export function isWebGLAvailable(): boolean {
  if (typeof window === "undefined") return false;
  try {
    const canvas = document.createElement("canvas");
    return Boolean(canvas.getContext("webgl2") || canvas.getContext("webgl") || canvas.getContext("experimental-webgl"));
  } catch {
    return false;
  }
}

export function projectGlobePoint(latitude: number, longitude: number, phi: number, theta: number): ProjectedJob {
  const lat = latitude * Math.PI / 180;
  const lon = longitude * Math.PI / 180 - Math.PI;
  const point = [-Math.cos(lat) * Math.sin(lon), Math.sin(lat), Math.cos(lat) * Math.cos(lon)] as const;
  const cosPhi = Math.cos(phi);
  const sinPhi = Math.sin(phi);
  const cosTheta = Math.cos(theta);
  const sinTheta = Math.sin(theta);
  const rotatedX = (cosPhi * point[0]) + (sinPhi * point[2]);
  const rotatedY = (sinPhi * sinTheta * point[0]) + (cosTheta * point[1]) - (cosPhi * sinTheta * point[2]);
  const depth = (-sinPhi * cosTheta * point[0]) + (sinTheta * point[1]) + (cosPhi * cosTheta * point[2]);
  const visible = depth >= 0 || (rotatedX * rotatedX) + (rotatedY * rotatedY) >= 0.64;

  return {
    x: 50 + rotatedX * 0.8 * 50,
    y: 50 - rotatedY * 0.8 * 50,
    depth,
    visible,
  };
}
