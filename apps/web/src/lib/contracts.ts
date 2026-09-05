import { parseAbi, type Abi } from "viem";
import poolArtifact from "../contracts/pool.abi.json";

export const poolAbi = poolArtifact as Abi;

export const tokenAbi = parseAbi([
  "function balanceOf(address account) view returns (uint256)",
  "function mint(address to, uint256 amount)",
  "function confidentialBalanceOf(address account) view returns (bytes32)",
]);

export const wrapperEventsAbi = parseAbi([
  "event UnwrapRequested(address indexed receiver, bytes32 indexed unwrapRequestId, bytes32 amount)",
  "event UnwrapFinalized(address indexed receiver, bytes32 indexed unwrapRequestId, bytes32 encryptedAmount, uint64 cleartextAmount)",
]);
