import xdc from '@/assets/images/networks/xdc.svg';

export default {
  name: 'XDCt',
  name_long: 'Apothem Network',
  homePage: 'https://apothem.network/',
  blockExplorer: 'BlocksScan',
  blockExplorerTX: 'https://apothem.blocksscan.io/tx/[[txHash]]',
  blockExplorerAddr: 'https://apothem.blocksscan.io/addr/[[address]]',
  chainID: 50,
  tokens: import('@/_generated/tokens/tokens-etc.json').then(
    val => val.default
  ),
  contracts: import('@/_generated/contracts/contract-abi-etc.json').then(
    val => val.default
  ),
  icon: xdc,
  currencyName: 'XDC',
  isTestNetwork: false,
  isEthVMSupported: {
    supported: false,
    url: null,
    blockExplorerTX: '',
    blockExplorerAddr: '',
    websocket: null
  },
  coingeckoID: 'xdce-crowd-sale',
  gasPriceMultiplier: 1,
  balanceApi: ''
};
