import { generateAnnualSolarSchedule, sceneRegistry, useScene } from '@pascal-app/core'
import { useFrame, useThree } from '@react-three/fiber'
import { useEffect, useRef } from 'react'
import * as THREE from 'three'
import { useSolarAnalysis } from '../store/use-solar-analysis'

const MAX_RAYS_PER_FRAME = 500

function getColorFromRamp(ratio: number): THREE.Color {
  // Blue (shadow) to Orange to Yellow (full sun)
  // Let's use a simple interpolation
  const c1 = new THREE.Color(0x1e3a8a) // blue-900
  const c2 = new THREE.Color(0xfb923c) // orange-400
  const c3 = new THREE.Color(0xfef08a) // yellow-200

  if (ratio < 0.5) {
    return c1.lerp(c2, ratio * 2)
  }
  return c2.lerp(c3, (ratio - 0.5) * 2)
}

export function SolarAnalysisSystem() {
  const isAnalyzing = useSolarAnalysis((state) => state.isAnalyzing)
  const setProgress = useSolarAnalysis((state) => state.setProgress)
  const completeAnalysis = useSolarAnalysis((state) => state.completeAnalysis)
  const results = useSolarAnalysis((state) => state.results)

  const { scene } = useThree()

  const taskRef = useRef<{
    schedule: THREE.Vector3[]
    nodes: Array<{ id: string; points: THREE.Vector3[]; normal: THREE.Vector3 }>
    currentNodeIndex: number
    currentPointIndex: number
    currentSunIndex: number
    results: Record<string, number>
    totalRays: number
    raysCast: number
    raycaster: THREE.Raycaster
  } | null>(null)

  // Coloring effect
  useEffect(() => {
    if (!results) {
      // Restore original materials
      const targetTypes = ['wall', 'slab', 'roof', 'solar-panel']
      for (const type of targetTypes) {
        const ids = sceneRegistry.byType[type]
        if (!ids) continue
        for (const id of ids) {
          const obj = sceneRegistry.nodes.get(id)
          if (!obj) continue
          obj.traverse((child) => {
            const mesh = child as THREE.Mesh
            if (mesh.isMesh && mesh.userData.originalMaterial) {
              mesh.material = mesh.userData.originalMaterial
              mesh.userData.originalMaterial = null
            }
          })
        }
      }
      return
    }

    // Apply colored materials based on results
    for (const [id, ratio] of Object.entries(results)) {
      const obj = sceneRegistry.nodes.get(id)
      if (!obj) continue

      const color = getColorFromRamp(ratio)
      const mat = new THREE.MeshBasicMaterial({ color })

      obj.traverse((child) => {
        const mesh = child as THREE.Mesh
        if (mesh.isMesh) {
          if (!mesh.userData.originalMaterial) {
            mesh.userData.originalMaterial = mesh.material
          }
          mesh.material = mat
        }
      })
    }
  }, [results])

  useEffect(() => {
    if (isAnalyzing && !taskRef.current) {
      // Initialize task
      let location = { latitude: 41.0082, longitude: 28.9784 }
      let northOffset = 0

      for (const node of Object.values(useScene.getState().nodes)) {
        if (node.type === 'site') {
          const site = node as any
          if (typeof site.latitude === 'number' && typeof site.longitude === 'number') {
            location = { latitude: site.latitude, longitude: site.longitude }
          }
          if (typeof site.northOffset === 'number') {
            northOffset = site.northOffset
          }
          break
        }
      }

      const rawSchedule = generateAnnualSolarSchedule(location, northOffset)
      const schedule = rawSchedule.map((s) => new THREE.Vector3(...s).normalize())

      const targetTypes = ['wall', 'slab', 'roof', 'solar-panel']
      const nodesToAnalyze = []

      let totalPoints = 0

      for (const type of targetTypes) {
        const ids = sceneRegistry.byType[type]
        if (!ids) continue
        for (const id of ids) {
          const obj = sceneRegistry.nodes.get(id)
          if (!obj) continue

          // Generate sample points using bounding box
          const box = new THREE.Box3().setFromObject(obj)
          if (box.isEmpty()) continue

          const center = box.getCenter(new THREE.Vector3())
          // For slabs/roofs, use top face. For walls, use center.
          if (type === 'slab' || type === 'roof' || type === 'solar-panel') {
            center.y = box.max.y + 0.1 // slightly above
          }

          const points = [center]

          nodesToAnalyze.push({
            id,
            points,
            normal: new THREE.Vector3(0, 1, 0), // rough approximation
          })

          totalPoints += points.length
        }
      }

      const totalRays = totalPoints * schedule.length

      if (totalRays === 0) {
        completeAnalysis({})
        return
      }

      taskRef.current = {
        schedule,
        nodes: nodesToAnalyze,
        currentNodeIndex: 0,
        currentPointIndex: 0,
        currentSunIndex: 0,
        results: {},
        totalRays,
        raysCast: 0,
        raycaster: new THREE.Raycaster(),
      }
    }
  }, [isAnalyzing, completeAnalysis])

  useFrame(() => {
    const task = taskRef.current
    if (!task || !isAnalyzing) return

    let raysThisFrame = 0
    const { raycaster, schedule, nodes } = task

    while (raysThisFrame < MAX_RAYS_PER_FRAME) {
      if (task.currentNodeIndex >= nodes.length) {
        // Done
        completeAnalysis(task.results)
        taskRef.current = null
        return
      }

      const nodeData = nodes[task.currentNodeIndex]
      if (!nodeData) break

      const point = nodeData.points[task.currentPointIndex]
      const sunDir = schedule[task.currentSunIndex]
      if (!point || !sunDir) break

      // Raycast
      raycaster.set(point, sunDir)
      // Hide the current object so it doesn't self-intersect
      const obj = sceneRegistry.nodes.get(nodeData.id)
      const wasVisible = obj ? obj.visible : false
      if (obj) obj.visible = false

      const hits = raycaster.intersectObject(scene, true)

      if (obj) obj.visible = wasVisible

      // If no hit, it's lit
      if (hits.length === 0) {
        task.results[nodeData.id] = (task.results[nodeData.id] || 0) + 1
      }

      task.raysCast++
      raysThisFrame++

      // Advance indices
      task.currentSunIndex++
      if (task.currentSunIndex >= schedule.length) {
        task.currentSunIndex = 0
        task.currentPointIndex++

        if (task.currentPointIndex >= nodeData.points.length) {
          task.currentPointIndex = 0

          // Normalize result for this node (kWh/m2 equivalent)
          // 1 hour = 1 weight. Total possible is schedule.length.
          const maxSun = schedule.length * nodeData.points.length
          const actualSun = task.results[nodeData.id] || 0
          task.results[nodeData.id] = actualSun / maxSun // Ratio 0-1

          task.currentNodeIndex++
        }
      }
    }

    setProgress(Math.round((task.raysCast / task.totalRays) * 100))
  })

  return null
}
