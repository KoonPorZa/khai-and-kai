// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

interface IKhaiBuy {
    function buyAndStartHatch() external payable returns (uint256);
}

/// @dev Test helper: a contract owner without onERC721Received. Its hatch must not block the FIFO queue.
contract RejectingHatcher {
    function hatch(address khai) external payable returns (uint256) {
        return IKhaiBuy(khai).buyAndStartHatch{value: msg.value}();
    }
}
