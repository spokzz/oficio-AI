export const serviceOptions = ["landscaping", "mowing", "tree_cutting", "yard_cleanup", "irrigation"] as const;

export type ServiceOption = (typeof serviceOptions)[number];

export function isServiceOption(value: string): value is ServiceOption {
  return serviceOptions.includes(value as ServiceOption);
}

export function serviceOptionDefaults(): ServiceOption[] {
  return [...serviceOptions];
}
