// SPDX-License-Identifier: MIT
pragma solidity ~0.8.27;

import {FHE, euint64} from "@fhevm/solidity/lib/FHE.sol";
import {MixTogetherPool} from "../MixTogetherPool.sol";

/// @dev Deterministic random source for local state-machine tests only.
contract MixTogetherPoolHarness is MixTogetherPool {
    uint64 private _testRandomWord;

    constructor(address token, address guardian) MixTogetherPool(token, guardian) {}

    function setRandomWord(uint64 value) external {
        _testRandomWord = value;
    }

    function _randomWord() internal override returns (euint64) {
        return FHE.asEuint64(_testRandomWord);
    }
}
