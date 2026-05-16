import type { HomeWorkerConfigDto, HomeWorkerMode } from '../../../shared/contracts/dto'
import { WORKER_CONTROL_SURFACE_CONNECTION_FILE } from '../../../shared/constants/controlSurface'
import type {
  ControlSurfaceRemoteEndpoint,
  ControlSurfaceRemoteEndpointResolver,
} from '../controlSurface/remote/controlSurfaceHttpClient'
import { resolveControlSurfaceConnectionInfoFromUserData } from '../controlSurface/remote/resolveControlSurfaceConnectionInfo'
import { startLocalWorker } from './localWorkerManager'
import { isWorkerConnectionAlive } from './workerConnectionHealth'

function toEndpoint(value: {
  hostname: string
  port: number
  token: string
}): ControlSurfaceRemoteEndpoint {
  return {
    hostname: value.hostname,
    port: value.port,
    token: value.token,
  }
}

const LOCAL_ENDPOINT_HEALTH_CHECK_TTL_MS = 5_000

function areEndpointsEqual(
  left: ControlSurfaceRemoteEndpoint | null,
  right: ControlSurfaceRemoteEndpoint | null,
): boolean {
  return (
    !!left &&
    !!right &&
    left.hostname === right.hostname &&
    left.port === right.port &&
    left.token === right.token
  )
}

async function resolveLocalWorkerEndpoint(
  userDataPath: string,
): Promise<ControlSurfaceRemoteEndpoint | null> {
  const connection = await resolveControlSurfaceConnectionInfoFromUserData({
    userDataPath,
    fileName: WORKER_CONTROL_SURFACE_CONNECTION_FILE,
  })

  return connection ? toEndpoint(connection) : null
}

async function recoverLocalWorkerEndpoint(): Promise<ControlSurfaceRemoteEndpoint | null> {
  const status = await startLocalWorker()
  return status.status === 'running' && status.connection ? toEndpoint(status.connection) : null
}

export function createHomeWorkerEndpointResolver(options: {
  userDataPath: string
  config: HomeWorkerConfigDto
  effectiveMode: HomeWorkerMode
  initialEndpoint?: ControlSurfaceRemoteEndpoint | null
  isLocalEndpointAlive?: (endpoint: ControlSurfaceRemoteEndpoint) => Promise<boolean>
  recoverLocalEndpoint?: () => Promise<ControlSurfaceRemoteEndpoint | null>
  localEndpointHealthCheckTtlMs?: number
  now?: () => number
}): ControlSurfaceRemoteEndpointResolver {
  if (options.effectiveMode === 'remote') {
    const endpoint =
      options.initialEndpoint ?? (options.config.remote ? toEndpoint(options.config.remote) : null)
    return async () => endpoint
  }

  if (options.effectiveMode === 'local') {
    let cachedEndpoint = options.initialEndpoint ?? null
    let lastHealthyEndpoint: ControlSurfaceRemoteEndpoint | null = null
    let lastHealthCheckAtMs = 0
    const isLocalEndpointAlive = options.isLocalEndpointAlive ?? isWorkerConnectionAlive
    const recoverLocalEndpoint = options.recoverLocalEndpoint ?? recoverLocalWorkerEndpoint
    const localEndpointHealthCheckTtlMs = Math.max(
      0,
      options.localEndpointHealthCheckTtlMs ?? LOCAL_ENDPOINT_HEALTH_CHECK_TTL_MS,
    )
    const now = options.now ?? (() => Date.now())

    return async () => {
      const resolved = await resolveLocalWorkerEndpoint(options.userDataPath)
      const candidateEndpoint = resolved ?? cachedEndpoint
      const checkedAtMs = now()
      if (
        candidateEndpoint &&
        areEndpointsEqual(candidateEndpoint, lastHealthyEndpoint) &&
        checkedAtMs - lastHealthCheckAtMs < localEndpointHealthCheckTtlMs
      ) {
        cachedEndpoint = candidateEndpoint
        return candidateEndpoint
      }

      if (candidateEndpoint && (await isLocalEndpointAlive(candidateEndpoint))) {
        cachedEndpoint = candidateEndpoint
        lastHealthyEndpoint = candidateEndpoint
        lastHealthCheckAtMs = checkedAtMs
        return candidateEndpoint
      }

      lastHealthyEndpoint = null
      lastHealthCheckAtMs = 0
      cachedEndpoint = await recoverLocalEndpoint()
      if (cachedEndpoint) {
        lastHealthyEndpoint = cachedEndpoint
        lastHealthCheckAtMs = now()
      }
      return cachedEndpoint
    }
  }

  return async () => null
}
