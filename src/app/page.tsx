'use client';

import { useEffect, useMemo, useRef, useState, type ChangeEvent, type ReactNode } from 'react';

const cn = (...classes: Array<string | false | null | undefined>) => classes.filter(Boolean).join(' ');

const UI_STATES = {
  IDLE: 'idle',
  UPLOADING: 'uploading',
  PROCESSING: 'processing',
  SUCCESS: 'success',
  ERROR: 'error'
} as const;

type UIState = typeof UI_STATES[keyof typeof UI_STATES];

type StepState = 'done' | 'current' | 'todo';

const getStepState = (step: number, currentStep: number): StepState => {
  if (step < currentStep) return 'done';
  if (step === currentStep) return 'current';
  return 'todo';
};

type StepDefinition = {
  step: 1 | 2 | 3;
  title: string;
  description: string;
};

const STEPS: StepDefinition[] = [
  { step: 1, title: '上传人物图', description: '清晰正面照，尽量不遮挡' },
  { step: 2, title: '上传服装图', description: '平铺/正面展示，背景干净' },
  { step: 3, title: '生成结果', description: '提交后等待 AI 合成' }
];

const StatusPill = ({
  tone,
  label
}: {
  tone: 'neutral' | 'blue' | 'amber' | 'green' | 'red';
  label: string;
}) => {
  const classes = cn(
    'inline-flex items-center gap-2 rounded-full border px-3 py-1 text-xs font-semibold',
    tone === 'neutral' && 'border-slate-200 bg-slate-50 text-slate-700',
    tone === 'blue' && 'border-blue-200 bg-blue-50 text-blue-700',
    tone === 'amber' && 'border-amber-200 bg-amber-50 text-amber-800',
    tone === 'green' && 'border-emerald-200 bg-emerald-50 text-emerald-700',
    tone === 'red' && 'border-red-200 bg-red-50 text-red-700'
  );

  return <span className={classes}>{label}</span>;
};

const Stepper = ({ currentStep }: { currentStep: number }) => {
  const progress = ((Math.max(1, Math.min(3, currentStep)) - 1) / 2) * 100;

  return (
    <div className="rounded-2xl border border-slate-200 bg-white px-5 py-4">
      <div className="flex items-center justify-between gap-3">
        <div className="text-sm font-semibold text-slate-900">操作流程</div>
        <StatusPill tone="neutral" label={`当前步骤：${currentStep}/3`} />
      </div>

      <div className="mt-4">
        <div className="relative">
          <div className="mx-4 h-1 rounded-full bg-slate-100" aria-hidden="true">
            <div
              className="h-1 rounded-full bg-blue-600 transition-[width] duration-300"
              style={{ width: `${progress}%` }}
              aria-hidden="true"
            />
          </div>

          <ol className="grid grid-cols-3 gap-3">
            {STEPS.map((s) => {
              const state = getStepState(s.step, currentStep);
              const isDone = state === 'done';
              const isCurrent = state === 'current';

              return (
                <li key={s.step} className="relative flex flex-col items-center text-center">
                  <div
                    className={cn(
                      'relative z-10 flex h-9 w-9 items-center justify-center rounded-full border text-sm font-bold',
                      isDone && 'border-emerald-200 bg-emerald-50 text-emerald-700',
                      isCurrent && 'border-blue-200 bg-blue-50 text-blue-700',
                      state === 'todo' && 'border-slate-200 bg-white text-slate-500'
                    )}
                    aria-label={`步骤 ${s.step}`}
                  >
                    {isDone ? '✓' : s.step}
                  </div>

                  <div className="mt-2">
                    <div
                      className={cn(
                        'text-sm font-semibold',
                        state === 'todo' ? 'text-slate-400' : 'text-slate-900'
                      )}
                    >
                      {s.title}
                    </div>
                    <div className={cn('mt-0.5 text-xs', state === 'todo' ? 'text-slate-400' : 'text-slate-500')}>
                      {s.description}
                    </div>
                  </div>
                </li>
              );
            })}
          </ol>
        </div>
      </div>
    </div>
  );
};

const SectionCard = ({
  children,
  className
}: {
  children: ReactNode;
  className?: string;
}) => (
  <div className={cn('rounded-2xl border border-slate-200 bg-white shadow-sm', className)}>
    {children}
  </div>
);

const CardHeader = ({
  title,
  subtitle,
  right
}: {
  title: string;
  subtitle?: string;
  right?: ReactNode;
}) => (
  <div className="flex items-start justify-between gap-4 border-b border-slate-200 px-5 py-4">
    <div className="min-w-0">
      <div className="flex items-center gap-2">
        <div className="text-sm font-semibold text-slate-900">{title}</div>
      </div>
      {subtitle ? <div className="mt-1 text-xs text-slate-500">{subtitle}</div> : null}
    </div>
    {right ? <div className="shrink-0">{right}</div> : null}
  </div>
);

const PrimaryButton = ({
  children,
  disabled,
  onClick,
  ariaLabel
}: {
  children: ReactNode;
  disabled?: boolean;
  onClick: () => void;
  ariaLabel: string;
}) => (
  <button
    type="button"
    aria-label={ariaLabel}
    onClick={onClick}
    disabled={disabled}
    className={cn(
      'inline-flex w-full items-center justify-center rounded-xl px-4 py-3 text-sm font-bold text-white shadow-sm transition-colors',
      'focus:outline-none focus:ring-2 focus:ring-blue-300',
      disabled ? 'cursor-not-allowed bg-slate-300' : 'bg-blue-600 hover:bg-blue-700'
    )}
  >
    {children}
  </button>
);

const SecondaryButton = ({
  children,
  disabled,
  onClick,
  ariaLabel
}: {
  children: ReactNode;
  disabled?: boolean;
  onClick: () => void;
  ariaLabel: string;
}) => (
  <button
    type="button"
    aria-label={ariaLabel}
    onClick={onClick}
    disabled={disabled}
    className={cn(
      'inline-flex w-full items-center justify-center rounded-xl border px-4 py-3 text-sm font-semibold transition-colors',
      'focus:outline-none focus:ring-2 focus:ring-blue-200',
      disabled ? 'cursor-not-allowed border-slate-200 bg-slate-50 text-slate-400' : 'border-slate-200 bg-white text-slate-800 hover:bg-slate-50'
    )}
  >
    {children}
  </button>
);

const CommerceCtaButton = ({
  children,
  disabled,
  onClick,
  ariaLabel
}: {
  children: ReactNode;
  disabled?: boolean;
  onClick: () => void;
  ariaLabel: string;
}) => (
  <button
    type="button"
    aria-label={ariaLabel}
    onClick={onClick}
    disabled={disabled}
    className={cn(
      'inline-flex items-center justify-center whitespace-nowrap rounded-lg transition-colors outline-offset-2 focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue-300/70 disabled:pointer-events-none disabled:opacity-50',
      'shadow-sm shadow-black/5',
      'h-11 px-5 py-3 text-base font-bold',
      disabled ? 'bg-slate-300 text-white' : 'bg-blue-600 text-white hover:bg-blue-700'
    )}
  >
    {children}
  </button>
);

export default function Home() {
  const [status, setStatus] = useState<UIState>(UI_STATES.IDLE);
  const [personImage, setPersonImage] = useState<string | null>(null);
  const [garmentImage, setGarmentImage] = useState<string | null>(null);
  const [resultImage, setResultImage] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [pollingTaskId, setPollingTaskId] = useState<string | null>(null);
  
  const personInputRef = useRef<HTMLInputElement>(null);
  const garmentInputRef = useRef<HTMLInputElement>(null);
  const step1Ref = useRef<HTMLDivElement>(null);
  const step2Ref = useRef<HTMLDivElement>(null);
  const step3Ref = useRef<HTMLDivElement>(null);

  const isBusy = status === UI_STATES.UPLOADING || status === UI_STATES.PROCESSING;
  const isReady = Boolean(personImage && garmentImage);
  const currentStep = !personImage ? 1 : !garmentImage ? 2 : 3;
  const isGarmentLocked = !personImage;

  const taskStatus = useMemo(() => {
    if (status === UI_STATES.UPLOADING) return { tone: 'amber' as const, label: '上传中' };
    if (status === UI_STATES.PROCESSING) return { tone: 'blue' as const, label: '生成中' };
    if (status === UI_STATES.SUCCESS) return { tone: 'green' as const, label: '已完成' };
    if (status === UI_STATES.ERROR) return { tone: 'red' as const, label: '失败' };
    return { tone: 'neutral' as const, label: '待上传' };
  }, [status]);

  const handleOpenPersonPicker = () => personInputRef.current?.click();
  const handleOpenGarmentPicker = () => garmentInputRef.current?.click();

  const handleResetTaskState = () => {
    setResultImage(null);
    setErrorMsg(null);
    setStatus(UI_STATES.IDLE);
    setPollingTaskId(null);
  };

  const handleJumpToStep = (step: 1 | 2 | 3) => {
    const target = step === 1 ? step1Ref.current : step === 2 ? step2Ref.current : step3Ref.current;
    if (!target) return;
    target.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  const handleSetPerson = (next: string | null) => {
    handleResetTaskState();
    setPersonImage(next);
    if (!next) setGarmentImage(null);
  };

  const handleSetGarment = (next: string | null) => {
    handleResetTaskState();
    setGarmentImage(next);
  };

  const handleImageUpload = (e: ChangeEvent<HTMLInputElement>, onLoaded: (dataUrl: string) => void) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      const dataUrl = event.target?.result;
      if (typeof dataUrl !== 'string') return;
      onLoaded(dataUrl);
    };
    reader.readAsDataURL(file);
  };

  const handleGenerate = async () => {
    if (isBusy) return;
    if (!isReady) {
      setErrorMsg('请上传人物图片和服装图片');
      return;
    }

    setStatus(UI_STATES.UPLOADING);
    setErrorMsg(null);
    setResultImage(null);

    try {
      // 1. Create task
      const res = await fetch('/api/try-on', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          personBase64: personImage,
          garmentBase64: garmentImage,
          mode: 'realistic'
        })
      });

      if (!res.ok) {
        const errorData = await res.json();
        throw new Error(errorData.error || '创建任务失败');
      }

      const { taskId } = await res.json();
      
      // 2. Start polling
      setStatus(UI_STATES.PROCESSING);
      setPollingTaskId(taskId);

    } catch (error: any) {
      console.error(error);
      setErrorMsg(error.message || '系统错误');
      setStatus(UI_STATES.ERROR);
    }
  };

  useEffect(() => {
    if (!pollingTaskId || status !== UI_STATES.PROCESSING) return;

    let timeoutId: NodeJS.Timeout;
    let isPolling = true;

    const poll = async () => {
      if (!isPolling) return;

      try {
        const res = await fetch(`/api/status?taskId=${pollingTaskId}`);
        if (!res.ok) throw new Error('查询状态失败');
        
        const data = await res.json();
        
        if (data.status === 'success') {
          setResultImage(data.resultUrl);
          setStatus(UI_STATES.SUCCESS);
          setPollingTaskId(null);
          isPolling = false;
        } else if (data.status === 'failed') {
          throw new Error(data.error || '生成失败');
        } else {
          // processing or pending, continue polling
          timeoutId = setTimeout(poll, 2000);
        }
      } catch (error: any) {
        console.error(error);
        setErrorMsg(error.message || '查询状态失败');
        setStatus(UI_STATES.ERROR);
        setPollingTaskId(null);
        isPolling = false;
      }
    };

    poll();

    return () => {
      isPolling = false;
      clearTimeout(timeoutId);
    };
  }, [pollingTaskId, status]);

  const handleReset = () => {
    handleSetPerson(null);
    setGarmentImage(null);
    setResultImage(null);
    setStatus(UI_STATES.IDLE);
    setErrorMsg(null);
    setPollingTaskId(null);
    if (personInputRef.current) personInputRef.current.value = '';
    if (garmentInputRef.current) garmentInputRef.current.value = '';
  };

  const handleDownloadResult = async () => {
    if (!resultImage) return;

    try {
      const res = await fetch(resultImage);
      if (!res.ok) throw new Error('下载失败');

      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'virtual-try-on-result.png';
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch {
      window.open(resultImage, '_blank', 'noopener,noreferrer');
    }
  };

  const step1State = personImage ? 'done' : 'current';
  const step2State: StepState = !personImage ? 'todo' : garmentImage ? 'done' : currentStep === 2 ? 'current' : 'todo';
  return (
    <main className="min-h-screen bg-slate-100">
      <div className="mx-auto max-w-6xl px-4 py-8 md:px-8">
        <header className="rounded-2xl border border-slate-200 bg-white px-5 py-4">
          <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
            <div className="min-w-0">
              <h1 className="text-2xl font-bold tracking-tight text-slate-900 md:text-3xl">虚拟换衣</h1>
              <p className="mt-1 text-sm text-slate-500">按流程上传素材并生成试穿结果，状态与步骤全程可见</p>
            </div>
            <div className="flex items-center gap-3">
              <div className="hidden text-sm font-semibold text-slate-600 md:block">任务状态</div>
              <StatusPill tone={taskStatus.tone} label={taskStatus.label} />
            </div>
          </div>
        </header>

        <div className="mt-5">
          <Stepper currentStep={currentStep} />
        </div>

        <div className="mt-6 grid gap-6 lg:grid-cols-12">
          <section className="space-y-6 lg:col-span-7">
            <SectionCard>
              <div ref={step1Ref}>
                <CardHeader
                  title="步骤 1 / 上传人物图"
                  subtitle="建议清晰正面照、光线均匀、人物主体完整"
                  right={
                    <StatusPill
                      tone={step1State === 'done' ? 'green' : step1State === 'current' ? 'blue' : 'neutral'}
                      label={personImage ? '已完成' : '待上传'}
                    />
                  }
                />

                <div className="grid gap-4 p-5 sm:grid-cols-2">
                  <div className="overflow-hidden rounded-xl border border-slate-200 bg-slate-50">
                    {personImage ? (
                      <img src={personImage} alt="人物图预览" className="aspect-[3/4] w-full object-cover" />
                    ) : (
                      <div className="flex aspect-[3/4] flex-col items-center justify-center gap-2 px-6 text-center">
                        <div className="text-sm font-semibold text-slate-700">未上传人物图</div>
                        <div className="text-xs text-slate-500">上传后会自动进入下一步</div>
                      </div>
                    )}
                  </div>

                  <div className="space-y-3">
                    <input
                      type="file"
                      accept="image/*"
                      className="hidden"
                      ref={personInputRef}
                      onChange={(e) => handleImageUpload(e, (dataUrl) => handleSetPerson(dataUrl))}
                    />

                    <PrimaryButton ariaLabel="上传人物图片" onClick={handleOpenPersonPicker} disabled={isBusy}>
                      {personImage ? '重新上传人物图' : '上传人物图'}
                    </PrimaryButton>

                    <SecondaryButton
                      ariaLabel="清除人物图片"
                      onClick={() => handleSetPerson(null)}
                      disabled={isBusy || !personImage}
                    >
                      清除人物图
                    </SecondaryButton>

                    <div className="rounded-xl border border-slate-200 bg-white px-4 py-3 text-xs text-slate-600">
                      <div className="font-semibold text-slate-800">上传要求</div>
                      <ul className="mt-2 list-disc space-y-1 pl-4">
                        <li>支持 JPG / PNG</li>
                        <li>尽量避免遮挡脸部/身体</li>
                        <li>人物占画面比例适中</li>
                      </ul>
                    </div>
                  </div>
                </div>
              </div>
            </SectionCard>

            <SectionCard>
              <div ref={step2Ref}>
                <CardHeader
                  title="步骤 2 / 上传服装图"
                  subtitle={isGarmentLocked ? '请先完成步骤 1，再上传服装图' : '推荐平铺或正面展示，背景尽量干净'}
                  right={
                    <StatusPill
                      tone={
                        isGarmentLocked ? 'neutral' : step2State === 'done' ? 'green' : step2State === 'current' ? 'blue' : 'neutral'
                      }
                      label={isGarmentLocked ? '未解锁' : garmentImage ? '已完成' : '待上传'}
                    />
                  }
                />

                <div className="grid gap-4 p-5 sm:grid-cols-2">
                  <div className="overflow-hidden rounded-xl border border-slate-200 bg-slate-50">
                    {garmentImage ? (
                      <img src={garmentImage} alt="服装图预览" className="aspect-[3/4] w-full object-cover" />
                    ) : (
                      <div className="flex aspect-[3/4] flex-col items-center justify-center gap-2 px-6 text-center">
                        <div className="text-sm font-semibold text-slate-700">未上传服装图</div>
                        <div className="text-xs text-slate-500">{isGarmentLocked ? '先上传人物图以解锁本步骤' : '上传后可直接生成结果'}</div>
                      </div>
                    )}
                  </div>

                  <div className="space-y-3">
                    <input
                      type="file"
                      accept="image/*"
                      className="hidden"
                      ref={garmentInputRef}
                      onChange={(e) => handleImageUpload(e, (dataUrl) => handleSetGarment(dataUrl))}
                    />

                    <PrimaryButton
                      ariaLabel="上传服装图片"
                      onClick={handleOpenGarmentPicker}
                      disabled={isBusy || isGarmentLocked}
                    >
                      {garmentImage ? '重新上传服装图' : '上传服装图'}
                    </PrimaryButton>

                    <SecondaryButton
                      ariaLabel="清除服装图片"
                      onClick={() => handleSetGarment(null)}
                      disabled={isBusy || isGarmentLocked || !garmentImage}
                    >
                      清除服装图
                    </SecondaryButton>

                    <div className="rounded-xl border border-slate-200 bg-white px-4 py-3 text-xs text-slate-600">
                      <div className="font-semibold text-slate-800">拍摄建议</div>
                      <ul className="mt-2 list-disc space-y-1 pl-4">
                        <li>衣服边缘清晰、褶皱尽量少</li>
                        <li>避免复杂花纹/大反光</li>
                        <li>推荐纯色或干净背景</li>
                      </ul>
                    </div>
                  </div>
                </div>
              </div>
            </SectionCard>

            <SectionCard>
              <div ref={step3Ref}>
                <CardHeader
                  title="步骤 3 / 生成结果"
                  subtitle="确认素材后提交生成；生成期间保持页面打开"
                  right={<StatusPill tone={isReady ? 'green' : 'neutral'} label={isReady ? '已就绪' : '未就绪'} />}
                />

                <div className="p-5">
                  {errorMsg ? (
                    <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                      <div className="font-semibold">操作失败</div>
                      <div className="mt-1">{errorMsg}</div>
                    </div>
                  ) : null}

                  <div className="grid gap-2 text-sm">
                    <div
                      className={cn(
                        'flex items-center justify-between rounded-xl border px-4 py-3',
                        personImage ? 'border-emerald-200 bg-emerald-50' : 'border-slate-200 bg-white'
                      )}
                    >
                      <div className="font-semibold text-slate-800">人物图</div>
                      <StatusPill tone={personImage ? 'green' : 'neutral'} label={personImage ? '已上传' : '未上传'} />
                    </div>
                    <div
                      className={cn(
                        'flex items-center justify-between rounded-xl border px-4 py-3',
                        garmentImage ? 'border-emerald-200 bg-emerald-50' : 'border-slate-200 bg-white'
                      )}
                    >
                      <div className="font-semibold text-slate-800">服装图</div>
                      <StatusPill tone={garmentImage ? 'green' : 'neutral'} label={garmentImage ? '已上传' : '未上传'} />
                    </div>
                  </div>

                  <div className="mt-4 grid gap-3">
                    <CommerceCtaButton
                      ariaLabel="生成换衣效果"
                      onClick={handleGenerate}
                      disabled={isBusy || !isReady}
                    >
                      {status === UI_STATES.IDLE || status === UI_STATES.ERROR ? '立即生成换衣效果' : null}
                      {status === UI_STATES.UPLOADING ? '上传中…' : null}
                      {status === UI_STATES.PROCESSING ? 'AI 生成中…' : null}
                      {status === UI_STATES.SUCCESS ? '再次生成' : null}
                    </CommerceCtaButton>

                    <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-xs text-slate-600">
                      <div className="font-semibold text-slate-800">状态说明</div>
                      <div className="mt-1">上传完成后提交生成；生成中预计需要 15–30 秒，请耐心等待。</div>
                    </div>
                  </div>
                </div>
              </div>
            </SectionCard>
          </section>

          <aside className="space-y-6 lg:col-span-5 lg:sticky lg:top-6 lg:h-fit">
            <SectionCard className="overflow-hidden">
              <CardHeader title="素材清单" subtitle="像下单一样核对素材与步骤" />
              <div className="space-y-3 p-5">
                <div className="flex items-center justify-between gap-3 rounded-xl border border-slate-200 bg-white px-4 py-3">
                  <div className="min-w-0">
                    <div className="text-sm font-semibold text-slate-900">人物图</div>
                    <div className="mt-1 text-xs text-slate-500">{personImage ? '已上传，可进入下一步' : '待上传'}</div>
                  </div>
                  <div className="flex items-center gap-2">
                    <StatusPill tone={personImage ? 'green' : 'neutral'} label={personImage ? '完成' : '待办'} />
                    <button
                      type="button"
                      aria-label="跳转到步骤1"
                      onClick={() => handleJumpToStep(1)}
                      className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-800 transition-colors hover:bg-slate-50"
                    >
                      去处理
                    </button>
                  </div>
                </div>

                <div className="flex items-center justify-between gap-3 rounded-xl border border-slate-200 bg-white px-4 py-3">
                  <div className="min-w-0">
                    <div className="text-sm font-semibold text-slate-900">服装图</div>
                    <div className="mt-1 text-xs text-slate-500">
                      {isGarmentLocked ? '未解锁（先完成步骤 1）' : garmentImage ? '已上传，可提交生成' : '待上传'}
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <StatusPill tone={isGarmentLocked ? 'neutral' : garmentImage ? 'green' : 'neutral'} label={garmentImage ? '完成' : '待办'} />
                    <button
                      type="button"
                      aria-label="跳转到步骤2"
                      onClick={() => handleJumpToStep(2)}
                      className={cn(
                        'rounded-lg border px-3 py-2 text-xs font-semibold transition-colors',
                        isGarmentLocked
                          ? 'cursor-not-allowed border-slate-200 bg-slate-50 text-slate-400'
                          : 'border-slate-200 bg-white text-slate-800 hover:bg-slate-50'
                      )}
                      disabled={isGarmentLocked}
                    >
                      去处理
                    </button>
                  </div>
                </div>

                <div className="flex items-center justify-between gap-3 rounded-xl border border-slate-200 bg-white px-4 py-3">
                  <div className="min-w-0">
                    <div className="text-sm font-semibold text-slate-900">生成结果</div>
                    <div className="mt-1 text-xs text-slate-500">{resultImage ? '已生成，可下载或重新开始' : '暂无结果'}</div>
                  </div>
                  <div className="flex items-center gap-2">
                    <StatusPill tone={resultImage ? 'green' : 'neutral'} label={resultImage ? '完成' : '待办'} />
                    <button
                      type="button"
                      aria-label="跳转到步骤3"
                      onClick={() => handleJumpToStep(3)}
                      className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-800 transition-colors hover:bg-slate-50"
                    >
                      去查看
                    </button>
                  </div>
                </div>
              </div>
            </SectionCard>

            <SectionCard className="overflow-hidden">
              <CardHeader title="结果预览" subtitle="生成完成后可在此查看与下载" right={<StatusPill tone={taskStatus.tone} label={taskStatus.label} />} />
              <div className="p-5">
                <div className="overflow-hidden rounded-xl border border-slate-200 bg-slate-50">
                  {resultImage ? (
                    <img src={resultImage} alt="换衣结果" className="w-full" />
                  ) : (
                    <div className="flex h-56 items-center justify-center px-6 text-center text-sm text-slate-500">
                      暂无结果。完成步骤 1–2 后，在步骤 3 提交生成。
                    </div>
                  )}
                </div>

                <div className="mt-4 grid gap-2">
                  <PrimaryButton ariaLabel="下载结果图片" onClick={handleDownloadResult} disabled={!resultImage}>
                    下载结果
                  </PrimaryButton>
                  <SecondaryButton ariaLabel="重新开始流程" onClick={handleReset}>
                    重新开始
                  </SecondaryButton>
                </div>
              </div>
            </SectionCard>
          </aside>
        </div>
      </div>
    </main>
  );
}
