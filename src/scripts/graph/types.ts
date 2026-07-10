export type GraphNodeRole =
  | 'flame'
  | 'rim'
  | 'arm'
  | 'eye'
  | 'pupil'
  | 'mouth'
  | 'spark'
  | 'ember'

export type GraphNodeFeature =
  | 'eye-outer-rim'
  | 'eye-sclera'
  | 'eye-iris'
  | 'eye-highlight'
  | 'eye-pupil'
  | 'mouth-outer-rim'
  | 'mouth-inner-rim'
  | 'mouth-cavity'
  | 'mouth-tongue'
  | 'mouth-highlight'

export type Rgb = readonly [number, number, number]

export interface GraphNodeSeed {
  id: number
  role: GraphNodeRole
  feature?: GraphNodeFeature
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
