import { vec4 } from 'three/tsl'
import {
  AdditiveBlending,
  BackSide,
  FrontSide,
  Mesh,
  MeshBasicNodeMaterial,
  PlaneGeometry,
  Scene,
  Vector3,
} from 'three/webgpu'
import { sceneClippingPlanes } from './scene-clipping'

/**
 * WebGPU stencil clipping cap implementation using TSL additive masking.
 * Instead of hardware stencil buffers (which are hard to share across TSL pass nodes),
 * we use additive masking.
 */

export const backFaceMaskMat = new MeshBasicNodeMaterial({
  side: BackSide,
  blending: AdditiveBlending,
  depthWrite: false,
  depthTest: true, // Must test against shared scene depth!
  colorWrite: true,
  transparent: true,
  clippingPlanes: sceneClippingPlanes,
})
backFaceMaskMat.colorNode = vec4(1, 0, 0, 1) // Red channel = +1

export const frontFaceMaskMat = new MeshBasicNodeMaterial({
  side: FrontSide,
  blending: AdditiveBlending,
  depthWrite: false,
  depthTest: true,
  colorWrite: true,
  transparent: true,
  clippingPlanes: sceneClippingPlanes,
})
frontFaceMaskMat.colorNode = vec4(1, 0, 0, 1) // Also add +1, but we subtract the passes in TSL

// A scene specifically for drawing the cap (poché) planes
export const capScene = new Scene()
const capGeometry = new PlaneGeometry(100000, 100000)
export const capFillMat = new MeshBasicNodeMaterial({
  color: 0x555555, // Poché fill color
})

const Z_AXIS = new Vector3(0, 0, 1)

// We keep exactly one cap mesh per active clipping plane
export function syncCapScene() {
  while (capScene.children.length < sceneClippingPlanes.length) {
    const mesh = new Mesh(capGeometry, capFillMat)
    capScene.add(mesh)
  }
  while (capScene.children.length > sceneClippingPlanes.length) {
    const child = capScene.children[capScene.children.length - 1]
    if (child) capScene.remove(child)
  }
  for (let i = 0; i < sceneClippingPlanes.length; i++) {
    const mesh = capScene.children[i] as Mesh
    const plane = sceneClippingPlanes[i]
    if (!plane) continue
    // Position the plane mesh on the clipping plane, facing away from the normal
    mesh.position.copy(plane.normal).multiplyScalar(-plane.constant)
    mesh.quaternion.setFromUnitVectors(Z_AXIS, plane.normal)
  }
}

