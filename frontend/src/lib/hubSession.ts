import { getSessionAddress } from "@nibgate/wallet/react";

export {
  HUB_SESSION_CLEARED_EVENT,
  HUB_SESSION_UPDATED_EVENT,
} from "@nibgate/wallet/react";
export { getSessionAddress };

export async function getHubSessionAddress(): Promise<string | null> {
  return getSessionAddress();
}
