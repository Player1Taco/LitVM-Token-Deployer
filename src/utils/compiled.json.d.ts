interface CompiledContract {
  abi: any[];
  bytecode: string;
  contractName: string;
  compiler: string;
  optimized: boolean;
  runs: number;
  compiledAt: string;
}

declare const compiledContract: CompiledContract;
export default compiledContract;
