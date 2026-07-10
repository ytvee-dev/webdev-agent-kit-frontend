import type {
  CalciferGraphData,
  GraphEdgeSeed,
  PhysicsState,
  PhysicsStepOptions,
} from './types'

const clamp = (value: number, min: number, max: number): number =>
  Math.min(max, Math.max(min, value))

export const createPhysicsState = (graph: CalciferGraphData): PhysicsState => ({
  nodes: graph.nodes.map((node) => ({
    x: node.x,
    y: node.y,
    z: node.z,
    targetX: node.x,
    targetY: node.y,
    targetZ: node.z,
    vx: 0,
    vy: 0,
    vz: 0,
    anchorStrength: node.anchorStrength,
    phase: node.phase,
    role: node.role,
  })),
})

const applyEdgeSpring = (
  state: PhysicsState,
  edge: GraphEdgeSeed,
  accelerationX: Float32Array,
  accelerationY: Float32Array,
  accelerationZ: Float32Array,
): void => {
  const source = state.nodes[edge.source]
  const target = state.nodes[edge.target]

  if (!source || !target) {
    return
  }

  const dx = target.x - source.x
  const dy = target.y - source.y
  const dz = target.z - source.z
  const distance = Math.max(0.0001, Math.hypot(dx, dy, dz))
  const displacement = distance - edge.restLength
  const force = displacement * edge.stiffness
  const inverseDistance = 1 / distance
  const forceX = dx * inverseDistance * force
  const forceY = dy * inverseDistance * force
  const forceZ = dz * inverseDistance * force

  accelerationX[edge.source] = (accelerationX[edge.source] ?? 0) + forceX
  accelerationY[edge.source] = (accelerationY[edge.source] ?? 0) + forceY
  accelerationZ[edge.source] = (accelerationZ[edge.source] ?? 0) + forceZ
  accelerationX[edge.target] = (accelerationX[edge.target] ?? 0) - forceX
  accelerationY[edge.target] = (accelerationY[edge.target] ?? 0) - forceY
  accelerationZ[edge.target] = (accelerationZ[edge.target] ?? 0) - forceZ
}

export const stepGraphPhysics = (
  state: PhysicsState,
  edges: GraphEdgeSeed[],
  elapsedSeconds: number,
  deltaSeconds: number,
  options: PhysicsStepOptions = {},
): void => {
  const delta = clamp(deltaSeconds, 1 / 240, 1 / 30)
  const count = state.nodes.length
  const accelerationX = new Float32Array(count)
  const accelerationY = new Float32Array(count)
  const accelerationZ = new Float32Array(count)
  const motionScale = options.motionScale ?? 1

  for (const edge of edges) {
    applyEdgeSpring(state, edge, accelerationX, accelerationY, accelerationZ)
  }

  for (let index = 0; index < count; index += 1) {
    const node = state.nodes[index]

    if (!node) {
      continue
    }

    if (index === options.draggedIndex) {
      node.x = options.draggedX ?? node.x
      node.y = options.draggedY ?? node.y
      node.vx = 0
      node.vy = 0
      node.vz = 0
      continue
    }

    const faceScale = node.role === 'flame' || node.role === 'arm' ? 1 : 0.2
    const driftX = Math.sin(elapsedSeconds * 1.17 + node.phase) * 0.013 * faceScale * motionScale
    const driftY = Math.cos(elapsedSeconds * 1.43 + node.phase * 1.31) * 0.015 * faceScale * motionScale
    const influence = options.dragInfluence?.[index] ?? 0
    const anchorScale = 1 - influence * 0.72
    const anchor = node.anchorStrength * anchorScale
    const targetX = node.targetX + driftX
    const targetY = node.targetY + driftY
    const targetZ = node.targetZ + Math.sin(elapsedSeconds * 0.88 + node.phase) * 0.008 * faceScale

    accelerationX[index] =
      (accelerationX[index] ?? 0) + (targetX - node.x) * anchor
    accelerationY[index] =
      (accelerationY[index] ?? 0) + (targetY - node.y) * anchor
    accelerationZ[index] =
      (accelerationZ[index] ?? 0) + (targetZ - node.z) * anchor

    node.vx += (accelerationX[index] ?? 0) * delta
    node.vy += (accelerationY[index] ?? 0) * delta
    node.vz += (accelerationZ[index] ?? 0) * delta

    const damping = Math.exp(-5.8 * delta)
    node.vx *= damping
    node.vy *= damping
    node.vz *= damping

    node.x += node.vx * delta
    node.y += node.vy * delta
    node.z += node.vz * delta
  }
}

export const createDragInfluence = (
  nodeCount: number,
  edges: GraphEdgeSeed[],
  draggedIndex: number,
): Float32Array => {
  const adjacency = Array.from({ length: nodeCount }, () => [] as number[])

  for (const edge of edges) {
    adjacency[edge.source]?.push(edge.target)
    adjacency[edge.target]?.push(edge.source)
  }

  const influence = new Float32Array(nodeCount)
  const queue: Array<{ index: number; depth: number }> = [{ index: draggedIndex, depth: 0 }]
  const visited = new Set<number>([draggedIndex])

  while (queue.length > 0) {
    const current = queue.shift()

    if (!current || current.depth > 4) {
      continue
    }

    influence[current.index] = Math.max(influence[current.index] ?? 0, Math.pow(0.58, current.depth))

    for (const neighbour of adjacency[current.index] ?? []) {
      if (visited.has(neighbour)) {
        continue
      }

      visited.add(neighbour)
      queue.push({ index: neighbour, depth: current.depth + 1 })
    }
  }

  return influence
}
