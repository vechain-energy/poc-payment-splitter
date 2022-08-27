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
 * release of the received payments is also shielded to be used by an admin and the payee themself
 */

contract SplitAfterMarketRevenue is
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
    uint256 private _totalReleased;

    mapping(address => uint256) private _shares;
    mapping(address => uint256) private _released;
    EnumerableSetUpgradeable.AddressSet _payees;

    mapping(IERC20Upgradeable => uint256) private _erc20TotalReleased;
    mapping(IERC20Upgradeable => mapping(address => uint256))
        private _erc20Released;

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
     * @dev Getter for the total amount of Ether already released.
     */
    function totalReleased() public view returns (uint256) {
        return _totalReleased;
    }

    /**
     * @dev Getter for the total amount of `token` already released. `token` should be the address of an IERC20
     * contract.
     */
    function totalReleased(IERC20Upgradeable token)
        public
        view
        returns (uint256)
    {
        return _erc20TotalReleased[token];
    }

    /**
     * @dev Getter for the amount of shares held by an account.
     */
    function shares(address account) public view returns (uint256) {
        return _shares[account];
    }

    /**
     * @dev Getter for the amount of Ether already released to a payee.
     */
    function released(address account) public view returns (uint256) {
        return _released[account];
    }

    /**
     * @dev Getter for the amount of `token` tokens already released to a payee. `token` should be the address of an
     * IERC20 contract.
     */
    function released(IERC20Upgradeable token, address account)
        public
        view
        returns (uint256)
    {
        return _erc20Released[token][account];
    }

    /**
     * @dev Getter for the address of the payee number `index`.
     */
    function payee(uint256 index) public view returns (address) {
        return _payees.at(index);
    }

    /**
     * @dev Getter for the amount of payee's releasable Ether.
     */
    function releasable(address account) public view returns (uint256) {
        uint256 totalReceived = address(this).balance + totalReleased();
        return _pendingPayment(account, totalReceived, released(account));
    }

    /**
     * @dev Getter for the amount of payee's releasable `token` tokens. `token` should be the address of an
     * IERC20 contract.
     */
    function releasable(IERC20Upgradeable token, address account)
        public
        view
        returns (uint256)
    {
        uint256 totalReceived = token.balanceOf(address(this)) +
            totalReleased(token);
        return
            _pendingPayment(account, totalReceived, released(token, account));
    }

    /**
     * @dev Triggers a transfer to `account` of the amount of Ether they are owed, according to their percentage of the
     * total shares and their previous withdrawals.
     */
    function release(address payable account) public {
        if (msg.sender != account) {
            _checkRole(ADMIN_ROLE);
        }
        require(_shares[account] > 0, "PaymentSplitter: account has no shares");

        uint256 payment = releasable(account);

        require(payment != 0, "PaymentSplitter: account is not due payment");

        _released[account] += payment;
        _totalReleased += payment;

        AddressUpgradeable.sendValue(account, payment);
        emit PaymentReleased(account, payment);
    }

    /**
     * @dev Triggers a transfer to `account` of the amount of `token` tokens they are owed, according to their
     * percentage of the total shares and their previous withdrawals. `token` must be the address of an IERC20
     * contract.
     */
    function releaseToken(IERC20Upgradeable token, address account) public {
        if (msg.sender != account) {
            _checkRole(ADMIN_ROLE);
        }
        require(_shares[account] > 0, "PaymentSplitter: account has no shares");

        uint256 payment = releasable(token, account);

        require(payment != 0, "PaymentSplitter: account is not due payment");

        _erc20Released[token][account] += payment;
        _erc20TotalReleased[token] += payment;

        SafeERC20Upgradeable.safeTransfer(token, account, payment);
        emit ERC20PaymentReleased(token, account, payment);
    }

    /**
     * @dev internal logic for computing the pending payment of an `account` given the token historical balances and
     * already released amounts.
     */
    function _pendingPayment(
        address account,
        uint256 totalReceived,
        uint256 alreadyReleased
    ) private view returns (uint256) {
        return
            (totalReceived * _shares[account]) / _totalShares - alreadyReleased;
    }

    /**
     * @dev Add a new payee to the contract.
     * @param account The address of the payee to add.
     * @param shares_ The number of shares owned by the payee.
     */
    function addPayee(address account, uint256 shares_)
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

    function payeeCount() public view returns (uint256) {
        return _payees.length();
    }
}
