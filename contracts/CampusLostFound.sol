// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/// @title 校园失物招领 DApp
/// @notice 实现「登记 — 悬赏 — 托管 — 归还 — 放款」全流程闭环：
///         流程一（拾获登记）：拾获人登记 -> 失主认领并托管押金 -> 拾获人标记已归还 -> 失主确认 / 超时 -> 合约自动放款给拾获人
///         流程二（寻物悬赏）：失主发布悬赏并托管赏金 -> 拾获人报名 -> 失主核对确认 -> 拾获人标记已归还 -> 失主确认 / 超时 -> 合约自动放款
///         所有资金由合约托管，状态流转全部上链，可追溯、不可篡改、不可抵赖。
contract CampusLostFound {
    // ---------------- 状态机 ----------------
    // Active        已发布 / 待认领（或待报名）
    // Matched       已认领 / 已匹配（押金/赏金已托管）
    // ReturnMarked  拾获人已声明线下归还（不可抵赖的链上声明）
    // Completed     双方确认（或超时），资金已放款，流程终态
    // Closed        发布方撤销，流程终态
    enum Status { Active, Matched, ReturnMarked, Completed, Closed }

    // ---------------- 链上状态结构 ----------------
    struct FoundItem {
        uint256 id;
        address finder;          // 拾获人地址
        string category;         // 物品种类
        string description;      // 物品描述（据实填写，形成不可篡改存证）
        string foundLocation;    // 拾获地点
        uint256 foundTime;       // 拾获时间（Unix 秒）
        string contact;          // 联系方式（建议前端加密或只存哈希）
        Status status;
        address claimant;        // 认领人（失主）
        uint256 deposit;         // 失主托管的答谢押金（wei）
        uint256 returnMarkedAt;  // 拾获人标记归还的时间
    }

    struct Bounty {
        uint256 id;
        address owner;           // 失主地址
        string category;
        string description;
        string lostLocation;     // 遗失地点
        uint256 lostTime;        // 遗失时间
        string contact;
        uint256 reward;          // 托管中的悬赏金（wei）
        Status status;
        address finder;          // 经失主核对确认的拾获人
        uint256 returnMarkedAt;
    }

    /// 失主确认收货的宽限期：拾获人标记归还后，超期未确认则任何人可触发自动放款
    uint256 public constant CONFIRM_TIMEOUT = 7 days;

    uint256 public foundCount;
    uint256 public bountyCount;

    mapping(uint256 => FoundItem) private _foundItems;
    mapping(uint256 => Bounty) private _bounties;
    mapping(uint256 => address[]) private _bountyApplicants; // 悬赏报名者列表
    mapping(uint256 => mapping(address => bool)) public hasApplied;

    bool private _locked; // 防重入锁

    // ---------------- 事件（全环节可追溯） ----------------
    event FoundRegistered(uint256 indexed id, address indexed finder, string category, uint256 foundTime);
    event FoundClaimed(uint256 indexed id, address indexed claimant, uint256 deposit);
    event FoundClaimCancelled(uint256 indexed id, address indexed claimant);
    event FoundReturnMarked(uint256 indexed id, uint256 markedAt);
    event FoundCompleted(uint256 indexed id, address indexed finder, uint256 amount);
    event FoundClosed(uint256 indexed id);

    event BountyPosted(uint256 indexed id, address indexed owner, uint256 reward);
    event BountyApplied(uint256 indexed id, address indexed finder);
    event BountyMatched(uint256 indexed id, address indexed finder);
    event BountyUnmatched(uint256 indexed id, address indexed finder);
    event BountyReturnMarked(uint256 indexed id, uint256 markedAt);
    event BountyCompleted(uint256 indexed id, address indexed finder, uint256 amount);
    event BountyCancelled(uint256 indexed id);

    modifier nonReentrant() {
        require(!_locked, "REENTRANCY");
        _locked = true;
        _;
        _locked = false;
    }

    modifier existsFound(uint256 id) {
        require(id > 0 && id <= foundCount, "found item not exist");
        _;
    }

    modifier existsBounty(uint256 id) {
        require(id > 0 && id <= bountyCount, "bounty not exist");
        _;
    }

    // ================= 流程一：拾获登记 =================

    /// @notice 拾获人登记物品（不可篡改存证）
    function registerFoundItem(
        string calldata category,
        string calldata description,
        string calldata foundLocation,
        uint256 foundTime,
        string calldata contact
    ) external returns (uint256 id) {
        require(bytes(category).length > 0, "category required");
        require(foundTime <= block.timestamp, "foundTime in future");
        id = ++foundCount;
        FoundItem storage it = _foundItems[id];
        it.id = id;
        it.finder = msg.sender;
        it.category = category;
        it.description = description;
        it.foundLocation = foundLocation;
        it.foundTime = foundTime;
        it.contact = contact;
        it.status = Status.Active;
        emit FoundRegistered(id, msg.sender, category, foundTime);
    }

    /// @notice 失主认领物品，同时把答谢押金托管进合约（不直接转给拾获人）
    function claimFoundItem(uint256 id) external payable existsFound(id) {
        FoundItem storage it = _foundItems[id];
        require(it.status == Status.Active, "not active");
        require(msg.sender != it.finder, "finder cannot claim own item");
        require(msg.value > 0, "deposit required");
        it.status = Status.Matched;
        it.claimant = msg.sender;
        it.deposit = msg.value;
        emit FoundClaimed(id, msg.sender, msg.value);
    }

    /// @notice 拾获人标记归还前，失主任一方可取消认领，押金原路退回
    function cancelClaim(uint256 id) external nonReentrant existsFound(id) {
        FoundItem storage it = _foundItems[id];
        require(it.status == Status.Matched, "not matched");
        require(msg.sender == it.claimant, "not claimant");
        uint256 amount = it.deposit;
        it.status = Status.Active;
        it.claimant = address(0);
        it.deposit = 0;
        (bool ok, ) = payable(msg.sender).call{value: amount}("");
        require(ok, "refund failed");
        emit FoundClaimCancelled(id, msg.sender);
    }

    /// @notice 拾获人完成线下归还后做链上声明（不可抵赖）
    function markFoundReturned(uint256 id) external existsFound(id) {
        FoundItem storage it = _foundItems[id];
        require(it.status == Status.Matched, "not matched");
        require(msg.sender == it.finder, "not finder");
        it.status = Status.ReturnMarked;
        it.returnMarkedAt = block.timestamp;
        emit FoundReturnMarked(id, block.timestamp);
    }

    /// @notice 失主确认收到物品 -> 合约自动把托管押金放款给拾获人
    function confirmFoundReceived(uint256 id) external nonReentrant existsFound(id) {
        FoundItem storage it = _foundItems[id];
        require(it.status == Status.ReturnMarked, "not return-marked");
        require(msg.sender == it.claimant, "not claimant");
        uint256 amount = it.deposit;
        it.status = Status.Completed;
        it.deposit = 0;
        (bool ok, ) = payable(it.finder).call{value: amount}("");
        require(ok, "payout failed");
        emit FoundCompleted(id, it.finder, amount);
    }

    /// @notice 超时自动放款：拾获人已标记归还，失主 7 天未确认，任何人可触发
    function timeoutReleaseFound(uint256 id) external nonReentrant existsFound(id) {
        FoundItem storage it = _foundItems[id];
        require(it.status == Status.ReturnMarked, "not return-marked");
        require(block.timestamp >= it.returnMarkedAt + CONFIRM_TIMEOUT, "timeout not reached");
        uint256 amount = it.deposit;
        it.status = Status.Completed;
        it.deposit = 0;
        (bool ok, ) = payable(it.finder).call{value: amount}("");
        require(ok, "payout failed");
        emit FoundCompleted(id, it.finder, amount);
    }

    /// @notice 拾获人撤销登记（仅未认领时）
    function closeFoundItem(uint256 id) external existsFound(id) {
        FoundItem storage it = _foundItems[id];
        require(it.status == Status.Active, "not active");
        require(msg.sender == it.finder, "not finder");
        it.status = Status.Closed;
        emit FoundClosed(id);
    }

    // ================= 流程二：寻物悬赏 =================

    /// @notice 失主发布寻物悬赏，悬赏金随交易托管进合约
    function postBounty(
        string calldata category,
        string calldata description,
        string calldata lostLocation,
        uint256 lostTime,
        string calldata contact
    ) external payable returns (uint256 id) {
        require(msg.value > 0, "reward required");
        require(bytes(category).length > 0, "category required");
        id = ++bountyCount;
        Bounty storage b = _bounties[id];
        b.id = id;
        b.owner = msg.sender;
        b.category = category;
        b.description = description;
        b.lostLocation = lostLocation;
        b.lostTime = lostTime;
        b.contact = contact;
        b.reward = msg.value;
        b.status = Status.Active;
        emit BountyPosted(id, msg.sender, msg.value);
    }

    /// @notice 拾获人对悬赏报名（表示"我捡到了疑似物品"）
    function applyForBounty(uint256 id) external existsBounty(id) {
        Bounty storage b = _bounties[id];
        require(b.status == Status.Active, "not active");
        require(msg.sender != b.owner, "owner cannot apply");
        require(!hasApplied[id][msg.sender], "already applied");
        hasApplied[id][msg.sender] = true;
        _bountyApplicants[id].push(msg.sender);
        emit BountyApplied(id, msg.sender);
    }

    /// @notice 失主核对报名者身份与物品归属后，指定真正的拾获人
    function confirmFinder(uint256 id, address finder) external existsBounty(id) {
        Bounty storage b = _bounties[id];
        require(b.status == Status.Active, "not active");
        require(msg.sender == b.owner, "not owner");
        require(hasApplied[id][finder], "finder not applied");
        b.status = Status.Matched;
        b.finder = finder;
        emit BountyMatched(id, finder);
    }

    /// @notice 核对有误时失主可取消匹配，悬赏重新开放
    function unmatchBounty(uint256 id) external existsBounty(id) {
        Bounty storage b = _bounties[id];
        require(b.status == Status.Matched, "not matched");
        require(msg.sender == b.owner, "not owner");
        address f = b.finder;
        b.finder = address(0);
        b.status = Status.Active;
        emit BountyUnmatched(id, f);
    }

    /// @notice 被确认的拾获人标记已线下归还
    function markBountyReturned(uint256 id) external existsBounty(id) {
        Bounty storage b = _bounties[id];
        require(b.status == Status.Matched, "not matched");
        require(msg.sender == b.finder, "not finder");
        b.status = Status.ReturnMarked;
        b.returnMarkedAt = block.timestamp;
        emit BountyReturnMarked(id, block.timestamp);
    }

    /// @notice 失主确认收到物品 -> 合约自动把托管赏金放款给拾获人
    function confirmBountyReceived(uint256 id) external nonReentrant existsBounty(id) {
        Bounty storage b = _bounties[id];
        require(b.status == Status.ReturnMarked, "not return-marked");
        require(msg.sender == b.owner, "not owner");
        uint256 amount = b.reward;
        b.status = Status.Completed;
        b.reward = 0;
        (bool ok, ) = payable(b.finder).call{value: amount}("");
        require(ok, "payout failed");
        emit BountyCompleted(id, b.finder, amount);
    }

    /// @notice 超时自动放款（防止失主恶意不确认）
    function timeoutReleaseBounty(uint256 id) external nonReentrant existsBounty(id) {
        Bounty storage b = _bounties[id];
        require(b.status == Status.ReturnMarked, "not return-marked");
        require(block.timestamp >= b.returnMarkedAt + CONFIRM_TIMEOUT, "timeout not reached");
        uint256 amount = b.reward;
        b.status = Status.Completed;
        b.reward = 0;
        (bool ok, ) = payable(b.finder).call{value: amount}("");
        require(ok, "payout failed");
        emit BountyCompleted(id, b.finder, amount);
    }

    /// @notice 悬赏未匹配前，失主可撤销并取回全部悬赏金
    function cancelBounty(uint256 id) external nonReentrant existsBounty(id) {
        Bounty storage b = _bounties[id];
        require(b.status == Status.Active, "not active");
        require(msg.sender == b.owner, "not owner");
        uint256 amount = b.reward;
        b.status = Status.Closed;
        b.reward = 0;
        (bool ok, ) = payable(msg.sender).call{value: amount}("");
        require(ok, "refund failed");
        emit BountyCancelled(id);
    }

    // ================= 查询接口 =================

    function getFoundItem(uint256 id) external view existsFound(id) returns (FoundItem memory) {
        return _foundItems[id];
    }

    function getBounty(uint256 id) external view existsBounty(id) returns (Bounty memory) {
        return _bounties[id];
    }

    function getBountyApplicants(uint256 id) external view existsBounty(id) returns (address[] memory) {
        return _bountyApplicants[id];
    }
}
