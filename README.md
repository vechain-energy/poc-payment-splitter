# PaymentSplitter

* The PaymentSplitter is a contract that supports receiving VET + Token Payments. A list of payees can be managed with a configurable number of shares.
* Payments are released by an Admin and sent to all payees in a single transaction, respecting the share for the balance at the time of release.

Source: [./contracts/PaymentSplitter.sol](./contracts/PaymentSplitter.sol)

```shell
yarn install
yarn build
yarn test
yarn deploy PaymentSplitter
```

# Distribute Tokens by NFT Holder-Shares

* A web-application reading all NFT token holders of a configured contract. The balance of the currently signed in wallet is distributed based on the number of NFT tokens.  
* A single transaction will distribute the full balane of VET or Tokens.

Source: [./web/distribute-vet-or-token-balance-to-nft-holders](./web/distribute-vet-or-token-balance-to-nft-holders) ([Sandbox](https://codesandbox.io/s/distribute-vet-or-token-balance-to-nft-holders-pff7ix))


```shell
cd web/distribute-vet-or-token-balance-to-nft-holders
yarn install
SKIP_PREFLIGHT_CHECK=true yarn start
```