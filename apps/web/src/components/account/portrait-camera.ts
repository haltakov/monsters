import { Box3, OrthographicCamera, Vector3 } from "three";

/** Fit the entire silhouette, including wings, long tails and tall horns. */
export function framePortraitCamera(camera: OrthographicCamera, bounds: Box3) {
  const center = bounds.getCenter(new Vector3());
  const radius = Math.max(bounds.getSize(new Vector3()).length() / 2, 0.1);
  camera.position
    .copy(center)
    .addScaledVector(new Vector3(1, 0.55, -1.8).normalize(), radius * 3);
  camera.near = 0.01;
  camera.far = radius * 8;
  camera.lookAt(center);
  camera.updateMatrixWorld(true);
  let extent = 0;
  for (const x of [bounds.min.x, bounds.max.x]) {
    for (const y of [bounds.min.y, bounds.max.y]) {
      for (const z of [bounds.min.z, bounds.max.z]) {
        const point = new Vector3(x, y, z).applyMatrix4(
          camera.matrixWorldInverse,
        );
        extent = Math.max(extent, Math.abs(point.x), Math.abs(point.y));
      }
    }
  }
  extent = Math.max(extent * 1.12, 0.1);
  camera.left = camera.bottom = -extent;
  camera.right = camera.top = extent;
  camera.updateProjectionMatrix();
}
