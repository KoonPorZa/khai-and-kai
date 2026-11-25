// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import {ERC1155} from "@openzeppelin/contracts/token/ERC1155/ERC1155.sol";
import {ERC1155Supply} from "@openzeppelin/contracts/token/ERC1155/extensions/ERC1155Supply.sol";
import {AccessControl} from "@openzeppelin/contracts/access/AccessControl.sol";
import {Pausable} from "@openzeppelin/contracts/utils/Pausable.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

interface IKaiForKhai {
    function poolSize() external view returns (uint256);
    function pendingHatches() external view returns (uint256);
    function startHatchFor(address owner) external returns (uint256 hatchId);
    function renderer() external view returns (address);
}

interface IEggRenderer {
    function eggURI() external view returns (string memory);
}

/// @title Khai (ไข่) — the egg
/// @notice ERC-1155 token id 1. Each egg is a claim on one random bird from the Kai pool.
contract Khai is ERC1155Supply, AccessControl, Pausable, ReentrancyGuard {
    bytes32 public constant FARM_ROLE = keccak256("FARM_ROLE");
    uint256 public constant EGG = 1;

    string public constant name = "Khai";
    string public constant symbol = "KHAI";

    uint256 public price;
    uint256 public dailyLimit;
    address public kai;

    struct Quota {
        uint64 day;
        uint192 count;
    }

    mapping(address => Quota) private _quota;

    event EggsBought(address indexed buyer, uint256 qty, uint256 paid);
    event KaiSet(address kai);
    event PriceSet(uint256 price);
    event DailyLimitSet(uint256 dailyLimit);
    event Withdrawn(address indexed to, uint256 amount);

    error WrongPayment();
    error DailyLimit();
    error SoldOut();
    error ZeroQuantity();
    error OnlyKai();
    error KaiAlreadySet();
    error KaiNotSet();
    error ZeroAddress();
    error TransferFailed();

    constructor(address admin, address farm, uint256 price_, uint256 dailyLimit_) ERC1155("") {
        if (admin == address(0) || farm == address(0)) revert ZeroAddress();
        _grantRole(DEFAULT_ADMIN_ROLE, admin);
        _grantRole(FARM_ROLE, farm);
        price = price_;
        dailyLimit = dailyLimit_;
    }

    // ---------------------------------------------------------------- sale

    /// @notice Buy `qty` eggs to keep. They are transferable and can be hatched later on Kai.
    function buy(uint256 qty) external payable nonReentrant whenNotPaused {
        _checkPurchase(qty);
        _mint(msg.sender, EGG, qty, "");
        emit EggsBought(msg.sender, qty, msg.value);
    }

    /// @notice Buy one egg and start its hatch in the same transaction. No egg token is minted.
    function buyAndStartHatch() external payable nonReentrant whenNotPaused returns (uint256 hatchId) {
        _checkPurchase(1);
        emit EggsBought(msg.sender, 1, msg.value);
        hatchId = IKaiForKhai(kai).startHatchFor(msg.sender);
    }

    function _checkPurchase(uint256 qty) private {
        if (qty == 0) revert ZeroQuantity();
        if (kai == address(0)) revert KaiNotSet();
        if (msg.value != price * qty) revert WrongPayment();
        if (qty > eggsAvailable()) revert SoldOut();
        uint64 today = uint64(block.timestamp / 1 days);
        Quota storage q = _quota[msg.sender];
        uint256 already = q.day == today ? q.count : 0;
        if (already + qty > dailyLimit) revert DailyLimit();
        q.day = today;
        q.count = uint192(already + qty);
    }

    // ---------------------------------------------------------------- views

    /// @notice Eggs bought by `who` in the current UTC day.
    function boughtToday(address who) public view returns (uint256) {
        Quota memory q = _quota[who];
        return q.day == uint64(block.timestamp / 1 days) ? q.count : 0;
    }

    function remainingToday(address who) external view returns (uint256) {
        uint256 bought = boughtToday(who);
        return bought >= dailyLimit ? 0 : dailyLimit - bought;
    }

    /// @notice pool − pending hatches − eggs outstanding.
    function eggsAvailable() public view returns (uint256) {
        if (kai == address(0)) return 0;
        uint256 reserved = IKaiForKhai(kai).pendingHatches() + totalSupply(EGG);
        uint256 pool = IKaiForKhai(kai).poolSize();
        return pool > reserved ? pool - reserved : 0;
    }

    function uri(uint256) public view override returns (string memory) {
        if (kai == address(0)) return "";
        return IEggRenderer(IKaiForKhai(kai).renderer()).eggURI();
    }

    // ---------------------------------------------------------------- Kai hook

    /// @notice Burns one egg of `from` when it starts hatching. Only callable by Kai.
    function burnForHatch(address from) external {
        if (msg.sender != kai) revert OnlyKai();
        _burn(from, EGG, 1);
    }

    // ---------------------------------------------------------------- admin

    function setKai(address kai_) external onlyRole(DEFAULT_ADMIN_ROLE) {
        if (kai != address(0)) revert KaiAlreadySet();
        if (kai_ == address(0)) revert ZeroAddress();
        kai = kai_;
        emit KaiSet(kai_);
    }

    function setPrice(uint256 price_) external onlyRole(DEFAULT_ADMIN_ROLE) {
        price = price_;
        emit PriceSet(price_);
    }

    function setDailyLimit(uint256 dailyLimit_) external onlyRole(DEFAULT_ADMIN_ROLE) {
        dailyLimit = dailyLimit_;
        emit DailyLimitSet(dailyLimit_);
    }

    function pause() external onlyRole(DEFAULT_ADMIN_ROLE) {
        _pause();
    }

    function unpause() external onlyRole(DEFAULT_ADMIN_ROLE) {
        _unpause();
    }

    /// @notice Sends the whole balance to `to`.
    function withdraw(address payable to) external onlyRole(FARM_ROLE) nonReentrant {
        if (to == address(0)) revert ZeroAddress();
        uint256 amount = address(this).balance;
        emit Withdrawn(to, amount);
        (bool ok, ) = to.call{value: amount}("");
        if (!ok) revert TransferFailed();
    }

    function supportsInterface(bytes4 interfaceId) public view override(ERC1155, AccessControl) returns (bool) {
        return super.supportsInterface(interfaceId);
    }
}
