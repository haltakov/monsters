import * as THREE from "three";

export type Point3 = [number, number, number];
export type SkinAnchor = {
  position: Point3;
  normal: THREE.Vector3;
  quaternion: THREE.Quaternion;
};

/** Rest-pose skin queries, shared by every instance of a cached geometry.
 * Attachments are fitted AFTER smoothing, never to the old primitive envelope.
 * All coordinates are in monster-local space (before build/size scaling).
 */
export class MonsterSurface {
  private readonly mesh: THREE.Mesh;
  private readonly ray = new THREE.Raycaster();
  private readonly anchors = new Map<string, SkinAnchor>();

  constructor(geometry: THREE.BufferGeometry, scale = 2.15, originY = 1.35) {
    this.mesh = new THREE.Mesh(geometry);
    this.mesh.scale.setScalar(scale);
    this.mesh.position.y = originY;
    this.mesh.updateMatrixWorld(true);
  }

  at(target: Point3, outward: Point3, inset = 0.035): SkinAnchor {
    const key = [...target, ...outward, inset].join(":");
    const cached = this.anchors.get(key);
    if (cached) return cached;
    const direction = new THREE.Vector3(...outward).normalize();
    const hint = new THREE.Vector3(...target);
    this.ray.set(
      hint.clone().addScaledVector(direction, 8),
      direction.clone().negate(),
    );
    const hit = this.ray.intersectObject(this.mesh, false)[0];
    let point: THREE.Vector3;
    let normal: THREE.Vector3;
    if (hit) {
      point = hit.point;
      normal = (hit.normal ?? hit.face!.normal).clone().normalize();
    } else {
      // Extreme DNA can put a requested ray outside the silhouette. Fit to
      // the closest real vertex instead of returning an ungrounded guess.
      const positions = this.mesh.geometry.getAttribute("position");
      const normals = this.mesh.geometry.getAttribute("normal");
      point = new THREE.Vector3();
      normal = direction.clone();
      const candidate = new THREE.Vector3();
      let nearest = Infinity;
      for (let i = 0; i < positions.count; i++) {
        candidate
          .fromBufferAttribute(positions, i)
          .applyMatrix4(this.mesh.matrixWorld);
        const distance = candidate.distanceToSquared(hint);
        if (distance < nearest) {
          nearest = distance;
          point.copy(candidate);
          normal.fromBufferAttribute(normals, i).normalize();
        }
      }
    }
    const anchor: SkinAnchor = {
      position: point.addScaledVector(normal, -inset).toArray() as Point3,
      normal,
      quaternion: new THREE.Quaternion().setFromUnitVectors(
        new THREE.Vector3(0, 1, 0),
        normal,
      ),
    };
    this.anchors.set(key, anchor);
    return anchor;
  }
}

const surfaces = new WeakMap<THREE.BufferGeometry, MonsterSurface>();
export function getMonsterSurface(geometry: THREE.BufferGeometry) {
  let surface = surfaces.get(geometry);
  if (!surface) {
    surface = new MonsterSurface(geometry);
    surfaces.set(geometry, surface);
  }
  return surface;
}
