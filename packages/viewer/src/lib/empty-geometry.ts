import { BufferGeometry, Float32BufferAttribute } from 'three'

export function createEmptyGeometry(groupCount = 0): BufferGeometry {
  const geometry = new BufferGeometry()
  geometry.setAttribute('position', new Float32BufferAttribute(new Float32Array(9), 3))
  geometry.setAttribute('normal', new Float32BufferAttribute(new Float32Array(9), 3))
  geometry.setAttribute('uv', new Float32BufferAttribute(new Float32Array(6), 2))
  geometry.setAttribute('uv2', new Float32BufferAttribute(new Float32Array(6), 2))
  for (let group = 0; group < groupCount; group++) {
    geometry.addGroup(0, 3, group)
  }
  return geometry
}

