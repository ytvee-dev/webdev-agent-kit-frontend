export type GraphNodeRole = 'flame' | 'arm' | 'eye' | 'pupil' | 'mouth'

export type Rgb = readonly [number, number, number]

export interface GraphNodeSeed {
  id: number
  role: GraphNodeRole
  x: number
  y: number
  z: number
  size: number
  color: Rgb
  anchorStrength: number
  phase: number
}

export interface GraphEdgeSeed {
  source: number
  target: number
  restLength: number
  stiffness: number
}

export interface CalciferGraphData {
  nodes: GraphNodeSeed[]
  edges: GraphEdgeSeed[]
}

export interface PhysicsNodeState {
  x: number
  y: number
  z: number
  targetX: number
  targetY: number
  targetZ: number
  vx: number
  vy: number
  vz: number
  anchorStrength: number
  phase: number
  role: GraphNodeRole
}

export interface PhysicsState {
  nodes: PhysicsNodeState[]
}

export interface PhysicsStepOptions {
  draggedIndex?: number | undefined
  draggedX?: number | undefined
  draggedY?: number | undefined
  dragInfluence?: Float32Array | undefined
  motionScale?: number | undefined
}
