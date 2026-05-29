/// <reference types="vite/client" />

interface ImportMetaEnv {
  /**
   * Fee wallet address that receives 10,000 tokens on every token deployment.
   * Must be a valid checksummed Ethereum address (0x + 40 hex chars).
   * Validated at startup with ethers.getAddress().
   *
   * @default "0x896C20Da40c2A4df9B7C98B16a8D5A95129161a5"
   */
  readonly VITE_FEE_WALLET?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
