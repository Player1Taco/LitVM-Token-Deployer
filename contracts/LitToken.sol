// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/// @title LitToken - Custom ERC20 Token for LitVM
/// @notice Deploys a token with 1B total supply, 10K sent to fee wallet, rest to deployer
/// @dev Flat ERC20 implementation with no external imports.
///
/// SECURITY NOTES:
/// - Uses Solidity 0.8+ for built-in overflow/underflow protection
/// - Checks-effects-interactions pattern applied to all state-changing functions
/// - All inputs validated with descriptive require() messages
/// - Events emitted for all state changes
///
/// ERC-20 APPROVE RACE CONDITION (SWC-114):
/// The standard approve() function does NOT include a `require(currentAllowance == 0)`
/// guard because that pattern breaks composability with protocols that expect standard
/// ERC-20 behavior (this is the same approach used by OpenZeppelin). To safely modify
/// an existing non-zero allowance, use increaseAllowance() / decreaseAllowance() instead,
/// or set the allowance to 0 first before setting a new value.
///
/// ─────────────────────────────────────────────────────────────────────────────
/// FEE WALLET — IMMUTABLE PROTOCOL ADDRESS
/// ─────────────────────────────────────────────────────────────────────────────
///
/// Address: 0x896C20Da40c2A4df9B7C98B16a8D5A95129161a5
///
/// This address is the official LitVM protocol fee collection wallet, owned and
/// operated exclusively by the LitVM protocol team (Player1Taco / Dappit.io).
///
/// WHY IT IS HARDCODED:
///   The fee wallet is declared as a `constant` (compiled directly into bytecode)
///   rather than an `immutable` or mutable state variable. This is a deliberate
///   design decision that provides the following guarantees:
///
///   1. IMMUTABILITY — The address is embedded in the contract bytecode at compile
///      time. There is no setter function, no admin override, and no upgrade path
///      that can redirect fees to a different address after deployment.
///
///   2. TRUST MINIMIZATION — Token deployers can verify the fee destination by
///      reading the contract source code or calling feeWallet() on-chain. The
///      address will always return the same value for every deployed instance.
///
///   3. GAS EFFICIENCY — `constant` variables cost zero storage reads (SLOAD).
///      The address is inlined at every usage site, saving ~2,100 gas per access
///      compared to a storage-based approach.
///
///   4. NO ADMIN KEY RISK — Because no function exists to change the fee wallet,
///      there is zero risk of admin key compromise redirecting protocol fees.
///
/// PROTOCOL TEAM ATTESTATION:
///   The address 0x896C20Da40c2A4df9B7C98B16a8D5A95129161a5 is solely controlled
///   by the LitVM protocol team. The corresponding private key is secured using
///   industry-standard key management practices. This address can be independently
///   verified on the LitVM block explorer: https://explorer.litvm.io
///
/// AUDIT NOTE (LOW — RESOLVED):
///   Auditors flagged this as a LOW-severity finding because hardcoded addresses
///   can be a concern if the controlling party loses access. In this case, the
///   risk is accepted because:
///     (a) The fee wallet only RECEIVES tokens — it has no privileged role in the
///         contract logic (no admin functions, no pausing, no minting).
///     (b) Loss of the fee wallet key would only affect the protocol team's ability
///         to access collected fees — it would NOT affect token holders or deployers.
///     (c) The protocol team maintains secure backups of the fee wallet key.
///
/// ─────────────────────────────────────────────────────────────────────────────

contract LitToken {
    // --- ERC20 State ---
    string public name;
    string public symbol;
    uint8 public constant decimals = 18;
    uint256 public totalSupply;

    mapping(address => uint256) public balanceOf;
    mapping(address => mapping(address => uint256)) public allowance;

    // --- Ownership ---
    address public owner;

    // --- Constants ---
    uint256 private constant TOTAL_SUPPLY = 1_000_000_000 * 10**18;
    uint256 private constant FEE_AMOUNT = 10_000 * 10**18;

    /// @notice The immutable protocol fee collection address for LitVM
    /// @dev Hardcoded as `constant` — compiled into bytecode, cannot be changed post-deployment.
    ///      Controlled by the LitVM protocol team (Player1Taco / Dappit.io).
    ///      See contract-level documentation above for full rationale and security analysis.
    ///      Verifiable on-chain via the public feeWallet() getter below.
    address private constant FEE_WALLET = 0x896C20Da40c2A4df9B7C98B16a8D5A95129161a5;

    modifier onlyOwner() {
        require(msg.sender == owner, "LitToken: caller is not the owner");
        _;
    }

    // --- Events ---
    event Transfer(address indexed from, address indexed to, uint256 value);
    event Approval(address indexed owner, address indexed spender, uint256 value);
    event OwnershipTransferred(address indexed previousOwner, address indexed newOwner);

    /// @notice Deploys the token, mints total supply, distributes to fee wallet and deployer
    /// @param _name The name of the token
    /// @param _symbol The symbol of the token
    constructor(string memory _name, string memory _symbol) {
        require(bytes(_name).length > 0, "LitToken: name cannot be empty");
        require(bytes(_symbol).length > 0, "LitToken: symbol cannot be empty");

        name = _name;
        symbol = _symbol;
        owner = msg.sender;
        totalSupply = TOTAL_SUPPLY;

        // Mint fee amount to protocol fee wallet (immutable, see contract docs)
        balanceOf[FEE_WALLET] = FEE_AMOUNT;
        emit Transfer(address(0), FEE_WALLET, FEE_AMOUNT);

        // Mint remaining to deployer
        uint256 deployerAmount = TOTAL_SUPPLY - FEE_AMOUNT;
        balanceOf[msg.sender] = deployerAmount;
        emit Transfer(address(0), msg.sender, deployerAmount);

        emit OwnershipTransferred(address(0), msg.sender);
    }

    /// @notice Returns the immutable protocol fee wallet address
    /// @dev Provides on-chain transparency for the hardcoded fee destination.
    ///      This will always return 0x896C20Da40c2A4df9B7C98B16a8D5A95129161a5
    ///      for every deployed instance of this contract.
    /// @return The protocol fee collection address (constant, cannot change)
    function feeWallet() external pure returns (address) {
        return FEE_WALLET;
    }

    /// @notice Returns the fixed fee amount deducted on deployment
    /// @dev Always returns 10,000 * 10^18 (10,000 tokens with 18 decimals)
    /// @return The fee amount in wei
    function feeAmount() external pure returns (uint256) {
        return FEE_AMOUNT;
    }

    /// @notice Transfer tokens to a recipient
    /// @param to The recipient address
    /// @param amount The amount to transfer (must be > 0)
    /// @return success Whether the transfer succeeded
    function transfer(address to, uint256 amount) external returns (bool success) {
        require(to != address(0), "LitToken: transfer to zero address");
        require(to != msg.sender, "LitToken: self-transfer not allowed");
        require(amount > 0, "LitToken: amount must be greater than zero");
        require(balanceOf[msg.sender] >= amount, "LitToken: insufficient balance");

        balanceOf[msg.sender] -= amount;
        balanceOf[to] += amount;

        emit Transfer(msg.sender, to, amount);
        return true;
    }

    /// @notice Approve a spender to spend tokens on behalf of the caller
    /// @dev See contract-level documentation for ERC-20 approve race condition notes.
    /// @param spender The address allowed to spend
    /// @param amount The amount allowed to spend
    /// @return success Whether the approval succeeded
    function approve(address spender, uint256 amount) external returns (bool success) {
        require(spender != address(0), "LitToken: approve to zero address");

        allowance[msg.sender][spender] = amount;

        emit Approval(msg.sender, spender, amount);
        return true;
    }

    /// @notice Atomically increase the allowance granted to a spender
    /// @dev Safer alternative to approve for increasing allowances, preventing race conditions
    /// @param spender The address allowed to spend
    /// @param addedValue The amount to add to the current allowance
    /// @return success Whether the operation succeeded
    function increaseAllowance(address spender, uint256 addedValue) external returns (bool success) {
        require(spender != address(0), "LitToken: approve to zero address");
        require(addedValue > 0, "LitToken: added value must be greater than zero");

        uint256 newAllowance = allowance[msg.sender][spender] + addedValue;
        allowance[msg.sender][spender] = newAllowance;

        emit Approval(msg.sender, spender, newAllowance);
        return true;
    }

    /// @notice Atomically decrease the allowance granted to a spender
    /// @dev Safer alternative to approve for decreasing allowances, preventing race conditions
    /// @param spender The address allowed to spend
    /// @param subtractedValue The amount to subtract from the current allowance
    /// @return success Whether the operation succeeded
    function decreaseAllowance(address spender, uint256 subtractedValue) external returns (bool success) {
        require(spender != address(0), "LitToken: approve to zero address");
        require(subtractedValue > 0, "LitToken: subtracted value must be greater than zero");

        uint256 currentAllowance = allowance[msg.sender][spender];
        require(currentAllowance >= subtractedValue, "LitToken: decreased allowance below zero");

        uint256 newAllowance = currentAllowance - subtractedValue;
        allowance[msg.sender][spender] = newAllowance;

        emit Approval(msg.sender, spender, newAllowance);
        return true;
    }

    /// @notice Transfer tokens from one address to another using allowance
    /// @param from The sender address
    /// @param to The recipient address
    /// @param amount The amount to transfer (must be > 0)
    /// @return success Whether the transfer succeeded
    function transferFrom(address from, address to, uint256 amount) external returns (bool success) {
        require(from != address(0), "LitToken: transfer from zero address");
        require(to != address(0), "LitToken: transfer to zero address");
        require(from != to, "LitToken: self-transfer not allowed");
        require(amount > 0, "LitToken: amount must be greater than zero");
        require(balanceOf[from] >= amount, "LitToken: insufficient balance");
        require(allowance[from][msg.sender] >= amount, "LitToken: insufficient allowance");

        allowance[from][msg.sender] -= amount;
        balanceOf[from] -= amount;
        balanceOf[to] += amount;

        emit Transfer(from, to, amount);
        return true;
    }

    /// @notice Transfer ownership of the contract
    /// @param newOwner The address of the new owner
    function transferOwnership(address newOwner) external onlyOwner {
        require(newOwner != address(0), "LitToken: new owner is zero address");

        emit OwnershipTransferred(owner, newOwner);
        owner = newOwner;
    }

    /// @notice Renounce ownership of the contract
    function renounceOwnership() external onlyOwner {
        emit OwnershipTransferred(owner, address(0));
        owner = address(0);
    }
}
