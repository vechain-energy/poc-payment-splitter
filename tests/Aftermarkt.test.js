const { ethers } = require('hardhat')
const { BigNumber } = ethers
const Web3EthAbi = require('web3-eth-abi')
const ERC1967Proxy = require('@openzeppelin/contracts/build/contracts/ERC1967Proxy.json')

const contracts = {}
const users = {}

beforeEach(async () => {
  [users.owner, users.admin, users.artist1, users.artist2, users.artist3, users.anon] = await ethers.getSigners()
  contracts.PaymentSplitter = await getContractWithProxy('PaymentSplitter')

  const adminRole = await contracts.PaymentSplitter.ADMIN_ROLE()
  contracts.PaymentSplitter.grantRole(adminRole, users.admin.address)

  contracts.PaymentSplitter.addPayee(users.artist1.address, 1)
  contracts.PaymentSplitter.addPayee(users.artist2.address, 1)
  contracts.PaymentSplitter.addPayee(users.artist3.address, 1)

  await ethers.provider.send('hardhat_setBalance', [users.artist1.address, '0x0'])
  await ethers.provider.send('hardhat_setBalance', [users.artist2.address, '0x0'])
  await ethers.provider.send('hardhat_setBalance', [users.artist3.address, '0x0'])
})

describe('Example Payment Flow', () => {

  it('receives 100 VET and pays 33% to each artist', async () => {
    await ethers.provider.send('hardhat_setBalance', [contracts.PaymentSplitter.address, BigNumber.from(100).toHexString()])

    await contracts.PaymentSplitter.release()

    const balanceArtist1 = await ethers.provider.getBalance(users.artist1.address)
    expect(balanceArtist1).toEqual(BigNumber.from(Math.round(100 / 3)))

    const balanceArtist2 = await ethers.provider.getBalance(users.artist2.address)
    expect(balanceArtist2).toEqual(BigNumber.from(Math.round(100 / 3)))

    const balanceArtist3 = await ethers.provider.getBalance(users.artist3.address)
    expect(balanceArtist3).toEqual(BigNumber.from(Math.round(100 / 3)))
  })


  it('receive 2x100 VET, respect payouts in between', async () => {
    await ethers.provider.send('hardhat_setBalance', [contracts.PaymentSplitter.address, BigNumber.from(100).toHexString()])

    await contracts.PaymentSplitter.release()
    const balanceArtist3 = await ethers.provider.getBalance(users.artist3.address)
    expect(balanceArtist3).toEqual(BigNumber.from(Math.round(100 / 3)))

    await ethers.provider.send('hardhat_setBalance', [contracts.PaymentSplitter.address, BigNumber.from(100).toHexString()])

    await contracts.PaymentSplitter.release()
    const balanceArtist2 = await ethers.provider.getBalance(users.artist2.address)
    expect(balanceArtist2).toEqual(BigNumber.from(Math.round(100 / 3) * 2))

  })

})

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
