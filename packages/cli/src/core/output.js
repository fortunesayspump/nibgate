export function printHelp() {
  console.log(`Nibgate

Usage:
  nibgate init       Create nibgate.config.json in this project
  nibgate dev        Run the Nibgate app and gateway locally
  nibgate routes     Print protected route config
  nibgate manifest   Print the public site manifest JSON
  nibgate status     Show local site and hub connection status
  nibgate connect    Register this site with the Nibgate hub
  nibgate sync       Send the current manifest to the Nibgate hub
  nibgate verify     Ask the hub to verify site ownership
  nibgate event      Emit a signed test event to the hub
  nibgate balance    Show buyer wallet and Gateway balances
  nibgate deposit    Deposit buyer USDC into Gateway balance

Environment:
  PORT                 Server port, defaults to 3000
  NIBGATE_CONFIG       Optional absolute path to a config file
  NIBGATE_PAYMENT_MODE demo or circle-gateway
  NIBGATE_SELLER_ADDRESS EVM seller wallet for Circle Gateway mode
  NIBGATE_BUYER_PRIVATE_KEY Local/server test buyer key for Gateway payments
  NIBGATE_BUYER_CHAIN   Gateway buyer chain, defaults to arcTestnet
  NIBGATE_BUYER_RPC_URL Optional RPC URL for the buyer chain
`);
}

export function printBalances(address, wallet, gateway) {
  console.log(`Buyer: ${address}`);
  console.log(`Wallet USDC: ${wallet.formatted}`);
  console.log(`Gateway available: ${gateway.formattedAvailable}`);
  console.log(`Gateway total: ${gateway.formattedTotal}`);
  if (gateway.formattedWithdrawing !== '0') {
    console.log(`Gateway withdrawing: ${gateway.formattedWithdrawing}`);
  }
  if (gateway.formattedWithdrawable !== '0') {
    console.log(`Gateway withdrawable: ${gateway.formattedWithdrawable}`);
  }
}
