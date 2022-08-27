const { ethers } = require('hardhat')
const { BigNumber } = ethers
const Web3EthAbi = require('web3-eth-abi')
const ERC1967Proxy = require('@openzeppelin/contracts/build/contracts/ERC1967Proxy.json')

const contracts = {}
const users = {}

beforeEach(async function () {
  [users.owner, users.user1, users.user2, users.user3, users.user4] = await ethers.getSigners()
  contracts.NFT = await getContractWithProxy('NFT')
  contracts.SplitAfterMarketRevenue = await getContractWithProxy('SplitAfterMarketRevenue')
})

describe('AfterMarket', () => {
  describe('Royalty', () => {
    it('NFT supports royalty extension', async () => {
      const royaltySetterRole = await contracts.NFT.ROYALTY_SETTER_ROLE()
      await contracts.NFT.grantRole(royaltySetterRole, users.user1.address)

      await contracts.NFT.connect(users.user1).setDefaultRoyalty(contracts.SplitAfterMarketRevenue.address, 1)
      const tokenId = await createToken(users.user1.address, 'uri')
      const [royaltyAddress] = await contracts.NFT.royaltyInfo(tokenId, 1000)
      expect(royaltyAddress).toEqual(contracts.SplitAfterMarketRevenue.address)
    })

    it('only ROYALTY_SETTER_ROLE can set new royalty', async () => {
      const royaltySetterRole = await contracts.NFT.ROYALTY_SETTER_ROLE()
      await expect(contracts.NFT.setDefaultRoyalty(contracts.SplitAfterMarketRevenue.address, 1)).rejects.toThrow(`is missing role ${royaltySetterRole}`)
    })
  })

  describe('addPayee(address, shares)', () => {
    it('addPayee(address, shares) is correctly executed', async () => {
      await contracts.SplitAfterMarketRevenue.addPayee(users.user2.address, 2)
      await contracts.SplitAfterMarketRevenue.addPayee(users.user3.address, 1)

      const totalShares = await contracts.SplitAfterMarketRevenue.totalShares()
      const payeeCount = await contracts.SplitAfterMarketRevenue.payeeCount()

      expect(totalShares).toEqual(BigNumber.from(3))
      expect(payeeCount).toEqual(BigNumber.from(2))
    })

    it('only ADMIN_ROLE can add new payee', async () => {
      const adminRole = await contracts.SplitAfterMarketRevenue.ADMIN_ROLE()
      await expect(contracts.SplitAfterMarketRevenue.connect(users.user2).addPayee(users.user2.address, 2)).rejects.toThrow(`is missing role ${adminRole}`)
    })
  })

  describe('removePayee(address)', () => {
    it('removePayee(address) is correctly executed', async () => {
      await contracts.SplitAfterMarketRevenue.addPayee(users.user2.address, 2)
      await contracts.SplitAfterMarketRevenue.addPayee(users.user3.address, 1)
      await contracts.SplitAfterMarketRevenue.removePayee(users.user2.address)

      const totalShares = await contracts.SplitAfterMarketRevenue.totalShares()
      const payeeCount = await contracts.SplitAfterMarketRevenue.payeeCount()

      expect(totalShares).toEqual(BigNumber.from(1))
      expect(payeeCount).toEqual(BigNumber.from(1))
    })

    it('only ADMIN_ROLE can remove payee', async () => {
      const adminRole = await contracts.SplitAfterMarketRevenue.ADMIN_ROLE()
      await expect(contracts.SplitAfterMarketRevenue.connect(users.user2).removePayee(users.user2.address)).rejects.toThrow(`is missing role ${adminRole}`)
    })
  })

  describe('VIP-180 Tokens: releaseToken(tokenAddress, recipientAddress)', () => {
    let vtho
    beforeEach(async () => {
      const VTHO = await ethers.getContractFactory('VTHO')
      vtho = await VTHO.deploy()

      await vtho.mint(users.owner.address, 256)
    })

    it('supports receiving VIP-180 Tokens', async () => {
      await vtho.transfer(contracts.SplitAfterMarketRevenue.address, 100)
    })

    it('supports releasing to an added payee', async () => {
      await vtho.transfer(contracts.SplitAfterMarketRevenue.address, 100)
      await contracts.SplitAfterMarketRevenue.addPayee(users.user2.address, 2)
      await contracts.SplitAfterMarketRevenue.connect(users.owner).releaseToken(vtho.address, users.user2.address)

      const balanceUser = await vtho.balanceOf(users.user2.address)
      expect(balanceUser).toEqual(BigNumber.from(100))
    })

    it('respects shares for the payees', async () => {
      await vtho.transfer(contracts.SplitAfterMarketRevenue.address, 100)
      await contracts.SplitAfterMarketRevenue.addPayee(users.user2.address, 2)
      await contracts.SplitAfterMarketRevenue.addPayee(users.user3.address, 2)
      await contracts.SplitAfterMarketRevenue.connect(users.owner).releaseToken(vtho.address, users.user2.address)

      const balanceUser = await vtho.balanceOf(users.user2.address)
      expect(balanceUser).toEqual(BigNumber.from(50))
    })

    it('rejects releasing to an unknown payee', async () => {
      const admimRole = await contracts.SplitAfterMarketRevenue.ADMIN_ROLE()
      await contracts.SplitAfterMarketRevenue.grantRole(admimRole, users.user3.address)

      await vtho.transfer(contracts.SplitAfterMarketRevenue.address, 100)
      await contracts.SplitAfterMarketRevenue.addPayee(users.user2.address, 2)
      await expect(contracts.SplitAfterMarketRevenue.connect(users.user3).releaseToken(vtho.address, users.user4.address)).rejects.toThrow('PaymentSplitter: account has no shares')
    })

    it('rejects none-admin-user to trigger release', async () => {
      const adminRole = await contracts.SplitAfterMarketRevenue.ADMIN_ROLE()
      await vtho.transfer(contracts.SplitAfterMarketRevenue.address, 100)
      await contracts.SplitAfterMarketRevenue.addPayee(users.user3.address, 2)
      await expect(contracts.SplitAfterMarketRevenue.connect(users.user3).releaseToken(vtho.address, users.user2.address)).rejects.toThrow(`is missing role ${adminRole}`)
    })

    it('supports ADMIN_ROLE triggering a release', async () => {
      const admimRole = await contracts.SplitAfterMarketRevenue.ADMIN_ROLE()
      await contracts.SplitAfterMarketRevenue.grantRole(admimRole, users.user3.address)

      await vtho.transfer(contracts.SplitAfterMarketRevenue.address, 100)
      await contracts.SplitAfterMarketRevenue.addPayee(users.user2.address, 2)
      await contracts.SplitAfterMarketRevenue.connect(users.user3).releaseToken(vtho.address, users.user2.address)

      const balanceUser = await vtho.balanceOf(users.user2.address)
      expect(balanceUser).toEqual(BigNumber.from(100))
    })

    it('supports payee triggering a release', async () => {
      await vtho.transfer(contracts.SplitAfterMarketRevenue.address, 100)
      await contracts.SplitAfterMarketRevenue.addPayee(users.user3.address, 2)
      await contracts.SplitAfterMarketRevenue.connect(users.user3).releaseToken(vtho.address, users.user3.address)

      const balanceUser = await vtho.balanceOf(users.user3.address)
      expect(balanceUser).toEqual(BigNumber.from(100))
    })
  })

  describe('VET: release(payee)', () => {
    it('supports releasing to an added payee', async () => {
      await ethers.provider.send('hardhat_setBalance', [contracts.SplitAfterMarketRevenue.address, BigNumber.from(100).toHexString()])
      await ethers.provider.send('hardhat_setBalance', [users.user3.address, '0x0'])

      await contracts.SplitAfterMarketRevenue.addPayee(users.user3.address, 2)
      await contracts.SplitAfterMarketRevenue.release(users.user3.address)

      const balanceUser = await ethers.provider.getBalance(users.user3.address)
      expect(balanceUser).toEqual(BigNumber.from(100))
    })

    it('respects shares for the payees', async () => {
      await ethers.provider.send('hardhat_setBalance', [contracts.SplitAfterMarketRevenue.address, BigNumber.from(100).toHexString()])
      await ethers.provider.send('hardhat_setBalance', [users.user2.address, '0x0'])

      await contracts.SplitAfterMarketRevenue.addPayee(users.user2.address, 2)
      await contracts.SplitAfterMarketRevenue.addPayee(users.user3.address, 2)
      await contracts.SplitAfterMarketRevenue.release(users.user2.address)

      const balanceUser = await ethers.provider.getBalance(users.user2.address)
      expect(balanceUser).toEqual(BigNumber.from(50))
    })
  })
})

async function createToken(...args) {
  const { events } = await (await contracts.NFT.connect(users.owner).safeMint(...args)).wait()
  const { tokenId } = events.find(({ event }) => event === 'Transfer').args
  return tokenId
}

async function getContractWithProxy(contractName) {
  // get contract details
  const Contract = await ethers.getContractFactory(contractName)
  const contract = await Contract.deploy()

  const Proxy = await ethers.getContractFactoryFromArtifact(ERC1967Proxy)

  // calculate initialize() call during deployment
  const callInitialize = Web3EthAbi.encodeFunctionCall(
    Contract.interface.fragments.find(({ name }) => name === 'initialize'), []
  )

  // deploy proxy pointing to contract
  const proxy = await Proxy.deploy(contract.address, callInitialize)

  // return proxy address attached with contract functionality
  const proxiedContract = Contract.attach(proxy.address)
  return proxiedContract
}
