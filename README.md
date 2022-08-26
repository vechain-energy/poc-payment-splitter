## Goal

Goal of the project is a multi artist collaboration project that shares the revenus of token sales:

1. 70% for Artists
1. 20% into a Pool
1. 8% locked in Contract until Collectors claim
1. 2% stay in Contract, claimable by the owner


## Reponsibilities

1. Another contract mints the Art
1. Royalty on mint and payments are handled somewhere else (Marketplace)
1. **This** Contract receives the royalty from mint and splits the revenue

## Participant

1. Marketplace
   * a public existing Marketplace
1. Artists
   * creator of the art
1. Admin
   * claim fees in contract
   * configure Pool address
1. Pool
   * wallet address
   * receiving part of the revenue
1. NFTContract
   * a standard NFT Contract
   * with extension to instruct the Royalty splitter
1. Royalty splitter
   * contract
   * an implementation of a payment splitter

```mermaid
sequenceDiagram
    participant Collector
    participant Marketplace
    participant Artist
    participant NFTContract
    participant Royalty splitter
    participant Pool
    participant Admin

    
    note over Artist, Royalty splitter: Minting the art
    Artist->>NFTContract: mint new token
    NFTContract-->>NFTContract: mint new token
    NFTContract-->Royalty splitter: register tokenId with Artist address

    note over Marketplace, Royalty splitter: Minting Event at a Marketplace
    note right of Marketplace: Marketplace puts tokens<br/>from NFTContract on sale<br/>as a minting event
    Collector->>Marketplace: mint a token with $VET
    Marketplace->>NFTContract: send $VET + TokenID + Buyer
    NFTContract->>Royalty splitter: forward $VET + TokenID

    note over Royalty splitter: https://docs.openzeppelin.com/contracts/2.x/api/payment#PullPayment
    Royalty splitter-->>Artist: % share
    Royalty splitter-->>Pool: % share
    Royalty splitter-->>Admin: % share
    Royalty splitter-->>Pool 2: % share
    Royalty splitter-->>NFTContract: confirm transaction

    NFTContract-->>Collector: transfer token

    note over Marketplace, Royalty splitter: Aftermarket
    Marketplace->>NFTContract: royaltyInfo(tokenId, salePrice)
    NFTContract-->>Marketplace: royalty + Royalty splitter address
    Marketplace->>Royalty splitter: $VET Payment
    Royalty splitter-->NFTContract: totalSupply()
    Royalty splitter-->>Artist: $VET / totalSupply() for each Artist
```
