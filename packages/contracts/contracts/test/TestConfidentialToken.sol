// SPDX-License-Identifier: MIT
pragma solidity ~0.8.27;

import {FHE, euint64} from "@fhevm/solidity/lib/FHE.sol";
import {ZamaEthereumConfig} from "@fhevm/solidity/config/ZamaConfig.sol";
import {ERC7984} from "@openzeppelin/confidential-contracts/token/ERC7984/ERC7984.sol";

/// @dev Local-test token only. Production deployments use Zama's stock cUSDC wrapper.
contract TestConfidentialToken is ERC7984, ZamaEthereumConfig {
    constructor() ERC7984("Confidential Test USDC", "cTUSDC", "") {}

    function faucetMint(address to, uint64 amount) external {
        euint64 encryptedAmount = FHE.asEuint64(amount);
        _mint(to, encryptedAmount);
    }
}
