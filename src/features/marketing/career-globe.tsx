"use client";

import { Canvas, useFrame } from "@react-three/fiber";
import { OrbitControls } from "@react-three/drei";
import { useRef } from "react";
import * as THREE from "three";

const pins: [number, number, string][] = [[13, 77, "Bengaluru"], [1, 104, "Singapore"], [52, 13, "Berlin"], [51, 0, "London"], [44, -79, "Toronto"], [38, -122, "San Francisco"], [-24, -47, "São Paulo"]];
function point(lat: number, lon: number, radius = 2.05) { const phi = (90 - lat) * Math.PI / 180; const theta = (lon + 180) * Math.PI / 180; return new THREE.Vector3(-radius * Math.sin(phi) * Math.cos(theta), radius * Math.cos(phi), radius * Math.sin(phi) * Math.sin(theta)); }

function GlobeMesh() {
  const group = useRef<THREE.Group>(null);
  const reduced = typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  useFrame((_, delta) => { if (group.current && !reduced) group.current.rotation.y += delta * .07; });
  return <group ref={group} rotation={[.18, -.5, 0]}>
    <mesh><sphereGeometry args={[2, 48, 48]} /><meshStandardMaterial color="#72c8ff" roughness={.76} metalness={.08} /></mesh>
    <mesh><sphereGeometry args={[2.015, 20, 20]} /><meshBasicMaterial color="#123f5e" wireframe transparent opacity={.25} /></mesh>
    {pins.map(([lat, lon, label]) => { const p = point(lat, lon); return <group key={label} position={p}><mesh><sphereGeometry args={[.075, 12, 12]} /><meshStandardMaterial color="#ffd166" emissive="#ffd166" emissiveIntensity={.25} /></mesh></group>; })}
    <mesh><sphereGeometry args={[2.12, 48, 48]} /><meshBasicMaterial color="#ccecff" transparent opacity={.09} side={THREE.BackSide} /></mesh>
  </group>;
}

export default function CareerGlobe() {
  return <Canvas dpr={[1, 1.5]} camera={{ position: [0, 0, 6.1], fov: 46 }} gl={{ antialias: true }} aria-label="Rotating globe with sample job locations">
    <ambientLight intensity={1.3} /><directionalLight position={[4, 4, 6]} intensity={2} /><GlobeMesh /><OrbitControls enableZoom={false} enablePan={false} minPolarAngle={Math.PI / 2.8} maxPolarAngle={Math.PI / 1.7} />
  </Canvas>;
}
