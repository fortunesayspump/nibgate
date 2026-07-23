export const CIRCLE_BATCHING_NAME = 'GatewayWalletBatched';
export const CIRCLE_BATCHING_VERSION = '1';
export const GATEWAY_MIN_AUTH_VALIDITY_SECONDS = 7 * 24 * 60 * 60;
export const GATEWAY_AUTH_VALIDITY_WINDOW_SECONDS = GATEWAY_MIN_AUTH_VALIDITY_SECONDS + 100;

const authorizationTypes = {
  TransferWithAuthorization: [
    { name: 'from', type: 'address' },
    { name: 'to', type: 'address' },
    { name: 'value', type: 'uint256' },
    { name: 'validAfter', type: 'uint256' },
    { name: 'validBefore', type: 'uint256' },
    { name: 'nonce', type: 'bytes32' }
  ]
};

function supportsBatching(requirements) {
  const extra = requirements.extra;
  if (!extra) return false;
  return extra.name === CIRCLE_BATCHING_NAME && extra.version === CIRCLE_BATCHING_VERSION;
}

function getVerifyingContract(requirements) {
  if (!supportsBatching(requirements)) return undefined;
  return requirements.extra?.verifyingContract;
}

function createNonce() {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return '0x' + Array.from(bytes).map((b) => b.toString(16).padStart(2, '0')).join('');
}

function getAddress(value) {
  return value && typeof value === 'string' && value.startsWith('0x') ? value.toLowerCase() : value;
}

export class BatchEvmScheme {
  constructor(signer) {
    this.signer = signer;
    this.scheme = CIRCLE_BATCHING_NAME;
    this._beforeHooks = [];
    this._afterHooks = [];
    this._failureHooks = [];
  }

  onBeforePaymentCreation(hook) {
    this._beforeHooks.push(hook);
    return this;
  }

  onAfterPaymentCreation(hook) {
    this._afterHooks.push(hook);
    return this;
  }

  onPaymentCreationFailure(hook) {
    this._failureHooks.push(hook);
    return this;
  }

  async createPaymentPayload(x402Version, paymentRequirements) {
    const context = {
      paymentRequired: { x402Version, accepts: [paymentRequirements] },
      selectedRequirements: paymentRequirements
    };

    for (const hook of this._beforeHooks) {
      const result = await hook(context);
      if (result && result.abort) {
        throw new Error('Payment creation aborted: ' + result.reason);
      }
    }

    try {
      if (!supportsBatching(paymentRequirements)) {
        throw new Error(
          'BatchEvmScheme can only handle Circle batching options. Expected extra.name="' +
          CIRCLE_BATCHING_NAME + '" and extra.version="' + CIRCLE_BATCHING_VERSION + '"'
        );
      }

      const verifyingContract = getVerifyingContract(paymentRequirements);
      if (!verifyingContract) {
        throw new Error(
          'Circle batching option missing extra.verifyingContract (GatewayWallet address)'
        );
      }

      const nonce = createNonce();
      const now = Math.floor(Date.now() / 1000);
      const validityWindowSeconds = Math.max(
        paymentRequirements.maxTimeoutSeconds || 0,
        GATEWAY_AUTH_VALIDITY_WINDOW_SECONDS
      );

      const authorization = {
        from: getAddress(this.signer.address),
        to: getAddress(paymentRequirements.payTo),
        value: paymentRequirements.amount,
        validAfter: String(now - 600),
        validBefore: String(now + validityWindowSeconds),
        nonce
      };

      const signature = await this.signAuthorization(authorization, paymentRequirements, verifyingContract);

      const payload = { authorization, signature };
      const result = { x402Version, payload };

      const createdContext = { ...context, paymentPayload: result };
      for (const hook of this._afterHooks) {
        try { await hook(createdContext); } catch {}
      }

      return result;
    } catch (error) {
      const failureContext = { ...context, error };
      for (const hook of this._failureHooks) {
        const result = await hook(failureContext);
        if (result && result.recovered) {
          return { x402Version: result.payload.x402Version, payload: result.payload.payload };
        }
      }
      throw error;
    }
  }

  async signAuthorization(authorization, requirements, verifyingContract) {
    if (!requirements.network.startsWith('eip155:')) {
      throw new Error('BatchEvmScheme: unsupported network format "' + requirements.network + '". Expected "eip155:<chainId>"');
    }

    const chainId = parseInt(requirements.network.split(':')[1], 10);

    const domain = {
      name: CIRCLE_BATCHING_NAME,
      version: CIRCLE_BATCHING_VERSION,
      chainId,
      verifyingContract: getAddress(verifyingContract)
    };

    const message = {
      from: getAddress(authorization.from),
      to: getAddress(authorization.to),
      value: BigInt(authorization.value),
      validAfter: BigInt(authorization.validAfter),
      validBefore: BigInt(authorization.validBefore),
      nonce: authorization.nonce
    };

    const typedData = {
      domain,
      types: authorizationTypes,
      primaryType: 'TransferWithAuthorization',
      message
    };

    return this.signer.signTypedData(typedData);
  }
}
