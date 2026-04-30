export const customerSourceOptions = ["referral", "facebook", "google", "website", "instagram", "other"] as const;

export type CustomerSourceOption = (typeof customerSourceOptions)[number];

export function isCustomerSourceOption(value: string): value is CustomerSourceOption {
  return customerSourceOptions.includes(value as CustomerSourceOption);
}
