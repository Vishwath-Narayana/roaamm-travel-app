export interface ServiceEndpoint {
  name: string;
  label: string;
  url: string;
}

export const SERVICES: ServiceEndpoint[] = [
  { name: "web", label: "Web app", url: "https://roaamm.plinthwell.com/health.json" },
  { name: "edge", label: "Real-time edge", url: "https://roaamm-rt.plinthwell.com/health" },
  { name: "api", label: "Core API", url: "https://roaamm-api.plinthwell.com/health" },
  { name: "status", label: "System page", url: "https://roaamm-status.plinthwell.com/health.json" },
];
