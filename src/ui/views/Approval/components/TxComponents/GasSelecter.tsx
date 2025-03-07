import { Button, Form, Input, Skeleton, Slider, Tooltip } from 'antd';
import { matomoRequestEvent } from '@/utils/matomo-request';
import { ValidateStatus } from 'antd/lib/form/FormItem';
import { GasLevel, Tx } from 'background/service/openapi';
import BigNumber from 'bignumber.js';
import clsx from 'clsx';
import { CHAINS, GAS_LEVEL_TEXT, MINIMUM_GAS_LIMIT } from 'consts';
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Trans, useTranslation } from 'react-i18next';
import { useDebounce } from 'react-use';
import IconInfo from 'ui/assets/infoicon.svg';
import { Popup } from 'ui/component';
import { formatTokenAmount } from 'ui/utils/number';
import { calcMaxPriorityFee } from '@/utils/transaction';
import styled, { css } from 'styled-components';
import LessPalette from '@/ui/style/var-defs';
import { ReactComponent as IconArrowRight } from 'ui/assets/approval/edit-arrow-right.svg';

export interface GasSelectorResponse extends GasLevel {
  gasLimit: number;
  nonce: number;
  maxPriorityFee: number;
}

interface GasSelectorProps {
  gasLimit: string | undefined;
  gas: {
    gasCostUsd: number | string | BigNumber;
    gasCostAmount: number | string | BigNumber;
    success?: boolean;
    error?: null | {
      msg: string;
      code: number;
    };
  };
  version: 'v0' | 'v1' | 'v2';
  chainId: number;
  tx: Tx;
  onChange(gas: GasSelectorResponse): void;
  isReady: boolean;
  recommendGasLimit: number | string | BigNumber;
  recommendNonce: number | string | BigNumber;
  nonce: string;
  disableNonce: boolean;
  noUpdate: boolean;
  gasList: GasLevel[];
  selectedGas: GasLevel | null;
  is1559: boolean;
  isHardware: boolean;
  gasCalcMethod: (
    price: number
  ) => Promise<{
    gasCostUsd: BigNumber;
    gasCostAmount: BigNumber;
  }>;
  isGnosisAccount?: boolean;
  manuallyChangeGasLimit: boolean;
}

const useExplainGas = ({
  price,
  method,
  value,
}: {
  price: number;
  method: GasSelectorProps['gasCalcMethod'];
  value: {
    gasCostUsd: BigNumber;
    gasCostAmount: BigNumber;
  };
}) => {
  const [result, setResult] = useState<{
    gasCostUsd: BigNumber;
    gasCostAmount: BigNumber;
  }>(value);
  useEffect(() => {
    method(price).then(setResult);
  }, [price, method]);

  return result;
};

const CardBody = styled.div<{
  $disabled?: boolean;
}>`
  display: flex;
  justify-content: space-between;
  width: 100%;
  gap: 8px;

  ${({ $disabled }) =>
    $disabled
      ? css`
          opacity: 0.5;
          cursor: not-allowed;
        `
      : css`
          .card {
            cursor: pointer;

            &:hover {
              border: 1px solid #8697ff;
            }

            &.active {
              background: rgba(134, 151, 255, 0.1);
              border: 1px solid #8697ff;
            }
          }

          .cardTitle {
            &.active {
              color: #8697ff !important;
            }
          }
        `}

  .card {
    width: 76px;
    height: 52px;
    background: #f5f6fa;
    border-radius: 4px;
    display: flex;
    flex-direction: column;
    border: 1px solid transparent;

    .gas-level,
    .cardTitle {
      text-align: center;
      font-size: 12px;
      line-height: 14px;
      color: ${LessPalette['@color-comment']};
      margin: 8px auto 0;
    }
    .cardTitle {
      color: ${LessPalette['@color-title']} !important;
      font-weight: 500;
      font-size: 13px !important;
      margin: 4px auto 0;
    }
    .custom-input {
      margin: 4px auto 0;
    }
    .ant-input {
      text-align: center !important;
      font-size: 13px !important;
      font-weight: 500;
      color: ${LessPalette['@color-title']};
      padding-top: 0;
      &.active {
        color: #8697ff !important;
      }
    }
    .ant-input:focus,
    .ant-input-focused {
      color: #000000;
    }
  }
`;

const ManuallySetGasLimitAlert = styled.div`
  font-weight: 400;
  font-size: 13px;
  line-height: 15px;
  margin-top: 10px;
  color: #707280;
`;

const GasSelector = ({
  gasLimit,
  gas,
  chainId,
  tx,
  onChange,
  isReady,
  recommendGasLimit,
  recommendNonce,
  nonce,
  disableNonce,
  gasList,
  selectedGas: rawSelectedGas,
  is1559,
  isHardware,
  version,
  gasCalcMethod,
  isGnosisAccount,
  manuallyChangeGasLimit,
}: GasSelectorProps) => {
  const { t } = useTranslation();
  const customerInputRef = useRef<Input>(null);
  const [afterGasLimit, setGasLimit] = useState<string | number>(
    Number(gasLimit)
  );
  const [modalVisible, setModalVisible] = useState(false);
  const [customGas, setCustomGas] = useState<string | number>(
    Number(tx.gasPrice || tx.maxFeePerGas || 0) / 1e9
  );
  const [selectedGas, setSelectedGas] = useState<GasLevel | null>(
    rawSelectedGas
  );
  const [maxPriorityFee, setMaxPriorityFee] = useState<number>(
    selectedGas ? selectedGas.price / 1e9 : 0
  );
  const [isReal1559, setIsReal1559] = useState(false);
  const [customNonce, setCustomNonce] = useState(Number(nonce));
  const [isFirstTimeLoad, setIsFirstTimeLoad] = useState(true);
  const [validateStatus, setValidateStatus] = useState<
    Record<string, { status: ValidateStatus; message: string | null }>
  >({
    customGas: {
      status: 'success',
      message: null,
    },
    gasLimit: {
      status: 'success',
      message: null,
    },
    nonce: {
      status: 'success',
      message: null,
    },
  });
  const chain = Object.values(CHAINS).find((item) => item.id === chainId)!;
  const sliderStep = useMemo(() => {
    if (!selectedGas) return 0;
    if (selectedGas.price / 1e9 <= 50) return 0.1;
    return 1;
  }, [selectedGas]);

  const handleSetRecommendTimes = () => {
    if (isGnosisAccount) return;
    const value = new BigNumber(recommendGasLimit).times(1.5).toFixed(0);
    setGasLimit(value);
  };

  const formValidator = () => {
    if (!afterGasLimit) {
      setValidateStatus({
        ...validateStatus,
        gasLimit: {
          status: 'error',
          message: t('GasLimitEmptyAlert'),
        },
      });
    } else if (Number(afterGasLimit) < MINIMUM_GAS_LIMIT) {
      setValidateStatus({
        ...validateStatus,
        gasLimit: {
          status: 'error',
          message: t('GasLimitMinimumValueAlert'),
        },
      });
    } else if (new BigNumber(customNonce).lt(recommendNonce) && !disableNonce) {
      setValidateStatus({
        ...validateStatus,
        nonce: {
          status: 'error',
          message: `Nonce is too low, the minimum should be ${new BigNumber(
            recommendNonce
          ).toString()}`,
        },
      });
    } else {
      setValidateStatus({
        ...validateStatus,
        gasLimit: {
          status: 'success',
          message: null,
        },
        nonce: {
          status: 'success',
          message: null,
        },
      });
    }
  };

  const modalExplainGas = useExplainGas({
    price: selectedGas?.price || 0,
    method: gasCalcMethod,
    value: {
      gasCostAmount: new BigNumber(gas.gasCostAmount),
      gasCostUsd: new BigNumber(gas.gasCostUsd),
    },
  });

  const handleConfirmGas = () => {
    if (!selectedGas) return;
    if (selectedGas.level === 'custom') {
      onChange({
        ...selectedGas,
        price: Number(customGas) * 1e9,
        gasLimit: Number(afterGasLimit),
        nonce: Number(customNonce),
        level: selectedGas.level,
        maxPriorityFee: maxPriorityFee * 1e9,
      });
    } else {
      onChange({
        ...selectedGas,
        gasLimit: Number(afterGasLimit),
        nonce: Number(customNonce),
        level: selectedGas.level,
        maxPriorityFee: maxPriorityFee * 1e9,
      });
    }
  };

  const handleModalConfirmGas = () => {
    handleConfirmGas();
    setModalVisible(false);
  };

  const handleCustomGasChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    e.stopPropagation();
    if (/^\d*(\.\d*)?$/.test(e.target.value)) {
      setCustomGas(e.target.value);
    }
  };

  const handleGasLimitChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (/^\d*$/.test(e.target.value)) {
      setGasLimit(e.target.value);
    }
  };

  const handleCustomNonceChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (/^\d*$/.test(e.target.value)) {
      setCustomNonce(Number(e.target.value));
    }
  };

  const handleClickEdit = () => {
    setModalVisible(true);
    setSelectedGas(rawSelectedGas);
    setGasLimit(Number(gasLimit));
    setCustomNonce(Number(nonce));
    matomoRequestEvent({
      category: 'Transaction',
      action: 'EditGas',
      label: chain?.serverId,
    });
  };

  const panelSelection = (e, gas: GasLevel) => {
    e.stopPropagation();
    let target = gas;

    if (gas.level === selectedGas?.level) return;

    if (gas.level === 'custom') {
      if (selectedGas && selectedGas.level !== 'custom' && !gas.price) {
        target =
          gasList.find((item) => item.level === selectedGas.level) || gas;
      }
      setCustomGas(Number(target.price) / 1e9);
      setSelectedGas({
        ...target,
        level: 'custom',
      });
      customerInputRef.current?.focus();
    } else {
      setSelectedGas({
        ...gas,
        level: gas?.level,
      });
    }
  };

  const handlePanelSelection = (e, gas: GasLevel) => {
    if (isGnosisAccount) return;
    return panelSelection(e, gas);
  };

  const externalPanelSelection = (e, gas: GasLevel) => {
    e.stopPropagation();
    let target = gas;

    if (gas.level === 'custom') {
      if (rawSelectedGas && rawSelectedGas.level !== 'custom' && !gas.price) {
        target =
          gasList.find((item) => item.level === rawSelectedGas.level) || gas;
      }

      onChange({
        ...target,
        level: 'custom',
        price: Number(target.price),
        gasLimit: Number(afterGasLimit),
        nonce: Number(customNonce),
        maxPriorityFee: calcMaxPriorityFee(gasList, target, chainId),
      });
    } else {
      onChange({
        ...gas,
        gasLimit: Number(afterGasLimit),
        nonce: Number(customNonce),
        level: gas?.level,
        maxPriorityFee: calcMaxPriorityFee(gasList, target, chainId),
      });
    }
  };

  const externalHandleCustomGasChange = (
    e: React.ChangeEvent<HTMLInputElement>
  ) => {
    e.stopPropagation();

    if (/^\d*(\.\d*)?$/.test(e.target.value)) {
      let value = e?.target?.value || '';
      if (value.trim() === '.') {
        value = '0.';
      }
      setCustomGas(value);

      const gasObj = {
        level: 'custom',
        front_tx_count: 0,
        estimated_seconds: 0,
        base_fee: gasList[0].base_fee,
      };

      const currentObj = {
        ...gasObj,
        ...rawSelectedGas,
        front_tx_count: 0,
        estimated_seconds: 0,
        base_fee: gasList[0].base_fee,
        price: Number(value) * 1e9,
        level: 'custom',
        gasLimit: Number(afterGasLimit),
        nonce: Number(customNonce),
        maxPriorityFee: Number(value) * 1e9,
      };
      onChange(currentObj);
    }
  };

  const customGasConfirm = (e) => {
    const gas = {
      level: 'custom',
      price: Number(e?.target?.value),
      front_tx_count: 0,
      estimated_seconds: 0,
      base_fee: gasList[0].base_fee,
    };
    setSelectedGas({
      ...gas,
      price: Number(gas.price),
      level: gas.level,
    });
  };

  const handleMaxPriorityFeeChange = (val: number) => {
    setMaxPriorityFee(val);
  };

  useDebounce(
    () => {
      (isReady || !isFirstTimeLoad) &&
        setSelectedGas((gas) => ({
          ...gas,
          level: 'custom',
          price: Number(customGas) * 1e9,
          front_tx_count: 0,
          estimated_seconds: 0,
          base_fee: gasList[0].base_fee,
        }));
    },
    500,
    [customGas]
  );

  useEffect(() => {
    setGasLimit(Number(gasLimit));
  }, [gasLimit]);

  useEffect(() => {
    formValidator();
  }, [afterGasLimit, selectedGas, gasList, customNonce]);

  useEffect(() => {
    if (!rawSelectedGas) return;
    setSelectedGas(rawSelectedGas);
    if (rawSelectedGas?.level !== 'custom') return;
    setCustomGas((e) =>
      Number(e) * 1e9 === rawSelectedGas.price ? e : rawSelectedGas.price / 1e9
    );
  }, [rawSelectedGas]);

  useEffect(() => {
    setCustomNonce(Number(nonce));
  }, [nonce]);

  useEffect(() => {
    if (isReady && isFirstTimeLoad) {
      setIsFirstTimeLoad(false);
    }
  }, [isReady]);

  useEffect(() => {
    if (!is1559) return;
    if (selectedGas?.level === 'custom') {
      if (Number(customGas) !== maxPriorityFee) {
        setIsReal1559(true);
      } else {
        setIsReal1559(false);
      }
    } else if (selectedGas) {
      if (selectedGas?.price / 1e9 !== maxPriorityFee) {
        setIsReal1559(true);
      } else {
        setIsReal1559(false);
      }
    }
  }, [maxPriorityFee, selectedGas, customGas, is1559]);

  useEffect(() => {
    if (isReady && selectedGas && chainId === 1) {
      const priorityFee = calcMaxPriorityFee(gasList, selectedGas, chainId);
      setMaxPriorityFee(priorityFee / 1e9);
    } else if (selectedGas) {
      setMaxPriorityFee(selectedGas.price / 1e9);
    }
  }, [gasList, selectedGas, isReady, chainId]);

  if (!isReady && isFirstTimeLoad)
    return (
      <>
        <div className="gas-selector pt-[14px] pb-[16px]">
          <div>
            <div>
              <Skeleton.Input active style={{ width: 120, height: 18 }} />
            </div>
            <div className="flex items-center justify-between mt-12">
              {Array(4)
                .fill(0)
                .map((_e, i) => (
                  <Skeleton.Input
                    key={i}
                    active
                    style={{ width: 76, height: 52 }}
                  />
                ))}
            </div>
          </div>
        </div>
      </>
    );

  return (
    <>
      <div className="gas-selector">
        <div
          className={clsx(
            'gas-selector-card',
            gas.error || !gas.success ? 'items-start mb-12' : 'mb-14'
          )}
        >
          <div className="gas-selector-card-title">Gas</div>
          <div className="gas-selector-card-content ml-[27px]">
            {isGnosisAccount ? (
              <div className="font-semibold">No gas required</div>
            ) : gas.error || !gas.success ? (
              <>
                <div className="gas-selector-card-error">
                  Fail to fetch gas cost
                </div>
                {version === 'v2' && gas.error ? (
                  <div className="gas-selector-card-error-desc">
                    {gas.error.msg}{' '}
                    <span className="number">#{gas.error.code}</span>
                  </div>
                ) : null}
              </>
            ) : (
              <div className="gas-selector-card-content-item">
                <div className="gas-selector-card-amount">
                  <span className="text-gray-title font-medium text-15">
                    {formatTokenAmount(
                      new BigNumber(gas.gasCostAmount).toString(10)
                    )}{' '}
                    {chain.nativeTokenSymbol}
                  </span>
                  &nbsp;&nbsp; ≈${new BigNumber(gas.gasCostUsd).toFixed(2)}
                </div>
              </div>
            )}
          </div>
          <div
            className="flex items-center text-12 text-gray-content cursor-pointer"
            role="button"
            onClick={handleClickEdit}
          >
            <span>More</span>
            <IconArrowRight />
          </div>
        </div>
        <GasSelectPanel
          gasList={gasList}
          selectedGas={rawSelectedGas}
          panelSelection={externalPanelSelection}
          customGas={customGas}
          handleCustomGasChange={externalHandleCustomGasChange}
          isGnosisAccount={isGnosisAccount}
        />
        {manuallyChangeGasLimit && (
          <ManuallySetGasLimitAlert>
            You have manually set the Gas limit to {Number(gasLimit)}
          </ManuallySetGasLimitAlert>
        )}
      </div>
      <Popup
        height={720}
        visible={modalVisible}
        title={t('Gas')}
        className="gas-modal"
        onCancel={() => setModalVisible(false)}
        destroyOnClose
        closable
      >
        <div className="gas-selector-modal-top">
          {isGnosisAccount ? (
            <div className="gas-selector-modal-amount">No gas required</div>
          ) : gas.error || !gas.success ? (
            <>
              <div className="gas-selector-modal-error">
                Fail to fetch gas cost
              </div>
              {version === 'v2' && gas.error ? (
                <div className="gas-selector-modal-error-desc mt-[4px]">
                  {gas.error.msg}{' '}
                  <span className="number">#{gas.error.code}</span>
                </div>
              ) : null}
            </>
          ) : (
            <>
              <div className="gas-selector-modal-amount">
                {formatTokenAmount(
                  new BigNumber(modalExplainGas.gasCostAmount).toString(10)
                )}{' '}
                {chain.nativeTokenSymbol}
              </div>
              <div className="gas-selector-modal-usd">
                ≈${modalExplainGas.gasCostUsd.toFixed(2)}
              </div>
            </>
          )}
        </div>
        <div className="card-container">
          <div
            className={clsx('card-container-title', {
              disabled: isGnosisAccount,
            })}
          >
            Gas Price (Gwei)
          </div>
          <Tooltip
            overlayClassName="rectangle"
            title={
              isGnosisAccount
                ? 'Gas fee is not required for Gnosis safe transactions'
                : null
            }
          >
            <CardBody $disabled={isGnosisAccount}>
              {gasList.map((item, idx) => (
                <div
                  key={`gas-item-${item.level}-${idx}`}
                  className={clsx('card', {
                    active: selectedGas?.level === item.level,
                  })}
                  onClick={(e) => handlePanelSelection(e, item)}
                >
                  <div className="gas-level">
                    {t(GAS_LEVEL_TEXT[item.level])}
                  </div>
                  <div
                    className={clsx('cardTitle', {
                      'custom-input': item.level === 'custom',
                      active: selectedGas?.level === item.level,
                    })}
                  >
                    {item.level === 'custom' ? (
                      <Input
                        value={customGas}
                        defaultValue={customGas}
                        onChange={handleCustomGasChange}
                        onClick={(e) => handlePanelSelection(e, item)}
                        onPressEnter={customGasConfirm}
                        ref={customerInputRef}
                        autoFocus={selectedGas?.level === item.level}
                        min={0}
                        bordered={false}
                        disabled={isGnosisAccount}
                      />
                    ) : (
                      item.price / 1e9
                    )}
                  </div>
                </div>
              ))}
            </CardBody>
          </Tooltip>
        </div>
        <div>
          {is1559 && (
            <div className="priority-slider">
              <p className="priority-slider-header">
                Max Priority Fee (Gwei)
                <Tooltip
                  title={
                    <ol className="list-decimal list-outside pl-[12px] mb-0">
                      <li>
                        On chains that support EIP-1559, the Priority Fee is the
                        tip for miners to process your transaction. You can save
                        your final gas cost by lowering the Priority Fee, which
                        may cost more time for the transaction to be processed.
                      </li>
                      <li>
                        Here in Rabby, Priority Fee (Tip) = Max Fee - Base Fee.
                        After you set up the Max Priority Fee, the Base Fee will
                        be deducted from it and the rest will be tipped to
                        miners.
                      </li>
                    </ol>
                  }
                  overlayClassName="rectangle"
                >
                  <img src={IconInfo} className="icon icon-info" />
                </Tooltip>
              </p>
              <div className="priority-slider-body">
                <Slider
                  min={0}
                  max={selectedGas ? selectedGas.price / 1e9 : 0}
                  onChange={handleMaxPriorityFeeChange}
                  value={maxPriorityFee}
                  step={sliderStep}
                />
                <p className="priority-slider__mark">
                  <span>0</span>
                  <span>{selectedGas ? selectedGas.price / 1e9 : 0}</span>
                </p>
              </div>
            </div>
          )}
          {isReal1559 && isHardware && (
            <div className="hardware-1559-tip">
              Make sure your hardware wallet firmware has been upgraded to the
              version that supports EIP 1559
            </div>
          )}
          <Form onFinish={handleConfirmGas}>
            <div className="gas-limit">
              <p
                className={clsx('gas-limit-label flex leading-[16px]', {
                  disabled: isGnosisAccount,
                })}
              >
                <span className="flex-1">{t('GasLimit')}</span>
              </p>
              <div className="expanded gas-limit-panel-wrapper">
                <Tooltip
                  overlayClassName="rectangle"
                  title={
                    isGnosisAccount
                      ? 'Gas fee is not required for Gnosis safe transactions'
                      : null
                  }
                >
                  <Form.Item
                    className={clsx('gas-limit-panel mb-0', {
                      disabled: isGnosisAccount,
                    })}
                    validateStatus={validateStatus.gasLimit.status}
                  >
                    <Input
                      className="popup-input"
                      value={afterGasLimit}
                      onChange={handleGasLimitChange}
                      disabled={isGnosisAccount}
                    />
                  </Form.Item>
                </Tooltip>
                {validateStatus.gasLimit.message ? (
                  <p className="tip text-red-light not-italic">
                    {validateStatus.gasLimit.message}
                  </p>
                ) : (
                  <p className={clsx('tip', { disabled: isGnosisAccount })}>
                    <Trans
                      i18nKey="RecommendGasLimitTip"
                      values={{
                        est: Number(recommendGasLimit),
                        current: new BigNumber(afterGasLimit)
                          .div(recommendGasLimit)
                          .toFixed(1),
                      }}
                    />
                    <span
                      className="recommend-times"
                      onClick={handleSetRecommendTimes}
                    >
                      1.5x
                    </span>
                    .
                  </p>
                )}
                <div className={clsx({ 'opacity-50': disableNonce })}>
                  <p className="gas-limit-title mt-20 mb-0 leading-[16px]">
                    {t('Nonce')}
                  </p>
                  <Form.Item
                    className="gas-limit-panel mb-0"
                    required
                    validateStatus={validateStatus.nonce.status}
                  >
                    <Input
                      className="popup-input"
                      value={customNonce}
                      onChange={handleCustomNonceChange}
                      disabled={disableNonce}
                    />
                  </Form.Item>
                  {validateStatus.nonce.message ? (
                    <p className="tip text-red-light not-italic">
                      {validateStatus.nonce.message}
                    </p>
                  ) : (
                    <p className="tip">{t('Modify only when necessary')}</p>
                  )}
                </div>
              </div>
            </div>
          </Form>
        </div>
        <div className="flex justify-center mt-32 popup-footer">
          <Button
            type="primary"
            className="w-[200px]"
            size="large"
            onClick={handleModalConfirmGas}
            disabled={!isReady || validateStatus.customGas.status === 'error'}
          >
            {t('Confirm')}
          </Button>
        </div>
      </Popup>
    </>
  );
};

const GasSelectPanel = ({
  gasList,
  selectedGas,
  panelSelection,
  customGas,
  customGasConfirm = () => null,
  handleCustomGasChange,
  isGnosisAccount,
}: {
  gasList: GasLevel[];
  selectedGas: GasLevel | null;
  panelSelection: (
    e: React.MouseEvent<HTMLDivElement, MouseEvent>,
    item: GasLevel
  ) => void;
  customGas: string | number;
  customGasConfirm?: React.KeyboardEventHandler<HTMLInputElement> | undefined;
  handleCustomGasChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  isGnosisAccount?: boolean;
}) => {
  const { t } = useTranslation();
  const customerInputRef = useRef<Input>(null);
  const disabled = isGnosisAccount;
  const handlePanelSelection = (e, item) => {
    if (disabled) return;
    return panelSelection(e, item);
  };

  return (
    <Tooltip
      overlayClassName="rectangle"
      title={
        disabled ? 'Gas fee is not required for Gnosis safe transactions' : null
      }
    >
      <CardBody $disabled={disabled}>
        {gasList.map((item, idx) => (
          <div
            key={`gas-item-${item.level}-${idx}`}
            className={clsx('card', {
              active: selectedGas?.level === item.level,
            })}
            onClick={(e) => {
              handlePanelSelection(e, item);
              if (item.level === 'custom') {
                customerInputRef.current?.focus();
              }
            }}
          >
            <div className="gas-level">{t(GAS_LEVEL_TEXT[item.level])}</div>
            <div
              className={clsx('cardTitle', {
                'custom-input': item.level === 'custom',
                active: selectedGas?.level === item.level,
              })}
            >
              {item.level === 'custom' ? (
                <Input
                  value={customGas}
                  defaultValue={customGas}
                  onChange={handleCustomGasChange}
                  onClick={(e) => handlePanelSelection(e, item)}
                  onPressEnter={customGasConfirm}
                  ref={customerInputRef}
                  autoFocus={selectedGas?.level === item.level}
                  min={0}
                  bordered={false}
                  disabled={disabled}
                />
              ) : (
                item.price / 1e9
              )}
            </div>
          </div>
        ))}
      </CardBody>
    </Tooltip>
  );
};

export default GasSelector;
