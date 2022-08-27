// SPDX-License-Identifier: MIT
pragma solidity ^0.8.4;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";

contract VTHO is ERC20 {
    constructor() ERC20("VTHO", "VTHO") {}

    function mint(address to, uint256 amount) public {
        _mint(to, amount);
    }
}
