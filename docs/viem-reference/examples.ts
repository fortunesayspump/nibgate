// Type-check-only integration examples. No wallet or network operation runs.
import {
  createPublicClient, createWalletClient, custom, fallback, http,
  decodeAbiParameters, decodeEventLog, decodeFunctionData,
  encodeAbiParameters, encodeFunctionData, getAddress, getContractAddress,
  isAddress, isAddressEqual, stringToBytes, toHex, keccak256, hashMessage,
  hashTypedData, recoverMessageAddress, formatEther, formatUnits,
  parseEther, parseUnits, type EIP1193Provider,
} from 'viem';
import { arcTestnet } from 'viem/chains';

declare const walletProvider: EIP1193Provider;
declare const primaryRpcUrl: string;
declare const backupRpcUrl: string;

const readClient = createPublicClient({
  chain: arcTestnet,
  transport: fallback([http(primaryRpcUrl), http(backupRpcUrl)]),
});
const walletClient = createWalletClient({chain: arcTestnet, transport: custom(walletProvider)});
void readClient; void walletClient;

// The zero address is a public test vector, not a payment destination.
const address = getAddress('0x0000000000000000000000000000000000000000');
isAddress(address); isAddressEqual(address, address);
getContractAddress({from: address, nonce: 0n});
const abi = [{type:'function',name:'balanceOf',stateMutability:'view',inputs:[{name:'owner',type:'address'}],outputs:[{type:'uint256'}]}] as const;
const data = encodeFunctionData({abi, functionName:'balanceOf', args:[address]});
decodeFunctionData({abi, data});
const parameters = [{type:'uint256'}] as const;
const encoded = encodeAbiParameters(parameters, [parseUnits('1',6)]);
decodeAbiParameters(parameters, encoded);
const events = [{type:'event',name:'Value',inputs:[{name:'value',type:'uint256',indexed:false}]}] as const;
declare const topic: `0x${string}`;
decodeEventLog({abi:events, topics:[topic], data:encoded});
keccak256(stringToBytes('hello world')); toHex('hello world');
hashMessage('hello world');
hashTypedData({types:{Value:[{name:'value',type:'uint256'}]},primaryType:'Value',message:{value:1n}});
recoverMessageAddress({message:'hello world',signature:'0xa461f509887bd19e312c0c58467ce8ff8e300d3c1a90b608a760c5b80318eaf15fe57c96f9175d6cd4daad4663763baa7e78836e067d0163e9a2ccf2ff753f5b1b'});
formatUnits(parseUnits('1.25',6),6);
formatEther(parseEther('1.25'));
