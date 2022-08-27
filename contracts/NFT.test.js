const { ethers } = require('hardhat')
const { BigNumber } = ethers
const Web3EthAbi = require('web3-eth-abi')
const ERC1967Proxy = require('@openzeppelin/contracts/build/contracts/ERC1967Proxy.json')

const contracts = {}
const users = {}

beforeEach(async function () {
  [users.owner, users.user1, users.user2, users.user3, users.user4] = await ethers.getSigners()
  contracts.NFT = await getContractWithProxy('NFT')
})

describe('NFT', () => {
  describe('Initialization', () => {
    it('sets msg.sender as default admin', async () => {
      const contract = await getContractWithProxy('NFT')
      const role = '0x0000000000000000000000000000000000000000000000000000000000000000'
      const isOwner = await contract.hasRole(role, users.owner.address)
      expect(isOwner).toEqual(true)
    })
  })

  describe('safeMint(to, uri)', () => {
    it('mints new nft for recipient', async () => {
      await contracts.NFT.safeMint(users.user1.address, '')
      const balance = await contracts.NFT.balanceOf(users.user1.address)
      expect(balance).toEqual(BigNumber.from(1))
    })

    it('sets uri correctly', async () => {
      const uri = 'https://vechain.energy'
      const { events } = await (await contracts.NFT.safeMint(users.user1.address, uri)).wait()
      const { tokenId } = events.find(({ event }) => event === 'Transfer').args

      const tokenUri = await contracts.NFT.tokenURI(tokenId)
      expect(tokenUri).toEqual(uri)
    })

    it('increments tokenId with each mint', async () => {
      const tokenId1 = await createToken(users.user1.address, '')
      const tokenId2 = await createToken(users.user2.address, '')

      expect(tokenId1).toEqual(BigNumber.from(0))
      expect(tokenId2).toEqual(BigNumber.from(1))
    })

  })
})

async function createToken (...args) {
  const { events } = await (await contracts.NFT.connect(users.owner).safeMint(...args)).wait()
  const { tokenId } = events.find(({ event }) => event === 'Transfer').args
  return tokenId
}

async function getContractWithProxy (contractName) {
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
