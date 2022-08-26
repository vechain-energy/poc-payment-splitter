## Goal

Goal of the project is a multi artist collaboration project that shares the revenus of token sales:

1. 70% for Artists
1. 20% into a Pool
1. 8% locked in Contract until Collectors claim
1. 2% stay in Contract, claimable by the owner

## Participant

1. Collector
   * purchasing the Art by sending VET
1. Artists
   * mint Art on a different platform
   * send Art as NFT with a price tag
1. Admin
   * claim fees in contract
   * configure Pool address
1. Pool
   * wallet address
   * receiving part of the revenue
1. Marketplace
   * Contract
   * responsible for sharing revenue
   * owns the art on sale

```mermaid
sequenceDiagram
    participant Collector
    participant Artist
    participant Marketplace
    participant Pool
    participant Admin

    note over Artist, Marketplace: Publishing
    Artist->>Artist: mint Art somewhere
    Artist->>Marketplace: send Art for sale with $VET pricetag
    Marketplace-->>Marketplace: provide listing

    note over Collector, Marketplace: Sale
    Collector->>Marketplace: buy Art with $VET
    Marketplace-->>Artist: forward 70% as payment
    Marketplace-->>Marketplace: **put 8% into ??**
    Marketplace-->>Pool: forward 20% to Liquidity Pool
    Marketplace-->>Marketplace: keep 2%

    note over Admin, Marketplace: Access 2% share
    Admin->>Marketplace: request kept $VET
    Marketplace-->>Admin: send balance of $VET

    note over Artist, Marketplace: Access 8% share
    Artist->>Marketplace: request kept $VET
    Marketplace-->>Artist: send balance of $VET
```
