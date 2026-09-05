// SPDX-License-Identifier: MIT
pragma solidity ~0.8.27;

import {FHE, ebool, euint64, euint128} from "@fhevm/solidity/lib/FHE.sol";
import {ZamaEthereumConfig} from "@fhevm/solidity/config/ZamaConfig.sol";
import {IERC7984} from "@openzeppelin/confidential-contracts/interfaces/IERC7984.sol";
import {IERC7984Receiver} from "@openzeppelin/confidential-contracts/interfaces/IERC7984Receiver.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {Ownable2Step} from "@openzeppelin/contracts/access/Ownable2Step.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

/// @title MixTogether confidential prize-savings pool
/// @notice A bounded, batch-processed PoolTogether-style pool for Zama FHEVM.
/// @dev Financial magnitude and winner state stay encrypted. Registry and draw
///      progress are intentionally public so permissionless callers can advance it.
contract MixTogetherPool is
    ZamaEthereumConfig,
    IERC7984Receiver,
    Ownable2Step,
    ReentrancyGuard
{
    enum DrawPhase {
        OPEN,
        ACCRUE,
        RANDOMIZE,
        SELECT
    }

    uint8 public constant DEPOSIT = 1;
    uint8 public constant PRIZE = 2;
    uint8 public constant MAX_SAVERS = 64;
    uint8 public constant BATCH_SIZE = 8;
    uint48 public constant EPOCH_DURATION = 5 minutes;
    uint64 public constant NOMINAL_PRIZE = 10_000_000;
    uint64 public constant TICKET_UNIT = 100_000;

    IERC7984 public immutable confidentialToken;

    DrawPhase private _phase;
    uint64 private _drawId;
    uint48 private _epochStartedAt;
    uint48 private _cutoff;
    uint8 private _accrualCursor;
    uint8 private _selectionCursor;
    bool private _depositsPaused;

    address[MAX_SAVERS] private _savers;
    uint8 public saverCount;
    /// @notice One-based slot number. Zero means the address is not registered.
    mapping(address saver => uint8 slotPlusOne) public slotOf;
    mapping(address saver => bool requested) public exitRequested;
    /// @notice Draw id whose eligibility must be completed before pruning.
    ///         Zero means the saver has no pending exit.
    mapping(address saver => uint64 drawId) public exitDrawId;
    mapping(address saver => uint48 timestamp) public lastAccrual;

    mapping(address saver => euint64 amount) private _principal;
    mapping(address saver => euint64 secondsAmount) private _balanceSeconds;
    mapping(address saver => euint64 amount) private _winnings;
    mapping(address saver => euint64 weight) private _drawWeight;
    mapping(address saver => uint64 drawId) private _weightDrawId;

    euint64 private _aggregatePrincipal;
    euint64 private _prizeReserve;
    euint64 private _aggregateWinnings;
    euint64 private _totalWeight;
    euint64 private _ticket;
    euint64 private _selectionCumulative;
    euint64 private _activeAward;
    ebool private _winnerCredited;

    error UnauthorizedToken(address caller);
    error InvalidMode(uint8 mode);
    error InvalidCallbackData();
    error DepositsPaused();
    error EpochEnded(uint48 cutoff);
    error RegistryFull();
    error WrongPhase(DrawPhase expected, DrawPhase actual);
    error EpochStillOpen(uint48 cutoff);
    error TooManySlots(uint256 supplied);
    error InvalidSlot(uint8 slot);
    error GuardianRequired();

    event SaverRegistered(address indexed saver, uint8 indexed slot);
    event SaverPruned(address indexed saver, uint8 indexed slot);
    event Deposit(address indexed saver);
    event PrizeFunded(address indexed funder);
    event Withdrawal(address indexed saver);
    event Claim(address indexed saver);
    event DrawClosed(uint64 indexed drawId, uint48 cutoff);
    event AccrualBatchProcessed(uint64 indexed drawId, uint8 cursor, uint8 saversProcessed);
    event DrawRandomized(uint64 indexed drawId);
    event SelectionBatchProcessed(uint64 indexed drawId, uint8 cursor, uint8 saversProcessed);
    event DrawFinalized(uint64 indexed drawId);
    event DepositPauseChanged(bool paused);

    constructor(address token_, address guardian_) Ownable(guardian_) {
        require(token_ != address(0) && guardian_ != address(0), "zero address");
        confidentialToken = IERC7984(token_);
        _phase = DrawPhase.OPEN;
        _drawId = 1;
        _epochStartedAt = uint48(block.timestamp);

        _aggregatePrincipal = _zero64();
        _prizeReserve = _zero64();
        _aggregateWinnings = _zero64();
        _totalWeight = _zero64();
        _ticket = _zero64();
        _selectionCumulative = _zero64();
        _activeAward = _zero64();
        _winnerCredited = FHE.asEbool(false);
        FHE.allowThis(_winnerCredited);
        FHE.allow(_prizeReserve, guardian_);
    }

    /// @inheritdoc IERC7984Receiver
    function onConfidentialTransferReceived(
        address,
        address from,
        euint64 amount,
        bytes calldata data
    ) external nonReentrant returns (ebool accepted) {
        if (msg.sender != address(confidentialToken)) revert UnauthorizedToken(msg.sender);
        if (data.length != 32) revert InvalidCallbackData();

        uint8 mode = abi.decode(data, (uint8));
        if (mode == DEPOSIT) {
            _receiveDeposit(from, amount);
            emit Deposit(from);
        } else if (mode == PRIZE) {
            _prizeReserve = FHE.add(_prizeReserve, amount);
            _persistReserve();
            emit PrizeFunded(from);
        } else {
            revert InvalidMode(mode);
        }

        accepted = FHE.asEbool(true);
        FHE.allowTransient(accepted, msg.sender);
    }

    /// @notice Returns all principal immediately as confidential cUSDC.
    /// @dev During ACCRUE this records cutoff weight before principal is reduced.
    function withdrawAll() external nonReentrant {
        if (_phase == DrawPhase.OPEN) {
            _accrueUntil(msg.sender, _openEligibilityEnd());
        } else if (_phase == DrawPhase.ACCRUE) {
            _recordWeight(msg.sender);
        }

        euint64 requested = _value64(_principal[msg.sender]);
        FHE.allowTransient(requested, address(confidentialToken));
        euint64 transferred = confidentialToken.confidentialTransfer(msg.sender, requested);

        _principal[msg.sender] = FHE.sub(requested, transferred);
        _persistUser64(_principal[msg.sender], msg.sender);
        _aggregatePrincipal = FHE.sub(_aggregatePrincipal, transferred);
        FHE.allowThis(_aggregatePrincipal);
        exitRequested[msg.sender] = true;
        exitDrawId[msg.sender] = _drawId;

        emit Withdrawal(msg.sender);
    }

    /// @notice Claims the caller's encrypted winnings, including a valid zero claim.
    function claimWinnings() external nonReentrant {
        euint64 requested = _value64(_winnings[msg.sender]);
        FHE.allowTransient(requested, address(confidentialToken));
        euint64 transferred = confidentialToken.confidentialTransfer(msg.sender, requested);

        _winnings[msg.sender] = FHE.sub(requested, transferred);
        _persistUser64(_winnings[msg.sender], msg.sender);
        _aggregateWinnings = FHE.sub(_aggregateWinnings, transferred);
        FHE.allowThis(_aggregateWinnings);

        emit Claim(msg.sender);
    }

    /// @notice Freezes the scheduled cutoff once the five-minute epoch has elapsed.
    function closeDraw() external {
        _requirePhase(DrawPhase.OPEN);
        uint48 scheduledCutoff = _scheduledCutoff();
        if (block.timestamp < scheduledCutoff) revert EpochStillOpen(scheduledCutoff);

        _cutoff = scheduledCutoff;
        _phase = DrawPhase.ACCRUE;
        _accrualCursor = 0;
        _totalWeight = _zero64();
        emit DrawClosed(_drawId, _cutoff);
    }

    /// @notice Finalizes at most eight occupied saver slots for the current draw.
    function processAccrualBatch() external {
        _requirePhase(DrawPhase.ACCRUE);
        uint8 processed;

        while (_accrualCursor < MAX_SAVERS && processed < BATCH_SIZE) {
            address saver = _savers[_accrualCursor];
            unchecked {
                ++_accrualCursor;
            }
            if (saver == address(0)) continue;
            _recordWeight(saver);
            unchecked {
                ++processed;
            }
        }

        if (_accrualCursor == MAX_SAVERS) _phase = DrawPhase.RANDOMIZE;
        emit AccrualBatchProcessed(_drawId, _accrualCursor, processed);
    }

    /// @notice Reserves the nominal award and creates an encrypted range ticket.
    function randomizeDraw() external {
        _requirePhase(DrawPhase.RANDOMIZE);

        _activeAward = FHE.min(_prizeReserve, NOMINAL_PRIZE);
        FHE.allowThis(_activeAward);
        _prizeReserve = FHE.sub(_prizeReserve, _activeAward);
        _persistReserve();

        euint128 product = FHE.mul(
            FHE.asEuint128(_randomWord()),
            FHE.asEuint128(_totalWeight)
        );
        _ticket = FHE.asEuint64(FHE.shr(product, 64));
        FHE.allowThis(_ticket);
        _selectionCumulative = _zero64();
        _winnerCredited = FHE.asEbool(false);
        FHE.allowThis(_winnerCredited);
        _selectionCursor = 0;
        _phase = DrawPhase.SELECT;

        emit DrawRandomized(_drawId);
    }

    /// @notice Scans and confidentially updates at most eight occupied saver slots.
    function processSelectionBatch() external {
        _requirePhase(DrawPhase.SELECT);
        uint8 processed;

        while (_selectionCursor < MAX_SAVERS && processed < BATCH_SIZE) {
            address saver = _savers[_selectionCursor];
            unchecked {
                ++_selectionCursor;
            }
            if (saver == address(0)) continue;
            _visitSelection(saver);
            unchecked {
                ++processed;
            }
        }

        emit SelectionBatchProcessed(_drawId, _selectionCursor, processed);
        if (_selectionCursor == MAX_SAVERS) _finalizeDraw();
    }

    /// @notice Reclaims up to eight exited slots after the draw that used them ends.
    function pruneExited(uint8[] calldata slots) external {
        _requirePhase(DrawPhase.OPEN);
        if (slots.length > BATCH_SIZE) revert TooManySlots(slots.length);

        for (uint256 i; i < slots.length; ++i) {
            uint8 slot = slots[i];
            if (slot >= MAX_SAVERS) revert InvalidSlot(slot);
            address saver = _savers[slot];
            if (
                saver == address(0) ||
                !exitRequested[saver] ||
                _drawId <= exitDrawId[saver]
            ) continue;

            _savers[slot] = address(0);
            slotOf[saver] = 0;
            exitRequested[saver] = false;
            exitDrawId[saver] = 0;
            lastAccrual[saver] = 0;
            unchecked {
                --saverCount;
            }
            emit SaverPruned(saver, slot);
        }
    }

    function pauseDeposits() external onlyOwner {
        _depositsPaused = true;
        emit DepositPauseChanged(true);
    }

    function unpauseDeposits() external onlyOwner {
        _depositsPaused = false;
        emit DepositPauseChanged(false);
    }

    function depositsPaused() external view returns (bool) {
        return _depositsPaused;
    }

    function principalOf(address saver) external view returns (euint64) {
        return _principal[saver];
    }

    function winningsOf(address saver) external view returns (euint64) {
        return _winnings[saver];
    }

    function drawWeightOf(address saver) external view returns (euint64) {
        return _drawWeight[saver];
    }

    /// @notice Guardian-only ACL makes this handle decryptable only by the owner.
    function reserveForGuardian() external view returns (euint64) {
        return _prizeReserve;
    }

    function saverAt(uint8 slot) external view returns (address) {
        if (slot >= MAX_SAVERS) revert InvalidSlot(slot);
        return _savers[slot];
    }

    function drawState()
        external
        view
        returns (
            uint64 drawId,
            DrawPhase phase,
            uint48 epochStartedAt,
            uint48 cutoff,
            uint48 scheduledCutoff,
            uint8 accrualCursor,
            uint8 selectionCursor,
            uint8 registeredSavers
        )
    {
        return (
            _drawId,
            _phase,
            _epochStartedAt,
            _cutoff,
            _scheduledCutoff(),
            _accrualCursor,
            _selectionCursor,
            saverCount
        );
    }

    /// @dev Ownership cannot be burned; a guardian must always exist.
    function renounceOwnership() public view override onlyOwner {
        revert GuardianRequired();
    }

    function acceptOwnership() public override {
        super.acceptOwnership();
        // ACL grants cannot be revoked from an existing ciphertext, so rotate
        // the current reserve into a fresh handle for the incoming guardian.
        _prizeReserve = FHE.add(_prizeReserve, FHE.asEuint64(0));
        _persistReserve();
    }

    function _receiveDeposit(address saver, euint64 amount) private {
        _requirePhase(DrawPhase.OPEN);
        if (_depositsPaused) revert DepositsPaused();
        uint48 scheduledCutoff = _scheduledCutoff();
        if (block.timestamp >= scheduledCutoff) revert EpochEnded(scheduledCutoff);

        _register(saver);
        _accrueUntil(saver, uint48(block.timestamp));
        _principal[saver] = FHE.add(_principal[saver], amount);
        _persistUser64(_principal[saver], saver);
        _aggregatePrincipal = FHE.add(_aggregatePrincipal, amount);
        FHE.allowThis(_aggregatePrincipal);
        exitRequested[saver] = false;
        exitDrawId[saver] = 0;
    }

    function _register(address saver) private {
        if (slotOf[saver] != 0) return;
        if (saverCount == MAX_SAVERS) revert RegistryFull();

        for (uint8 slot; slot < MAX_SAVERS; ++slot) {
            if (_savers[slot] != address(0)) continue;
            _savers[slot] = saver;
            slotOf[saver] = slot + 1;
            unchecked {
                ++saverCount;
            }
            lastAccrual[saver] = uint48(block.timestamp);
            _principal[saver] = _zeroFor(saver);
            _balanceSeconds[saver] = _zeroFor(saver);
            _winnings[saver] = _zeroFor(saver);
            _drawWeight[saver] = _zeroFor(saver);
            emit SaverRegistered(saver, slot);
            return;
        }
        revert RegistryFull();
    }

    function _recordWeight(address saver) private {
        if (_weightDrawId[saver] == _drawId) return;
        _accrueUntil(saver, _cutoff);

        _drawWeight[saver] = _balanceSeconds[saver];
        _persistUser64(_drawWeight[saver], saver);
        _weightDrawId[saver] = _drawId;
        _totalWeight = FHE.add(_totalWeight, _drawWeight[saver]);
        FHE.allowThis(_totalWeight);
        _balanceSeconds[saver] = _zeroFor(saver);
    }

    function _accrueUntil(address saver, uint48 end) private {
        if (slotOf[saver] == 0) return;
        uint48 start = lastAccrual[saver];
        if (start < _epochStartedAt) start = _epochStartedAt;
        if (end <= start) return;

        uint64 elapsed = uint64(end - start);
        euint64 ticketUnits = FHE.div(_principal[saver], TICKET_UNIT);
        euint64 increment = FHE.mul(ticketUnits, elapsed);
        _balanceSeconds[saver] = FHE.add(_balanceSeconds[saver], increment);
        _persistUser64(_balanceSeconds[saver], saver);
        lastAccrual[saver] = end;
    }

    function _visitSelection(address saver) private {
        euint64 weight = _weightDrawId[saver] == _drawId
            ? _drawWeight[saver]
            : _zero64();
        euint64 nextCumulative = FHE.add(_selectionCumulative, weight);

        ebool selected = FHE.and(
            FHE.and(FHE.not(_winnerCredited), FHE.gt(weight, 0)),
            FHE.and(
                FHE.ge(_ticket, _selectionCumulative),
                FHE.lt(_ticket, nextCumulative)
            )
        );
        euint64 credit = FHE.select(selected, _activeAward, FHE.asEuint64(0));
        _winnings[saver] = FHE.add(_winnings[saver], credit);
        _persistUser64(_winnings[saver], saver);
        _aggregateWinnings = FHE.add(_aggregateWinnings, credit);
        FHE.allowThis(_aggregateWinnings);
        _winnerCredited = FHE.or(_winnerCredited, selected);
        FHE.allowThis(_winnerCredited);
        _selectionCumulative = nextCumulative;
        FHE.allowThis(_selectionCumulative);
    }

    function _finalizeDraw() private {
        euint64 unusedAward = FHE.select(
            _winnerCredited,
            FHE.asEuint64(0),
            _activeAward
        );
        _prizeReserve = FHE.add(_prizeReserve, unusedAward);
        _persistReserve();

        uint64 completedDraw = _drawId;
        unchecked {
            ++_drawId;
        }
        _phase = DrawPhase.OPEN;
        _epochStartedAt = uint48(block.timestamp);
        _cutoff = 0;
        _accrualCursor = 0;
        _selectionCursor = 0;
        _totalWeight = _zero64();
        _ticket = _zero64();
        _selectionCumulative = _zero64();
        _activeAward = _zero64();
        _winnerCredited = FHE.asEbool(false);
        FHE.allowThis(_winnerCredited);

        emit DrawFinalized(completedDraw);
    }

    function _scheduledCutoff() private view returns (uint48) {
        return _epochStartedAt + EPOCH_DURATION;
    }

    function _openEligibilityEnd() private view returns (uint48) {
        uint48 scheduledCutoff = _scheduledCutoff();
        return block.timestamp < scheduledCutoff
            ? uint48(block.timestamp)
            : scheduledCutoff;
    }

    function _requirePhase(DrawPhase expected) private view {
        if (_phase != expected) revert WrongPhase(expected, _phase);
    }

    function _persistReserve() private {
        FHE.allowThis(_prizeReserve);
        FHE.allow(_prizeReserve, owner());
    }

    function _persistUser64(euint64 value, address user) private {
        FHE.allowThis(value);
        FHE.allow(value, user);
    }

    function _zero64() private returns (euint64 value) {
        value = FHE.asEuint64(0);
        FHE.allowThis(value);
    }

    function _zeroFor(address user) private returns (euint64 value) {
        euint64 r = FHE.randEuint64();
        value = FHE.sub(r, r);
        _persistUser64(value, user);
    }

    function _value64(euint64 value) private returns (euint64) {
        return FHE.isInitialized(value) ? value : _zero64();
    }

    function _randomWord() internal virtual returns (euint64) {
        return FHE.randEuint64();
    }
}
