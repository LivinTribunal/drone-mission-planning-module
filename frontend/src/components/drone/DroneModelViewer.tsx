import { useRef, useEffect, useState, useCallback } from "react";
import { useTranslation } from "react-i18next";
import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import type { GLTF } from "three/examples/jsm/loaders/GLTFLoader.js";

interface DroneModelViewerProps {
  modelUrl: string | null;
  autoRotate?: boolean;
  backgroundColor?: string;
  height?: string;
  onSceneLoaded?: (gltf: GLTF) => void;
}

/** drone silhouette placeholder svg. */
function DronePlaceholderIcon() {
  return (
    <svg
      className="h-16 w-16 text-[var(--tv-text-muted)]"
      viewBox="0 0 64 64"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
    >
      <circle cx="32" cy="32" r="4" />
      <line x1="32" y1="28" x2="18" y2="14" />
      <line x1="32" y1="28" x2="46" y2="14" />
      <line x1="32" y1="36" x2="18" y2="50" />
      <line x1="32" y1="36" x2="46" y2="50" />
      <circle cx="18" cy="14" r="6" />
      <circle cx="46" cy="14" r="6" />
      <circle cx="18" cy="50" r="6" />
      <circle cx="46" cy="50" r="6" />
    </svg>
  );
}

/** 3d drone model viewer using three.js. */
export default function DroneModelViewer({
  modelUrl,
  autoRotate = true,
  backgroundColor = "transparent",
  height = "100%",
  onSceneLoaded,
}: DroneModelViewerProps) {
  const { t } = useTranslation();
  const containerRef = useRef<HTMLDivElement>(null);
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null);
  const sceneRef = useRef<THREE.Scene | null>(null);
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null);
  const controlsRef = useRef<OrbitControls | null>(null);
  const frameRef = useRef<number>(0);
  const resumeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const observerRef = useRef<ResizeObserver | null>(null);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);

  const defaultCameraPos = useRef(new THREE.Vector3(0, 1.5, 3));

  /** dispose all three.js resources from a scene. */
  const disposeScene = useCallback((scene: THREE.Scene) => {
    scene.traverse((obj) => {
      if (obj instanceof THREE.Mesh) {
        obj.geometry?.dispose();
        if (Array.isArray(obj.material)) {
          obj.material.forEach((m: THREE.Material) => m.dispose());
        } else {
          obj.material?.dispose();
        }
      }
    });
  }, []);

  /** reset camera to default position. */
  const resetCamera = useCallback(() => {
    if (cameraRef.current && controlsRef.current) {
      cameraRef.current.position.copy(defaultCameraPos.current);
      controlsRef.current.target.set(0, 0, 0);
      controlsRef.current.update();
    }
  }, []);

  useEffect(() => {
    if (!containerRef.current) return;
    if (!modelUrl) return;

    const container = containerRef.current;
    setLoading(true);
    setError(false);

    // renderer
    const renderer = new THREE.WebGLRenderer({
      alpha: backgroundColor === "transparent",
      antialias: true,
    });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));
    renderer.setSize(container.clientWidth, container.clientHeight);
    if (backgroundColor !== "transparent") {
      renderer.setClearColor(new THREE.Color(backgroundColor));
    }
    container.appendChild(renderer.domElement);
    rendererRef.current = renderer;

    // scene
    const scene = new THREE.Scene();
    sceneRef.current = scene;

    // camera
    const camera = new THREE.PerspectiveCamera(
      45,
      container.clientWidth / container.clientHeight,
      0.01,
      100,
    );
    camera.position.copy(defaultCameraPos.current);
    cameraRef.current = camera;

    // lights
    scene.add(new THREE.AmbientLight(0xffffff, 0.6));
    const keyLight = new THREE.DirectionalLight(0xfff5e0, 1.2);
    keyLight.position.set(3, 4, 2);
    scene.add(keyLight);
    const fillLight = new THREE.DirectionalLight(0xc0e0ff, 0.4);
    fillLight.position.set(-2, 1, -2);
    scene.add(fillLight);

    // controls
    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.minDistance = 0.5;
    controls.maxDistance = 8;
    controls.autoRotate = autoRotate;
    controls.autoRotateSpeed = 1.5;
    controlsRef.current = controls;

    // pause auto-rotate on user interaction, resume after 3s
    controls.addEventListener("start", () => {
      controls.autoRotate = false;
      if (resumeTimerRef.current) clearTimeout(resumeTimerRef.current);
    });
    controls.addEventListener("end", () => {
      if (!autoRotate) return;
      resumeTimerRef.current = setTimeout(() => {
        controls.autoRotate = true;
      }, 3000);
    });

    // load model
    const loader = new GLTFLoader();
    loader.load(
      modelUrl,
      (gltf) => {
        const model = gltf.scene;

        // center and scale to fit
        const box = new THREE.Box3().setFromObject(model);
        const center = box.getCenter(new THREE.Vector3());
        const size = box.getSize(new THREE.Vector3());
        const maxDim = Math.max(size.x, size.y, size.z);
        const scale = maxDim > 0 ? 2 / maxDim : 1;
        model.scale.setScalar(scale);
        model.position.sub(center.multiplyScalar(scale));

        scene.add(model);
        setLoading(false);
        onSceneLoaded?.(gltf);
      },
      undefined,
      () => {
        setLoading(false);
        setError(true);
      },
    );

    // double-click to reset
    const handleDblClick = () => resetCamera();
    renderer.domElement.addEventListener("dblclick", handleDblClick);

    // render loop
    function animate() {
      frameRef.current = requestAnimationFrame(animate);
      controls.update();
      renderer.render(scene, camera);
    }
    animate();

    // resize observer
    const observer = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (!entry) return;
      const { width, height: h } = entry.contentRect;
      if (width === 0 || h === 0) return;
      camera.aspect = width / h;
      camera.updateProjectionMatrix();
      renderer.setSize(width, h);
    });
    observer.observe(container);
    observerRef.current = observer;

    return () => {
      cancelAnimationFrame(frameRef.current);
      if (resumeTimerRef.current) clearTimeout(resumeTimerRef.current);
      observer.disconnect();
      renderer.domElement.removeEventListener("dblclick", handleDblClick);
      disposeScene(scene);
      renderer.dispose();
      if (container.contains(renderer.domElement)) {
        container.removeChild(renderer.domElement);
      }
      rendererRef.current = null;
      sceneRef.current = null;
      cameraRef.current = null;
      controlsRef.current = null;
    };
  }, [modelUrl, autoRotate, backgroundColor, disposeScene, resetCamera, onSceneLoaded]);

  // no model selected
  if (!modelUrl) {
    return (
      <div
        className="flex flex-col items-center justify-center gap-2"
        style={{ height }}
      >
        <DronePlaceholderIcon />
        <span className="text-xs text-[var(--tv-text-muted)]">
          {t("drone.noModel")}
        </span>
      </div>
    );
  }

  return (
    <div className="relative" style={{ height }}>
      <div ref={containerRef} className="w-full h-full" />

      {/* loading spinner */}
      {loading && (
        <div className="absolute inset-0 flex items-center justify-center">
          <div className="h-8 w-8 rounded-full border-2 border-[var(--tv-accent)] border-t-transparent animate-spin" />
        </div>
      )}

      {/* error state */}
      {error && (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-2">
          <DronePlaceholderIcon />
          <span className="text-xs text-[var(--tv-text-muted)]">
            {t("drone.modelNotAvailable")}
          </span>
        </div>
      )}
    </div>
  );
}

/** render a model to a png data url for thumbnail generation. */
export async function renderToImage(
  modelUrl: string,
  size = 256,
): Promise<string> {
  const renderer = new THREE.WebGLRenderer({
    alpha: true,
    antialias: true,
  });
  renderer.setSize(size, size);

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(45, 1, 0.01, 100);
  camera.position.set(0, 1.5, 3);
  camera.lookAt(0, 0, 0);

  scene.add(new THREE.AmbientLight(0xffffff, 0.6));
  const light = new THREE.DirectionalLight(0xfff5e0, 1.2);
  light.position.set(3, 4, 2);
  scene.add(light);

  const loader = new GLTFLoader();

  return new Promise((resolve, reject) => {
    loader.load(
      modelUrl,
      (gltf) => {
        const model = gltf.scene;
        const box = new THREE.Box3().setFromObject(model);
        const center = box.getCenter(new THREE.Vector3());
        const maxSize = box.getSize(new THREE.Vector3());
        const maxDim = Math.max(maxSize.x, maxSize.y, maxSize.z);
        const scale = maxDim > 0 ? 2 / maxDim : 1;
        model.scale.setScalar(scale);
        model.position.sub(center.multiplyScalar(scale));
        scene.add(model);

        renderer.render(scene, camera);
        const dataUrl = renderer.domElement.toDataURL("image/png");

        scene.traverse((obj) => {
          if (obj instanceof THREE.Mesh) {
            obj.geometry?.dispose();
            if (Array.isArray(obj.material)) {
              obj.material.forEach((m: THREE.Material) => m.dispose());
            } else {
              obj.material?.dispose();
            }
          }
        });
        renderer.dispose();

        resolve(dataUrl);
      },
      undefined,
      (err) => {
        renderer.dispose();
        reject(err);
      },
    );
  });
}
