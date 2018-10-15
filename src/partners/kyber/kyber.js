import debugLogger from 'debug';
import BigNumber from 'bignumber.js';
import { networkSymbols } from '../config';
import { getTokenList, getRates } from './call';
import {
  KyberCurrencies,
  kyberAddressFallback,
  kyberNetworkABI,
  ERC20,
  kyberValidNetworks
} from './config';

const logger = debugLogger('v5:kyber-swap');
const errorLogger = debugLogger('v5:error');
/**
 * Note: Need to implement checks for these:
 *   - Source amount is too small. Minimum amount is 0.001 ETH equivalent.
 *   - Ask about ETH equivalent in relation to User Cap
 */
export default class Kyber {
  constructor(props = {}) {
    this.name = 'kybernetwork';
    this.network = props.network || networkSymbols.ETH;
    this.hasTokens = false;
    this.gasLimit = 300000;
    this.maxGasPrice = 30000000000; // 30 Gwei
    this.gasPrice = 2000000000; // 2 Gwei
    this.tokenDetails = {};
    this.setDefaultCurrencyList();
    this.web3 = props.web3;
    this.ens = props.ens;
    this.kyberNetworkABI = kyberNetworkABI || [];
    this.kyberNetworkAddress =
      props.kyberAddress || kyberAddressFallback[this.network];
    this.retrieveRatesFromAPI();
    this.getSupportedTokenList();
    this.getMainNetAddress();
    this.setupKyberContractObject();
    this.rates = new Map();
  }

  get currencies() {
    if (kyberValidNetworks.includes(this.network)) {
      return this.tokenDetails;
    }
    return {};
  }

  getNetwork() {
    return this.network;
  }

  getAddress() {
    return this.kyberNetworkAddress;
  }

  validSwap(fromCurrency, toCurrency) {
    return this.currencies[fromCurrency] && this.currencies[toCurrency];
  }

  setDefaultCurrencyList(fromConstructor) {
    if (fromConstructor) {
      this.tokenDetails = fromConstructor;
    } else if (KyberCurrencies[this.network]) {
      this.tokenDetails = KyberCurrencies[this.network];
    }
  }

  // potential interface methods
  getRate(fromToken, toToken, fromValue) {
    return this.getExpactedRateInTokens(fromToken, toToken, fromValue);
  }

  getSupportedTokens() {
    if (this.hasTokens) {
      return this.tokenDetails;
    }
    return {};
  }

  async retrieveRatesFromAPI() {
    const rates = await getRates(this.network);
    const data = Object.keys(rates);
    data.forEach(key => {
      const keyParts = key.split('_');
      this.rates.set(`${keyParts[0]}/${keyParts[1]}`, rates[key].currentPrice);
      if (
        rates[key].symbol &&
        rates[key].name &&
        rates[key].decimals &&
        rates[key].contractAddress
      ) {
        // otherwise the entry is invalid
        this.tokenDetails[rates[key].symbol] = {
          symbol: rates[key].symbol,
          name: rates[key].name,
          contractAddress: rates[key].contractAddress,
          decimals: rates[key].decimals
        };
      }
    });
    this.hasTokens = Object.keys(this.tokenDetails).length > 0;
  }

  getPreliminaryRate(fromToken, toToken) {
    if (this.rates.has(`${fromToken}/${toToken}`)) {
      return this.rates.get(`${fromToken}/${toToken}`);
    }
    return -1;
  }

  getMainNetAddress() {
    if (this.network === 'ETH') {
      try {
        this.ens
          .resolver('kybernetwork.eth')
          .addr()
          .then(address => {
            this.kyberNetworkAddress = address;
            this.setupKyberContractObject(address);
          })
          .catch(() => {
            errorLogger('failed to resolve kyber network address via ENS');
          });
      } catch (e) {
        errorLogger(e);
      }
    }
  }

  async getSupportedTokenList() {
    try {
      const tokenList = await getTokenList(this.network);
      this.tokenDetails = {};
      for (let i = 0; i < tokenList.length; i++) {
        if (
          tokenList[i].symbol &&
          tokenList[i].name &&
          tokenList[i].decimals &&
          tokenList[i].contractAddress
        ) {
          // otherwise the entry is invalid
          const symbol = tokenList[i].symbol.toUpperCase();
          this.tokenDetails[symbol] = tokenList[i];
        }
      }
      this.hasTokens = Object.keys(this.tokenDetails).length > 0;
    } catch (e) {
      errorLogger(e);
    }
  }

  setupKyberContractObject() {
    this.kyberNetworkContract = new this.web3.eth.Contract(
      this.kyberNetworkABI,
      this.kyberNetworkAddress
    );
  }

  getTokenAddress(token) {
    try {
      return this.tokenDetails[token].contractAddress;
    } catch (e) {
      throw Error(
        `Token [${token}] not included in kyber network list of tokens`
      );
    }
  }

  getTokenDecimals(token) {
    try {
      return +this.tokenDetails[token].decimals;
    } catch (e) {
      throw Error(
        `Token [${token}] not included in kyber network list of tokens`
      );
    }
  }

  convertToTokenBase(token, value) {
    const decimals = this.getTokenDecimals(token);
    const denominator = new BigNumber(10).pow(decimals);
    return new BigNumber(value).div(denominator).toString(10);
  }

  // TODO: Investigate rate conversion and decimals appearing at the end of the converted value
  convertToTokenWei(token, value) {
    const decimals = this.getTokenDecimals(token);
    const denominator = new BigNumber(10).pow(decimals);
    // getting strange cases where decimals are appearing at the end of the converted value
    logger('convertToTokenWei', denominator.toString(10));
    return new BigNumber(value)
      .times(denominator)
      .integerValue(BigNumber.ROUND_DOWN)
      .toString(10);
  }

  getKyberNetworkAddress() {
    return this.kyberNetworkAddress;
  }

  findBestRate() {}

  async getBalance(fromToken, userAddress) {
    return await this.kyberNetworkContract.methods
      .getBalance(this.getTokenAddress(fromToken), userAddress)
      .call();
  }

  hasCachedRate(fromToken, toToken) {
    return this.rates.has(`${fromToken}/${toToken}`);
  }

  getLastRate(fromToken, toToken) {
    if (this.rates.has(`${fromToken}/${toToken}`)) {
      return this.rates.get(`${fromToken}/${toToken}`);
    }
    return -1;
  }

  getLastRateInToken(fromToken, toToken) {
    if (this.rates.has(`${fromToken}/${toToken}`)) {
      const rate = this.rates.get(`${fromToken}/${toToken}`);
      return this.convertToTokenBase('ETH', rate);
    }
    return -1;
  }

  async getExpectedRate(fromToken, toToken, fromValue) {
    const rates = await this.kyberNetworkContract.methods
      .getExpectedRate(
        this.getTokenAddress(fromToken),
        this.getTokenAddress(toToken),
        fromValue
      )
      .call();
    logger(rates);
    this.rates.set(`${fromToken}/${toToken}`, rates['expectedRate']);
    if (+rates['expectedRate'] === 0) {
      return -1;
    }
    return rates['expectedRate'];
  }

  async getExpactedRateInTokens(fromToken, toToken, fromValue) {
    const fromWei = this.convertToTokenWei(fromToken, fromValue);
    logger(fromWei);
    const inWei = await this.getExpectedRate(fromToken, toToken, fromWei);
    if (+inWei > -1) {
      return this.convertToTokenBase('ETH', inWei);
    }
    return -1;
  }

  async getUserCapInWei(userAddress) {
    return await this.kyberNetworkContract.methods
      .getUserCapInWei(userAddress)
      .call();
  }

  async checkUserCap(swapValue, userAddress) {
    const weiValue = this.convertToTokenWei('ETH', swapValue);
    const userCap = await this.getUserCapInWei(userAddress);
    const numberAsBN = new BigNumber(weiValue);
    const nineFivePct = new BigNumber(userCap).times(0.95);
    return nineFivePct.gt(numberAsBN);
  }

  kyberNetworkState() {}

  approveKyber(fromToken, fromValue) {
    const weiValue = this.convertToTokenWei(fromToken, fromValue);
    const contract = new this.web3.eth.Contract(
      ERC20,
      this.getTokenAddress(fromToken)
    );
    return contract.methods
      .approve(this.getKyberNetworkAddress(), weiValue)
      .encodeABI();
  }

  // not a transaction, just a read-only call
  async allowance(fromToken, userAddress) {
    const contract = new this.web3.eth.Contract(
      ERC20,
      this.getTokenAddress(fromToken)
    );
    return await contract.methods
      .allowance(userAddress, this.getKyberNetworkAddress())
      .call();
  }

  async canUserSwap(fromToken, toToken, fromValue, toValue, userAddress) {
    let userCap = true;
    if (fromToken === 'ETH' || toToken === 'ETH') {
      const checkValue = fromToken === 'ETH' ? fromValue : toValue;
      userCap = await this.checkUserCap(checkValue, userAddress);
    }
    const tokenBalance = await this.getBalance(fromToken, userAddress);
    const userTokenBalance = new BigNumber(tokenBalance);
    const hasEnoughTokens = userTokenBalance.gte(fromValue);

    if (userCap && hasEnoughTokens) {
      const { approve, reset } = await this.isTokenApprovalNeeded(
        fromToken,
        toToken,
        fromValue,
        userAddress
      );
      if (approve && reset) {
        return [
          this.approveKyber(fromToken, 0, userAddress),
          this.approveKyber(fromToken, fromValue, userAddress)
        ];
      } else if (approve) {
        return [this.approveKyber(fromToken, fromValue, userAddress)];
      }
      return [];
    }
    const reason = !userCap ? 'user cap value' : 'current token balance';
    const errorMessage = `User is not eligible to use kyber network. Current swap value exceeds ${reason}`;
    throw Error(errorMessage);
  }

  async isTokenApprovalNeeded(fromToken, toToken, fromValue, userAddress) {
    if (fromToken === 'ETH') return { approve: false, reset: false };

    const currentAllowance = await this.allowance(fromToken, userAddress);

    if (currentAllowance > 0) {
      const allocationNeeded = this.convertToTokenWei(fromToken, fromValue);
      if (currentAllowance < allocationNeeded) {
        return { approve: true, reset: true };
      }
      return { approve: false, reset: false };
    }
    return { approve: true, reset: false };
  }

  async getTradeData(fromToken, toToken, fromValue, minRate, userAddress) {
    const walletId = '0xDECAF9CD2367cdbb726E904cD6397eDFcAe6068D'; // TODO move to config
    const maxDestAmount = 1000000000000000; // 2 ** 200; // TODO move to config

    return this.kyberNetworkContract.methods
      .trade(
        await this.getTokenAddress(fromToken),
        await this.convertToTokenWei(fromToken, fromValue),
        await this.getTokenAddress(toToken),
        userAddress,
        maxDestAmount,
        minRate,
        walletId
      )
      .encodeABI();
  }

  async generateDataForTransactions(
    fromToken,
    toToken,
    fromValue,
    toValue,
    rate,
    userAddress
  ) {
    try {
      const finalRate = await this.getExpectedRate(
        fromToken,
        toToken,
        fromValue
      );
      const prepareSwapTxData = await this.canUserSwap(
        fromToken,
        toToken,
        fromValue,
        toValue,
        userAddress
      );
      if (Array.isArray(prepareSwapTxData)) {
        const kyberSwap = await this.getTradeData(
          fromToken,
          toToken,
          fromValue,
          finalRate,
          userAddress
        );

        return prepareSwapTxData.push(kyberSwap);
      }
    } catch (e) {
      throw e;
    }
  }
}
