const { ethers } = require('hardhat')
const { BigNumber } = ethers
const Web3EthAbi = require('web3-eth-abi')
const ERC1967Proxy = require('@openzeppelin/contracts/build/contracts/ERC1967Proxy.json')

const contracts = {}
const users = {}

beforeEach(async function () {
  [users.owner, users.user1, users.user2, users.user3, users.user4, users.user5] = await ethers.getSigners()
  contracts.NFT = await getContractWithProxy('NFT')
  contracts.PaymentSplitter = await getContractWithProxy('PaymentSplitter')
})

describe('PaymentSplitter', () => {
  describe('addPayee(address, shares)', () => {
    it('addPayee(address, shares) is correctly executed', async () => {
      await contracts.PaymentSplitter.addPayee(users.user2.address, 2)
      await contracts.PaymentSplitter.addPayee(users.user3.address, 1)

      const totalShares = await contracts.PaymentSplitter.totalShares()
      const payeeCount = await contracts.PaymentSplitter.payeeCount()

      expect(totalShares).toEqual(BigNumber.from(3))
      expect(payeeCount).toEqual(BigNumber.from(2))
    })

    it('only ADMIN_ROLE can add new payee', async () => {
      const adminRole = await contracts.PaymentSplitter.ADMIN_ROLE()
      await expect(contracts.PaymentSplitter.connect(users.user2).addPayee(users.user2.address, 2)).rejects.toThrow(`is missing role ${adminRole}`)
    })
  })

  describe('removePayee(address)', () => {
    it('removePayee(address) is correctly executed', async () => {
      await contracts.PaymentSplitter.addPayee(users.user2.address, 2)
      await contracts.PaymentSplitter.addPayee(users.user3.address, 1)
      await contracts.PaymentSplitter.removePayee(users.user2.address)

      const totalShares = await contracts.PaymentSplitter.totalShares()
      const payeeCount = await contracts.PaymentSplitter.payeeCount()

      expect(totalShares).toEqual(BigNumber.from(1))
      expect(payeeCount).toEqual(BigNumber.from(1))
    })

    it('only ADMIN_ROLE can remove payee', async () => {
      const adminRole = await contracts.PaymentSplitter.ADMIN_ROLE()
      await expect(contracts.PaymentSplitter.connect(users.user2).removePayee(users.user2.address)).rejects.toThrow(`is missing role ${adminRole}`)
    })
  })

  describe('VIP-180 Tokens', () => {
    describe('releaseToken(tokenAddress)', () => {
      beforeEach(async () => {
        const VTHO = await ethers.getContractFactory('VTHO')
        contracts.vtho = await VTHO.deploy()

        contracts.vtho.mint(users.owner.address, 10000000)
      })

      it('supports receiving VIP-180 Tokens', async () => {
        contracts.vtho.transfer(contracts.PaymentSplitter.address, 100)
      })

      it('supports releasing to payees', async () => {
        contracts.vtho.transfer(contracts.PaymentSplitter.address, 100)
        await contracts.PaymentSplitter.addPayee(users.user2.address, 2)
        await contracts.PaymentSplitter.connect(users.owner).releaseToken(contracts.vtho.address)

        const balanceUser = await contracts.vtho.balanceOf(users.user2.address)
        expect(balanceUser).toEqual(BigNumber.from(100))
      })

      it('respects shares for the payees', async () => {
        contracts.vtho.transfer(contracts.PaymentSplitter.address, 100)
        await contracts.PaymentSplitter.addPayee(users.user1.address, 75)
        await contracts.PaymentSplitter.addPayee(users.user2.address, 25)
        await contracts.PaymentSplitter.connect(users.owner).releaseToken(contracts.vtho.address)

        const balanceUser1 = await contracts.vtho.balanceOf(users.user1.address)
        expect(balanceUser1).toEqual(BigNumber.from(75))

        const balanceUser2 = await contracts.vtho.balanceOf(users.user2.address)
        expect(balanceUser2).toEqual(BigNumber.from(25))
      })

      it('supports consecutive payments respecting shares for the payees', async () => {
        contracts.vtho.transfer(contracts.PaymentSplitter.address, 100)
        await contracts.PaymentSplitter.addPayee(users.user3.address, 75)
        await contracts.PaymentSplitter.addPayee(users.user4.address, 25)
        await contracts.PaymentSplitter.connect(users.owner).releaseToken(contracts.vtho.address)

        contracts.vtho.transfer(contracts.PaymentSplitter.address, 100)
        await contracts.PaymentSplitter.addPayee(users.user5.address, 25)
        await contracts.PaymentSplitter.removePayee(users.user3.address)
        await contracts.PaymentSplitter.connect(users.owner).releaseToken(contracts.vtho.address)

        const balanceUser3 = await contracts.vtho.balanceOf(users.user3.address)
        expect(balanceUser3).toEqual(BigNumber.from(75 + 0))

        const balanceUser5 = await contracts.vtho.balanceOf(users.user5.address)
        expect(balanceUser5).toEqual(BigNumber.from(0 + 50))

        const balanceUser4 = await contracts.vtho.balanceOf(users.user4.address)
        expect(balanceUser4).toEqual(BigNumber.from(25 + 50))
      })


      it('rejects none-admin-user to trigger release', async () => {
        const adminRole = await contracts.PaymentSplitter.ADMIN_ROLE()
        contracts.vtho.transfer(contracts.PaymentSplitter.address, 100)
        await contracts.PaymentSplitter.addPayee(users.user3.address, 2)
        await expect(contracts.PaymentSplitter.connect(users.user3).releaseToken(contracts.vtho.address)).rejects.toThrow(`is missing role ${adminRole}`)
      })

      it('supports ADMIN_ROLE triggering a release', async () => {
        const adminRole = await contracts.PaymentSplitter.ADMIN_ROLE()
        await contracts.PaymentSplitter.grantRole(adminRole, users.user3.address)

        contracts.vtho.transfer(contracts.PaymentSplitter.address, 100)
        await contracts.PaymentSplitter.addPayee(users.user2.address, 2)
        await contracts.PaymentSplitter.connect(users.user3).releaseToken(contracts.vtho.address)

        const balanceUser = await contracts.vtho.balanceOf(users.user2.address)
        expect(balanceUser).toEqual(BigNumber.from(100))
      })
    })

    describe('releaseTokenInShares(tokenAddress, releaseShares, releaseSharesBase)', () => {
      beforeEach(async () => {
        const VTHO = await ethers.getContractFactory('VTHO')
        contracts.vtho = await VTHO.deploy()

        contracts.vtho.mint(users.owner.address, 10000000)
      })

      it('supports receiving VIP-180 Tokens', async () => {
        contracts.vtho.transfer(contracts.PaymentSplitter.address, 100)
      })

      it('supports releasing to payees', async () => {
        contracts.vtho.transfer(contracts.PaymentSplitter.address, 100)
        await contracts.PaymentSplitter.addPayee(users.user2.address, 2)
        await contracts.PaymentSplitter.connect(users.owner).releaseTokenInShares(contracts.vtho.address, 1, 1)

        const balanceUser = await contracts.vtho.balanceOf(users.user2.address)
        expect(balanceUser).toEqual(BigNumber.from(100))
      })

      it('respects shares for the payees', async () => {
        contracts.vtho.transfer(contracts.PaymentSplitter.address, 100)
        await contracts.PaymentSplitter.addPayee(users.user1.address, 75)
        await contracts.PaymentSplitter.addPayee(users.user2.address, 25)
        await contracts.PaymentSplitter.connect(users.owner).releaseTokenInShares(contracts.vtho.address, 1, 1)

        const balanceUser1 = await contracts.vtho.balanceOf(users.user1.address)
        expect(balanceUser1).toEqual(BigNumber.from(75))

        const balanceUser2 = await contracts.vtho.balanceOf(users.user2.address)
        expect(balanceUser2).toEqual(BigNumber.from(25))
      })

      it('respects given shares', async () => {
        contracts.vtho.transfer(contracts.PaymentSplitter.address, 10000)
        await contracts.PaymentSplitter.addPayee(users.user1.address, 75)
        await contracts.PaymentSplitter.addPayee(users.user2.address, 25)
        await contracts.PaymentSplitter.connect(users.owner).releaseTokenInShares(contracts.vtho.address, 1, 100)

        const balanceUser1 = await contracts.vtho.balanceOf(users.user1.address)
        expect(balanceUser1).toEqual(BigNumber.from(75))

        const balanceUser2 = await contracts.vtho.balanceOf(users.user2.address)
        expect(balanceUser2).toEqual(BigNumber.from(25))
      })

      it('supports consecutive payments respecting shares for the payees', async () => {
        contracts.vtho.transfer(contracts.PaymentSplitter.address, 100)
        await contracts.PaymentSplitter.addPayee(users.user3.address, 75)
        await contracts.PaymentSplitter.addPayee(users.user4.address, 25)
        await contracts.PaymentSplitter.connect(users.owner).releaseTokenInShares(contracts.vtho.address, 1, 1)

        contracts.vtho.transfer(contracts.PaymentSplitter.address, 100)
        await contracts.PaymentSplitter.addPayee(users.user5.address, 25)
        await contracts.PaymentSplitter.removePayee(users.user3.address)
        await contracts.PaymentSplitter.connect(users.owner).releaseTokenInShares(contracts.vtho.address, 1, 1)

        const balanceUser3 = await contracts.vtho.balanceOf(users.user3.address)
        expect(balanceUser3).toEqual(BigNumber.from(75 + 0))

        const balanceUser5 = await contracts.vtho.balanceOf(users.user5.address)
        expect(balanceUser5).toEqual(BigNumber.from(0 + 50))

        const balanceUser4 = await contracts.vtho.balanceOf(users.user4.address)
        expect(balanceUser4).toEqual(BigNumber.from(25 + 50))
      })


      it('rejects none-admin-user to trigger release', async () => {
        const adminRole = await contracts.PaymentSplitter.ADMIN_ROLE()
        contracts.vtho.transfer(contracts.PaymentSplitter.address, 100)
        await contracts.PaymentSplitter.addPayee(users.user3.address, 2)
        await expect(contracts.PaymentSplitter.connect(users.user3).releaseTokenInShares(contracts.vtho.address, 1, 1)).rejects.toThrow(`is missing role ${adminRole}`)
      })

      it('supports ADMIN_ROLE triggering a release', async () => {
        const adminRole = await contracts.PaymentSplitter.ADMIN_ROLE()
        await contracts.PaymentSplitter.grantRole(adminRole, users.user3.address)

        contracts.vtho.transfer(contracts.PaymentSplitter.address, 100)
        await contracts.PaymentSplitter.addPayee(users.user2.address, 2)
        await contracts.PaymentSplitter.connect(users.user3).releaseTokenInShares(contracts.vtho.address, 1, 1)

        const balanceUser = await contracts.vtho.balanceOf(users.user2.address)
        expect(balanceUser).toEqual(BigNumber.from(100))
      })
    })

    describe('releaseTokenBalance(tokenAddress, balance)', () => {
      beforeEach(async () => {
        const VTHO = await ethers.getContractFactory('VTHO')
        contracts.vtho = await VTHO.deploy()

        contracts.vtho.mint(users.owner.address, 10000000)
      })

      it('supports receiving VIP-180 Tokens', async () => {
        contracts.vtho.transfer(contracts.PaymentSplitter.address, 100)
      })

      it('supports releasing to payees', async () => {
        contracts.vtho.transfer(contracts.PaymentSplitter.address, 100)
        await contracts.PaymentSplitter.addPayee(users.user2.address, 2)
        await contracts.PaymentSplitter.connect(users.owner).releaseTokenBalance(contracts.vtho.address, 100)

        const balanceUser = await contracts.vtho.balanceOf(users.user2.address)
        expect(balanceUser).toEqual(BigNumber.from(100))
      })

      it('respects shares for the payees', async () => {
        contracts.vtho.transfer(contracts.PaymentSplitter.address, 100)
        await contracts.PaymentSplitter.addPayee(users.user1.address, 75)
        await contracts.PaymentSplitter.addPayee(users.user2.address, 25)
        await contracts.PaymentSplitter.connect(users.owner).releaseTokenBalance(contracts.vtho.address, 100)

        const balanceUser1 = await contracts.vtho.balanceOf(users.user1.address)
        expect(balanceUser1).toEqual(BigNumber.from(75))

        const balanceUser2 = await contracts.vtho.balanceOf(users.user2.address)
        expect(balanceUser2).toEqual(BigNumber.from(25))
      })

      it('respects given balance', async () => {
        contracts.vtho.transfer(contracts.PaymentSplitter.address, 10000)
        await contracts.PaymentSplitter.addPayee(users.user1.address, 75)
        await contracts.PaymentSplitter.addPayee(users.user2.address, 25)
        await contracts.PaymentSplitter.connect(users.owner).releaseTokenBalance(contracts.vtho.address, 100)

        const balanceUser1 = await contracts.vtho.balanceOf(users.user1.address)
        expect(balanceUser1).toEqual(BigNumber.from(75))

        const balanceUser2 = await contracts.vtho.balanceOf(users.user2.address)
        expect(balanceUser2).toEqual(BigNumber.from(25))
      })

      it('supports consecutive payments respecting shares for the payees', async () => {
        contracts.vtho.transfer(contracts.PaymentSplitter.address, 100)
        await contracts.PaymentSplitter.addPayee(users.user3.address, 75)
        await contracts.PaymentSplitter.addPayee(users.user4.address, 25)
        await contracts.PaymentSplitter.connect(users.owner).releaseTokenBalance(contracts.vtho.address, 100)

        contracts.vtho.transfer(contracts.PaymentSplitter.address, 100)
        await contracts.PaymentSplitter.addPayee(users.user5.address, 25)
        await contracts.PaymentSplitter.removePayee(users.user3.address)
        await contracts.PaymentSplitter.connect(users.owner).releaseTokenBalance(contracts.vtho.address, 100)

        const balanceUser3 = await contracts.vtho.balanceOf(users.user3.address)
        expect(balanceUser3).toEqual(BigNumber.from(75 + 0))

        const balanceUser5 = await contracts.vtho.balanceOf(users.user5.address)
        expect(balanceUser5).toEqual(BigNumber.from(0 + 50))

        const balanceUser4 = await contracts.vtho.balanceOf(users.user4.address)
        expect(balanceUser4).toEqual(BigNumber.from(25 + 50))
      })

      it('rejects if balance is bigger than available', async () => {
        const adminRole = await contracts.PaymentSplitter.ADMIN_ROLE()
        await contracts.PaymentSplitter.grantRole(adminRole, users.user3.address)

        contracts.vtho.transfer(contracts.PaymentSplitter.address, 100)
        await contracts.PaymentSplitter.addPayee(users.user3.address, 2)
        await expect(contracts.PaymentSplitter.connect(users.user3).releaseTokenBalance(contracts.vtho.address, 101)).rejects.toThrow("balance must be less or equal than token balance")
      })

      it('rejects none-admin-user to trigger release', async () => {
        const adminRole = await contracts.PaymentSplitter.ADMIN_ROLE()
        contracts.vtho.transfer(contracts.PaymentSplitter.address, 100)
        await contracts.PaymentSplitter.addPayee(users.user3.address, 2)
        await expect(contracts.PaymentSplitter.connect(users.user3).releaseTokenBalance(contracts.vtho.address, 100)).rejects.toThrow(`is missing role ${adminRole}`)
      })

      it('supports ADMIN_ROLE triggering a release', async () => {
        const adminRole = await contracts.PaymentSplitter.ADMIN_ROLE()
        await contracts.PaymentSplitter.grantRole(adminRole, users.user3.address)

        contracts.vtho.transfer(contracts.PaymentSplitter.address, 100)
        await contracts.PaymentSplitter.addPayee(users.user2.address, 2)
        await contracts.PaymentSplitter.connect(users.user3).releaseTokenBalance(contracts.vtho.address, 100)

        const balanceUser = await contracts.vtho.balanceOf(users.user2.address)
        expect(balanceUser).toEqual(BigNumber.from(100))
      })
    })
  })

  describe('VET', () => {
    describe('release()', () => {

      beforeEach(async () => {
        const VTHO = await ethers.getContractFactory('VTHO')
        contracts.vtho = await VTHO.deploy()

        contracts.vtho.mint(users.owner.address, 10000)

        await ethers.provider.send('hardhat_setBalance', [users.user1.address, '0x0'])
        await ethers.provider.send('hardhat_setBalance', [users.user2.address, '0x0'])
        await ethers.provider.send('hardhat_setBalance', [users.user3.address, '0x0'])
        await ethers.provider.send('hardhat_setBalance', [users.user4.address, '0x0'])
        await ethers.provider.send('hardhat_setBalance', [users.user5.address, '0x0'])

      })

      it('supports releasing to payees', async () => {
        await ethers.provider.send('hardhat_setBalance', [contracts.PaymentSplitter.address, BigNumber.from(100).toHexString()])
        await contracts.PaymentSplitter.addPayee(users.user2.address, 2)
        await contracts.PaymentSplitter.connect(users.owner).release()

        const balanceUser = await ethers.provider.getBalance(users.user2.address)
        expect(balanceUser).toEqual(BigNumber.from(100))
      })

      it('respects shares for the payees', async () => {
        await ethers.provider.send('hardhat_setBalance', [contracts.PaymentSplitter.address, BigNumber.from(100).toHexString()])
        await contracts.PaymentSplitter.addPayee(users.user1.address, 75)
        await contracts.PaymentSplitter.addPayee(users.user2.address, 25)
        await contracts.PaymentSplitter.connect(users.owner).release()

        const balanceUser1 = await ethers.provider.getBalance(users.user1.address)
        expect(balanceUser1).toEqual(BigNumber.from(75))

        const balanceUser2 = await ethers.provider.getBalance(users.user2.address)
        expect(balanceUser2).toEqual(BigNumber.from(25))
      })

      it('supports consecutive payments respecting shares for the payees', async () => {
        await ethers.provider.send('hardhat_setBalance', [contracts.PaymentSplitter.address, BigNumber.from(100).toHexString()])
        await contracts.PaymentSplitter.addPayee(users.user3.address, 75)
        await contracts.PaymentSplitter.addPayee(users.user4.address, 25)
        await contracts.PaymentSplitter.connect(users.owner).release()

        await ethers.provider.send('hardhat_setBalance', [contracts.PaymentSplitter.address, BigNumber.from(100).toHexString()])
        await contracts.PaymentSplitter.addPayee(users.user5.address, 25)
        await contracts.PaymentSplitter.removePayee(users.user3.address)
        await contracts.PaymentSplitter.connect(users.owner).release()

        const balanceUser3 = await ethers.provider.getBalance(users.user3.address)
        expect(balanceUser3).toEqual(BigNumber.from(75 + 0))

        const balanceUser5 = await ethers.provider.getBalance(users.user5.address)
        expect(balanceUser5).toEqual(BigNumber.from(0 + 50))

        const balanceUser4 = await ethers.provider.getBalance(users.user4.address)
        expect(balanceUser4).toEqual(BigNumber.from(25 + 50))
      })


      it('rejects none-admin-user to trigger release', async () => {
        await ethers.provider.send('hardhat_setBalance', [users.user3.address, '0xffffffffffffff'])
        const adminRole = await contracts.PaymentSplitter.ADMIN_ROLE()
        await contracts.PaymentSplitter.addPayee(users.user3.address, 2)
        await expect(contracts.PaymentSplitter.connect(users.user3).release()).rejects.toThrow(`is missing role ${adminRole}`)
      })

      it('supports ADMIN_ROLE triggering a release', async () => {
        await ethers.provider.send('hardhat_setBalance', [users.user3.address, '0xffffffffffffff'])
        const adminRole = await contracts.PaymentSplitter.ADMIN_ROLE()
        await contracts.PaymentSplitter.grantRole(adminRole, users.user3.address)

        await ethers.provider.send('hardhat_setBalance', [contracts.PaymentSplitter.address, BigNumber.from(100).toHexString()])
        await contracts.PaymentSplitter.addPayee(users.user2.address, 2)
        await contracts.PaymentSplitter.connect(users.user3).release()

        const balanceUser = await ethers.provider.getBalance(users.user2.address)
        expect(balanceUser).toEqual(BigNumber.from(100))
      })

    })

    describe('releaseInShares(releaseShares, releaseSharesBase)', () => {

      beforeEach(async () => {
        const VTHO = await ethers.getContractFactory('VTHO')
        contracts.vtho = await VTHO.deploy()

        contracts.vtho.mint(users.owner.address, 10000)

        await ethers.provider.send('hardhat_setBalance', [users.user1.address, '0x0'])
        await ethers.provider.send('hardhat_setBalance', [users.user2.address, '0x0'])
        await ethers.provider.send('hardhat_setBalance', [users.user3.address, '0x0'])
        await ethers.provider.send('hardhat_setBalance', [users.user4.address, '0x0'])
        await ethers.provider.send('hardhat_setBalance', [users.user5.address, '0x0'])

      })

      it('supports releasing to payees', async () => {
        await ethers.provider.send('hardhat_setBalance', [contracts.PaymentSplitter.address, BigNumber.from(100).toHexString()])
        await contracts.PaymentSplitter.addPayee(users.user2.address, 2)
        await contracts.PaymentSplitter.connect(users.owner).releaseInShares(1, 1)

        const balanceUser = await ethers.provider.getBalance(users.user2.address)
        expect(balanceUser).toEqual(BigNumber.from(100))
      })

      it('respects shares for the payees', async () => {
        await ethers.provider.send('hardhat_setBalance', [contracts.PaymentSplitter.address, BigNumber.from(100).toHexString()])
        await contracts.PaymentSplitter.addPayee(users.user1.address, 75)
        await contracts.PaymentSplitter.addPayee(users.user2.address, 25)
        await contracts.PaymentSplitter.connect(users.owner).releaseInShares(1, 1)

        const balanceUser1 = await ethers.provider.getBalance(users.user1.address)
        expect(balanceUser1).toEqual(BigNumber.from(75))

        const balanceUser2 = await ethers.provider.getBalance(users.user2.address)
        expect(balanceUser2).toEqual(BigNumber.from(25))
      })

      it('respects defined shares', async () => {
        await ethers.provider.send('hardhat_setBalance', [contracts.PaymentSplitter.address, BigNumber.from(10000).toHexString()])
        await contracts.PaymentSplitter.addPayee(users.user1.address, 75)
        await contracts.PaymentSplitter.addPayee(users.user2.address, 25)
        await contracts.PaymentSplitter.connect(users.owner).releaseInShares(1, 10)

        const balanceUser1 = await ethers.provider.getBalance(users.user1.address)
        expect(balanceUser1).toEqual(BigNumber.from(750))

        const balanceUser2 = await ethers.provider.getBalance(users.user2.address)
        expect(balanceUser2).toEqual(BigNumber.from(250))
      })

      it('respects releaseShares on the balance', async () => {
        await ethers.provider.send('hardhat_setBalance', [contracts.PaymentSplitter.address, BigNumber.from(10000).toHexString()])
        await contracts.PaymentSplitter.addPayee(users.user1.address, 75)
        await contracts.PaymentSplitter.addPayee(users.user2.address, 25)
        await contracts.PaymentSplitter.connect(users.owner).releaseInShares(1, 100)

        const balanceUser1 = await ethers.provider.getBalance(users.user1.address)
        expect(balanceUser1).toEqual(BigNumber.from(75))

        const balanceUser2 = await ethers.provider.getBalance(users.user2.address)
        expect(balanceUser2).toEqual(BigNumber.from(25))
      })

      it('supports consecutive payments respecting shares for the payees', async () => {
        await ethers.provider.send('hardhat_setBalance', [contracts.PaymentSplitter.address, BigNumber.from(100).toHexString()])
        await contracts.PaymentSplitter.addPayee(users.user3.address, 75)
        await contracts.PaymentSplitter.addPayee(users.user4.address, 25)
        await contracts.PaymentSplitter.connect(users.owner).releaseInShares(1, 1)

        await ethers.provider.send('hardhat_setBalance', [contracts.PaymentSplitter.address, BigNumber.from(100).toHexString()])
        await contracts.PaymentSplitter.addPayee(users.user5.address, 25)
        await contracts.PaymentSplitter.removePayee(users.user3.address)
        await contracts.PaymentSplitter.connect(users.owner).releaseInShares(1, 1)

        const balanceUser3 = await ethers.provider.getBalance(users.user3.address)
        expect(balanceUser3).toEqual(BigNumber.from(75 + 0))

        const balanceUser5 = await ethers.provider.getBalance(users.user5.address)
        expect(balanceUser5).toEqual(BigNumber.from(0 + 50))

        const balanceUser4 = await ethers.provider.getBalance(users.user4.address)
        expect(balanceUser4).toEqual(BigNumber.from(25 + 50))
      })


      it('rejects none-admin-user to trigger release', async () => {
        await ethers.provider.send('hardhat_setBalance', [users.user3.address, '0xffffffffffffff'])
        const adminRole = await contracts.PaymentSplitter.ADMIN_ROLE()
        await contracts.PaymentSplitter.addPayee(users.user3.address, 2)
        await expect(contracts.PaymentSplitter.connect(users.user3).releaseInShares(1, 1)).rejects.toThrow(`is missing role ${adminRole}`)
      })

      it('supports ADMIN_ROLE triggering a release', async () => {
        await ethers.provider.send('hardhat_setBalance', [users.user3.address, '0xffffffffffffff'])
        const adminRole = await contracts.PaymentSplitter.ADMIN_ROLE()
        await contracts.PaymentSplitter.grantRole(adminRole, users.user3.address)

        await ethers.provider.send('hardhat_setBalance', [contracts.PaymentSplitter.address, BigNumber.from(100).toHexString()])
        await contracts.PaymentSplitter.addPayee(users.user2.address, 2)
        await contracts.PaymentSplitter.connect(users.user3).releaseInShares(1, 1)

        const balanceUser = await ethers.provider.getBalance(users.user2.address)
        expect(balanceUser).toEqual(BigNumber.from(100))
      })

    })

    describe('releaseBalance(balance)', () => {

      beforeEach(async () => {
        const VTHO = await ethers.getContractFactory('VTHO')
        contracts.vtho = await VTHO.deploy()

        contracts.vtho.mint(users.owner.address, 10000)

        await ethers.provider.send('hardhat_setBalance', [users.user1.address, '0x0'])
        await ethers.provider.send('hardhat_setBalance', [users.user2.address, '0x0'])
        await ethers.provider.send('hardhat_setBalance', [users.user3.address, '0x0'])
        await ethers.provider.send('hardhat_setBalance', [users.user4.address, '0x0'])
        await ethers.provider.send('hardhat_setBalance', [users.user5.address, '0x0'])

      })

      it('supports releasing to payees', async () => {
        await ethers.provider.send('hardhat_setBalance', [contracts.PaymentSplitter.address, BigNumber.from(100).toHexString()])
        await contracts.PaymentSplitter.addPayee(users.user2.address, 2)
        await contracts.PaymentSplitter.connect(users.owner).releaseBalance(100)

        const balanceUser = await ethers.provider.getBalance(users.user2.address)
        expect(balanceUser).toEqual(BigNumber.from(100))
      })

      it('respects shares for the payees', async () => {
        await ethers.provider.send('hardhat_setBalance', [contracts.PaymentSplitter.address, BigNumber.from(100).toHexString()])
        await contracts.PaymentSplitter.addPayee(users.user1.address, 75)
        await contracts.PaymentSplitter.addPayee(users.user2.address, 25)
        await contracts.PaymentSplitter.connect(users.owner).releaseBalance(100)

        const balanceUser1 = await ethers.provider.getBalance(users.user1.address)
        expect(balanceUser1).toEqual(BigNumber.from(75))

        const balanceUser2 = await ethers.provider.getBalance(users.user2.address)
        expect(balanceUser2).toEqual(BigNumber.from(25))
      })

      it('respects given balance', async () => {
        await ethers.provider.send('hardhat_setBalance', [contracts.PaymentSplitter.address, BigNumber.from(10000).toHexString()])
        await contracts.PaymentSplitter.addPayee(users.user1.address, 75)
        await contracts.PaymentSplitter.addPayee(users.user2.address, 25)
        await contracts.PaymentSplitter.connect(users.owner).releaseBalance(200)

        const balanceUser1 = await ethers.provider.getBalance(users.user1.address)
        expect(balanceUser1).toEqual(BigNumber.from(150))

        const balanceUser2 = await ethers.provider.getBalance(users.user2.address)
        expect(balanceUser2).toEqual(BigNumber.from(50))
      })

      it('supports consecutive payments respecting shares for the payees', async () => {
        await ethers.provider.send('hardhat_setBalance', [contracts.PaymentSplitter.address, BigNumber.from(10000).toHexString()])
        await contracts.PaymentSplitter.addPayee(users.user3.address, 75)
        await contracts.PaymentSplitter.addPayee(users.user4.address, 25)
        await contracts.PaymentSplitter.connect(users.owner).releaseBalance(100)

        await contracts.PaymentSplitter.addPayee(users.user5.address, 25)
        await contracts.PaymentSplitter.removePayee(users.user3.address)
        await contracts.PaymentSplitter.connect(users.owner).releaseBalance(100)

        const balanceUser3 = await ethers.provider.getBalance(users.user3.address)
        expect(balanceUser3).toEqual(BigNumber.from(75 + 0))

        const balanceUser5 = await ethers.provider.getBalance(users.user5.address)
        expect(balanceUser5).toEqual(BigNumber.from(0 + 50))

        const balanceUser4 = await ethers.provider.getBalance(users.user4.address)
        expect(balanceUser4).toEqual(BigNumber.from(25 + 50))
      })

      it('rejects if balance is bigger than available', async () => {
        await ethers.provider.send('hardhat_setBalance', [contracts.PaymentSplitter.address, BigNumber.from(100).toHexString()])
        contracts.vtho.transfer(contracts.PaymentSplitter.address, 100)
        await contracts.PaymentSplitter.addPayee(users.user3.address, 2)
        await expect(contracts.PaymentSplitter.releaseBalance(101)).rejects.toThrow("balance must be less or equal than token balance")
      })

      it('rejects none-admin-user to trigger release', async () => {
        await ethers.provider.send('hardhat_setBalance', [users.user3.address, '0xffffffffffffff'])
        const adminRole = await contracts.PaymentSplitter.ADMIN_ROLE()
        await contracts.PaymentSplitter.addPayee(users.user3.address, 2)
        await expect(contracts.PaymentSplitter.connect(users.user3).releaseBalance(100)).rejects.toThrow(`is missing role ${adminRole}`)
      })

      it('supports ADMIN_ROLE triggering a release', async () => {
        await ethers.provider.send('hardhat_setBalance', [users.user3.address, '0xffffffffffffff'])
        const adminRole = await contracts.PaymentSplitter.ADMIN_ROLE()
        await contracts.PaymentSplitter.grantRole(adminRole, users.user3.address)

        await ethers.provider.send('hardhat_setBalance', [contracts.PaymentSplitter.address, BigNumber.from(100).toHexString()])
        await contracts.PaymentSplitter.addPayee(users.user2.address, 2)
        await contracts.PaymentSplitter.connect(users.user3).releaseBalance(100)

        const balanceUser = await ethers.provider.getBalance(users.user2.address)
        expect(balanceUser).toEqual(BigNumber.from(100))
      })

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
