// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import {ERC721} from "@openzeppelin/contracts/token/ERC721/ERC721.sol";
import {ERC721Enumerable} from "@openzeppelin/contracts/token/ERC721/extensions/ERC721Enumerable.sol";
import {AccessControl} from "@openzeppelin/contracts/access/AccessControl.sol";
import {Pausable} from "@openzeppelin/contracts/utils/Pausable.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

interface IKhaiForKai {
    function burnForHatch(address from) external;
    function totalSupply(uint256 id) external view returns (uint256);
}

interface IChickenRenderer {
    function chickenURI(uint256 tokenId, Kai.Bird calldata bird, uint64 carePaidUntil, uint64 redeemedAt) external view returns (string memory);
}

/// @title Kai (ไก่) — the chicken
/// @notice ERC-721 sponsorship token for one real farm bird. tokenId == birdId.
contract Kai is ERC721Enumerable, AccessControl, Pausable, ReentrancyGuard {
    bytes32 public constant FARM_ROLE = keccak256("FARM_ROLE");
    uint64 public constant HATCH_DELAY = 2;
    uint256 public constant MAX_NOTE_BYTES = 140;
    uint8 public constant MAX_CARE_KIND = 5;
    uint256 public constant MAX_CARE_PERIODS = 8760;
    /// @notice Care must be overdue for more than this many full care periods before the farm may release a bird.
    uint256 public constant RELEASE_AFTER_PERIODS = 3;

    struct Bird {
        uint8 breed;
        uint8 sex;
        uint8 plumage;
        uint40 bornAt;
        bytes32 recordHash;
    }

    struct Hatch {
        address owner;
        uint64 revealBlock;
        uint32 birdId; // 0 = pending
        bool usedFallback;
    }

    struct CareProof {
        uint64 at;
        uint8 kind;
        bytes32 contentHash;
        string note;
    }

    struct Chicken {
        uint256 tokenId;
        address owner;
        Bird bird;
        uint64 carePaidUntil;
        uint256 hatchId;
        uint256 proofCount;
        uint64 redeemRequestedAt; // 0 = no pending request
        uint64 redeemedAt; // 0 = not collected
    }

    struct Stats {
        uint256 birdsRegistered;
        uint256 poolSize;
        uint256 hatched;
        uint256 pendingHatches;
        uint256 careProofs;
        uint256 collected;
        uint256 released;
    }

    /// @dev What the Verify button needs that the Hatch struct does not hold.
    struct HatchSeed {
        bytes32 seed;
        uint32 poolSizeAtFinish;
        uint32 index;
    }

    address public immutable khai;
    uint64 public immutable carePeriod;
    uint256 public careFee;
    address public renderer;

    uint256 public birdsRegistered;
    uint256 public hatchCount;
    uint256 private _nextToFinish = 1;
    uint256 public pendingHatches;
    uint256 public totalCareProofs;
    uint256 public totalCollected;
    uint256 public totalReleased;

    mapping(uint256 => Bird) private _birds;
    uint32[] private _pool;
    mapping(uint256 => Hatch) private _hatches;
    mapping(uint256 => HatchSeed) private _hatchSeeds;
    mapping(address => uint256[]) private _hatchesOf;
    mapping(uint256 => uint256) private _hatchOfToken;
    mapping(uint256 => uint64) private _carePaidUntil;
    mapping(uint256 => CareProof[]) private _proofs;
    mapping(uint256 => uint64) private _redeemRequestedAt;
    mapping(uint256 => uint64) private _redeemedAt;
    uint256[] private _pendingRedeems;
    mapping(uint256 => uint256) private _pendingRedeemIndex; // 1-based position in _pendingRedeems, 0 = none

    event BirdsRegistered(uint256 firstBirdId, uint256 count);
    event HatchStarted(uint256 indexed hatchId, address indexed owner, uint64 revealBlock);
    event HatchFinished(uint256 indexed hatchId, address indexed owner, uint256 indexed tokenId, bytes32 seed, bool usedFallback);
    event CarePaid(uint256 indexed tokenId, address indexed payer, uint256 periods, uint64 carePaidUntil);
    event CareProofPosted(uint256 indexed tokenId, uint8 kind, bytes32 contentHash, string note);
    event CareFeeSet(uint256 careFee);
    event RendererSet(address renderer);
    event Withdrawn(address indexed to, uint256 amount);
    event RedeemRequested(uint256 indexed tokenId, address indexed owner);
    event RedeemCancelled(uint256 indexed tokenId, address indexed owner);
    event Redeemed(uint256 indexed tokenId, address indexed owner, bytes32 handoverHash);
    event Released(uint256 indexed tokenId, address indexed previousOwner);

    error WrongPayment();
    error ZeroQuantity();
    error TooEarly();
    error AlreadyFinished();
    error UnknownHatch();
    error CareOverdue(uint256 tokenId);
    error OnlyKhai();
    error PoolExhausted();
    error InvalidBird(uint256 index);
    error InvalidKind();
    error NoteTooLong();
    error ZeroAddress();
    error TransferFailed();
    error TooManyPeriods();
    error ZeroFee();
    error NotTokenOwner(uint256 tokenId);
    error RedeemPending(uint256 tokenId);
    error NoRedeemRequest(uint256 tokenId);
    error AlreadyRedeemed(uint256 tokenId);
    error NotReleasable(uint256 tokenId);

    constructor(
        address admin,
        address farm,
        address khai_,
        address renderer_,
        uint256 careFee_,
        uint64 carePeriod_
    ) ERC721("Kai", "KAI") {
        if (admin == address(0) || farm == address(0) || khai_ == address(0) || renderer_ == address(0)) revert ZeroAddress();
        if (carePeriod_ == 0) revert ZeroQuantity();
        if (careFee_ == 0) revert ZeroFee();
        _grantRole(DEFAULT_ADMIN_ROLE, admin);
        _grantRole(FARM_ROLE, farm);
        khai = khai_;
        renderer = renderer_;
        careFee = careFee_;
        carePeriod = carePeriod_;
    }

    // ---------------------------------------------------------------- farm

    function registerBirds(Bird[] calldata birds) external onlyRole(FARM_ROLE) {
        uint256 n = birds.length;
        if (n == 0) revert ZeroQuantity();
        uint256 first = birdsRegistered + 1;
        if (first + n - 1 > type(uint32).max) revert InvalidBird(0);
        for (uint256 i; i < n; ++i) {
            Bird calldata b = birds[i];
            if (b.breed > 9 || b.sex > 1 || b.plumage > 7 || b.bornAt == 0 || b.bornAt > block.timestamp) {
                revert InvalidBird(i);
            }
            uint256 id = first + i;
            _birds[id] = b;
            _pool.push(uint32(id));
        }
        birdsRegistered = first + n - 1;
        emit BirdsRegistered(first, n);
    }

    function postCareProof(uint256 tokenId, uint8 kind, bytes32 contentHash, string calldata note) external onlyRole(FARM_ROLE) {
        _requireOwned(tokenId);
        if (_redeemedAt[tokenId] != 0) revert AlreadyRedeemed(tokenId);
        if (kind > MAX_CARE_KIND) revert InvalidKind();
        if (bytes(note).length > MAX_NOTE_BYTES) revert NoteTooLong();
        _proofs[tokenId].push(CareProof(uint64(block.timestamp), kind, contentHash, note));
        ++totalCareProofs;
        emit CareProofPosted(tokenId, kind, contentHash, note);
    }

    // ---------------------------------------------------------------- hatch

    /// @notice Burns one egg of the caller and starts a hatch.
    function startHatch() external nonReentrant whenNotPaused returns (uint256 hatchId) {
        IKhaiForKai(khai).burnForHatch(msg.sender);
        hatchId = _startHatch(msg.sender);
    }

    /// @notice Starts a hatch for `owner` without an egg token. Khai has already taken payment and checked capacity.
    function startHatchFor(address owner) external whenNotPaused returns (uint256 hatchId) {
        if (msg.sender != khai) revert OnlyKhai();
        hatchId = _startHatch(owner);
    }

    function _startHatch(address owner) private returns (uint256 hatchId) {
        // I1 is enforced in Khai; this re-checks it here (outstanding eggs already exclude a burnt one).
        if (pendingHatches + IKhaiForKai(khai).totalSupply(1) >= _pool.length) revert PoolExhausted();
        hatchId = ++hatchCount;
        uint64 revealBlock = uint64(block.number) + HATCH_DELAY;
        _hatches[hatchId] = Hatch(owner, revealBlock, 0, false);
        _hatchesOf[owner].push(hatchId);
        ++pendingHatches;
        emit HatchStarted(hatchId, owner, revealBlock);
    }

    /// @notice Finishes `hatchId`, first finishing every earlier pending hatch, so hatches always finish in
    /// hatch-id order and finish order cannot change which bird a hatch gets. Anyone may call once
    /// block.number > revealBlock. Use finishNext to advance a long queue in bounded gas.
    function finishHatch(uint256 hatchId) external nonReentrant returns (uint256 tokenId) {
        Hatch storage h = _hatches[hatchId];
        if (h.owner == address(0)) revert UnknownHatch();
        if (h.birdId != 0) revert AlreadyFinished();
        if (block.number <= h.revealBlock) revert TooEarly();
        // Earlier hatches have revealBlock <= h.revealBlock, so they are ready as well.
        uint256 id = _nextToFinish;
        for (; id < hatchId; ++id) _finish(id);
        tokenId = _finish(hatchId);
        _nextToFinish = hatchId + 1;
    }

    /// @notice Finishes up to `maxCount` ready hatches from the front of the queue. Returns how many finished.
    function finishNext(uint256 maxCount) external nonReentrant returns (uint256 finished) {
        uint256 id = _nextToFinish;
        uint256 last = hatchCount;
        while (finished < maxCount && id <= last && block.number > _hatches[id].revealBlock) {
            _finish(id);
            ++id;
            ++finished;
        }
        _nextToFinish = id;
    }

    /// @notice Id of the oldest pending hatch (the next one to finish), or 0 when none is pending.
    function nextHatchToFinish() external view returns (uint256) {
        return pendingHatches == 0 ? 0 : _nextToFinish;
    }

    function _finish(uint256 hatchId) private returns (uint256 tokenId) {
        Hatch storage h = _hatches[hatchId];
        (bytes32 seed, bool usedFallback) = hatchSeed(hatchId, h.revealBlock);
        uint256 size = _pool.length;
        uint256 index = uint256(seed) % size;
        tokenId = _pool[index];
        _pool[index] = _pool[size - 1];
        _pool.pop();

        h.birdId = uint32(tokenId);
        h.usedFallback = usedFallback;
        _hatchSeeds[hatchId] = HatchSeed(seed, uint32(size), uint32(index));
        --pendingHatches;
        _hatchOfToken[tokenId] = hatchId;
        _carePaidUntil[tokenId] = uint64(block.timestamp) + carePeriod;

        address owner = h.owner;
        emit HatchFinished(hatchId, owner, tokenId, seed, usedFallback);
        _mint(owner, tokenId);
    }

    /// @notice The seed rule: keccak256(abi.encode(blockhash(revealBlock), hatchId)) while the
    /// block hash is available, otherwise keccak256(abi.encode(hatchId, revealBlock)).
    function hatchSeed(uint256 hatchId, uint64 revealBlock) private view returns (bytes32 seed, bool usedFallback) {
        bytes32 bh = blockhash(revealBlock);
        if (bh == bytes32(0)) {
            return (keccak256(abi.encode(hatchId, uint256(revealBlock))), true);
        }
        return (keccak256(abi.encode(bh, hatchId)), false);
    }

    // ---------------------------------------------------------------- care

    function payCare(uint256 tokenId, uint256 periods) external payable nonReentrant {
        _requireOwned(tokenId);
        if (_redeemedAt[tokenId] != 0) revert AlreadyRedeemed(tokenId);
        if (periods == 0) revert ZeroQuantity();
        if (msg.value != careFee * periods) revert WrongPayment();
        uint64 base = _carePaidUntil[tokenId];
        if (base < block.timestamp) base = uint64(block.timestamp);
        if (periods > MAX_CARE_PERIODS) revert TooManyPeriods();
        uint256 next = uint256(base) + periods * carePeriod;
        if (next > type(uint64).max) revert TooManyPeriods();
        uint64 until = uint64(next);
        _carePaidUntil[tokenId] = until;
        emit CarePaid(tokenId, msg.sender, periods, until);
    }

    function isOverdue(uint256 tokenId) public view returns (bool) {
        _requireOwned(tokenId);
        if (_redeemedAt[tokenId] != 0) return false; // a collected bird has no care clock
        return block.timestamp > _carePaidUntil[tokenId];
    }

    /// @dev Transfers revert while a collection request is pending or care is overdue, unless the bird is collected.
    /// Mints and burns (release) are not affected.
    function _update(address to, uint256 tokenId, address auth) internal override returns (address from) {
        from = super._update(to, tokenId, auth);
        if (from != address(0) && to != address(0) && _redeemedAt[tokenId] == 0) {
            if (_redeemRequestedAt[tokenId] != 0) revert RedeemPending(tokenId);
            if (block.timestamp > _carePaidUntil[tokenId]) revert CareOverdue(tokenId);
        }
    }

    // ---------------------------------------------------------------- collect (redeem) and release

    /// @notice The owner asks the farm to hand over the real bird. Care must not be overdue.
    function requestRedeem(uint256 tokenId) external {
        if (_requireOwned(tokenId) != msg.sender) revert NotTokenOwner(tokenId);
        if (_redeemedAt[tokenId] != 0) revert AlreadyRedeemed(tokenId);
        if (_redeemRequestedAt[tokenId] != 0) revert RedeemPending(tokenId);
        if (block.timestamp > _carePaidUntil[tokenId]) revert CareOverdue(tokenId);
        _redeemRequestedAt[tokenId] = uint64(block.timestamp);
        _pendingRedeems.push(tokenId);
        _pendingRedeemIndex[tokenId] = _pendingRedeems.length;
        emit RedeemRequested(tokenId, msg.sender);
    }

    function cancelRedeem(uint256 tokenId) external {
        if (_requireOwned(tokenId) != msg.sender) revert NotTokenOwner(tokenId);
        if (_redeemRequestedAt[tokenId] == 0) revert NoRedeemRequest(tokenId);
        _clearRequest(tokenId);
        emit RedeemCancelled(tokenId, msg.sender);
    }

    /// @notice The farm confirms the handover. The token stays with its owner as the bird's permanent record.
    function confirmRedeem(uint256 tokenId, bytes32 handoverHash) external onlyRole(FARM_ROLE) {
        address owner = _requireOwned(tokenId);
        if (_redeemRequestedAt[tokenId] == 0) revert NoRedeemRequest(tokenId);
        _clearRequest(tokenId);
        _redeemedAt[tokenId] = uint64(block.timestamp);
        ++totalCollected;
        emit Redeemed(tokenId, owner, handoverHash);
    }

    /// @notice The farm returns a bird whose care has been overdue for more than RELEASE_AFTER_PERIODS periods to the pool.
    /// The token is burned; the bird's care proofs stay with the bird id for the next sponsor.
    function release(uint256 tokenId) external onlyRole(FARM_ROLE) {
        address owner = _requireOwned(tokenId);
        if (_redeemedAt[tokenId] != 0) revert AlreadyRedeemed(tokenId);
        if (!isReleasable(tokenId)) revert NotReleasable(tokenId);
        if (_redeemRequestedAt[tokenId] != 0) _clearRequest(tokenId);
        delete _carePaidUntil[tokenId];
        delete _hatchOfToken[tokenId];
        _burn(tokenId);
        _pool.push(uint32(tokenId));
        ++totalReleased;
        emit Released(tokenId, owner);
    }

    /// @notice carePaidUntil + RELEASE_AFTER_PERIODS x carePeriod; 0 for a collected bird or a token that does not exist.
    function releasableAt(uint256 tokenId) public view returns (uint64) {
        if (_ownerOf(tokenId) == address(0) || _redeemedAt[tokenId] != 0) return 0;
        uint256 at = uint256(_carePaidUntil[tokenId]) + RELEASE_AFTER_PERIODS * uint256(carePeriod);
        return at > type(uint64).max ? type(uint64).max : uint64(at);
    }

    function isReleasable(uint256 tokenId) public view returns (bool) {
        uint64 at = releasableAt(tokenId);
        return at != 0 && block.timestamp > at;
    }

    /// @notice Token ids with a pending collection request.
    function pendingRedeems() external view returns (uint256[] memory) {
        return _pendingRedeems;
    }

    function _clearRequest(uint256 tokenId) private {
        uint256 pos = _pendingRedeemIndex[tokenId];
        uint256 last = _pendingRedeems.length;
        if (pos != last) {
            uint256 moved = _pendingRedeems[last - 1];
            _pendingRedeems[pos - 1] = moved;
            _pendingRedeemIndex[moved] = pos;
        }
        _pendingRedeems.pop();
        delete _pendingRedeemIndex[tokenId];
        delete _redeemRequestedAt[tokenId];
    }

    // ---------------------------------------------------------------- views

    function bird(uint256 birdId) external view returns (Bird memory) {
        if (birdId == 0 || birdId > birdsRegistered) revert InvalidBird(birdId);
        return _birds[birdId];
    }

    function chicken(uint256 tokenId) public view returns (Chicken memory) {
        address owner = _requireOwned(tokenId);
        return Chicken(
            tokenId,
            owner,
            _birds[tokenId],
            _carePaidUntil[tokenId],
            _hatchOfToken[tokenId],
            _proofs[tokenId].length,
            _redeemRequestedAt[tokenId],
            _redeemedAt[tokenId]
        );
    }

    function chickensOf(address owner) external view returns (Chicken[] memory list) {
        uint256 n = balanceOf(owner);
        list = new Chicken[](n);
        for (uint256 i; i < n; ++i) {
            list[i] = chicken(tokenOfOwnerByIndex(owner, i));
        }
    }

    function hatch(uint256 hatchId) external view returns (Hatch memory) {
        return _hatches[hatchId];
    }

    /// @notice Data the Verify button needs: the seed, the pool size when the hatch finished and the drawn index.
    /// `index == uint256(seed) % poolSizeAtFinish`. All zero while the hatch is pending.
    function hatchProof(uint256 hatchId) external view returns (bytes32 seed, uint256 poolSizeAtFinish, uint256 index) {
        HatchSeed memory s = _hatchSeeds[hatchId];
        return (s.seed, s.poolSizeAtFinish, s.index);
    }

    /// @notice Hatch ids of `owner`, oldest first.
    function hatchesOf(address owner) external view returns (uint256[] memory) {
        return _hatchesOf[owner];
    }

    /// @notice Care proofs of `tokenId`, newest first. `offset` counts from the newest.
    function careProofs(uint256 tokenId, uint256 offset, uint256 limit) external view returns (CareProof[] memory page) {
        CareProof[] storage all = _proofs[tokenId];
        uint256 total = all.length;
        if (offset >= total) return new CareProof[](0);
        uint256 n = total - offset;
        if (limit < n) n = limit;
        page = new CareProof[](n);
        for (uint256 i; i < n; ++i) {
            page[i] = all[total - 1 - offset - i];
        }
    }

    function poolSize() external view returns (uint256) {
        return _pool.length;
    }

    function stats() external view returns (Stats memory) {
        return Stats(birdsRegistered, _pool.length, totalSupply(), pendingHatches, totalCareProofs, totalCollected, totalReleased);
    }

    function tokenURI(uint256 tokenId) public view override returns (string memory) {
        _requireOwned(tokenId);
        return IChickenRenderer(renderer).chickenURI(tokenId, _birds[tokenId], _carePaidUntil[tokenId], _redeemedAt[tokenId]);
    }

    // ---------------------------------------------------------------- admin

    function setCareFee(uint256 careFee_) external onlyRole(DEFAULT_ADMIN_ROLE) {
        if (careFee_ == 0) revert ZeroFee();
        careFee = careFee_;
        emit CareFeeSet(careFee_);
    }

    function setRenderer(address renderer_) external onlyRole(DEFAULT_ADMIN_ROLE) {
        if (renderer_ == address(0)) revert ZeroAddress();
        renderer = renderer_;
        emit RendererSet(renderer_);
    }

    function pause() external onlyRole(DEFAULT_ADMIN_ROLE) {
        _pause();
    }

    function unpause() external onlyRole(DEFAULT_ADMIN_ROLE) {
        _unpause();
    }

    function withdraw(address payable to) external onlyRole(FARM_ROLE) nonReentrant {
        if (to == address(0)) revert ZeroAddress();
        uint256 amount = address(this).balance;
        emit Withdrawn(to, amount);
        (bool ok, ) = to.call{value: amount}("");
        if (!ok) revert TransferFailed();
    }

    function supportsInterface(bytes4 interfaceId) public view override(ERC721Enumerable, AccessControl) returns (bool) {
        return super.supportsInterface(interfaceId);
    }
}
