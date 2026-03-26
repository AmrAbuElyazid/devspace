export function getTrafficLightPosition(sidebarOpen: boolean): { x: number; y: number } {
  return sidebarOpen ? { x: 16, y: 18 } : { x: 16, y: 6 };
}
