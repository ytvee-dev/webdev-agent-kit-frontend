import { createCalciferGraph } from './generateGraph'
import type { CalciferGraphData } from './types'

interface CreatePresentationGraphOptions {
  nodeCount: number
  seed?: number
}

const clamp = (value: number, min: number, max: number): number =>
  Math.min(max, Math.max(min, value))

const deepenMouthGeometry = (graph: CalciferGraphData): void => {
  for (const node of graph.nodes) {
    if (node.feature === 'mouth-outer-rim' && node.y < -0.56) {
      const depth = clamp((-node.y - 0.56) / 0.15, 0, 1)
      node.y -= depth * 0.15
    }

    if (node.feature === 'mouth-inner-rim' && node.y < -0.58) {
      const depth = clamp((-node.y - 0.58) / 0.12, 0, 1)
      node.y -= depth * 0.1
    }

    if (node.feature === 'mouth-highlight' && node.y < -0.61) {
      const depth = clamp((-node.y - 0.61) / 0.1, 0, 1)
      node.y -= depth * 0.09
    }
  }

  for (const edge of graph.edges) {
    const source = graph.nodes[edge.source]
    const target = graph.nodes[edge.target]

    if (!source || !target) {
      continue
    }

    edge.restLength = Math.hypot(
      source.x - target.x,
      source.y - target.y,
      source.z - target.z,
    )
  }
}

export const createPresentationGraph = (
  options: CreatePresentationGraphOptions,
): CalciferGraphData => {
  const graph =
    options.seed === undefined
      ? createCalciferGraph({ nodeCount: options.nodeCount })
      : createCalciferGraph({ nodeCount: options.nodeCount, seed: options.seed })

  deepenMouthGeometry(graph)

  return graph
}
