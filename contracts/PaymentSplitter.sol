// SPDX-License-Identifier: MIT
pragma solidity ^0.8.4;

import "@openzeppelin/contracts-upgradeable/access/AccessControlUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/token/ERC20/utils/SafeERC20Upgradeable.sol";
import "@openzeppelin/contracts-upgradeable/utils/AddressUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/utils/structs/EnumerableSetUpgradeable.sol";

/**
 * @dev contract for splitting payments between multiple participants
 *
 * uses the example of the PaymentSplitter with the additional ability to add/remove payee
 * release of the received payments is shielded to be used by an admin
 * will always distribute full balance to all accounts in one transaction
 *
 * payees can be managed with:
 * - addPayee(address, shares)
 * - removePayee(address)
 *
 * information is available by:
 * - payeeCount()
 * - payee(index)
 * - totalShares()
 * - shares(address)
 *
 * releasing will send current contracts balance to payees respecting their share:
 * - release(releaseShares, releaseSharesBase)
 * - releaseTokem(tokenAddress, releaseShares, releaseSharesBase)
 *   the total balance is sent out in shares too, divided by the releaseSharesBase multiplied with the releaseShares, examples
 *       *  releaseShares = 1, releaseSharesBase = 1 sends out 100% of balance
 *       *  releaseShares = 1, releaseSharesBase = 2 sends out 50% of balance
 *       *  releaseShares = 1, releaseSharesBase = 100 sends out 1% of balance
 *
 * caveat:
 * - releases do not know the history, they only pay according to the current balance and shares at time of call
 * - rounding errors may leave some dust in the contract, should be too small to care
 * - the number of payees is limited by gas fees
 *   releases with a lot of payee will fail (did not test, up to 500 should be safe, maybe fails at >1.000?)
 */

contract PaymentSplitter is
    Initializable,
    AccessControlUpgradeable,
    UUPSUpgradeable
{
    using EnumerableSetUpgradeable for EnumerableSetUpgradeable.AddressSet;

    bytes32 public constant UPGRADER_ROLE = keccak256("UPGRADER_ROLE");
    bytes32 public constant ADMIN_ROLE = keccak256("ADMIN_ROLE");

    event PayeeAdded(address account, uint256 shares);
    event PayeeRemoved(address account, uint256 shares);
    event PaymentReleased(address to, uint256 amount);
    event ERC20PaymentReleased(
        IERC20Upgradeable indexed token,
        address to,
        uint256 amount
    );
    event PaymentReceived(address from, uint256 amount);

    uint256 private _totalShares;

    mapping(address => uint256) private _shares;
    EnumerableSetUpgradeable.AddressSet private _payees;

    /// @custom:oz-upgrades-unsafe-allow constructor
    constructor() {
        _disableInitializers();
    }

    function initialize() public initializer {
        __AccessControl_init();
        __UUPSUpgradeable_init();

        _grantRole(DEFAULT_ADMIN_ROLE, msg.sender);
        _grantRole(UPGRADER_ROLE, msg.sender);
        _grantRole(ADMIN_ROLE, msg.sender);
    }

    function _authorizeUpgrade(address newImplementation)
        internal
        override
        onlyRole(UPGRADER_ROLE)
    {}

    /**
     * @dev The Ether received will be logged with {PaymentReceived} events. Note that these events are not fully
     * reliable: it's possible for a contract to receive Ether without triggering this function. This only affects the
     * reliability of the events, and not the actual splitting of Ether.
     *
     * To learn more about this see the Solidity documentation for
     * https://solidity.readthedocs.io/en/latest/contracts.html#fallback-function[fallback
     * functions].
     */
    receive() external payable virtual {
        emit PaymentReceived(_msgSender(), msg.value);
    }

    /**
     * @dev Getter for the total shares held by payees.
     */
    function totalShares() public view returns (uint256) {
        return _totalShares;
    }

    /**
     * @dev Getter for the amount of shares held by an account.
     */
    function shares(address account) public view returns (uint256) {
        return _shares[account];
    }

    /**
     * @dev Getter for the address of the payee number `index`.
     */
    function payee(uint256 index) public view returns (address) {
        return _payees.at(index);
    }

    /**
     * @dev Triggers a transfer to `account` of the amount of Ether they are owed, according to their percentage of the
     * total shares and their previous withdrawals.
     * @param releaseShares Shares of the total balance to release.
     * @param releaseSharesBase The number of total shares the release is calculated on.
     */
    function release(uint256 releaseShares, uint256 releaseSharesBase) public onlyRole(ADMIN_ROLE) {
        uint256 balance = address(this).balance / releaseSharesBase * releaseShares;
        uint256 payeeCount = payeeCount();
        uint256 amountPerShare = balance / _totalShares;
        for (uint256 index; index < payeeCount; index += 1) {
            address payable account = payable(_payees.at(index));
            uint256 amount = amountPerShare * _shares[account];
            AddressUpgradeable.sendValue(account, amount);
            emit PaymentReleased(account, amount);
        }
    }

    /**
     * @dev Triggers a transfer to `account` of the amount of `token` tokens they are owed, according to their
     * percentage of the total shares and their previous withdrawals. `token` must be the address of an IERC20
     * contract.
     * @param token The token address of the IERC20 contract.
     * @param releaseShares Shares of the total balance to release.
     * @param releaseSharesBase The number of total shares the release is calculated on.
     */
    function releaseToken(IERC20Upgradeable token, uint256 releaseShares, uint256 releaseSharesBase) public onlyRole(ADMIN_ROLE) {
        uint256 balance = token.balanceOf(address(this)) / releaseSharesBase * releaseShares;
        uint256 payeeCount = payeeCount();
        uint256 amountPerShare = balance / _totalShares;
        for (uint256 index; index < payeeCount; index += 1) {
            address account = payable(_payees.at(index));
            uint256 amount = amountPerShare * _shares[account];

            SafeERC20Upgradeable.safeTransfer(token, account, amount);
            emit ERC20PaymentReleased(token, account, amount);
        }
    }

    /**
     * @dev Add a new payee to the contract.
     * @param account The address of the payee to add.
     * @param shares_ The number of shares owned by the payee.
     */
    function addPayee(address payable account, uint256 shares_)
        public
        onlyRole(ADMIN_ROLE)
    {
        require(
            account != address(0),
            "PaymentSplitter: account is the zero address"
        );
        require(shares_ > 0, "PaymentSplitter: shares are 0");
        require(
            _shares[account] == 0,
            "PaymentSplitter: account already has shares"
        );

        _payees.add(account);
        _shares[account] = shares_;
        _totalShares = _totalShares + shares_;
        emit PayeeAdded(account, shares_);
    }

    /**
     * @dev remove an existing payee from the contract.
     * @param account The address of the payee to remove.
     */
    function removePayee(address account) public onlyRole(ADMIN_ROLE) {
        require(
            account != address(0),
            "PaymentSplitter: account is the zero address"
        );
        require(
            _payees.contains(account),
            "PaymentSplitter: account no known payee"
        );

        _payees.remove(account);
        uint256 sharesToRemove = _shares[account];
        _shares[account] = 0;
        _totalShares = _totalShares - sharesToRemove;
        emit PayeeRemoved(account, sharesToRemove);
    }

    /**
     * @dev Getter for the number of accounts in the contract
     * can be used with payee(index) to compile a list of addresses
     */
    function payeeCount() public view returns (uint256) {
        return _payees.length();
    }
}
