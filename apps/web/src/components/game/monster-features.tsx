import { useEffect, useMemo, type ReactNode, type RefObject } from "react";
import * as THREE from "three";
import type { MonsterDna } from "./monster-dna";
import type { BodyProfile } from "./monster-model";
import { taperedSweep } from "./monster-appendages";
import { MonsterSurface, type Point3 } from "./monster-surface";

function Sweep({
  points,
  radii,
  color,
  scale,
  castShadow = false,
}: {
  points: Point3[];
  radii: number[];
  color: string;
  scale?: Point3;
  castShadow?: boolean;
}) {
  const signature = JSON.stringify([points, radii]);
  const geometry = useMemo(() => {
    const [path, widths] = JSON.parse(signature) as [Point3[], number[]];
    return taperedSweep(path, widths);
  }, [signature]);
  useEffect(() => () => geometry.dispose(), [geometry]);
  return (
    <mesh geometry={geometry} scale={scale} castShadow={castShadow}>
      <meshStandardMaterial color={color} roughness={0.74} />
    </mesh>
  );
}

function Mount({
  surface,
  point,
  direction = [0, 1, 0],
  children,
  align = true,
  inset = 0.045,
}: {
  surface: MonsterSurface;
  point: Point3;
  direction?: Point3;
  children: ReactNode;
  align?: boolean;
  inset?: number;
}) {
  const anchor = surface.at(point, direction, inset);
  return (
    <group
      position={anchor.position}
      quaternion={align ? anchor.quaternion : undefined}
    >
      {children}
    </group>
  );
}

type FeatureProps = {
  dna: MonsterDna;
  profile: BodyProfile;
  surface: MonsterSurface;
  accent: string;
  bodyColor: string;
  castShadow: boolean;
  wingRefs?: Array<RefObject<THREE.Group | null>>;
};

export function SkinHorns({
  dna,
  profile,
  surface,
  accent,
  castShadow,
}: FeatureProps) {
  const { horns } = dna;
  if (horns === "none") return null;
  const [y, z, spread] = profile.horn;
  if (horns === "rhino") {
    return (
      <Mount
        surface={surface}
        point={[0, profile.face[0] + 0.13, profile.face[1] - 0.06]}
        direction={[0, 0.65, -1]}
      >
        <Sweep
          points={[
            [0, -0.07, 0],
            [0, 0.28, 0],
            [0, 0.65, -0.16],
          ]}
          radii={[0.2, 0.14, 0.005]}
          color={accent}
          castShadow={castShadow}
        />
      </Mount>
    );
  }
  const offsets =
    horns === "single"
      ? [0]
      : horns === "crown"
        ? [-0.34, 0, 0.34]
        : [-spread * 0.8, spread * 0.8];
  return (
    <group>
      {offsets.map((x) => (
        <Mount key={x} surface={surface} point={[x, y, z]}>
          {horns === "buds" ? (
            <mesh position={[0, 0.07, 0]} scale={[0.16, 0.2, 0.16]}>
              <sphereGeometry args={[1, 18, 12]} />
              <meshStandardMaterial color={accent} />
            </mesh>
          ) : horns === "ram" ? (
            <Sweep
              points={[
                [0, -0.07, 0],
                [0.12, 0.23, 0.08],
                [0.18, 0.2, 0.48],
                [0.16, -0.18, 0.55],
                [0.1, -0.26, 0.26],
                [0.06, -0.1, 0.19],
              ]}
              radii={[0.18, 0.15, 0.11, 0.07, 0.012]}
              color={accent}
              castShadow={castShadow}
            />
          ) : horns === "antlers" ? (
            <group>
              <Sweep
                points={[
                  [0, -0.06, 0],
                  [0, 0.4, 0.04],
                  [Math.sign(x) * 0.2, 0.95, 0.18],
                ]}
                radii={[0.115, 0.075, 0.008]}
                color={accent}
                castShadow={castShadow}
              />
              {[0.3, 0.55].map((h) => (
                <Sweep
                  key={h}
                  points={[
                    [0, h, 0.04],
                    [Math.sign(x) * 0.2, h + 0.12, -0.02],
                    [Math.sign(x) * 0.29, h + 0.32, -0.08],
                  ]}
                  radii={[0.065, 0.04, 0.005]}
                  color={accent}
                />
              ))}
            </group>
          ) : (
            <Sweep
              points={[
                [0, -0.07, 0],
                [0, 0.28, 0.02],
                [
                  x * 0.23,
                  horns === "single"
                    ? 0.84
                    : horns === "crown" && x !== 0
                      ? 0.43
                      : 0.64,
                  -0.12,
                ],
              ]}
              radii={[horns === "crown" ? 0.13 : 0.18, 0.1, 0.004]}
              color={accent}
              castShadow={castShadow}
            />
          )}
        </Mount>
      ))}
    </group>
  );
}

export function SkinEars({
  dna,
  profile,
  surface,
  accent,
  bodyColor,
  castShadow,
}: FeatureProps) {
  if (dna.ears === "none") return null;
  const { ears } = dna;
  return (
    <group>
      {[-1, 1].map((side) => (
        <Mount
          key={side}
          surface={surface}
          point={[
            side * profile.scale[0] * 0.62,
            profile.face[0] + 0.2,
            profile.face[1] + 0.35,
          ]}
          direction={[side * 0.8, 0.6, 0]}
          align={false}
        >
          {ears === "round" || ears === "fan" ? (
            <group>
              <mesh
                position={[0, 0.18, 0]}
                scale={[
                  ears === "fan" ? 0.38 : 0.28,
                  ears === "fan" ? 0.46 : 0.3,
                  0.12,
                ]}
                castShadow={castShadow}
              >
                <sphereGeometry args={[1, 24, 16]} />
                <meshStandardMaterial color={bodyColor} roughness={0.8} />
              </mesh>
              <mesh
                position={[0, 0.19, -0.09]}
                scale={[
                  ears === "fan" ? 0.29 : 0.19,
                  ears === "fan" ? 0.34 : 0.21,
                  0.04,
                ]}
              >
                <sphereGeometry args={[1, 20, 14]} />
                <meshStandardMaterial color={accent} roughness={0.8} />
              </mesh>
            </group>
          ) : (
            <group>
              <Sweep
                points={
                  ears === "floppy"
                    ? [
                        [0, -0.06, 0],
                        [side * 0.12, 0.23, 0],
                        [side * 0.22, -0.22, -0.05],
                        [side * 0.17, -0.48, -0.05],
                      ]
                    : [
                        [0, -0.08, 0],
                        [side * 0.08, 0.28, 0],
                        [side * 0.12, ears === "long-ear" ? 0.98 : 0.63, 0.04],
                      ]
                }
                radii={
                  ears === "floppy"
                    ? [0.16, 0.24, 0.2, 0.03]
                    : ears === "long-ear"
                      ? [0.14, 0.19, 0.19, 0.13, 0.008]
                      : [0.17, 0.23, 0.008]
                }
                scale={[1, 1, 0.48]}
                color={accent}
                castShadow={castShadow}
              />
            </group>
          )}
        </Mount>
      ))}
    </group>
  );
}

export function SkinAdaptation({
  dna,
  profile,
  surface,
  accent,
  bodyColor,
  castShadow,
  wingRefs,
}: FeatureProps) {
  const type = dna.adaptation;
  if (type === "none") return null;
  const [cx, cy, cz] = profile.center;
  const [sx, sy, sz] = profile.scale;
  const upright = dna.body === "biped" || dna.body === "avian";
  if (type === "wings" || type === "fins") {
    return (
      <group>
        {[-1, 1].map((side, index) => {
          const anchor = surface.at(
            [
              side * sx,
              cy + sy * (dna.body === "biped" ? 0.62 : 0.22),
              cz + 0.12,
            ],
            [side, 0, 0],
            0.07,
          );
          return (
            <group key={side} position={anchor.position}>
              <group
                ref={type === "wings" ? wingRefs?.[index] : undefined}
                rotation={[
                  type === "wings" ? 0.55 : 0.12,
                  0,
                  side * (type === "wings" ? 0.28 : -0.18),
                ]}
              >
                <Sweep
                  points={[
                    [0, 0, 0],
                    [side * 0.43, 0.12, 0.02],
                    [side * (type === "wings" ? 1.5 : 0.8), 0.15, 0.23],
                  ]}
                  radii={[0.15, type === "wings" ? 0.38 : 0.28, 0.008]}
                  scale={[1, 0.35, 1]}
                  color={bodyColor}
                  castShadow={castShadow}
                />
                {Array.from({ length: type === "wings" ? 5 : 3 }, (_, i) => (
                  <Sweep
                    key={i}
                    points={[
                      [side * (0.18 + i * 0.13), 0.02, 0.05],
                      [side * (0.38 + i * 0.18), 0.02, 0.36],
                      [
                        side * (0.48 + i * (type === "wings" ? 0.26 : 0.2)),
                        -0.02,
                        (type === "wings" ? 1.08 : 0.52) - i * 0.08,
                      ],
                    ]}
                    radii={[0.13, type === "wings" ? 0.19 : 0.15, 0.01]}
                    scale={[1, 0.32, 1]}
                    color={accent}
                    castShadow={castShadow}
                  />
                ))}
              </group>
            </group>
          );
        })}
      </group>
    );
  }
  if (type === "shell") {
    // A fitted carapace across the dorsal surface, not a ball buried in the rump.
    return (
      <group>
        {[-0.42, 0, 0.42].flatMap((row) =>
          [-0.45, 0, 0.45].map((column) => (
            <Mount
              key={`${row}:${column}`}
              surface={surface}
              point={
                upright
                  ? [cx + column * sx, cy + row * sy * 1.4, cz + sz]
                  : [cx + column * sx, cy + sy, cz + row * sz]
              }
              direction={upright ? [0, 0, 1] : [0, 1, 0]}
              inset={0.07}
            >
              <mesh
                position={[0, 0.05, 0]}
                scale={[sx * 0.39, 0.17, upright ? sy * 0.4 : sz * 0.32]}
                castShadow={castShadow}
              >
                <sphereGeometry args={[1, 20, 14]} />
                <meshStandardMaterial color={accent} roughness={0.87} />
              </mesh>
            </Mount>
          )),
        )}
      </group>
    );
  }
  if (type === "antennae") {
    return (
      <group>
        {[-1, 1].map((side) => (
          <Mount
            key={side}
            surface={surface}
            point={[side * 0.28, profile.face[0] + 0.3, profile.face[1] + 0.15]}
          >
            <Sweep
              points={[
                [0, -0.05, 0],
                [side * 0.12, 0.35, -0.04],
                [side * 0.2, 0.66, -0.18],
              ]}
              radii={[0.06, 0.04, 0.025]}
              color={bodyColor}
            />
            <mesh position={[side * 0.2, 0.66, -0.18]}>
              <sphereGeometry args={[0.1, 18, 12]} />
              <meshStandardMaterial color={accent} />
            </mesh>
          </Mount>
        ))}
      </group>
    );
  }
  if (type === "mane") {
    return (
      <group>
        {Array.from({ length: 14 }, (_, i) => {
          const angle = (i / 13 - 0.5) * Math.PI * 1.4;
          const direction: Point3 = [Math.sin(angle), Math.cos(angle), 0];
          return (
            <Mount
              key={i}
              surface={surface}
              point={[
                Math.sin(angle) * sx * 0.65,
                profile.face[0] - 0.16 + Math.cos(angle) * 0.46,
                profile.face[1] + 0.5,
              ]}
              direction={direction}
              inset={0.07}
            >
              <Sweep
                points={[
                  [0, -0.08, 0],
                  [0, 0.16, 0.04],
                  [0, 0.35, 0.21],
                ]}
                radii={[0.19, 0.23, 0.008]}
                color={accent}
                castShadow={castShadow}
              />
            </Mount>
          );
        })}
      </group>
    );
  }
  return (
    <group>
      {Array.from({ length: type === "spines" ? 9 : 6 }, (_, i) => {
        const count = type === "spines" ? 9 : 6;
        const progress = i / (count - 1);
        return (
          <Mount
            key={i}
            surface={surface}
            point={
              upright
                ? [0, cy + (progress - 0.5) * sy * 1.45, cz + sz]
                : [0, cy + sy, cz + (progress - 0.5) * sz * 1.45]
            }
            direction={upright ? [0, 0, 1] : [0, 1, 0]}
          >
            <Sweep
              points={[
                [0, -0.05, 0],
                [0, 0.2, 0.04],
                [0, 0.4 + Math.sin(progress * Math.PI) * 0.18, 0.16],
              ]}
              radii={
                type === "spines" ? [0.1, 0.06, 0.004] : [0.19, 0.25, 0.004]
              }
              scale={type === "plates" ? [0.32, 1, 1.3] : undefined}
              color={accent}
              castShadow={castShadow}
            />
          </Mount>
        );
      })}
    </group>
  );
}

export function SkinGills({ dna, profile, surface, bodyColor }: FeatureProps) {
  if (dna.breathing === "lungs") return null;
  const color = new THREE.Color(bodyColor).multiplyScalar(0.42).getStyle();
  return (
    <group>
      {[-1, 1].flatMap((side) =>
        [0, 1, 2].map((slit) => {
          const points = Array.from({ length: 7 }, (_, i) => {
            const t = i / 6;
            return surface.at(
              [
                side * profile.scale[0],
                profile.face[0] - 0.35 + t * 0.32,
                profile.face[1] +
                  0.55 +
                  slit * 0.16 +
                  Math.sin(t * Math.PI) * 0.045,
              ],
              [side, 0, 0],
              -0.003,
            ).position;
          });
          return (
            <Sweep
              key={`${side}:${slit}`}
              points={points}
              radii={[0.002, 0.016, 0.016, 0.002]}
              color={color}
            />
          );
        }),
      )}
    </group>
  );
}

export function SkinSmile({
  profile,
  surface,
}: {
  profile: BodyProfile;
  surface: MonsterSurface;
}) {
  const points = Array.from({ length: 9 }, (_, i) => {
    const x = (i / 8 - 0.5) * 0.42 * profile.faceScale;
    const y =
      profile.face[0] -
      (0.4 + Math.sin((i / 8) * Math.PI) * 0.085) * profile.faceScale;
    return surface.at([x, y, profile.face[1]], [0, 0, -1], -0.007).position;
  });
  return (
    <Sweep
      points={points}
      radii={[0.008, 0.022, 0.022, 0.008]}
      color="#173F35"
    />
  );
}
