"use client";

import ContentViewer from "./ContentViewer";
import { NibgateUnlock } from "@nibgate/wallet/react";
import { ACCESS_PATH, GATEWAY_BALANCE_PATH } from "../api";
import type { AccessResource } from "../types";

export default function UnlockGate({ resource }: { resource: AccessResource }) {
  return (
    <NibgateUnlock
      resource={{
        id: resource.id,
        title: resource.title,
        type: resource.type,
        price: resource.price,
        currency: resource.currency,
        path: resource.path,
      }}
      accessPath={ACCESS_PATH(resource.id)}
      gatewayBalanceUrl={GATEWAY_BALANCE_PATH}
      noncePath="/auth/nonce"
      verifyPath="/auth/verify"
    >
      {(state) => (
        <ContentViewer
          body={(state.payload as { content?: unknown } | null)?.content}
          title={resource.title}
          slug={resource.id}
        />
      )}
    </NibgateUnlock>
  );
}
