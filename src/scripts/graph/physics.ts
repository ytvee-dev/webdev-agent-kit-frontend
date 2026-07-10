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

const getRoleMotion = (role: PhysicsState['nodes'][number]['role']): number => {
  if (role === 'ember') {
    return 3.1
  }

  if (role === 'spark') {
    return 2.45
  }

  if (role === 'arm') {
    return 1.48
  }

  if (role === 'rim') {
    return 1.18
  }

  if (role === 'flame') {
    return 1
  }

  return 0.075
}

const getDamping = (role: PhysicsState['nodes'][number]['role']): number => {
  if (role === 'ember') {
    return 3.8
  }

  if (role === 'spark') {
    return 4.2
  }

  if (role === 'arm' || role === 'rim') {
    return 5
  }

  return 5.65
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

    const roleMotion = getRoleMotion(node.role)
    const height = clamp((node.targetY + 1.08) / 2.58, 0, 1)
    const slowWave = Math.sin(elapsedSeconds * 0.92 + node.phase)
    const mediumWave = Math.sin(elapsedSeconds * 2.35 + node.phase * 1.47)
    const fastWave = Math.sin(elapsedSeconds * 5.6 + node.phase * 2.11)
    const thermalWave = Math.sin(elapsedSeconds * 1.28 - node.targetY * 4.6 + node.phase * 0.52)
    const lateral =
      (slowWave * 0.013 + mediumWave * 0.007 + fastWave * 0.0035) *
      roleMotion *
      (0.56 + height * 0.72) *
      motionScale
    const convection =
      (Math.max(0, thermalWave) * 0.018 + mediumWave * 0.005) *
      roleMotion *
      (0.48 + height * 0.84) *
      motionScale
    const orbitalX =
      node.role === 'spark' || node.role === 'ember'
        ? Math.cos(elapsedSeconds * 0.68 + node.phase) * 0.023 * roleMotion
        : 0
    const orbitalY =
      node.role === 'spark' || node.role === 'ember'
        ? Math.sin(elapsedSeconds * 0.56 + node.phase * 1.2) * 0.029 * roleMotion
        : 0
    const influence = options.dragInfluence?.[index] ?? 0
    const anchorScale = 1 - influence * 0.9
    const anchor = node.anchorStrength * anchorScale
    const targetX = node.targetX + lateral + orbitalX
    const targetY = node.targetY + convection + orbitalY
    const targetZ =
      node.targetZ +
      Math.sin(elapsedSeconds * 0.86 + node.phase) * 0.012 * roleMotion * motionScale

    accelerationX[index] = (accelerationX[index] ?? 0) + (targetX - node.x) * anchor
    accelerationY[index] = (accelerationY[index] ?? 0) + (targetY - node.y) * anchor
    accelerationZ[index] = (accelerationZ[index] ?? 0) + (targetZ - node.z) * anchor

    node.vx += (accelerationX[index] ?? 0) * delta
    node.vy += (accelerationY[index] ?? 0) * delta
    node.vz += (accelerationZ[index] ?? 0) * delta

    const damping = Math.exp(-getDamping(node.role) * delta)
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

    if (!current || current.depth > 7) {
      continue
    }

    influence[current.index] = Math.max(influence[current.index] ?? 0, Math.pow(0.67, current.depth))

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
