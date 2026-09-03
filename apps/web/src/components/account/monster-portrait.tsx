"use client";

import { Canvas, useThree } from "@react-three/fiber";
import { Box3, Group, OrthographicCamera } from "three";
import Image from "next/image";
import { Dna, ImageOff } from "lucide-react";
import {
  Component,
  createContext,
  useContext,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
  type ReactNode,
} from "react";
import { decodeMonsterDna } from "@monsters/game-core";
import { MonsterVisual } from "@/components/game/monster-model";
import {
  PortraitCache,
  PortraitQueue,
  type PortraitJob,
} from "./portrait-queue";
import { framePortraitCamera } from "./portrait-camera";

const cache = new PortraitCache();
const PortraitContext = createContext<PortraitQueue | null>(null);
const emptySnapshot = () => null;

class PortraitBoundary extends Component<
  {
    children: ReactNode;
    onError: () => void;
  },
  { failed: boolean }
> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  componentDidCatch() {
    this.props.onError();
  }
  render() {
    return this.state.failed ? null : this.props.children;
  }
}

function CapturePortrait({
  job,
  queue,
}: {
  job: PortraitJob;
  queue: PortraitQueue;
}) {
  const { gl, scene, camera } = useThree();
  const model = useRef<Group>(null);
  const dna = useMemo(() => decodeMonsterDna(job.dna), [job.dna]);

  useLayoutEffect(() => {
    const frame = requestAnimationFrame(() => {
      try {
        if (!model.current || !(camera instanceof OrthographicCamera)) {
          throw new Error("Portrait model unavailable");
        }
        scene.updateMatrixWorld(true);
        const bounds = new Box3().setFromObject(model.current, true);
        if (bounds.isEmpty()) throw new Error("Empty portrait model");
        framePortraitCamera(camera, bounds);
        // Render a neutral pose directly: no animation loop or per-row WebGL context.
        gl.render(scene, camera);
        if (gl.getContext().isContextLost())
          throw new Error("Portrait context lost");
        queue.complete(job, gl.domElement.toDataURL("image/png"));
      } catch {
        queue.complete(job, null);
      }
    });
    return () => cancelAnimationFrame(frame);
  }, [camera, gl, job, queue, scene]);

  return (
    <group ref={model}>
      <MonsterVisual dna={dna} castShadow={false} geometryQuality="remote" />
    </group>
  );
}

/** A single, idle-by-default renderer shared by every portrait in the open ledger. */
export function MonsterPortraitProvider({ children }: { children: ReactNode }) {
  const [queue] = useState(() => new PortraitQueue(cache));
  const job = useSyncExternalStore(
    queue.subscribe,
    queue.getSnapshot,
    emptySnapshot,
  );

  useEffect(() => {
    if (!job) return;
    // Fail gracefully if WebGL cannot initialize instead of leaving loading placeholders forever.
    const timer = window.setTimeout(() => queue.complete(job, null), 10_000);
    return () => window.clearTimeout(timer);
  }, [job, queue]);

  return (
    <PortraitContext.Provider value={queue}>
      {children}
      <div className="monster-portrait-renderer" aria-hidden="true">
        <PortraitBoundary onError={queue.failAll}>
          <Canvas
            orthographic
            camera={{ position: [4, 3, -6], near: 0.01, far: 100 }}
            dpr={1}
            frameloop="never"
            gl={{ alpha: true, antialias: true, powerPreference: "low-power" }}
            onCreated={({ gl }) => {
              gl.domElement.addEventListener(
                "webglcontextlost",
                queue.failAll,
                { once: true },
              );
            }}
          >
            <hemisphereLight
              intensity={2.1}
              color="#FFF4D6"
              groundColor="#41695B"
            />
            <directionalLight intensity={2.4} position={[-4, 7, -6]} />
            <directionalLight intensity={0.7} position={[4, 3, 3]} />
            {job && (
              <PortraitBoundary
                key={job.dna}
                onError={() => queue.complete(job, null)}
              >
                <CapturePortrait job={job} queue={queue} />
              </PortraitBoundary>
            )}
          </Canvas>
        </PortraitBoundary>
      </div>
    </PortraitContext.Provider>
  );
}

export function MonsterPortrait({
  dna,
  name,
  generation,
  large = false,
}: {
  dna: string;
  name: string;
  generation?: number;
  large?: boolean;
}) {
  const queue = useContext(PortraitContext);
  const element = useRef<HTMLSpanElement>(null);
  const [result, setResult] = useState<{
    dna: string;
    image: string | null;
  } | null>(null);
  const image = result?.dna === dna ? result.image : undefined;

  useEffect(() => {
    const target = element.current;
    if (!queue || !target) return;
    let cancel: (() => void) | undefined;
    const request = () => {
      cancel ??= queue.request(dna, (src) => setResult({ dna, image: src }));
    };
    if (typeof IntersectionObserver === "undefined") {
      request();
      return () => cancel?.();
    }
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) request();
        else {
          cancel?.();
          cancel = undefined;
        }
      },
      { root: target.closest(".account-ledger"), rootMargin: "120px" },
    );
    observer.observe(target);
    return () => {
      observer.disconnect();
      cancel?.();
    };
  }, [dna, queue]);

  return (
    <span
      ref={element}
      className={`monster-portrait${large ? " monster-portrait-large" : ""}`}
    >
      {image ? (
        <Image
          src={image}
          alt={name}
          width={256}
          height={256}
          unoptimized
          draggable={false}
        />
      ) : (
        <span className="monster-portrait-placeholder" aria-hidden="true">
          {image === null ? <ImageOff size={22} /> : <Dna size={22} />}
        </span>
      )}
      {generation !== undefined && (
        <span className="account-specimen-number">G{generation}</span>
      )}
    </span>
  );
}
