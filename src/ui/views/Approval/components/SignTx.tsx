import stats from '@/stats';
import { openInternalPageInTab } from 'ui/utils/webapi';
import {
  convertLegacyTo1559,
  getKRCategoryByType,
  validateGasPriceRange,
} from '@/utils/transaction';
import Safe from '@rabby-wallet/gnosis-sdk';
import { SafeInfo } from '@rabby-wallet/gnosis-sdk/src/api';
import * as Sentry from '@sentry/browser';
import { Button, Drawer, Modal, Tooltip } from 'antd';
import {
  Chain,
  ExplainTxResponse,
  GasLevel,
  SecurityCheckDecision,
  SecurityCheckResponse,
  Tx,
} from 'background/service/openapi';
import { Account, ChainGas } from 'background/service/preference';
import BigNumber from 'bignumber.js';
import clsx from 'clsx';
import {
  CHAINS,
  CHAINS_ENUM,
  HARDWARE_KEYRING_TYPES,
  INTERNAL_REQUEST_ORIGIN,
  KEYRING_CLASS,
  KEYRING_TYPE,
  SUPPORT_1559_KEYRING_TYPE,
  KEYRING_CATEGORY_MAP,
  SAFE_GAS_LIMIT_RATIO,
  DEFAULT_GAS_LIMIT_RATIO,
  MINIMUM_GAS_LIMIT,
} from 'consts';
import { addHexPrefix, isHexPrefixed, isHexString } from 'ethereumjs-util';
import React, { ReactNode, useEffect, useMemo, useState } from 'react';
import { matomoRequestEvent } from '@/utils/matomo-request';
import { useTranslation } from 'react-i18next';
import IconGnosis from 'ui/assets/walletlogo/gnosis.svg';
import IconWatch from 'ui/assets/walletlogo/watch-purple.svg';
import { useApproval, useWallet, isStringOrNumber } from 'ui/utils';
import AccountCard from './AccountCard';
import LedgerWebHIDAlert from './LedgerWebHIDAlert';
import SecurityCheck from './SecurityCheck';
import { WaitingSignComponent } from './SignText';
import Approve from './TxComponents/Approve';
import ApproveNFT from './TxComponents/ApproveNFT';
import ApproveNFTCollection from './TxComponents/ApproveNFTCollection';
import Cancel from './TxComponents/Cancel';
import CancelNFT from './TxComponents/CancelNFT';
import CancelNFTCollection from './TxComponents/CancelNFTCollection';
import CancelTx from './TxComponents/CancelTx';
import Deploy from './TxComponents/Deploy';
import GasSelector, { GasSelectorResponse } from './TxComponents/GasSelecter';
import GnosisDrawer from './TxComponents/GnosisDrawer';
import Loading from './TxComponents/Loading';
import Send from './TxComponents/Send';
import SendNFT from './TxComponents/sendNFT';
import Sign from './TxComponents/Sign';
import ListNFT from './TxComponents/ListNFT';
import PreCheckCard from './PreCheckCard';
import SecurityCheckCard from './SecurityCheckCard';
import ProcessTooltip from './ProcessTooltip';
import { useLedgerDeviceConnected } from '@/utils/ledger';
import { TransactionGroup } from 'background/service/transactionHistory';
import { intToHex } from 'ui/utils/number';
import { calcMaxPriorityFee } from '@/utils/transaction';

const normalizeHex = (value: string | number) => {
  if (typeof value === 'number') {
    return intToHex(Math.floor(value));
  }
  if (typeof value === 'string') {
    if (!isHexPrefixed(value)) {
      return addHexPrefix(value);
    }
    return value;
  }
  return value;
};

const normalizeTxParams = (tx) => {
  const copy = tx;
  try {
    if ('nonce' in copy && isStringOrNumber(copy.nonce)) {
      copy.nonce = normalizeHex(copy.nonce);
    }
    if ('gas' in copy && isStringOrNumber(copy.gas)) {
      copy.gas = normalizeHex(copy.gas);
    }
    if ('gasLimit' in copy && isStringOrNumber(copy.gasLimit)) {
      copy.gas = normalizeHex(copy.gasLimit);
    }
    if ('gasPrice' in copy && isStringOrNumber(copy.gasPrice)) {
      copy.gasPrice = normalizeHex(copy.gasPrice);
    }
    if ('value' in copy) {
      if (!isStringOrNumber(copy.value)) {
        copy.value = '0x0';
      } else {
        copy.value = normalizeHex(copy.value);
      }
    }
  } catch (e) {
    Sentry.captureException(
      new Error(`normalizeTxParams failed, ${JSON.stringify(e)}`)
    );
  }
  return copy;
};

export const TxTypeComponent = ({
  txDetail,
  chain = CHAINS[CHAINS_ENUM.ETH],
  isReady,
  raw,
  onChange,
  tx,
  isSpeedUp,
}: {
  txDetail: ExplainTxResponse;
  chain: Chain | undefined;
  isReady: boolean;
  raw: Record<string, string | number>;
  onChange(data: Record<string, any>): void;
  tx: Tx;
  isSpeedUp: boolean;
}) => {
  if (!isReady) return <Loading chainEnum={chain.enum} />;

  if (txDetail.type_deploy_contract)
    return (
      <Deploy
        data={txDetail}
        chainEnum={chain.enum}
        isSpeedUp={isSpeedUp}
        raw={raw}
      />
    );
  if (txDetail.type_cancel_tx)
    return (
      <CancelTx
        data={txDetail}
        chainEnum={chain.enum}
        tx={tx}
        isSpeedUp={isSpeedUp}
        raw={raw}
      />
    );
  if (txDetail.type_cancel_single_nft_approval)
    return (
      <CancelNFT
        data={txDetail}
        chainEnum={chain.enum}
        isSpeedUp={isSpeedUp}
        raw={raw}
      />
    );
  if (txDetail.type_cancel_nft_collection_approval)
    return (
      <CancelNFTCollection
        data={txDetail}
        chainEnum={chain.enum}
        isSpeedUp={isSpeedUp}
        raw={raw}
      />
    );
  if (txDetail.type_cancel_token_approval)
    return (
      <Cancel
        data={txDetail}
        chainEnum={chain.enum}
        isSpeedUp={isSpeedUp}
        raw={raw}
      />
    );
  if (txDetail.type_single_nft_approval)
    return (
      <ApproveNFT
        data={txDetail}
        chainEnum={chain.enum}
        isSpeedUp={isSpeedUp}
        raw={raw}
      />
    );
  if (txDetail.type_nft_collection_approval)
    return (
      <ApproveNFTCollection
        data={txDetail}
        chainEnum={chain.enum}
        isSpeedUp={isSpeedUp}
        raw={raw}
      />
    );
  if (txDetail.type_nft_send)
    return (
      <SendNFT
        data={txDetail}
        chainEnum={chain.enum}
        isSpeedUp={isSpeedUp}
        raw={raw}
      />
    );
  if (txDetail.type_token_approval)
    return (
      <Approve
        data={txDetail}
        chainEnum={chain.enum}
        onChange={onChange}
        tx={tx}
        isSpeedUp={isSpeedUp}
        raw={raw}
      />
    );
  if (txDetail.type_send)
    return (
      <Send
        data={txDetail}
        chainEnum={chain.enum}
        isSpeedUp={isSpeedUp}
        raw={raw}
      />
    );
  if (txDetail.type_list_nft) {
    return (
      <ListNFT
        data={txDetail}
        chainEnum={chain.enum}
        isSpeedUp={isSpeedUp}
        raw={raw}
      />
    );
  }
  if (txDetail.type_call)
    return (
      <Sign
        data={txDetail}
        raw={raw}
        chainEnum={chain.enum}
        isSpeedUp={isSpeedUp}
        tx={tx}
      />
    );
  return <></>;
};

// todo move to background
const getRecommendGas = async ({
  gas,
  wallet,
  tx,
}: {
  gas: number;
  wallet: ReturnType<typeof useWallet>;
  tx: Tx;
  chainId: number;
}) => {
  if (gas > 0) {
    return {
      needRatio: true,
      gas: new BigNumber(gas),
    };
  }
  const txGas = tx.gasLimit || tx.gas;
  if (txGas && new BigNumber(txGas).gt(0)) {
    return {
      needRatio: true,
      gas: new BigNumber(txGas),
    };
  }
  const res = await wallet.openapi.historyGasUsed({
    tx: {
      ...tx,
      nonce: tx.nonce || '0x1', // set a mock nonce for explain if dapp not set it
      data: tx.data,
      value: tx.value || '0x0',
      gas: tx.gas || '', // set gas limit if dapp not set
    },
    user_addr: tx.from,
  });
  if (res.gas_used > 0) {
    return {
      needRatio: true,
      gas: new BigNumber(res.gas_used),
    };
  }
  return {
    needRatio: false,
    gas: new BigNumber(1000000),
  };
};

// todo move to background
const getRecommendNonce = async ({
  wallet,
  tx,
  chainId,
}: {
  wallet: ReturnType<typeof useWallet>;
  tx: Tx;
  chainId: number;
}) => {
  const chain = Object.values(CHAINS).find((item) => item.id === chainId);
  if (!chain) {
    throw new Error('chain not found');
  }
  const onChainNonce = await wallet.requestETHRpc(
    {
      method: 'eth_getTransactionCount',
      params: [tx.from, 'latest'],
    },
    chain.serverId
  );
  const localNonce = (await wallet.getNonceByChain(tx.from, chainId)) || 0;
  return `0x${BigNumber.max(onChainNonce, localNonce).toString(16)}`;
};

const getNativeTokenBalance = async ({
  wallet,
  address,
  chainId,
}: {
  wallet: ReturnType<typeof useWallet>;
  address: string;
  chainId: number;
}): Promise<string> => {
  const chain = Object.values(CHAINS).find((item) => item.id === chainId);
  if (!chain) {
    throw new Error('chain not found');
  }
  const balance = await wallet.requestETHRpc(
    {
      method: 'eth_getBalance',
      params: [address, 'latest'],
    },
    chain.serverId
  );
  return balance;
};

const explainGas = async ({
  gasUsed,
  gasPrice,
  chainId,
  nativeTokenPrice,
  tx,
  wallet,
  gasLimit,
}: {
  gasUsed: number | string;
  gasPrice: number | string;
  chainId: number;
  nativeTokenPrice: number;
  tx: Tx;
  wallet: ReturnType<typeof useWallet>;
  gasLimit: string | undefined;
}) => {
  let gasCostTokenAmount = new BigNumber(gasUsed).times(gasPrice).div(1e18);
  let maxGasCostAmount = new BigNumber(gasLimit || 0).times(gasPrice).div(1e18);
  const chain = Object.values(CHAINS).find((item) => item.id === chainId);
  const isOp = chain?.enum === CHAINS_ENUM.OP;
  if (isOp) {
    const res = await wallet.fetchEstimatedL1Fee({
      txParams: tx,
    });
    gasCostTokenAmount = new BigNumber(res).div(1e18).plus(gasCostTokenAmount);
    maxGasCostAmount = new BigNumber(res).div(1e18).plus(maxGasCostAmount);
  }
  const gasCostUsd = new BigNumber(gasCostTokenAmount).times(nativeTokenPrice);

  return {
    gasCostUsd,
    gasCostAmount: gasCostTokenAmount,
    maxGasCostAmount,
  };
};

const useExplainGas = ({
  gasUsed,
  gasPrice,
  chainId,
  nativeTokenPrice,
  tx,
  wallet,
  gasLimit,
}: Parameters<typeof explainGas>[0]) => {
  const [result, setResult] = useState({
    gasCostUsd: new BigNumber(0),
    gasCostAmount: new BigNumber(0),
    maxGasCostAmount: new BigNumber(0),
  });

  useEffect(() => {
    explainGas({
      gasUsed,
      gasPrice,
      chainId,
      nativeTokenPrice,
      wallet,
      tx,
      gasLimit,
    }).then((data) => {
      setResult(data);
    });
  }, [gasUsed, gasPrice, chainId, nativeTokenPrice, wallet, tx, gasLimit]);

  return {
    ...result,
  };
};

const checkGasAndNonce = ({
  recommendGasLimitRatio,
  recommendGasLimit,
  recommendNonce,
  tx,
  gasLimit,
  nonce,
  isCancel,
  gasExplainResponse,
  isSpeedUp,
  isGnosisAccount,
  nativeTokenBalance,
}: {
  recommendGasLimitRatio: number;
  nativeTokenBalance: string;
  recommendGasLimit: number | string | BigNumber;
  recommendNonce: number | string | BigNumber;
  tx: Tx;
  gasLimit: number | string | BigNumber;
  nonce: number | string | BigNumber;
  gasExplainResponse: ReturnType<typeof useExplainGas>;
  isCancel: boolean;
  isSpeedUp: boolean;
  isGnosisAccount: boolean;
}) => {
  const errors: {
    code: number;
    msg: string;
    level?: 'warn' | 'danger' | 'forbidden';
  }[] = [];
  if (!isGnosisAccount && new BigNumber(gasLimit).lt(MINIMUM_GAS_LIMIT)) {
    errors.push({
      code: 3006,
      msg: "Gas limit is less than 21000. Transaction can't be submitted",
      level: 'forbidden',
    });
  }
  if (
    !isGnosisAccount &&
    new BigNumber(gasLimit).lt(
      new BigNumber(recommendGasLimit).times(recommendGasLimitRatio)
    ) &&
    new BigNumber(gasLimit).gte(21000)
  ) {
    if (recommendGasLimitRatio === 4) {
      const realRatio = new BigNumber(gasLimit).div(recommendGasLimit);
      if (realRatio.lt(4) && realRatio.gt(1)) {
        errors.push({
          code: 3004,
          msg:
            'Gas limit is low. There is 1% chance that the transaction may fail.',
          level: 'warn',
        });
      } else if (realRatio.lt(1)) {
        errors.push({
          code: 3005,
          msg:
            'Gas limit is too low. There is 95% chance that the transaction may fail.',
          level: 'danger',
        });
      }
    } else {
      if (new BigNumber(gasLimit).lt(recommendGasLimit)) {
        errors.push({
          code: 3004,
          msg:
            'Gas limit is low. There is 1% chance that the transaction may fail.',
          level: 'warn',
        });
      }
    }
  }
  let sendNativeTokenAmount = new BigNumber(tx.value); // current transaction native token transfer count
  sendNativeTokenAmount = isNaN(sendNativeTokenAmount.toNumber())
    ? new BigNumber(0)
    : sendNativeTokenAmount;
  if (
    !isGnosisAccount &&
    gasExplainResponse.maxGasCostAmount
      .plus(sendNativeTokenAmount.div(1e18))
      .isGreaterThan(new BigNumber(nativeTokenBalance).div(1e18))
  ) {
    errors.push({
      code: 3001,
      msg: 'The reserved gas fee is not enough',
      level: 'forbidden',
    });
  }
  if (new BigNumber(nonce).lt(recommendNonce) && !(isCancel || isSpeedUp)) {
    errors.push({
      code: 3003,
      msg: `Nonce is too low, the minimum should be ${new BigNumber(
        recommendNonce
      ).toString()}`,
    });
  }
  return errors;
};

const useCheckGasAndNonce = ({
  recommendGasLimitRatio,
  recommendGasLimit,
  recommendNonce,
  tx,
  gasLimit,
  nonce,
  isCancel,
  gasExplainResponse,
  isSpeedUp,
  isGnosisAccount,
  nativeTokenBalance,
}: Parameters<typeof checkGasAndNonce>[0]) => {
  return useMemo(
    () =>
      checkGasAndNonce({
        recommendGasLimitRatio,
        recommendGasLimit,
        recommendNonce,
        tx,
        gasLimit,
        nonce,
        isCancel,
        gasExplainResponse,
        isSpeedUp,
        isGnosisAccount,
        nativeTokenBalance,
      }),
    [
      recommendGasLimit,
      recommendNonce,
      tx,
      gasLimit,
      nonce,
      isCancel,
      gasExplainResponse,
      isSpeedUp,
      isGnosisAccount,
      nativeTokenBalance,
    ]
  );
};

const getGasLimitBaseAccountBalance = ({
  gasPrice,
  nativeTokenBalance,
  nonce,
  pendingList,
  tx,
  recommendGasLimit,
  recommendGasLimitRatio,
}: {
  tx: Tx;
  nonce: number | string | BigNumber;
  gasPrice: number | string | BigNumber;
  pendingList: TransactionGroup[];
  nativeTokenBalance: string;
  recommendGasLimit: string | number;
  recommendGasLimitRatio: number;
}) => {
  let sendNativeTokenAmount = new BigNumber(tx.value); // current transaction native token transfer count
  sendNativeTokenAmount = isNaN(sendNativeTokenAmount.toNumber())
    ? new BigNumber(0)
    : sendNativeTokenAmount;
  const pendingsSumNativeTokenCost = pendingList
    .filter((item) => new BigNumber(item.nonce).lt(nonce))
    .reduce((sum, item) => {
      return sum.plus(
        item.txs
          .map((txItem) => ({
            value: isNaN(Number(txItem.rawTx.value))
              ? 0
              : Number(txItem.rawTx.value),
            gasPrice: txItem.rawTx.gasPrice || txItem.rawTx.maxFeePerGas,
            gasUsed:
              txItem.gasUsed || txItem.rawTx.gasLimit || txItem.rawTx.gas || 0,
          }))
          .reduce((sum, txItem) => {
            return sum.plus(
              new BigNumber(txItem.value).plus(
                new BigNumber(txItem.gasUsed).times(txItem.gasUsed)
              )
            );
          }, new BigNumber(0))
      );
    }, new BigNumber(0)); // sum native token cost in pending tx list which nonce less than current tx
  const avaliableGasToken = new BigNumber(nativeTokenBalance).minus(
    sendNativeTokenAmount.plus(pendingsSumNativeTokenCost)
  ); // avaliableGasToken = current native token balance - sendNativeTokenAmount - pendingsSumNativeTokenCost
  if (avaliableGasToken.lte(0)) {
    // avaliableGasToken less than 0 use 21000 as gasLimit
    return 21000;
  }
  if (
    avaliableGasToken.gt(
      new BigNumber(gasPrice).times(
        Number(recommendGasLimit) * recommendGasLimitRatio
      )
    )
  ) {
    // if avaliableGasToken is enough to pay gas fee of recommendGasLimit * recommendGasLimitRatio, use recommendGasLimit * recommendGasLimitRatio as gasLimit
    return Number(recommendGasLimit) * recommendGasLimitRatio;
  }
  const adaptGasLimit = avaliableGasToken.div(gasPrice); // adapt gasLimit by account balance
  if (adaptGasLimit.lt(21000)) {
    // use 21000 as minimum gasLimit
    return 21000;
  }
  return Math.floor(adaptGasLimit.toNumber());
};

interface SignTxProps<TData extends any[] = any[]> {
  params: {
    session: {
      origin: string;
      icon: string;
      name: string;
    };
    data: TData;
    isGnosis?: boolean;
    account?: Account;
    $ctx?: any;
  };
  origin?: string;
}

interface BlockInfo {
  baseFeePerGas: string;
  difficulty: string;
  extraData: string;
  gasLimit: string;
  gasUsed: string;
  hash: string;
  logsBloom: string;
  miner: string;
  mixHash: string;
  nonce: string;
  number: string;
  parentHash: string;
  receiptsRoot: string;
  sha3Uncles: string;
  size: string;
  stateRoot: string;
  timestamp: string;
  totalDifficulty: string;
  transactions: string[];
  transactionsRoot: string;
  uncles: string[];
}

const SignTx = ({ params, origin }: SignTxProps) => {
  const { isGnosis, account } = params;
  const [isReady, setIsReady] = useState(false);
  const [nonceChanged, setNonceChanged] = useState(false);
  const [canProcess, setCanProcess] = useState(true);
  const [
    cantProcessReason,
    setCantProcessReason,
  ] = useState<ReactNode | null>();
  const [blockInfo, setBlockInfo] = useState<BlockInfo | null>(null);
  const [recommendGasLimit, setRecommendGasLimit] = useState<string>('');
  const [recommendGasLimitRatio, setRecommendGasLimitRatio] = useState(1); // 1 / 1.5 / 4
  const [recommendNonce, setRecommendNonce] = useState<string>('');
  const [updateId, setUpdateId] = useState(0);
  const [txDetail, setTxDetail] = useState<ExplainTxResponse | null>({
    pre_exec_version: 'v0',
    balance_change: {
      receive_nft_list: [],
      receive_token_list: [],
      send_nft_list: [],
      send_token_list: [],
      success: true,
      usd_value_change: 0,
    },
    native_token: {
      amount: 0,
      chain: '',
      decimals: 18,
      display_symbol: '',
      id: '1',
      is_core: true,
      is_verified: true,
      is_wallet: true,
      is_infinity: true,
      logo_url: '',
      name: '',
      optimized_symbol: '',
      price: 0,
      symbol: '',
      time_at: 0,
      usd_value: 0,
    },
    gas: {
      gas_used: 0,
      estimated_gas_cost_usd_value: 0,
      estimated_gas_cost_value: 0,
      estimated_gas_used: 0,
      estimated_seconds: 0,
    },
    pre_exec: {
      success: true,
      error: null,
      // err_msg: '',
    },
    recommend: {
      gas: '',
      nonce: '',
    },
    support_balance_change: true,
    type_call: {
      action: '',
      contract: '',
      contract_protocol_logo_url: '',
      contract_protocol_name: '',
    },
  });
  const [submitText, setSubmitText] = useState('Proceed');
  const [checkText, setCheckText] = useState('Sign');
  const { t } = useTranslation();
  const [
    securityCheckStatus,
    setSecurityCheckStatus,
  ] = useState<SecurityCheckDecision>('loading');
  const [securityCheckAlert, setSecurityCheckAlert] = useState('Checking...');
  const [
    securityCheckDetail,
    setSecurityCheckDetail,
  ] = useState<SecurityCheckResponse | null>(null);
  const [preprocessSuccess, setPreprocessSuccess] = useState(true);
  const [chainId, setChainId] = useState<number>(
    params.data[0].chainId && Number(params.data[0].chainId)
  );
  const [chain, setChain] = useState(
    Object.values(CHAINS).find((item) => item.id === chainId)
  );
  const [inited, setInited] = useState(false);
  const [isHardware, setIsHardware] = useState(false);
  const [manuallyChangeGasLimit, setManuallyChangeGasLimit] = useState(false);
  const [selectedGas, setSelectedGas] = useState<GasLevel | null>(null);
  const [gasList, setGasList] = useState<GasLevel[]>([
    {
      level: 'slow',
      front_tx_count: 0,
      price: 0,
      estimated_seconds: 0,
      base_fee: 0,
    },
    {
      level: 'normal',
      front_tx_count: 0,
      price: 0,
      estimated_seconds: 0,
      base_fee: 0,
    },
    {
      level: 'fast',
      front_tx_count: 0,
      price: 0,
      estimated_seconds: 0,
      base_fee: 0,
    },
    {
      level: 'custom',
      price: 0,
      front_tx_count: 0,
      estimated_seconds: 0,
      base_fee: 0,
    },
  ]);
  const [isGnosisAccount, setIsGnosisAccount] = useState(false);
  const [gnosisDrawerVisible, setGnosisDrawerVisble] = useState(false);
  const [getApproval, resolveApproval, rejectApproval] = useApproval();
  const wallet = useWallet();
  if (!chain) throw new Error('No support chain not found');
  const [support1559, setSupport1559] = useState(chain.eip['1559']);
  const [isLedger, setIsLedger] = useState(false);
  const [useLedgerLive, setUseLedgerLive] = useState(false);
  const hasConnectedLedgerHID = useLedgerDeviceConnected();

  const gaEvent = async (type: 'allow' | 'cancel') => {
    const ga:
      | {
          category: 'Send' | 'Security';
          source: 'sendNFT' | 'sendToken' | 'nftApproval' | 'tokenApproval';
          trigger: string;
        }
      | undefined = params?.$ctx?.ga;
    if (!ga) {
      return;
    }
    const { category, source, trigger } = ga;
    const currentAccount =
      isGnosis && account ? account : (await wallet.getCurrentAccount())!;

    if (category === 'Send') {
      matomoRequestEvent({
        category,
        action: type === 'cancel' ? 'cancelSignTx' : 'signTx',
        label: [
          chain.name,
          getKRCategoryByType(currentAccount.type),
          currentAccount.brandName,
          source === 'sendNFT' ? 'nft' : 'token',
          trigger,
        ].join('|'),
        transport: 'beacon',
      });
    } else if (category === 'Security') {
      let action = '';
      if (type === 'cancel') {
        if (source === 'nftApproval') {
          action = 'cancelSignDeclineNFTApproval';
        } else {
          action = 'cancelSignDeclineTokenApproval';
        }
      } else {
        if (source === 'nftApproval') {
          action = 'signDeclineNFTApproval';
        } else {
          action = 'signDeclineTokenApproval';
        }
      }
      matomoRequestEvent({
        category,
        action,
        label: [
          chain.name,
          getKRCategoryByType(currentAccount.type),
          currentAccount.brandName,
        ].join('|'),
        transport: 'beacon',
      });
    }
  };

  const {
    data = '0x',
    from,
    gas,
    gasPrice,
    nonce,
    to,
    value,
    maxFeePerGas,
    isSpeedUp,
    isCancel,
    isSend,
    isSwap,
    isViewGnosisSafe,
  } = normalizeTxParams(params.data[0]);

  let updateNonce = true;
  if (isCancel || isSpeedUp || (nonce && from === to) || nonceChanged)
    updateNonce = false;

  const getGasPrice = () => {
    let result = '';
    if (maxFeePerGas) {
      result = isHexString(maxFeePerGas)
        ? maxFeePerGas
        : intToHex(maxFeePerGas);
    }
    if (gasPrice) {
      result = isHexString(gasPrice) ? gasPrice : intToHex(parseInt(gasPrice));
    }
    if (Number.isNaN(Number(result))) {
      result = '';
    }
    return result;
  };
  const [tx, setTx] = useState<Tx>({
    chainId,
    data: data || '0x', // can not execute with empty string, use 0x instead
    from,
    gas: gas || params.data[0].gasLimit,
    gasPrice: getGasPrice(),
    nonce,
    to,
    value,
  });
  const [realNonce, setRealNonce] = useState('');
  const [gasLimit, setGasLimit] = useState<string | undefined>(undefined);
  const [forceProcess, setForceProcess] = useState(true);
  const [safeInfo, setSafeInfo] = useState<SafeInfo | null>(null);
  const [maxPriorityFee, setMaxPriorityFee] = useState(0);
  const [nativeTokenBalance, setNativeTokenBalance] = useState('0x0');

  const gasExplainResponse = useExplainGas({
    gasUsed: recommendGasLimit,
    gasPrice: selectedGas?.price || 0,
    chainId,
    nativeTokenPrice: txDetail?.native_token.price || 0,
    tx,
    wallet,
    gasLimit,
  });

  const checkErrors = useCheckGasAndNonce({
    recommendGasLimit,
    recommendNonce,
    gasLimit: Number(gasLimit),
    nonce: Number(realNonce || tx.nonce),
    gasExplainResponse,
    isSpeedUp,
    isCancel,
    tx,
    isGnosisAccount,
    nativeTokenBalance,
    recommendGasLimitRatio,
  });

  const checkTx = async (address: string) => {
    try {
      setSecurityCheckStatus('loading');
      const res = await wallet.openapi.checkTx(
        {
          ...tx,
          nonce: tx.nonce || '0x1',
          data: tx.data,
          value: tx.value || '0x0',
          gas: tx.gas || '',
        }, // set a mock nonce for check if dapp not set it
        origin || '',
        address,
        !(nonce && tx.from === tx.to)
      );
      setSecurityCheckStatus(res.decision);
      setSecurityCheckAlert(res.alert);
      setSecurityCheckDetail(res);
      setForceProcess(res.decision !== 'forbidden');
    } catch (e: any) {
      console.error(e);
      const alert = 'Security engine service is temporarily unavailable';
      const decision = 'pass';
      setForceProcess(true);
      setSecurityCheckStatus(decision);
      setSecurityCheckAlert(alert);
      setSecurityCheckDetail(({
        error: {
          msg: alert,
          code: 4000,
        },
        alert,
        decision,
        danger_list: [],
        warning_list: [],
        forbidden_list: [],
        trace_id: '',
      } as unknown) as SecurityCheckResponse);
    }
  };

  const explainTx = async (address: string) => {
    let recommendNonce = '0x0';
    if (!isGnosisAccount) {
      recommendNonce = await getRecommendNonce({
        tx,
        wallet,
        chainId,
      });
      setRecommendNonce(recommendNonce);
    }
    if (updateNonce && !isGnosisAccount) {
      setRealNonce(recommendNonce);
    } // do not overwrite nonce if from === to(cancel transaction)
    const { pendings } = await wallet.getTransactionHistory(address);
    const res: ExplainTxResponse = await wallet.openapi.preExecTx({
      tx: {
        ...tx,
        nonce: (updateNonce ? recommendNonce : tx.nonce) || '0x1', // set a mock nonce for explain if dapp not set it
        data: tx.data,
        value: tx.value || '0x0',
        gas: tx.gas || '', // set gas limit if dapp not set
      },
      origin: origin || '',
      address,
      updateNonce,
      pending_tx_list: pendings
        .filter((item) =>
          new BigNumber(item.nonce).lt(updateNonce ? recommendNonce : tx.nonce)
        )
        .reduce((result, item) => {
          return result.concat(item.txs.map((tx) => tx.rawTx));
        }, [] as Tx[])
        .map((item) => ({
          from: item.from,
          to: item.to,
          chainId: item.chainId,
          data: item.data || '0x',
          nonce: item.nonce,
          value: item.value,
          gasPrice: `0x${new BigNumber(
            item.gasPrice || item.maxFeePerGas || 0
          ).toString(16)}`,
          gas: item.gas || item.gasLimit || '0x0',
        })),
    });
    const { gas, needRatio } = await getRecommendGas({
      gas: res.gas.gas_used,
      tx,
      wallet,
      chainId,
    });
    setRecommendGasLimit(`0x${gas.toString(16)}`);
    let block = null;
    try {
      block = await wallet.requestETHRpc(
        {
          method: 'eth_getBlockByNumber',
          params: ['latest', false],
        },
        chain.serverId
      );
      setBlockInfo(block);
    } catch (e) {
      // DO NOTHING
    }
    if (tx.gas && origin === INTERNAL_REQUEST_ORIGIN) {
      setGasLimit(intToHex(Number(tx.gas))); // use origin gas as gasLimit when tx is an internal tx with gasLimit(i.e. for SendMax native token)
      reCalcGasLimitBaseAccountBalance({
        nonce: (updateNonce ? recommendNonce : tx.nonce) || '0x1',
        tx: {
          ...tx,
          nonce: (updateNonce ? recommendNonce : tx.nonce) || '0x1', // set a mock nonce for explain if dapp not set it
          data: tx.data,
          value: tx.value || '0x0',
          gas: tx.gas || '', // set gas limit if dapp not set
        },
        gasPrice: selectedGas?.price || 0,
        customRecommendGasLimit: gas.toNumber(),
        customGasLimit: Number(tx.gas),
        customRecommendGasLimitRatio: 1,
        block,
      });
    } else if (!gasLimit) {
      // use server response gas limit
      const ratio = SAFE_GAS_LIMIT_RATIO[chainId] || DEFAULT_GAS_LIMIT_RATIO;
      setRecommendGasLimitRatio(needRatio ? ratio : 1);
      const recommendGasLimit = needRatio
        ? gas.times(ratio).toFixed(0)
        : gas.toFixed(0);
      setGasLimit(intToHex(Number(recommendGasLimit)));
      reCalcGasLimitBaseAccountBalance({
        nonce: (updateNonce ? recommendNonce : tx.nonce) || '0x1',
        tx: {
          ...tx,
          nonce: (updateNonce ? recommendNonce : tx.nonce) || '0x1', // set a mock nonce for explain if dapp not set it
          data: tx.data,
          value: tx.value || '0x0',
          gas: tx.gas || '', // set gas limit if dapp not set
        },
        gasPrice: selectedGas?.price || 0,
        customRecommendGasLimit: gas.toNumber(),
        customGasLimit: Number(recommendGasLimit),
        customRecommendGasLimitRatio: needRatio ? ratio : 1,
        block,
      });
    }

    setTxDetail(res);

    setPreprocessSuccess(res.pre_exec.success);
    const approval = await getApproval();

    approval.signingTxId &&
      (await wallet.updateSigningTx(approval.signingTxId, {
        rawTx: {
          nonce: updateNonce ? recommendNonce : tx.nonce,
        },
        explain: {
          ...res,
          approvalId: approval.id,
          calcSuccess: !(checkErrors.length > 0),
        },
      }));

    return res;
  };

  const explain = async () => {
    const currentAccount =
      isGnosis && account ? account : (await wallet.getCurrentAccount())!;
    try {
      setIsReady(false);
      await explainTx(currentAccount.address);
      setIsReady(true);
      await checkTx(currentAccount.address);
    } catch (e: any) {
      Modal.error({
        title: t('Error'),
        content: e.message || JSON.stringify(e),
      });
    }
  };

  const handleGnosisConfirm = async (account: Account) => {
    stats.report('signTransaction', {
      type: KEYRING_TYPE.GnosisKeyring,
      category: KEYRING_CATEGORY_MAP[KEYRING_CLASS.GNOSIS],
      chainId: chain.serverId,
      preExecSuccess:
        checkErrors.length > 0 || !txDetail?.pre_exec.success ? false : true,
      createBy: params?.$ctx?.ga ? 'rabby' : 'dapp',
      source: params?.$ctx?.ga?.source || '',
      trigger: params?.$ctx?.ga?.trigger || '',
    });
    if (!isViewGnosisSafe) {
      const params: any = {
        from: tx.from,
        to: tx.to,
        data: tx.data,
        value: tx.value,
      };
      if (nonceChanged) {
        params.nonce = realNonce;
      }
      await wallet.buildGnosisTransaction(tx.from, account, params);
    }
    const hash = await wallet.getGnosisTransactionHash();
    resolveApproval({
      data: [hash, account.address],
      session: params.session,
      isGnosis: true,
      account: account,
      uiRequestComponent: 'SignText',
    });
  };

  const handleAllow = async (doubleCheck = false) => {
    if (!selectedGas) return;
    if (!doubleCheck && securityCheckStatus !== 'pass') {
      // setShowSecurityCheckDetail(true);
      return;
    }

    const currentAccount =
      isGnosis && account ? account : (await wallet.getCurrentAccount())!;

    try {
      validateGasPriceRange(tx);
    } catch (e) {
      Modal.error({
        title: t('Error'),
        content: e.message || JSON.stringify(e),
      });
      return;
    }

    const selected: ChainGas = {
      lastTimeSelect: selectedGas.level === 'custom' ? 'gasPrice' : 'gasLevel',
    };
    if (selectedGas.level === 'custom') {
      if (support1559) {
        selected.gasPrice = parseInt(tx.maxFeePerGas!);
      } else {
        selected.gasPrice = parseInt(tx.gasPrice!);
      }
    } else {
      selected.gasLevel = selectedGas.level;
    }
    if (!isSpeedUp && !isCancel && !isSwap) {
      await wallet.updateLastTimeGasSelection(chainId, selected);
    }
    const transaction: Tx = {
      from: tx.from,
      to: tx.to,
      data: tx.data,
      nonce: tx.nonce,
      value: tx.value,
      chainId: tx.chainId,
      gas: '',
    };
    if (support1559) {
      transaction.maxFeePerGas = tx.maxFeePerGas;
      transaction.maxPriorityFeePerGas =
        maxPriorityFee <= 0 ? tx.maxFeePerGas : intToHex(maxPriorityFee);
    } else {
      (transaction as Tx).gasPrice = tx.gasPrice;
    }
    const approval = await getApproval();
    gaEvent('allow');

    approval.signingTxId &&
      (await wallet.updateSigningTx(approval.signingTxId, {
        rawTx: {
          nonce: realNonce || tx.nonce,
        },
        explain: {
          ...txDetail!,
          approvalId: approval.id,
          calcSuccess: !(checkErrors.length > 0),
        },
      }));

    if (currentAccount?.type && WaitingSignComponent[currentAccount.type]) {
      // await wallet.addTxExplainCache({
      //   address: currentAccount.address,
      //   chainId,
      //   nonce: Number(realNonce || tx.nonce),
      //   explain: txDetail!,
      //   approvalId: approval.id,
      //   calcSuccess: !(checkErrors.length > 0),
      // });
      resolveApproval({
        ...transaction,
        isSend,
        nonce: realNonce || tx.nonce,
        gas: gasLimit,
        uiRequestComponent: WaitingSignComponent[currentAccount.type],
        type: currentAccount.type,
        address: currentAccount.address,
        traceId: securityCheckDetail?.trace_id,
        extra: {
          brandName: currentAccount.brandName,
        },
        $ctx: params.$ctx,
        signingTxId: approval.signingTxId,
      });

      return;
    }
    if (currentAccount.type === KEYRING_TYPE.GnosisKeyring) {
      setGnosisDrawerVisble(true);
      return;
    }

    await wallet.reportStats('signTransaction', {
      type: currentAccount.brandName,
      chainId: chain.serverId,
      category: KEYRING_CATEGORY_MAP[currentAccount.type],
      preExecSuccess:
        checkErrors.length > 0 || !txDetail?.pre_exec.success ? false : true,
      createBy: params?.$ctx?.ga ? 'rabby' : 'dapp',
      source: params?.$ctx?.ga?.source || '',
      trigger: params?.$ctx?.ga?.trigger || '',
    });

    // await wallet.addTxExplainCache({
    //   address: currentAccount.address,
    //   chainId,
    //   nonce: Number(realNonce || tx.nonce),
    //   explain: txDetail!,
    //   approvalId: approval.id,
    //   calcSuccess: !(checkErrors.length > 0),
    // });

    matomoRequestEvent({
      category: 'Transaction',
      action: 'Submit',
      label: currentAccount.brandName,
    });
    resolveApproval({
      ...transaction,
      nonce: realNonce || tx.nonce,
      gas: gasLimit,
      isSend,
      traceId: securityCheckDetail?.trace_id,
      signingTxId: approval.signingTxId,
    });
  };

  const handleGasChange = (gas: GasSelectorResponse) => {
    setSelectedGas({
      level: gas.level,
      front_tx_count: gas.front_tx_count,
      estimated_seconds: gas.estimated_seconds,
      base_fee: gas.base_fee,
      price: gas.price,
    });
    if (gas.level === 'custom') {
      setGasList(
        gasList.map((item) => {
          if (item.level === 'custom') return gas;
          return item;
        })
      );
    }
    const beforeNonce = realNonce || tx.nonce;
    const afterNonce = intToHex(gas.nonce);
    if (support1559) {
      setTx({
        ...tx,
        maxFeePerGas: intToHex(Math.round(gas.price)),
        gas: intToHex(gas.gasLimit),
        nonce: afterNonce,
      });
      setMaxPriorityFee(gas.maxPriorityFee);
    } else {
      setTx({
        ...tx,
        gasPrice: intToHex(Math.round(gas.price)),
        gas: intToHex(gas.gasLimit),
        nonce: afterNonce,
      });
    }
    setGasLimit(intToHex(gas.gasLimit));
    if (Number(gasLimit) !== gas.gasLimit) {
      setManuallyChangeGasLimit(true);
    } else {
      reCalcGasLimitBaseAccountBalance({
        gasPrice: gas.price,
        tx: {
          ...tx,
          gasPrice: intToHex(Math.round(gas.price)),
          gas: intToHex(gas.gasLimit),
          nonce: afterNonce,
        },
        nonce: afterNonce,
        block: blockInfo,
      });
    }
    if (!isGnosisAccount) {
      setRealNonce(afterNonce);
    } else {
      if (safeInfo && safeInfo.nonce <= gas.nonce) {
        setRealNonce(afterNonce);
      } else {
        safeInfo && setRealNonce(`0x${safeInfo.nonce.toString(16)}`);
      }
    }
    if (beforeNonce !== afterNonce) {
      setNonceChanged(true);
    }
  };

  const handleCancel = () => {
    gaEvent('cancel');
    rejectApproval('User rejected the request.');
  };

  const handleGnosisDrawerCancel = () => {
    setGnosisDrawerVisble(false);
  };

  const handleForceProcessChange = (checked: boolean) => {
    setForceProcess(checked);
  };

  const handleTxChange = (obj: Record<string, any>) => {
    setTx({
      ...tx,
      ...obj,
    });
    // trigger explain
    setUpdateId((id) => id + 1);
  };

  const loadGasMarket = async (
    chain: Chain,
    custom?: number
  ): Promise<GasLevel[]> => {
    const list = await wallet.openapi.gasMarket(
      chain.serverId,
      custom && custom > 0 ? custom : undefined
    );
    setGasList(list);
    return list;
  };

  const checkCanProcess = async () => {
    const session = params.session;
    const currentAccount =
      isGnosis && account ? account : (await wallet.getCurrentAccount())!;
    const site = await wallet.getConnectedSite(session.origin);

    if (currentAccount.type === KEYRING_TYPE.WatchAddressKeyring) {
      setCanProcess(false);
      setCantProcessReason(
        <div className="flex items-center gap-6">
          <img src={IconWatch} alt="" className="w-[24px] flex-shrink-0" />
          <div>
            Unable to sign because the current address is a Watch-only Address
            from Contacts. You can{' '}
            <a
              href=""
              className="underline"
              onClick={async (e) => {
                e.preventDefault();
                await rejectApproval('User rejected the request.', true);
                openInternalPageInTab('no-address');
              }}
            >
              import it
            </a>{' '}
            fully or use another address.
          </div>
        </div>
      );
    }
    if (currentAccount.type === KEYRING_TYPE.GnosisKeyring || isGnosis) {
      const networkId = await wallet.getGnosisNetworkId(currentAccount.address);

      if ((chainId || CHAINS[site!.chain].id) !== Number(networkId)) {
        setCanProcess(false);
        setCantProcessReason(
          <div className="flex items-center gap-6">
            <img src={IconGnosis} alt="" className="w-[24px] flex-shrink-0" />
            {t('multiSignChainNotMatch')}
          </div>
        );
      }
    }
  };

  const getSafeInfo = async () => {
    const currentAccount = (await wallet.getCurrentAccount())!;
    const networkId = await wallet.getGnosisNetworkId(currentAccount.address);
    const safeInfo = await Safe.getSafeInfo(currentAccount.address, networkId);
    setSafeInfo(safeInfo);
    setRecommendNonce(`0x${safeInfo.nonce.toString(16)}`);
    if (Number(tx.nonce || 0) < safeInfo.nonce) {
      setTx({
        ...tx,
        nonce: `0x${safeInfo.nonce.toString(16)}`,
      });
    }
    if (Number(realNonce || 0) < safeInfo.nonce) {
      setRealNonce(`0x${safeInfo.nonce.toString(16)}`);
    }
    if (tx.nonce === undefined || tx.nonce === null) {
      setTx({
        ...tx,
        nonce: `0x${safeInfo.nonce.toString(16)}`,
      });
      setRealNonce(`0x${safeInfo.nonce.toString(16)}`);
    }
  };

  const init = async () => {
    try {
      const currentAccount =
        isGnosis && account ? account : (await wallet.getCurrentAccount())!;
      const is1559 =
        support1559 && SUPPORT_1559_KEYRING_TYPE.includes(currentAccount.type);
      setIsLedger(currentAccount?.type === KEYRING_CLASS.HARDWARE.LEDGER);
      setUseLedgerLive(await wallet.isUseLedgerLive());
      setIsHardware(
        !!Object.values(HARDWARE_KEYRING_TYPES).find(
          (item) => item.type === currentAccount.type
        )
      );
      const balance = await getNativeTokenBalance({
        wallet,
        chainId,
        address: currentAccount.address,
      });

      setNativeTokenBalance(balance);

      wallet.reportStats('createTransaction', {
        type: currentAccount.brandName,
        category: KEYRING_CATEGORY_MAP[currentAccount.type],
        chainId: chain.serverId,
        createBy: params?.$ctx?.ga ? 'rabby' : 'dapp',
        source: params?.$ctx?.ga?.source || '',
        trigger: params?.$ctx?.ga?.trigger || '',
      });

      matomoRequestEvent({
        category: 'Transaction',
        action: 'init',
        label: currentAccount.brandName,
      });

      if (currentAccount.type === KEYRING_TYPE.GnosisKeyring) {
        setIsGnosisAccount(true);
        await getSafeInfo();
      }
      checkCanProcess();
      const lastTimeGas: ChainGas | null = await wallet.getLastTimeGasSelection(
        chainId
      );
      let customGasPrice = 0;
      if (lastTimeGas?.lastTimeSelect === 'gasPrice' && lastTimeGas.gasPrice) {
        // use cached gasPrice if exist
        customGasPrice = lastTimeGas.gasPrice;
      }
      if (isSpeedUp || isCancel || ((isSend || isSwap) && tx.gasPrice)) {
        // use gasPrice set by dapp when it's a speedup or cancel tx
        customGasPrice = parseInt(tx.gasPrice!);
      }
      const gasList = await loadGasMarket(chain, customGasPrice);
      let gas: GasLevel | null = null;

      if (
        ((isSend || isSwap) && customGasPrice) ||
        isSpeedUp ||
        isCancel ||
        lastTimeGas?.lastTimeSelect === 'gasPrice'
      ) {
        gas = gasList.find((item) => item.level === 'custom')!;
      } else if (
        lastTimeGas?.lastTimeSelect &&
        lastTimeGas?.lastTimeSelect === 'gasLevel'
      ) {
        const target = gasList.find(
          (item) => item.level === lastTimeGas?.gasLevel
        )!;
        gas = target;
      } else {
        // no cache, use the fast level in gasMarket
        gas = gasList.find((item) => item.level === 'normal')!;
      }
      const fee = calcMaxPriorityFee(gasList, gas, chainId);
      setMaxPriorityFee(fee);

      setSelectedGas(gas);
      setSupport1559(is1559);
      if (is1559) {
        setTx(
          convertLegacyTo1559({
            ...tx,
            gasPrice: intToHex(gas.price),
          })
        );
      } else {
        setTx({
          ...tx,
          gasPrice: intToHex(gas.price),
        });
      }
      setInited(true);
    } catch (e) {
      Modal.error({
        title: t('Error'),
        content: e.message || JSON.stringify(e),
      });
    }
  };

  const handleIsGnosisAccountChange = async () => {
    if (!isViewGnosisSafe) {
      await wallet.clearGnosisTransaction();
    }
  };

  const reCalcGasLimitBaseAccountBalance = async ({
    gasPrice,
    nonce,
    tx,
    customRecommendGasLimit,
    customGasLimit,
    customRecommendGasLimitRatio,
    block,
  }: {
    tx: Tx;
    nonce: number | string | BigNumber;
    gasPrice: number | string | BigNumber;
    customRecommendGasLimit?: number;
    customGasLimit?: number;
    customRecommendGasLimitRatio?: number;
    block: BlockInfo | null;
  }) => {
    if (isGnosisAccount) return; // Gnosis Safe transaction no need gasLimit
    const calcGasLimit = customGasLimit || gasLimit;
    const calcGasLimitRatio =
      customRecommendGasLimitRatio || recommendGasLimitRatio;
    const calcRecommendGasLimit = customRecommendGasLimit || recommendGasLimit;
    if (!calcGasLimit) return;
    const currentAccount =
      isGnosis && account ? account : (await wallet.getCurrentAccount())!;
    const { pendings } = await wallet.getTransactionHistory(
      currentAccount.address
    );
    let res = getGasLimitBaseAccountBalance({
      gasPrice,
      nonce,
      pendingList: pendings.filter((item) => item.chainId === chainId),
      nativeTokenBalance,
      tx,
      recommendGasLimit: calcRecommendGasLimit,
      recommendGasLimitRatio: calcGasLimitRatio,
    });

    if (block && res > Number(block.gasLimit)) {
      res = Number(block.gasLimit);
    }
    if (!new BigNumber(res).eq(calcGasLimit)) {
      setGasLimit(`0x${new BigNumber(res).toNumber().toString(16)}`);
      setManuallyChangeGasLimit(false);
    }
  };

  useEffect(() => {
    init();
  }, []);

  useEffect(() => {
    if (isGnosisAccount) {
      handleIsGnosisAccountChange();
    }
  }, [isGnosisAccount]);

  useEffect(() => {
    if (!inited) return;
    explain();
  }, [inited, updateId]);

  useEffect(() => {
    (async () => {
      const currentAccount = (await wallet.getCurrentAccount())!;
      if (
        [
          KEYRING_CLASS.MNEMONIC,
          KEYRING_CLASS.PRIVATE_KEY,
          KEYRING_CLASS.WATCH,
        ].includes(currentAccount.type)
      ) {
        setSubmitText('Sign');
        setCheckText('Sign');
      } else {
        setSubmitText('Proceed');
        setCheckText('Proceed');
      }
    })();
  }, [securityCheckStatus]);

  const approvalTxStyle: Record<string, string> = {};
  if (isLedger && !useLedgerLive && !hasConnectedLedgerHID) {
    approvalTxStyle.paddingBottom = '230px';
  }
  return (
    <>
      <AccountCard />
      <div
        className={clsx('approval-tx', {
          'pre-process-failed': !preprocessSuccess,
        })}
        style={approvalTxStyle}
      >
        {txDetail && (
          <>
            {txDetail && (
              <TxTypeComponent
                isReady={isReady}
                txDetail={txDetail}
                chain={chain}
                raw={{
                  ...tx,
                  nonce: realNonce || tx.nonce,
                  gas: gasLimit!,
                }}
                onChange={handleTxChange}
                tx={{
                  ...tx,
                  nonce: realNonce || tx.nonce,
                  gas: gasLimit,
                }}
                isSpeedUp={isSpeedUp}
              />
            )}
            <GasSelector
              isGnosisAccount={isGnosisAccount}
              isReady={isReady}
              tx={tx}
              gasLimit={gasLimit}
              noUpdate={isCancel || isSpeedUp}
              gasList={gasList}
              selectedGas={selectedGas}
              version={txDetail.pre_exec_version}
              gas={{
                error: txDetail.gas.error,
                success: txDetail.gas.success,
                gasCostUsd: gasExplainResponse.gasCostUsd,
                gasCostAmount: gasExplainResponse.gasCostAmount,
              }}
              gasCalcMethod={(price) => {
                return explainGas({
                  gasUsed: recommendGasLimit,
                  gasPrice: price,
                  chainId,
                  nativeTokenPrice: txDetail?.native_token.price || 0,
                  tx,
                  wallet,
                  gasLimit,
                });
              }}
              recommendGasLimit={recommendGasLimit}
              recommendNonce={recommendNonce}
              chainId={chainId}
              onChange={handleGasChange}
              nonce={realNonce || tx.nonce}
              disableNonce={isSpeedUp || isCancel}
              is1559={support1559}
              isHardware={isHardware}
              manuallyChangeGasLimit={manuallyChangeGasLimit}
            />
            <div className="section-title">Pre-sign check</div>
            <PreCheckCard
              isReady={isReady}
              loading={!isReady}
              version={txDetail.pre_exec_version}
              data={txDetail.pre_exec}
              errors={checkErrors}
            ></PreCheckCard>
            <SecurityCheckCard
              isReady={isReady}
              loading={!securityCheckDetail}
              data={securityCheckDetail}
            ></SecurityCheckCard>

            <footer className="connect-footer pb-[20px]">
              {txDetail && (
                <>
                  {isLedger && !useLedgerLive && !hasConnectedLedgerHID && (
                    <LedgerWebHIDAlert connected={hasConnectedLedgerHID} />
                  )}
                  {canProcess ? (
                    <SecurityCheck
                      status={securityCheckStatus}
                      value={forceProcess}
                      onChange={handleForceProcessChange}
                    />
                  ) : (
                    <ProcessTooltip>{cantProcessReason}</ProcessTooltip>
                  )}

                  <div className="action-buttons flex justify-between relative">
                    <Button
                      type="primary"
                      size="large"
                      className="w-[172px]"
                      onClick={handleCancel}
                    >
                      {t('Cancel')}
                    </Button>
                    {!canProcess ||
                    !!checkErrors.find((item) => item.level === 'forbidden') ? (
                      <Tooltip
                        placement="topLeft"
                        overlayClassName="rectangle sign-tx-forbidden-tooltip"
                        title={
                          checkErrors.find((item) => item.level === 'forbidden')
                            ? checkErrors.find(
                                (item) => item.level === 'forbidden'
                              )!.msg
                            : null
                        }
                      >
                        <div>
                          <Button
                            type="primary"
                            size="large"
                            className="w-[172px]"
                            onClick={() => handleAllow()}
                            disabled={true}
                          >
                            {t(submitText)}
                          </Button>
                        </div>
                      </Tooltip>
                    ) : (
                      <Button
                        type="primary"
                        size="large"
                        className="w-[172px]"
                        onClick={() => handleAllow(forceProcess)}
                        disabled={
                          !isReady ||
                          (selectedGas ? selectedGas.price < 0 : true) ||
                          (isGnosisAccount ? !safeInfo : false) ||
                          (isLedger &&
                            !useLedgerLive &&
                            !hasConnectedLedgerHID) ||
                          !forceProcess ||
                          securityCheckStatus === 'loading'
                        }
                        loading={isGnosisAccount ? !safeInfo : false}
                      >
                        {t(submitText)}
                      </Button>
                    )}
                  </div>
                </>
              )}
            </footer>
          </>
        )}
        {isGnosisAccount && safeInfo && (
          <Drawer
            placement="bottom"
            height="400px"
            className="gnosis-drawer"
            visible={gnosisDrawerVisible}
            onClose={() => setGnosisDrawerVisble(false)}
            maskClosable
          >
            <GnosisDrawer
              safeInfo={safeInfo}
              onCancel={handleGnosisDrawerCancel}
              onConfirm={handleGnosisConfirm}
            />
          </Drawer>
        )}
      </div>
    </>
  );
};

export default SignTx;
