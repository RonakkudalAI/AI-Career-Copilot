"use client";

import { Html, OrbitControls } from "@react-three/drei";
import { Canvas, useFrame, useLoader } from "@react-three/fiber";
import { useEffect, useMemo, useRef, useState } from "react";
import * as THREE from "three";

export type GlobeJobPin = {
  id: string;
  title: string;
  company: string;
  latitude: number;
  longitude: number;
};

function point(latitude: number, longitude: number, radius = 2.05) {
  const phi = (90 - latitude) * Math.PI / 180;
  const theta = (longitude + 180) * Math.PI / 180;
  return new THREE.Vector3(
    -radius * Math.sin(phi) * Math.cos(theta),
    radius * Math.cos(phi),
    radius * Math.sin(phi) * Math.sin(theta),
  );
}

function GlobeMesh({ jobs }: { jobs: GlobeJobPin[] }) {
  const group = useRef<THREE.Group>(null);
  const texture = useLoader(THREE.TextureLoader, "/earth-texture.png");
  const earthTexture = useMemo(() => {
    const clone = texture.clone();
    clone.colorSpace = THREE.SRGBColorSpace;
    clone.anisotropy = 4;
    clone.needsUpdate = true;
    return clone;
  }, [texture]);
  const [colors, setColors] = useState({ pin: "#f1c94a", halo: "#ccecff" });

  useEffect(() => {
    const readColors = () => {
      const styles = getComputedStyle(document.documentElement);
      setColors({
        pin: styles.getPropertyValue("--globe-pin").trim() || "#f1c94a",
        halo: styles.getPropertyValue("--globe-halo").trim() || "#ccecff",
      });
    };
    const observer = new MutationObserver(readColors);
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
    readColors();
    return () => observer.disconnect();
  }, []);

  const reduced = typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  useFrame((_, delta) => {
    if (group.current && !reduced) group.current.rotation.y += delta * 0.07;
  });

  return (
    <group ref={group} rotation={[0.18, -0.5, 0]}>
      <mesh>
        <sphereGeometry args={[2, 64, 64]} />
        <meshStandardMaterial map={earthTexture} roughness={0.9} metalness={0} />
      </mesh>
      {jobs.map((job) => {
        const position = point(job.latitude, job.longitude);
        return (
          <group key={job.id} position={position}>
            <mesh>
              <sphereGeometry args={[0.075, 14, 14]} />
              <meshStandardMaterial color={colors.pin} emissive={colors.pin} emissiveIntensity={0.35} />
            </mesh>
            <Html center distanceFactor={6} position={[0, 0.12, 0]}>
              <span className="globe-job-label" title={`${job.title} at ${job.company}`}>
                {job.title}
              </span>
            </Html>
          </group>
        );
      })}
      <mesh>
        <sphereGeometry args={[2.12, 48, 48]} />
        <meshBasicMaterial color={colors.halo} transparent opacity={0.08} side={THREE.BackSide} />
      </mesh>
    </group>
  );
}

export default function CareerGlobe({ jobs = [] }: { jobs?: GlobeJobPin[] }) {
  return (
    <Canvas
      dpr={[1, 1.5]}
      camera={{ position: [0, 0, 6.1], fov: 46 }}
      gl={{ antialias: true }}
      aria-label="Rotating Earth with verified job locations"
    >
      <ambientLight intensity={1.1} />
      <directionalLight position={[4, 4, 6]} intensity={1.8} />
      <GlobeMesh jobs={jobs} />
      <OrbitControls enableZoom={false} enablePan={false} minPolarAngle={Math.PI / 2.8} maxPolarAngle={Math.PI / 1.7} />
    </Canvas>
  );
}
