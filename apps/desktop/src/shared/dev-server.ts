/** Ports a managed terminal session is currently listening on, lowest first. */
export interface DevServerPorts {
  sessionId: string;
  ports: number[];
}
