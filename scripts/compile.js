/**
 * Solidity Compilation Script
 *
 * Compiles LitToken.sol using solc-js and outputs ABI + bytecode to compiled.json.
 *
 * Fix #21: Renamed `constructor` variable to `ctorEntry` to avoid confusion
 * with the reserved property name in class contexts.
 *
 * Usage: node scripts/compile.js
 */

import solc from 'solc';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const contractPath = path.resolve(__dirname, '..', 'contracts', 'LitToken.sol');
const outputDir = path.resolve(__dirname, '..', 'src', 'utils');
const outputPath = path.resolve(outputDir, 'compiled.json');

// Ensure output directory exists
if (!fs.existsSync(outputDir)) {
  fs.mkdirSync(outputDir, { recursive: true });
}

console.log('📄 Reading contract:', contractPath);
const source = fs.readFileSync(contractPath, 'utf8');

const input = {
  language: 'Solidity',
  sources: {
    'LitToken.sol': {
      content: source,
    },
  },
  settings: {
    optimizer: {
      enabled: true,
      runs: 200,
    },
    outputSelection: {
      '*': {
        '*': ['abi', 'evm.bytecode.object'],
      },
    },
  },
};

console.log('⚙️  Compiling with solc-js (optimizer: 200 runs)...');
const output = JSON.parse(solc.compile(JSON.stringify(input)));

// Check for errors
if (output.errors) {
  const fatal = output.errors.filter((e) => e.severity === 'error');
  if (fatal.length > 0) {
    console.error('\n❌ Compilation errors:');
    fatal.forEach((e) => console.error(`   ${e.formattedMessage}`));
    process.exit(1);
  }

  const warnings = output.errors.filter((e) => e.severity === 'warning');
  if (warnings.length > 0) {
    console.warn('\n⚠️  Warnings:');
    warnings.forEach((w) => console.warn(`   ${w.formattedMessage.trim()}`));
  }
}

const contract = output.contracts['LitToken.sol']['LitToken'];

if (!contract) {
  console.error('❌ Contract "LitToken" not found in compilation output.');
  process.exit(1);
}

const abi = contract.abi;
const bytecode = '0x' + contract.evm.bytecode.object;

// Fix #21: Renamed from `constructor` to `ctorEntry` to avoid
// shadowing the reserved property name in class contexts.
const ctorEntry = abi.find((item) => item.type === 'constructor');
if (ctorEntry) {
  const paramTypes = ctorEntry.inputs.map((i) => `${i.type} ${i.name}`).join(', ');
  console.log(`\n🔍 Constructor signature: constructor(${paramTypes})`);

  if (ctorEntry.inputs.length !== 2) {
    console.error('❌ Expected exactly 2 constructor parameters (_name, _symbol)');
    process.exit(1);
  }

  if (ctorEntry.inputs[0].type !== 'string' || ctorEntry.inputs[1].type !== 'string') {
    console.error('❌ Constructor parameters must be (string, string)');
    process.exit(1);
  }

  console.log('✅ Constructor parameters verified: (string _name, string _symbol)');
} else {
  console.error('❌ No constructor found in ABI');
  process.exit(1);
}

// Validate key functions exist
const requiredFunctions = [
  'transfer',
  'approve',
  'transferFrom',
  'increaseAllowance',
  'decreaseAllowance',
  'balanceOf',
  'allowance',
  'totalSupply',
  'name',
  'symbol',
  'decimals',
  'owner',
  'transferOwnership',
  'renounceOwnership',
];

const functionNames = abi
  .filter((item) => item.type === 'function')
  .map((item) => item.name);

const missing = requiredFunctions.filter((fn) => !functionNames.includes(fn));
if (missing.length > 0) {
  console.error(`\n❌ Missing functions in compiled ABI: ${missing.join(', ')}`);
  process.exit(1);
}
console.log(`✅ All ${requiredFunctions.length} required functions present in ABI`);

// Validate events
const requiredEvents = ['Transfer', 'Approval', 'OwnershipTransferred'];
const eventNames = abi
  .filter((item) => item.type === 'event')
  .map((item) => item.name);

const missingEvents = requiredEvents.filter((ev) => !eventNames.includes(ev));
if (missingEvents.length > 0) {
  console.error(`\n❌ Missing events in compiled ABI: ${missingEvents.join(', ')}`);
  process.exit(1);
}
console.log(`✅ All ${requiredEvents.length} required events present in ABI`);

// Write compiled output
const compiled = {
  abi,
  bytecode,
  contractName: 'LitToken',
  compiler: `solc-js`,
  optimized: true,
  runs: 200,
  compiledAt: new Date().toISOString(),
};

fs.writeFileSync(outputPath, JSON.stringify(compiled, null, 2));

console.log(`\n✅ Compilation successful!`);
console.log(`   📦 Bytecode size: ${(bytecode.length - 2) / 2} bytes`);
console.log(`   📋 ABI entries: ${abi.length}`);
console.log(`   💾 Output: ${outputPath}`);
console.log(`\n🌮 Ready for deployment on LitVM!`);
